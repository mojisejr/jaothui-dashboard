/** @jest-environment node */
import { randomUUID } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { mkdir, mkdtemp, rm, readFile } from "fs/promises";
import { resolve } from "path";
import httpServer from "http";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import {
  decodeEventLog,
  createPublicClient,
  createWalletClient,
  http,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { composeCreateRuntime, type CreateRuntime } from "../runtime";
import { localAssetStorage, contentHash } from "../storage";
import { draftInputSchema, type DraftInput } from "../contract";
import { loopbackChainPorts } from "../../operations/loopback";
import { type CreateChain } from "../workflow";
import { type Domain } from "../../operations/types";
import { type RawMetadata } from "~/interfaces/i-metadata";
import {
  chainSnapshot,
  databaseSnapshot,
  intentToManagerInput,
} from "../../field-policy";
import { abi as nftAbi } from "~/server/blockchain/nft/abi";
import { abi as managerAbi } from "~/server/blockchain/metadata-maneger/abi";
import { bitkub_mainnet } from "~/server/blockchain/chain";

const artifacts = resolve(
  process.env.BUFFALO_INTEGRITY_TEST_FIXTURE_DIR ?? ".tmp/phase3",
);
const enabled =
  process.env.BUFFALO_INTEGRITY_TEST_DATABASE_URL &&
  process.env.BUFFALO_INTEGRITY_TEST_FIXTURE_DIR;
const infra = enabled ? describe : describe.skip;
infra(
  "create integration: disposable PG15, pinned local fork and normal HTTP origin",
  () => {
    let db: PrismaClient,
      directory: string,
      origin: string,
      server: httpServer.Server,
      chain: CreateChain,
      domain: Domain;
    let signer: { privateKey: Hex; address: Address; rpcUrl: string },
      identity: { instanceId: string; codeHashes: Record<string, string> };
    let client: ReturnType<typeof createPublicClient>,
      wallet: ReturnType<typeof createWalletClient>,
      image: Buffer;
    const createdIds = new Set<string>();
    const chip = () =>
      `999${String(Math.floor(Math.random() * 1e12)).padStart(12, "0")}`;
    const input = (patch: Partial<DraftInput> = {}) =>
      draftInputSchema.parse({
        name: "Synthetic integration",
        microchip: chip(),
        certNo: "CERT-P3",
        origin: "Thailand",
        height: 157,
        color: "Black",
        sex: "Male",
        rarity: "Rare",
        birthday: "2024-06-30",
        fatherId: "",
        motherId: "",
        detail: "Complete fields",
        ...patch,
      });
    const rpc = async (method: string, params: unknown[] = []) => {
      const res = await fetch(signer.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const data = (await res.json()) as { error?: unknown; result: unknown };
      if (data.error) throw Error(`LOCAL_RPC_FAILED:${method}`);
      return data.result;
    };
    const mine = async () => {
      await rpc("anvil_mine", ["0x3"]);
    };
    function runtime(faults: { projectionFailures?: number } = {}) {
      let signatures = 0;
      const rt = composeCreateRuntime(
        db,
        localAssetStorage(directory, origin),
        chain,
        (workflow) => {
          const ports = loopbackChainPorts({
            rpcUrl: signer.rpcUrl,
            privateKey: signer.privateKey,
            domain,
            codeHashes: identity.codeHashes,
            expectedInstanceId: identity.instanceId,
            maxFeeWei: "50000000000000000",
            prepare: (op) => workflow.prepare(op),
            nextStep: (op, steps) => workflow.nextStep(op, steps),
            project: (op) => workflow.project(op),
            verifyPublication: (op, steps, proof) =>
              workflow.verifyPublication(op, steps, proof),
          });
          for (const stage of [
            "sign",
            "nonce",
            "nextStep",
            "verifyEffects",
            "project",
          ] as const) {
            const original = ports[stage] as (
              ...args: unknown[]
            ) => Promise<unknown>;
            Object.assign(ports, {
              [stage]: async (...args: unknown[]) => {
                try {
                  return await original(...args);
                } catch (error) {
                  const known = error as {
                    name?: string;
                    shortMessage?: string;
                    message?: string;
                    details?: string;
                    cause?: { details?: string };
                  };
                  writeFileSync(
                    resolve(artifacts, "create-adapter-failure.json"),
                    JSON.stringify(
                      {
                        stage,
                        name: known.name,
                        message:
                          known.shortMessage ?? known.message?.split("\n")[0],
                        details: known.cause?.details ?? known.details,
                      },
                      null,
                      2,
                    ),
                  );
                  throw error;
                }
              },
            });
          }
          const sign = ports.sign;
          ports.sign = async (...args) => {
            signatures++;
            return sign(...args);
          };
          return ports;
        },
        faults,
      );
      return { rt, signatures: () => signatures };
    }
    async function prepared(rt: CreateRuntime, owner: string, data = input()) {
      const created = await rt.workflow.create(owner, randomUUID(), data);
      createdIds.add(created.id);
      await rt.workflow.upload(
        created.id,
        owner,
        created.version,
        image,
        "image/jpeg",
      );
      const current = await rt.drafts.operations.get(created.id, owner);
      await rt.engine.prepare(current.id, owner, current.version);
      return rt.drafts.operations.get(current.id, owner);
    }
    async function mint(rt: CreateRuntime, id: string, owner: string) {
      const op = await rt.drafts.operations.get(id, owner);
      await rt.engine.advance(id, owner, "mint", op.version);
      await mine();
      const state = await rt.engine.advance(id, owner, "resume");
      expect(state.state).toBe("AWAITING_METADATA_ACTION");
      return state;
    }
    async function finish(
      rt: CreateRuntime,
      id: string,
      owner: string,
      stopOnRecovery: () => boolean = () => false,
    ) {
      let status = await rt.engine.status(id, owner);
      for (
        let attempt = 0;
        attempt < 16 &&
        ![
          "COMPLETED",
          "NEEDS_REVIEW",
          ...(stopOnRecovery() ? ["RECOVERY_REQUIRED"] : []),
        ].includes(status.state);
        attempt++
      ) {
        status = await rt.engine.advance(
          id,
          owner,
          status.state === "AWAITING_METADATA_ACTION" ? "metadata" : "resume",
        );
        await mine();
      }
      return status;
    }
    beforeAll(async () => {
      const databaseUrl = process.env.BUFFALO_INTEGRITY_TEST_DATABASE_URL!;
      const parsed = new URL(databaseUrl);
      if (
        parsed.hostname !== "127.0.0.1" ||
        !parsed.pathname.includes("integrity")
      )
        throw Error("DISPOSABLE_DATABASE_REQUIRED");
      const fixtures = process.env.BUFFALO_INTEGRITY_TEST_FIXTURE_DIR!;
      signer = JSON.parse(
        readFileSync(resolve(fixtures, "local-signer.json"), "utf8"),
      ) as typeof signer;
      identity = JSON.parse(
        readFileSync(resolve(fixtures, "fork-identity.json"), "utf8"),
      ) as typeof identity;
      const fixtureDomain = JSON.parse(
        readFileSync(resolve(fixtures, "runtime.json"), "utf8"),
      ) as { domain: Domain };
      domain = fixtureDomain.domain;
      if (new URL(signer.rpcUrl).hostname !== "127.0.0.1")
        throw Error("LOOPBACK_ONLY");
      db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
      expect(
        (
          await db.$queryRaw<{ server_version: string }[]>`SHOW server_version`
        )[0]!.server_version,
      ).toMatch(/^15\./);
      client = createPublicClient({
        chain: bitkub_mainnet,
        transport: http(signer.rpcUrl, { retryCount: 0 }),
      });
      wallet = createWalletClient({
        chain: bitkub_mainnet,
        account: privateKeyToAccount(signer.privateKey),
        transport: http(signer.rpcUrl, { retryCount: 0 }),
      });
      const read = client.readContract as (parameters: {
        address: Address;
        abi: Abi;
        functionName: string;
        args: readonly unknown[];
        blockNumber?: bigint;
      }) => Promise<unknown>;
      chain = {
        domain,
        sender: signer.address,
        receiver: signer.address,
        executionInstance: identity.instanceId,
        read: (contract, abi, functionName, args = [], blockNumber) =>
          read({
            address: contract as Address,
            abi,
            functionName,
            args,
            blockNumber,
          }),
        block: async (number) => {
          const block = await client.getBlock(
            number === undefined ? {} : { blockNumber: number },
          );
          return { number: block.number, hash: block.hash };
        },
      };
      await mkdir(artifacts, { recursive: true });
      directory = await mkdtemp(resolve(artifacts, "create-tests-"));
      server = httpServer.createServer((req, res) => {
        void (async () => {
          try {
            const key = new URL(req.url!, "http://local").pathname.slice(1);
            if (
              !/^(operations\/|buffalo\/|json\/)/.test(key) ||
              key.includes("..")
            )
              throw Error();
            const data = await readFile(resolve(directory, key));
            res.writeHead(200, {
              "content-type": key.endsWith("jpg")
                ? "image/jpeg"
                : "application/json",
            });
            res.end(data);
          } catch {
            res.writeHead(404).end();
          }
        })();
      });
      await new Promise<void>((accept) =>
        server.listen(0, "127.0.0.1", accept),
      );
      origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      image = await sharp({
        create: { width: 40, height: 40, channels: 3, background: "orange" },
      })
        .jpeg()
        .toBuffer();
    }, 30000);
    afterAll(async () => {
      let preserve = false;
      for (const id of createdIds) {
        const rows = await db.$queryRaw<
          { state: string; signed: bigint }[]
        >`SELECT state,(SELECT count(*) FROM buffalo_integrity.step WHERE operation_id=o.id AND signed_bytes IS NOT NULL) AS signed FROM buffalo_integrity.operation o WHERE id=${id}::uuid`;
        if (
          rows[0] &&
          !["COMPLETED", "CANCELLED", "NEEDS_REVIEW"].includes(rows[0].state) &&
          rows[0].signed > 0n
        )
          preserve = true;
      }
      if (preserve)
        writeFileSync(
          resolve(artifacts, "create-pending-assets.json"),
          JSON.stringify(
            { directory, origin, operationIds: [...createdIds] },
            null,
            2,
          ),
        );
      await db?.$disconnect();
      if (server)
        await new Promise<void>((resolve) => server.close(() => resolve()));
      if (directory && !preserve) await rm(directory, { recursive: true });
    });
    test("actual receipt token after out-of-band mint and burn; parents/full manifest/projection failure recover forward", async () => {
      const parentOwner = `phase3:${randomUUID()}`,
        parent = runtime();
      const parentOp = await prepared(parent.rt, parentOwner);
      await mint(parent.rt, parentOp.id, parentOwner);
      expect((await finish(parent.rt, parentOp.id, parentOwner)).state).toBe(
        "COMPLETED",
      );
      const parentRecord = await parent.rt.drafts.operations.get(
        parentOp.id,
        parentOwner,
      );
      const parentChip =
        parentRecord.intent.kind === "create"
          ? parentRecord.intent.buffalo.microchip
          : "";
      const currentToken = (await client.readContract({
        address: domain.nft as Address,
        abi: nftAbi,
        functionName: "getCurrentTokenId",
      })) as bigint;
      const sacrificial = await wallet.writeContract({
        account: privateKeyToAccount(signer.privateKey),
        chain: bitkub_mainnet,
        address: domain.nft as Address,
        abi: nftAbi,
        functionName: "mintWithMetadata",
        args: [
          signer.address,
          "https://example.test/synthetic.jpg",
          "https://example.test/synthetic.json",
        ],
      });
      const sacrificialReceipt = await client.waitForTransactionReceipt({
        hash: sacrificial,
      });
      const mintedEvents = sacrificialReceipt.logs
        .filter((log) => log.address.toLowerCase() === domain.nft.toLowerCase())
        .flatMap((log) => {
          try {
            const event = decodeEventLog({
              abi: nftAbi,
              data: log.data,
              topics: log.topics,
            });
            return event.eventName === "MintWithMetadata"
              ? [(event.args as unknown as { _tokenId: bigint })._tokenId]
              : [];
          } catch {
            return [];
          }
        });
      expect(mintedEvents).toHaveLength(1);
      const burnToken = mintedEvents[0]!;
      const burned = await wallet.writeContract({
        account: privateKeyToAccount(signer.privateKey),
        chain: bitkub_mainnet,
        address: domain.nft as Address,
        abi: nftAbi,
        functionName: "burn",
        args: [burnToken],
      });
      await client.waitForTransactionReceipt({ hash: burned });
      const c = runtime({ projectionFailures: 1 }),
        owner = `phase3:${randomUUID()}`,
        data = input({ fatherId: parentChip });
      const op = await prepared(c.rt, owner, data);
      await expect(
        c.rt.engine.advance(op.id, owner, "metadata", op.version),
      ).rejects.toThrow("EXPLICIT_MINT_ACTION_REQUIRED");
      expect(c.signatures()).toBe(0);
      const [first, second] = await Promise.all([
        c.rt.engine.advance(op.id, owner, "mint", op.version),
        c.rt.engine.advance(op.id, owner, "mint", op.version),
      ]);
      expect([first.state, second.state]).toContain("CHAIN_PENDING");
      expect(c.signatures()).toBe(1);
      await mine();
      const minted = await c.rt.engine.advance(op.id, owner, "resume");
      expect(minted.state).toBe("AWAITING_METADATA_ACTION");
      expect(BigInt(minted.actualToken!)).toBeGreaterThan(currentToken);
      const totalSupply = (await client.readContract({
        address: domain.nft as Address,
        abi: nftAbi,
        functionName: "totalSupply",
      })) as bigint;
      expect(BigInt(minted.actualToken!)).not.toBe(totalSupply + 1n);
      await c.rt.engine.advance(op.id, owner, "mint");
      expect(c.signatures()).toBe(1);
      expect(
        await db.pedigree.findUnique({ where: { microchip: data.microchip } }),
      ).toBeNull();
      const failed = await finish(
        c.rt,
        op.id,
        owner,
        () => c.rt.workflow.faults.projectionFailures === 0,
      );
      expect(failed.state).toBe("RECOVERY_REQUIRED");
      expect(
        await db.pedigree.findUnique({ where: { microchip: data.microchip } }),
      ).toBeNull();
      const signedBefore = c.signatures();
      const restarted = runtime();
      expect(
        (await restarted.rt.engine.advance(op.id, owner, "resume")).state,
      ).toBe("COMPLETED");
      expect(restarted.signatures()).toBe(0);
      expect(c.signatures()).toBe(signedBefore);
      const completed = await restarted.rt.drafts.operations.get(op.id, owner),
        row = await db.pedigree.findUnique({
          where: { microchip: data.microchip },
        });
      expect(row).not.toBeNull();
      const raw = (await chain.read(
        domain.manager,
        managerAbi as Abi,
        "getMetadata",
        [BigInt(completed.actualToken!)],
      )) as RawMetadata;
      expect(chainSnapshot(raw)).toEqual(databaseSnapshot(row!));
      expect(raw.height).toBe(157n);
      expect(raw.certify.certNo).toBe("CERT-P3");
      expect(raw.detail).toBe("Complete fields");
      expect(raw.relation.fatherTokenId).toBe(parentChip);
      const json = (await fetch(
        `${origin}/json/${completed.actualToken}.json`,
      ).then((r) => r.json())) as { edition: number };
      expect(json.edition).toBe(Number(completed.actualToken));
      const source = await c.rt.storage.get(
        new URL(
          completed.intent.kind === "create"
            ? completed.intent.buffalo.image
            : "",
        ).pathname.slice(1),
      );
      expect(
        contentHash(
          Buffer.from(
            await (
              await fetch(`${origin}/buffalo/${completed.actualToken}.jpg`)
            ).arrayBuffer(),
          ),
        ),
      ).toBe(contentHash(source!));
      const uriStep = (await restarted.rt.drafts.operations.steps(op.id)).find(
        (s) => s.kind === "uri",
      )!;
      expect(JSON.stringify(uriStep.proof)).toContain("nativeCreatedAt");
    }, 120000);
    test("per-owner concurrent create requests retain one unfinished server operation", async () => {
      const c = runtime(),
        owner = `phase3:${randomUUID()}`;
      const outcomes = await Promise.allSettled([
        c.rt.workflow.create(owner, randomUUID(), input()),
        c.rt.workflow.create(owner, randomUUID(), input()),
      ]);
      expect(
        outcomes.filter((item) => item.status === "fulfilled"),
      ).toHaveLength(1);
      const selected = outcomes.find((item) => item.status === "fulfilled")!;
      if (selected.status !== "fulfilled") throw Error("NO_CREATE");
      const rows = await c.rt.drafts.list(owner);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe(selected.value.id);
      expect(c.signatures()).toBe(0);
      await c.rt.engine.cancel(selected.value.id, owner);
    });
    test("two clients race revisions and stale cancelled tab cannot sign; original createdAt survives edits", async () => {
      const c = runtime(),
        owner = `phase3:${randomUUID()}`,
        data = input();
      const created = await c.rt.workflow.create(owner, randomUUID(), data);
      await c.rt.workflow.upload(created.id, owner, 0, image, "image/jpeg");
      const draft = await c.rt.drafts.operations.get(created.id, owner);
      const originalCreatedAt = (
        await c.rt.drafts.key(draft.id, owner)
      ).created_at.toISOString();
      const results = await Promise.allSettled([
        c.rt.workflow.revise(draft.id, owner, draft.version, {
          ...data,
          detail: "revision1",
        }),
        c.rt.workflow.revise(draft.id, owner, draft.version, {
          ...data,
          detail: "revision2",
        }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const selected = results.find((r) => r.status === "fulfilled")!;
      if (selected.status !== "fulfilled")
        throw Error("NO_SUCCESSFUL_REVISION");
      const next = selected.value;
      const noRead = jest.spyOn(c.rt.storage, "get");
      const nextAgain = await c.rt.workflow.revise(
        next.id,
        owner,
        next.version,
        { ...data, detail: "revision3" },
        false,
      );
      expect(noRead).not.toHaveBeenCalled();
      noRead.mockRestore();
      const row = await c.rt.drafts.operations.get(nextAgain.id, owner);
      expect(
        (row.result as { originalCreatedAt: string }).originalCreatedAt,
      ).toBe(originalCreatedAt);
      if (row.intent.kind !== "create" || draft.intent.kind !== "create")
        throw Error("CREATE_REQUIRED");
      expect(row.intent.buffalo.detail).toBe("revision3");
      expect(
        await c.rt.storage.get(
          new URL(row.intent.buffalo.image).pathname.slice(1),
        ),
      ).toBeNull();
      expect(
        await c.rt.storage.get(
          new URL(draft.intent.buffalo.image).pathname.slice(1),
        ),
      ).not.toBeNull();
      await c.rt.workflow.upload(
        row.id,
        owner,
        row.version,
        image,
        "image/jpeg",
      );
      await expect(
        c.rt.engine.advance(draft.id, owner, "mint", draft.version),
      ).rejects.toThrow();
      expect(c.signatures()).toBe(0);
      await expect(
        c.rt.workflow.create(owner, randomUUID(), input()),
      ).rejects.toThrow("CONTINUE_EXISTING_OPERATION");
      const uploaded = await c.rt.drafts.operations.get(row.id, owner);
      const readFailure = jest
        .spyOn(c.rt.storage, "get")
        .mockRejectedValueOnce(Error("INJECTED_STORAGE_READ_FAILURE"));
      const durable = await c.rt.workflow.revise(
        uploaded.id,
        owner,
        uploaded.version,
        { ...data, detail: "retained on storage failure" },
      );
      readFailure.mockRestore();
      expect(durable.state).toBe("DRAFT");
      expect(durable.version).toBe(0);
      expect(
        (durable.result as { originalCreatedAt: string }).originalCreatedAt,
      ).toBe(originalCreatedAt);
      await c.rt.engine.cancel(durable.id, owner);
    });
    test("initialized metadata recovery compares canonical state; aliases collide without overwrite", async () => {
      const c = runtime(),
        owner = `phase3:${randomUUID()}`,
        op = await prepared(c.rt, owner);
      await mint(c.rt, op.id, owner);
      const preparedOp = await c.rt.drafts.operations.get(op.id, owner);
      const finalStep = await c.rt.workflow.nextStep(
        preparedOp,
        await c.rt.drafts.operations.steps(op.id),
      );
      expect(finalStep?.kind).toBe("uri");
      await c.rt.engine.advance(op.id, owner, "metadata");
      await mine();
      await c.rt.engine.advance(op.id, owner, "resume");
      const current = await c.rt.drafts.operations.get(op.id, owner);
      if (current.intent.kind !== "create") throw Error();
      const params = {
        ...intentToManagerInput(current.intent.buffalo),
        issuedAt: BigInt(
          (current.plan!.context as { issuedAt: string }).issuedAt,
        ),
      };
      const external = await wallet.writeContract({
        account: privateKeyToAccount(signer.privateKey),
        chain: bitkub_mainnet,
        address: domain.manager as Address,
        abi: managerAbi,
        functionName: "addMetadata",
        args: [BigInt(current.actualToken!), params],
      });
      await client.waitForTransactionReceipt({ hash: external });
      await mine();
      await c.rt.storage.putImmutable(
        `buffalo/${current.actualToken}.jpg`,
        Buffer.from("unowned alias"),
        "image/jpeg",
      );
      expect((await finish(c.rt, op.id, owner)).state).toBe("NEEDS_REVIEW");
      expect(c.signatures()).toBe(2);
      expect(
        (await c.rt.storage.get(
          `buffalo/${current.actualToken}.jpg`,
        ))!.toString(),
      ).toBe("unowned alias");
      expect(
        await db.pedigree.findUnique({
          where: { microchip: current.intent.buffalo.microchip },
        }),
      ).toBeNull();
      const events = await db.$queryRaw<
        { kind: string }[]
      >`SELECT kind FROM buffalo_integrity.event WHERE operation_id=${current.id}::uuid AND kind='INITIAL_METADATA_OBSERVED'`;
      expect(events.length).toBeGreaterThan(0);
    }, 120000);
  },
);
