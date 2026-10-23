/** @jest-environment node */
jest.mock("superjson", () => ({
  __esModule: true,
  default: {
    serialize: (value: unknown) => ({ json: value }),
    deserialize: (value: { json: unknown }) => value.json,
  },
}));
jest.mock("~/server/db", () => ({ db: {} }));
import { createServer, type Server } from "http";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import sharp from "sharp";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getCreateRuntime, type CreateRuntime } from "../../create/runtime";
import { getEditRuntime, type EditRuntime } from "../../edit/runtime";
import { draftInputSchema } from "../../create/contract";
import { type ChainPorts } from "../../operations/types";
import { receiptEvidence } from "../../operations/receipt-evidence";
import { revisionOf } from "../../edit/contract";
import {
  createBuffaloCreateRouter,
  sharedAccount,
} from "~/server/api/routers/r-buffalo-create";
import { createBuffaloEditRouter } from "~/server/api/routers/r-buffalo-edit";
import { abi as managerAbi } from "~/server/blockchain/metadata-maneger/abi";
import { bitkub_mainnet } from "~/server/blockchain/chain";
const root = process.env.BUFFALO_INTEGRITY_PHASE5_FIXTURE_DIR;
const infra = root ? describe : describe.skip;
infra(
  "Phase5 actual PG restart, scoped Supabase, authenticated drain and aged canonical reconciliation",
  () => {
    let rt: CreateRuntime,
      edit: EditRuntime,
      server: Server,
      cfg: {
        rpcUrl: string;
        privateKey: Hex;
        domain: { manager: Address };
        databaseUrl: string;
      },
      path: string,
      originalPath: string,
      pruned = false,
      denyAll = false,
      deniedHistorical = 0,
      image: Buffer;
    let externalKey: Hex;
    let client: ReturnType<typeof createPublicClient>,
      wallet: ReturnType<typeof createWalletClient>;
    const chips = { created: "999000000005101", edit: "999000000004010" };
    const results: unknown[] = [];
    const cache = globalThis as typeof globalThis & {
      __buffaloCreateRuntime?: unknown;
      __buffaloEditRuntime?: unknown;
    };
    const rpc = async (method: string, params: unknown[] = []) => {
      const r = await fetch(cfg.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const body = (await r.json()) as { result: unknown; error?: unknown };
      if (body.error) throw Error(`LOCAL_RPC:${method}`);
      return body.result;
    };
    const mine = () => rpc("anvil_mine", ["0x3"]);
    const ports = (engine: CreateRuntime["engine"]) =>
      (engine as unknown as { chain: ChainPorts }).chain;
    const context = () => ({
      token: jwt.sign({ username: process.env.username }, process.env.secret!),
      db: rt.db,
    });
    const createApi = () =>
      createBuffaloCreateRouter(() => rt).createCaller(context());
    const editApi = () =>
      createBuffaloEditRouter(() => edit).createCaller(context());
    const input = (microchip = chips.created) =>
      draftInputSchema.parse({
        name: "Phase5 actual local",
        microchip,
        certNo: "CERT-P5",
        origin: "Thailand",
        color: "Black",
        sex: "Male",
        rarity: "Rare",
        birthday: "2024-06-30",
        height: 155,
        detail: "Full local publication",
        fatherId: "",
        motherId: "",
      });
    async function restart() {
      await rt?.db.$disconnect();
      delete cache.__buffaloCreateRuntime;
      delete cache.__buffaloEditRuntime;
      rt = getCreateRuntime();
      edit = getEditRuntime();
    }
    async function prepared() {
      const api = createApi(),
        draft = await api.create({ key: randomUUID(), input: input() });
      await rt.workflow.upload(
        draft.id,
        sharedAccount(),
        draft.version,
        image,
        "image/jpeg",
      );
      const op = await rt.drafts.operations.get(draft.id, sharedAccount());
      await api.prepare({ id: op.id, version: op.version });
      return op.id;
    }
    async function editPrepared(name: string) {
      const row = (await rt.db.pedigree.findUnique({
        where: { microchip: chips.edit },
      }))!;
      const job = await editApi().create({
        key: randomUUID(),
        microchip: row.microchip,
        tokenId: row.tokenId.toString(),
        expectedRevision: revisionOf(row),
        patch: { name },
      });
      await editApi().prepare({ id: job.id, version: job.version });
      return job.id;
    }
    async function finish(id: string, engine: CreateRuntime["engine"]) {
      let state = await engine.status(id, sharedAccount());
      for (
        let i = 0;
        i < 16 && !["COMPLETED", "NEEDS_REVIEW"].includes(state.state);
        i++
      ) {
        state = await engine.advance(
          id,
          sharedAccount(),
          state.state === "AWAITING_METADATA_ACTION" ? "metadata" : "resume",
        );
        await mine();
      }
      return state;
    }
    beforeAll(async () => {
      originalPath = process.env.BUFFALO_INTEGRITY_ISOLATED_CONFIG!;
      cfg = JSON.parse(readFileSync(originalPath, "utf8")) as typeof cfg;
      if (
        new URL(cfg.rpcUrl).hostname !== "127.0.0.1" ||
        new URL(cfg.databaseUrl).hostname !== "127.0.0.1"
      )
        throw Error("DISPOSABLE_ONLY");
      process.env.username = "phase5-infra";
      process.env.secret = "synthetic-phase5-infra-secret";
      process.env.BUFFALO_INTEGRITY_MODE = "enabled";
      client = createPublicClient({
        transport: http(cfg.rpcUrl, { retryCount: 0 }),
      });
      externalKey = (
        JSON.parse(
          readFileSync(resolve(root!, "local-external.json"), "utf8"),
        ) as { privateKey: Hex }
      ).privateKey;
      wallet = createWalletClient({
        account: privateKeyToAccount(externalKey),
        chain: bitkub_mainnet,
        transport: http(cfg.rpcUrl, { retryCount: 0 }),
      });
      server = createServer((request, response) => {
        void (async () => {
          let raw = "";
          for await (const chunk of request) raw += String(chunk);
          const body = JSON.parse(raw) as {
            method: string;
            params: unknown[];
            id: number;
          };
          let historical = false;
          if (
            body.method === "eth_call" &&
            typeof body.params[1] === "string" &&
            body.params[1].startsWith("0x")
          )
            historical =
              BigInt(body.params[1]) <
              (await client.getBlockNumber({ cacheTime: 0 }));
          if (denyAll && body.method === "eth_call") {
            response.end(
              JSON.stringify({
                jsonrpc: "2.0",
                id: body.id,
                error: { code: -32000, message: "unrelated upstream outage" },
              }),
            );
            return;
          }
          if (pruned && historical) {
            deniedHistorical++;
            response.end(
              JSON.stringify({
                jsonrpc: "2.0",
                id: body.id,
                error: {
                  code: -32000,
                  message:
                    "missing trie node: deliberately pruned receipt state",
                },
              }),
            );
            return;
          }
          const upstream = await fetch(cfg.rpcUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: raw,
          });
          response.setHeader("content-type", "application/json");
          response.end(await upstream.text());
        })().catch(() => {
          response.statusCode = 502;
          response.end();
        });
      });
      await new Promise<void>((resolveListen) =>
        server.listen(0, "127.0.0.1", resolveListen),
      );
      const address = server.address();
      if (!address || typeof address === "string") throw Error("NO_PROXY");
      path = resolve(root!, "aged-runtime.json");
      writeFileSync(
        path,
        JSON.stringify({
          ...cfg,
          rpcUrl: `http://127.0.0.1:${address.port}`,
          projectionFailures: 0,
          editProjectionFailures: 0,
          editPauseAfterBatch: false,
        }),
        { mode: 0o600 },
      );
      process.env.BUFFALO_INTEGRITY_ISOLATED_CONFIG = path;
      image = await sharp({
        create: { width: 700, height: 500, channels: 3, background: "#946735" },
      })
        .jpeg()
        .toBuffer();
      await restart();
    }, 30000);
    afterAll(async () => {
      pruned = false;
      await rt?.db.$disconnect();
      await new Promise<void>((resolveClose) =>
        server?.close(() => resolveClose()),
      );
      process.env.BUFFALO_INTEGRITY_ISOLATED_CONFIG = originalPath;
      process.env.BUFFALO_INTEGRITY_MODE = "enabled";
      delete cache.__buffaloCreateRuntime;
      delete cache.__buffaloEditRuntime;
      writeFileSync(
        resolve(root!, "aged-release-proof.json"),
        JSON.stringify(
          {
            at: new Date().toISOString(),
            results,
            deniedHistorical,
            storage: "official Supabase StorageAPI",
            database: "actual PostgreSQL15",
            productionWrites: 0,
          },
          null,
          2,
        ),
      );
    });
    test("authenticated drain rejects new create/revise/edit, pauses an unsigned reservation and resumes the same ID after unpause", async () => {
      const id = await prepared();
      process.env.BUFFALO_INTEGRITY_MODE = "drain";
      await expect(
        createApi().create({
          key: randomUUID(),
          input: input("999000000005102"),
        }),
      ).rejects.toMatchObject({ message: "INTEGRITY_WRITES_PAUSED" });
      await expect(
        createApi().revise({ id, version: 0, input: input() }),
      ).rejects.toMatchObject({ message: "INTEGRITY_WRITES_PAUSED" });
      const row = (await rt.db.pedigree.findUnique({
        where: { microchip: chips.edit },
      }))!;
      await expect(
        editApi().create({
          key: randomUUID(),
          microchip: row.microchip,
          tokenId: row.tokenId.toString(),
          expectedRevision: revisionOf(row),
          patch: { name: "blocked" },
        }),
      ).rejects.toMatchObject({ message: "INTEGRITY_WRITES_PAUSED" });
      const op = await rt.drafts.operations.get(id, sharedAccount());
      const paused = await createApi().advance({
        id,
        version: op.version,
        action: "mint",
      });
      expect(paused.state).toBe("READY");
      expect(paused.reason).toBe("INTEGRITY_WRITES_PAUSED");
      expect((await rt.drafts.operations.steps(id))[0]!.signedBytes).toBeNull();
      process.env.BUFFALO_INTEGRITY_MODE = "enabled";
      const p = ports(rt.engine),
        send = p.broadcast;
      p.broadcast = async () => {
        throw Error("crash after durable signing before broadcast");
      };
      const current = await rt.drafts.operations.get(id, sharedAccount());
      await createApi().advance({
        id,
        version: current.version,
        action: "mint",
      });
      p.broadcast = send;
      const signed = (await rt.drafts.operations.steps(id))[0]!;
      expect(signed.signedBytes).not.toBeNull();
      await restart();
      process.env.BUFFALO_INTEGRITY_MODE = "drain";
      const status = await rt.engine.advance(id, sharedAccount(), "resume");
      expect(status.state).toBe("CHAIN_PENDING");
      await mine();
      // Crash after broadcast, before first effect verification; current reconciliation has no saved proof to rely on.
      expect((await rt.drafts.operations.steps(id))[0]!.proof).toBeNull();
      pruned = true;
      await restart();
      const confirmed = await rt.engine.advance(id, sharedAccount(), "resume");
      expect(confirmed.state).toBe("AWAITING_METADATA_ACTION");
      const step = (await rt.drafts.operations.steps(id))[0]!,
        operation = await rt.drafts.operations.get(id, sharedAccount());
      const evidence = receiptEvidence(operation, step, step.receipt!)!;
      expect(evidence.origin).toBe("current-full-state");
      expect(evidence.observedHead).toBeDefined();
      expect(deniedHistorical).toBeGreaterThan(0);
      // Actual repository reconnect returns details directly; saved canonical evidence survives process memory loss.
      await restart();
      expect((await rt.drafts.operations.steps(id))[0]!.proof).toEqual(
        step.proof,
      );
      expect((await finish(id, rt.engine)).state).toBe("COMPLETED");
      const db = await rt.db.pedigree.findUnique({
        where: { microchip: chips.created },
      });
      expect(db?.name).toBe("Phase5 actual local");
      const json = await fetch(
        rt.storage.publicUrl(`json/${db!.tokenId}.json`),
      );
      expect(json.status).toBe(200);
      expect(await json.text()).toContain("Phase5 actual local");
      process.env.BUFFALO_INTEGRITY_MODE = "off";
      expect(() => getCreateRuntime()).toThrow("INTEGRITY_FEATURE_DISABLED");
      process.env.BUFFALO_INTEGRITY_MODE = "enabled";
      results.push({
        case: "real API drain and signed-resume, same-ID restart before first proof + pruned publication",
        id,
        hash: step.hash,
        origin: evidence.origin,
        token: db!.tokenId.toString(),
        pass: true,
      });
    }, 90000);
    test("pruned first-proof edit reconciles full current state; persisted proof tampering, canonical timestamp and anchor changes reject", async () => {
      const id = await editPrepared("Phase5 aged setter");
      await edit.engine.advance(id, sharedAccount(), "resume");
      await mine();
      await restart();
      const state = await edit.engine.advance(id, sharedAccount(), "resume");
      expect(state.state).toBe("CHAIN_STEPS");
      const step = (await rt.drafts.operations.steps(id))[0]!,
        op = await rt.drafts.operations.get(id, sharedAccount()),
        p = ports(edit.engine);
      const evidence = receiptEvidence(op, step, step.receipt!)!;
      expect(evidence.origin).toBe("current-full-state");
      const tampered = structuredClone(step);
      (tampered.proof as Record<string, unknown>).binding = {
        ...evidence.binding,
        blockTimestamp: "1",
      };
      await expect(
        p.verifyEffects(op, tampered, step.receipt!),
      ).rejects.toThrow("RECEIPT_TIMESTAMP_CHANGED");
      const orphan = structuredClone(step);
      (orphan.proof as Record<string, unknown>).observedHead = {
        ...evidence.observedHead,
        hash: `0x${"aa".repeat(32)}`,
      };
      await expect(p.verifyEffects(op, orphan, step.receipt!)).rejects.toThrow(
        "RECONCILIATION_HEAD_CHANGED",
      );
      const missing = structuredClone(step);
      missing.proof = null;
      denyAll = true;
      await expect(
        p.verifyEffects(op, missing, step.receipt!),
      ).rejects.not.toThrow("HISTORICAL_STATE_REQUIRED");
      denyAll = false;
      await restart();
      expect((await finish(id, edit.engine)).state).toBe("COMPLETED");
      results.push({
        case: "actual setter pruned first-proof, persisted direct JSON shape and rejection boundaries",
        id,
        hash: step.hash,
        pass: true,
      });
    }, 90000);
    test("external state after confirmed canonical proof blocks publication even when historical receipt state is unavailable", async () => {
      const id = await editPrepared("Phase5 publication guard");
      await edit.engine.advance(id, sharedAccount(), "resume");
      await mine();
      await edit.engine.advance(id, sharedAccount(), "resume");
      const row = (await rt.db.pedigree.findUnique({
        where: { microchip: chips.edit },
      }))!;
      const hash = await wallet.writeContract({
        address: cfg.domain.manager,
        abi: managerAbi,
        chain: bitkub_mainnet,
        account: privateKeyToAccount(externalKey),
        functionName: "setName",
        args: [row.tokenId, "External changed after evidence"],
        gas: 2000000n,
      });
      await mine();
      expect((await client.getTransactionReceipt({ hash })).status).toBe(
        "success",
      );
      await restart();
      const state = await finish(id, edit.engine);
      expect(state.state).toBe("NEEDS_REVIEW");
      expect(
        (await rt.db.pedigree.findUnique({ where: { microchip: chips.edit } }))!
          .name,
      ).toBe(row.name);
      results.push({
        case: "current external state cannot hide behind saved canonical proof",
        id,
        reason: state.reason,
        pass: true,
      });
    }, 90000);
    test("our stale signed-but-unsent transaction is retained without rebroadcast or resign", async () => {
      // Separate newly created cow avoids the previous reviewed cow and its partial business state.
      const row = (await rt.db.pedigree.findUnique({
        where: { microchip: chips.created },
      }))!;
      const op = await edit.workflow.create(sharedAccount(), {
        key: randomUUID(),
        microchip: row.microchip,
        tokenId: row.tokenId.toString(),
        expectedRevision: revisionOf(row),
        patch: { color: "Brown" },
      });
      await edit.engine.prepare(op.id, op.owner, op.version);
      const p = ports(edit.engine),
        send = p.broadcast;
      p.broadcast = async () => {
        throw Error("crash before first send");
      };
      await edit.engine.advance(op.id, op.owner, "resume");
      p.broadcast = send;
      const before = (await rt.drafts.operations.steps(op.id))[0]!;
      expect(before.hash).not.toBeNull();
      expect(
        await client
          .getTransactionReceipt({ hash: before.hash as Hex })
          .catch(() => null),
      ).toBeNull();
      const hash = await wallet.writeContract({
        address: cfg.domain.manager,
        abi: managerAbi,
        chain: bitkub_mainnet,
        account: privateKeyToAccount(externalKey),
        functionName: "setName",
        args: [row.tokenId, "External while offline"],
        gas: 2000000n,
      });
      await mine();
      expect((await client.getTransactionReceipt({ hash })).status).toBe(
        "success",
      );
      // The second authorized synthetic ADMIN leaves our wallet nonce unconsumed; guard must stop the stale batch.
      await restart();
      const status = await edit.engine.advance(op.id, op.owner, "resume");
      expect(status.state).toBe("NEEDS_REVIEW");
      const after = (await rt.drafts.operations.steps(op.id))[0]!;
      expect(after.hash).toBe(before.hash);
      expect(after.signedBytes).toBe(before.signedBytes);
      expect(
        await client
          .getTransactionReceipt({ hash: before.hash as Hex })
          .catch(() => null),
      ).toBeNull();
      results.push({
        case: "signed stale journal never blindly rebroadcasts",
        id: op.id,
        hash: before.hash,
        reason: status.reason,
        pass: true,
      });
    }, 90000);
  },
);
