/** @jest-environment node */
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { randomUUID } from "crypto";
import sharp from "sharp";
import {
  type Abi,
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getCreateRuntime } from "../../create/runtime";
import { BuffaloEditWorkflow } from "../workflow";
import { OperationEngine } from "../../operations/engine";
import { loopbackChainPorts } from "../../operations/loopback";
import { revisionOf, type EditPatch } from "../contract";
import {
  chainSnapshot,
  databaseSnapshot,
  type BusinessField,
} from "../../field-policy";
import { type RawMetadata } from "~/interfaces/i-metadata";
import { abi as managerAbi } from "~/server/blockchain/metadata-maneger/abi";
import { abi as nftAbi } from "~/server/blockchain/nft/abi";
import { bitkub_mainnet } from "~/server/blockchain/chain";
const enabled = !!process.env.BUFFALO_INTEGRITY_PHASE4_FIXTURE_DIR;
const infra = enabled ? describe : describe.skip;
infra(
  "Phase4 real PG15 + unchanged deployed contracts on a task-owned Anvil fork",
  () => {
    const root =
        process.env.BUFFALO_INTEGRITY_PHASE4_FIXTURE_DIR ?? ".tmp/phase4",
      path = resolve(root, "runtime.json");
    let runtime: ReturnType<typeof getCreateRuntime>,
      cfg: {
        rpcUrl: string;
        privateKey: Hex;
        instanceId: string;
        codeHashes: Record<string, string>;
      },
      chip = "999000000004010",
      token: bigint;
    let client: ReturnType<typeof createPublicClient>,
      wallet: ReturnType<typeof createWalletClient>;
    const owner = `phase4-infra:${randomUUID()}`;
    const proofs: unknown[] = [];
    const rewardId = `phase4-reward:${randomUUID()}`;
    const rpc = async (method: string, params: unknown[] = []) => {
      const r = await fetch(cfg.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const x = (await r.json()) as { result: unknown; error?: unknown };
      if (x.error) throw Error(`LOCAL_RPC:${method}`);
      return x.result;
    };
    const mine = () => rpc("anvil_mine", ["0x3"]);
    function setup(
      faults: { pauseAfterBatch?: boolean; projectionFailures?: number } = {},
      beforeSign?: () => Promise<void>,
    ) {
      const workflow = new BuffaloEditWorkflow(
        runtime.db,
        runtime.drafts,
        runtime.storage,
        runtime.workflow.chain,
        faults,
      );
      const ports = loopbackChainPorts({
        rpcUrl: cfg.rpcUrl,
        privateKey: cfg.privateKey,
        domain: runtime.workflow.chain.domain,
        codeHashes: cfg.codeHashes,
        expectedInstanceId: cfg.instanceId,
        maxFeeWei: "50000000000000000",
        prepare: (op) => workflow.prepare(op),
        nextStep: (op, steps) => workflow.nextStep(op, steps),
        beforeSign: async (op) => {
          await beforeSign?.();
          await workflow.guard(
            op,
            (await runtime.drafts.operations.steps(op.id)).filter(
              (s) => s.state === "CONFIRMED",
            ),
          );
        },
        project: (op, steps) => workflow.project(op, steps),
        verifyPublication: (op, steps, p) =>
          workflow.verifyPublication(op, steps, p),
      });
      return {
        workflow,
        ports,
        engine: new OperationEngine(runtime.drafts.operations, ports),
      };
    }
    async function prepare(c: ReturnType<typeof setup>, patch: EditPatch) {
      const row = await runtime.db.pedigree.findUniqueOrThrow({
          where: { microchip: chip },
        }),
        op = await c.workflow.create(owner, {
          key: randomUUID(),
          microchip: chip,
          tokenId: token.toString(),
          expectedRevision: revisionOf(row),
          patch,
          ...(patch.image ? { upload: "image" as const } : {}),
        });
      if (patch.image)
        await c.workflow.upload(
          op.id,
          owner,
          op.version,
          await sharp({
            create: { width: 40, height: 40, channels: 3, background: "white" },
          })
            .png()
            .toBuffer(),
          "image/png",
        );
      const fresh = await runtime.drafts.operations.get(op.id, owner);
      await c.engine.prepare(op.id, owner, fresh.version);
      return runtime.drafts.operations.get(op.id, owner);
    }
    async function finish(
      c: ReturnType<typeof setup>,
      id: string,
      stopRecovery = false,
    ) {
      let status = await c.engine.status(id, owner);
      for (
        let i = 0;
        i < 18 &&
        ![
          "COMPLETED",
          "NEEDS_REVIEW",
          ...(stopRecovery && i > 0 ? ["RECOVERY_REQUIRED"] : []),
        ].includes(status.state);
        i++
      ) {
        status = await c.engine.advance(id, owner, "resume");
        await mine();
      }
      return status;
    }
    const raw = async () =>
      (await runtime.workflow.chain.read(
        runtime.workflow.chain.domain.manager,
        managerAbi as Abi,
        "getMetadata",
        [token],
      )) as RawMetadata;
    beforeAll(async () => {
      process.env.BUFFALO_INTEGRITY_ISOLATED_CONFIG = path;
      cfg = JSON.parse(readFileSync(path, "utf8")) as typeof cfg;
      if (new URL(cfg.rpcUrl).hostname !== "127.0.0.1")
        throw Error("LOOPBACK_REQUIRED");
      runtime = getCreateRuntime();
      expect(
        (
          await runtime.db.$queryRaw<
            { server_version: string }[]
          >`SHOW server_version`
        )[0]!.server_version,
      ).toMatch(/^15\./);
      const row = await runtime.db.pedigree.findUniqueOrThrow({
        where: { microchip: chip },
      });
      token = row.tokenId;
      await runtime.db.reward.create({
        data: {
          id: rewardId,
          microchip: chip,
          eventName: "Synthetic P4",
          rewardName: "preserve reward FK",
        },
      });
      client = createPublicClient({
        chain: bitkub_mainnet,
        transport: http(cfg.rpcUrl, { retryCount: 0 }),
      });
      wallet = createWalletClient({
        chain: bitkub_mainnet,
        account: privateKeyToAccount(cfg.privateKey),
        transport: http(cfg.rpcUrl, { retryCount: 0 }),
      });
    }, 30000);
    afterAll(async () => {
      if (runtime) {
        await runtime.db.$disconnect();
        writeFileSync(
          resolve(root, "edit-infra-proof.json"),
          JSON.stringify(
            {
              instanceId: cfg.instanceId,
              token: token.toString(),
              proofs,
              productionWrites: 0,
            },
            null,
            2,
          ),
        );
      }
      delete process.env.BUFFALO_INTEGRITY_ISOLATED_CONFIG;
    });
    test("raw N/A literals and legacy intraday seconds survive actual batch, exact DNA restoration and receipt readback", async () => {
      const original = await raw(),
        domain = runtime.workflow.chain.domain;
      const input = {
        name: original.name,
        microchip: original.certify.microchip,
        certNo: "N/A",
        origin: "N/A",
        color: original.color,
        imageUri: original.imageUri,
        detail: "N/A",
        sex: original.sex,
        rarity: original.certify.rarity,
        birthdate: original.birthdate + 3601n,
        height: original.height,
        issuedAt: original.certify.issuedAt,
      };
      for (const [functionName, args] of [
        ["addMetadataBatch", [[token], [input]]],
        ["setDNA", [token, "N/A"]],
      ] as const) {
        const hash = await wallet.writeContract({
          account: privateKeyToAccount(cfg.privateKey),
          chain: bitkub_mainnet,
          address: domain.manager as Address,
          abi: managerAbi,
          functionName,
          args,
          gas: 2500000n,
        });
        await mine();
        expect((await client.waitForTransactionReceipt({ hash })).status).toBe(
          "success",
        );
      }
      const c = setup(),
        op = await prepare(c, { color: "P4 raw literal fixture" }),
        status = await finish(c, op.id);
      expect(status.state).toBe("COMPLETED");
      expect(status.steps.map((s) => s.kind)).toEqual([
        "batch",
        "dna_restore",
        "uri",
      ]);
      const after = await raw();
      expect(after).toMatchObject({
        origin: "N/A",
        detail: "N/A",
        birthdate: input.birthdate,
        certify: {
          certNo: "N/A",
          dna: "N/A",
          issuedAt: original.certify.issuedAt,
        },
        relation: original.relation,
      });
      proofs.push({
        case: "raw-literal-intraday-preservation",
        id: op.id,
        steps: status.steps,
      });
    }, 120000);
    const cases: Array<[BusinessField, string]> = [
      ["name", "ชื่อแก้ไขจริง Phase4"],
      ["height", "166"],
      ["certNo", "CERT-P4-UPDATED"],
      ["detail", "รายละเอียดแก้ไขจริง"],
      ["rarity", "Super Rare"],
      ["dna", "https://example.test/dna/p4-new"],
      ["fatherId", ""],
      ["motherId", ""],
      ["birthday", "2021-07-03"],
      ["origin", "Thailand North"],
      ["color", "White"],
      ["sex", "Female"],
      ["image", "https://upload.invalid/pending"],
      ["microchip", "999000000004099"],
    ];
    test.each(cases)(
      "%s actual deployed setter/batch/restore/URI and DB/JSON aliases preserve all other business fields",
      async (field, value) => {
        const c = setup(),
          originalRaw = await raw(),
          baseline = chainSnapshot(originalRaw),
          counterBefore = (await runtime.workflow.chain.read(
            runtime.workflow.chain.domain.manager,
            managerAbi as Abi,
            "totalMetadata",
          )) as bigint,
          before = await runtime.db.pedigree.findUniqueOrThrow({
            where: { microchip: chip },
          }),
          approved = await client.readContract({
            address: runtime.workflow.chain.domain.nft as Address,
            abi: nftAbi,
            functionName: "getApproved",
            args: [token],
          }),
          approvals = await client.readContract({
            address: runtime.workflow.chain.domain.manager as Address,
            abi: managerAbi,
            functionName: "getApprovedByTokenId",
            args: [token, false],
          });
        const op = await prepare(c, { [field]: value });
        const status = await finish(c, op.id);
        expect(status).toMatchObject({ state: "COMPLETED" });
        if (op.intent.kind !== "edit") throw Error();
        const expected = { ...baseline, ...op.intent.patch };
        expect(chainSnapshot(await raw())).toEqual(expected);
        if (field === "microchip") {
          const old = chip;
          chip = value;
          expect(
            (
              await runtime.db.reward.findUniqueOrThrow({
                where: { id: rewardId },
              })
            ).microchip,
          ).toBe(value);
          expect(
            await runtime.workflow.chain.read(
              runtime.workflow.chain.domain.manager,
              managerAbi as Abi,
              "microchipToTokenId",
              [old],
            ),
          ).toBe(token);
        }
        const after = await runtime.db.pedigree.findUniqueOrThrow({
          where: { microchip: chip },
        });
        expect(databaseSnapshot(after)).toEqual({
          ...databaseSnapshot(before),
          ...op.intent.patch,
        });
        expect(after.createdAt).toBe(before.createdAt);
        const afterRaw = await raw(),
          batchStep = status.steps.find((step) => step.kind === "batch"),
          historyStep = status.steps
            .filter(
              (step) =>
                step.kind === "batch" ||
                step.kind === "parents" ||
                (step.kind === "setter" && field !== "dna"),
            )
            .at(-1),
          uriStep = status.steps.find((step) => step.kind === "uri")!;
        const batchBlock = batchStep?.receipt
          ? await client.getBlock({
              blockNumber: BigInt(batchStep.receipt.blockNumber),
            })
          : null;
        const historyBlock = historyStep?.receipt
          ? await client.getBlock({
              blockNumber: BigInt(historyStep.receipt.blockNumber),
            })
          : null;
        const uriBlock = await client.getBlock({
          blockNumber: BigInt(uriStep.receipt!.blockNumber),
        });
        expect(afterRaw.createdAt).toBe(
          batchBlock?.timestamp ?? originalRaw.createdAt,
        );
        expect(afterRaw.updatedAt).toBe(
          historyBlock?.timestamp ?? originalRaw.updatedAt,
        );
        expect(
          await runtime.workflow.chain.read(
            runtime.workflow.chain.domain.manager,
            managerAbi as Abi,
            "totalMetadata",
          ),
        ).toBe(counterBefore + (batchStep ? 1n : 0n));
        const nftRecord = (await client.readContract({
          address: runtime.workflow.chain.domain.nft as Address,
          abi: nftAbi,
          functionName: "tokenIdToUri",
          args: [token],
        })) as readonly [string, string, bigint, bigint];
        expect(nftRecord[2]).toBe(uriBlock.timestamp);
        expect(nftRecord[3]).toBe(uriBlock.timestamp);

        expect(
          await client.readContract({
            address: runtime.workflow.chain.domain.nft as Address,
            abi: nftAbi,
            functionName: "getApproved",
            args: [token],
          }),
        ).toBe(approved);
        expect(
          await client.readContract({
            address: runtime.workflow.chain.domain.manager as Address,
            abi: managerAbi,
            functionName: "getApprovedByTokenId",
            args: [token, false],
          }),
        ).toEqual(approvals);
        proofs.push({
          field,
          id: op.id,
          state: status.state,
          steps: status.steps,
        });
      },
      120000,
    );
    test("real durable batch crash, process reconstruction, exact DNA restoration and post-restore projection failure recover same hashes", async () => {
      const c = setup({ pauseAfterBatch: true, projectionFailures: 1 }),
        before = await runtime.db.pedigree.findUniqueOrThrow({
          where: { microchip: chip },
        }),
        dna = (await raw()).certify.dna,
        op = await prepare(c, { color: "Brown" });
      let status = await finish(c, op.id, true);
      expect(status.state).toBe("RECOVERY_REQUIRED");
      expect((await raw()).certify.dna).toBe("");
      expect(
        (
          await runtime.db.pedigree.findUniqueOrThrow({
            where: { microchip: chip },
          })
        ).color,
      ).toBe(before.color);
      const batchHash = status.steps[0]!.hash;
      const restored = setup({ projectionFailures: 1 });
      status = await finish(restored, op.id, true);
      expect(status.state).toBe("RECOVERY_REQUIRED");
      expect((await raw()).certify.dna).toBe(dna);
      expect(
        (
          await runtime.db.pedigree.findUniqueOrThrow({
            where: { microchip: chip },
          })
        ).color,
      ).toBe(before.color);
      status = await finish(setup(), op.id);
      expect(status.state).toBe("COMPLETED");
      expect(status.steps[0]!.hash).toBe(batchHash);
      expect(status.steps.map((s) => s.kind)).toEqual([
        "batch",
        "dna_restore",
        "uri",
      ]);
      proofs.push({
        case: "crash-preservation",
        id: op.id,
        steps: status.steps,
      });
    }, 120000);
    test("unsigned beforeSign review can cancel and release real PG wallet; signed operations cannot cancel", async () => {
      const c = setup({}, async () => {
          const hash = await wallet.writeContract({
            account: privateKeyToAccount(cfg.privateKey),
            chain: bitkub_mainnet,
            address: runtime.workflow.chain.domain.manager as Address,
            abi: managerAbi,
            functionName: "setDetail",
            args: [token, "local external change before managed signing"],
            gas: 1500000n,
          });
          await mine();
          expect(
            (await client.waitForTransactionReceipt({ hash })).status,
          ).toBe("success");
        }),
        op = await prepare(c, { name: "blocked before sign" });
      const status = await c.engine.advance(op.id, owner, "resume");
      expect(status).toMatchObject({ state: "NEEDS_REVIEW", canCancel: true });
      expect(status.steps.every((s) => s.hash === null)).toBe(true);
      const lease = await runtime.db.$queryRaw<
        { active_step: string | null }[]
      >`SELECT active_step FROM buffalo_integrity.wallet_lease WHERE sender=${runtime.workflow.chain.sender.toLowerCase()}`;
      expect(lease.some((l) => l.active_step !== null)).toBe(true);
      await c.engine.cancel(op.id, owner);
      const next = setup(),
        other = await prepare(next, { name: "wallet released" });
      const pending = await next.engine.advance(other.id, owner, "resume");
      expect(pending.steps[0]!.hash).not.toBeNull();
      await expect(next.engine.cancel(other.id, owner)).rejects.toThrow(
        "CANNOT_CANCEL_SIGNED_OPERATION",
      );
      expect((await finish(next, other.id)).state).toBe("COMPLETED");
      proofs.push({
        case: "unsigned-review-wallet-release",
        cancelled: op.id,
        next: other.id,
      });
    }, 120000);
    test("external baseline changes after real confirmed destructive batch block blind restore and preserve old DB", async () => {
      const c = setup({ pauseAfterBatch: true }),
        before = await runtime.db.pedigree.findUniqueOrThrow({
          where: { microchip: chip },
        }),
        op = await prepare(c, { origin: "external conflict fixture" });
      expect((await finish(c, op.id, true)).state).toBe("RECOVERY_REQUIRED");
      const hash = await wallet.writeContract({
        account: privateKeyToAccount(cfg.privateKey),
        chain: bitkub_mainnet,
        address: runtime.workflow.chain.domain.manager as Address,
        abi: managerAbi,
        functionName: "setDetail",
        args: [token, "out-of-band local fixture change"],
        gas: 1500000n,
      });
      await mine();
      expect((await client.waitForTransactionReceipt({ hash })).status).toBe(
        "success",
      );
      const status = await setup().engine.advance(op.id, owner, "resume");
      expect(status).toMatchObject({
        state: "NEEDS_REVIEW",
        reason: "EXTERNAL_CHAIN_BASELINE_CHANGED",
        canCancel: false,
      });
      await expect(c.engine.cancel(op.id, owner)).rejects.toThrow(
        "CANNOT_CANCEL_SIGNED_OPERATION",
      );
      expect(
        (
          await runtime.db.pedigree.findUniqueOrThrow({
            where: { microchip: chip },
          })
        ).origin,
      ).toBe(before.origin);
      proofs.push({
        case: "external-baseline-review",
        id: op.id,
        steps: status.steps,
      });
    }, 120000);
  },
);
