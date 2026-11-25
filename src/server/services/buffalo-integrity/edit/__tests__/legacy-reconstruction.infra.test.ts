/** @jest-environment node */
import { readFileSync, writeFileSync } from "fs";
import { resolve, sep } from "path";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { type Abi } from "viem";
import { type Pedigree } from "@prisma/client";
import { type RawMetadata } from "~/interfaces/i-metadata";
import { abi as managerAbi } from "~/server/blockchain/metadata-maneger/abi";
import { getCreateRuntime } from "../../create/runtime";
import { getEditRuntime } from "../runtime";
import { BuffaloEditWorkflow } from "../workflow";
import { revisionOf } from "../contract";
import { chainSnapshot, databaseSnapshot } from "../../field-policy";
import { type IsolatedConfig } from "../../release/config";

const enabled = !!process.env.BUFFALO_LEGACY_FIXTURE_DIR;
(enabled ? describe : describe.skip)(
  "Legacy102 actual PG14 + mainnet-contract Anvil fork (loopback only)",
  () => {
    let base: ReturnType<typeof getCreateRuntime>;
    let edit: ReturnType<typeof getEditRuntime>;
    let cfg: IsolatedConfig;
    let original: Pedigree;
    let snapshot: string;
    const root = resolve(
      process.env.BUFFALO_LEGACY_FIXTURE_DIR ?? ".tmp/phase102",
    );
    const owner = `legacy102-infra:${randomUUID()}`;
    const created: { id: string; owner: string }[] = [];
    const proofs: Record<string, unknown> = { productionWrites: 0 };
    async function rpc(method: string, params: unknown[] = []) {
      const response = await fetch(cfg.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const body = (await response.json()) as {
        result: unknown;
        error?: unknown;
      };
      if (body.error) throw Error(`LOCAL_RPC_FAILED:${method}`);
      return body.result;
    }
    async function raw() {
      return (await base.workflow.chain.read(
        cfg.domain.manager,
        managerAbi as Abi,
        "getMetadata",
        [102n],
      )) as RawMetadata;
    }
    async function draft(actor: string) {
      const row = await base.db.pedigree.findUniqueOrThrow({
        where: { microchip: original.microchip },
      });
      const op = await edit.workflow.create(actor, {
        key: randomUUID(),
        microchip: row.microchip,
        tokenId: "102",
        expectedRevision: revisionOf(row),
        patch: { image: `${cfg.storageOrigin}/buffalo/replacement.jpg` },
        upload: "image",
      });
      created.push({ id: op.id, owner: actor });
      await edit.workflow.upload(
        op.id,
        actor,
        op.version,
        await sharp({
          create: { width: 40, height: 40, channels: 3, background: "orange" },
        })
          .png()
          .toBuffer(),
        "image/png",
      );
      return base.drafts.operations.get(op.id, actor);
    }
    beforeAll(async () => {
      if (!root.startsWith(resolve(process.cwd(), ".tmp") + sep))
        throw Error("TASK_FIXTURE_REQUIRED");
      const path = resolve(root, "runtime.json");
      cfg = JSON.parse(readFileSync(path, "utf8")) as IsolatedConfig;
      for (const url of [cfg.rpcUrl, cfg.databaseUrl, cfg.storageOrigin])
        if (new URL(url).hostname !== "127.0.0.1")
          throw Error("LOOPBACK_REQUIRED");
      if (
        !!cfg.storageUrl ||
        !resolve(cfg.storageDirectory).startsWith(root + sep)
      )
        throw Error("LOCAL_ASSETS_REQUIRED");
      if (new URL(cfg.databaseUrl).pathname !== "/integrity_legacy102")
        throw Error("DEDICATED_DATABASE_REQUIRED");
      process.env.BUFFALO_INTEGRITY_ISOLATED_CONFIG = path;
      base = getCreateRuntime();
      edit = getEditRuntime();
      const versions = await base.db.$queryRaw<
        { server_version: string }[]
      >`SHOW server_version`;
      expect(versions[0]!.server_version).toMatch(/^14\./);
      original = await base.db.pedigree.findFirstOrThrow({
        where: { tokenId: 102n },
      });
      expect(original.rarity).toBe("Normal");
      for (const prior of await edit.workflow.list("integrity-qa", "102")) {
        if (
          prior.state === "DRAFT" &&
          (await base.drafts.operations.steps(prior.id)).length === 0
        )
          await edit.engine.cancel(prior.id, "integrity-qa");
      }
      snapshot = (await rpc("evm_snapshot")) as string;
      proofs.instanceId = cfg.instanceId;
    }, 30000);
    afterAll(async () => {
      if (!base) return;
      try {
        // Release only this test's unsigned drafts; never discard signed evidence.
        for (const item of created) {
          const op = await base.drafts.operations.get(item.id, item.owner);
          if (
            op.state === "DRAFT" &&
            (await base.drafts.operations.steps(op.id)).length === 0
          )
            await edit.engine.cancel(op.id, item.owner);
        }
        if (snapshot) {
          await rpc("evm_revert", [snapshot]);
          await base.db.pedigree.update({
            where: { microchip: original.microchip },
            data: original,
          });
          const browser = await draft("integrity-qa");
          proofs.browserDraft = browser.id;
          try {
            await edit.engine.prepare(
              browser.id,
              "integrity-qa",
              browser.version,
            );
            proofs.browserDiagnostic = "unexpected_prepare_success";
          } catch (error) {
            proofs.browserDiagnostic =
              error instanceof Error &&
              error.message === "LEGACY_METADATA_RECONSTRUCTION_CONFLICT"
                ? error.message
                : "fixture_read_or_permission_unavailable";
          }
        }
      } finally {
        proofs.createdOperations = created;
        writeFileSync(
          resolve(root, "legacy102-infra-proof.json"),
          JSON.stringify(proofs, null, 2),
        );
        await base.db.$disconnect();
        delete process.env.BUFFALO_INTEGRITY_ISOLATED_CONFIG;
      }
    }, 30000);
    test("exact102 mismatch blocks before broadcast, journal reload preserves cause; reconciled local fixture completes and retry is idempotent", async () => {
      const before = await raw();
      expect(before.certify.rarity).toBe("Super Special Rare");
      const nonce = await rpc("eth_getTransactionCount", [
        cfg.sender,
        "latest",
      ]);
      const op = await draft(owner);
      await expect(
        edit.engine.prepare(op.id, owner, op.version),
      ).rejects.toThrow("LEGACY_METADATA_RECONSTRUCTION_CONFLICT");
      const reloaded = new BuffaloEditWorkflow(
        base.db,
        base.drafts,
        base.storage,
        base.workflow.chain,
      );
      const view = await reloaded.view(op.id, owner, edit.engine);
      expect(view.state).toBe("DRAFT");
      expect(view.diagnostic?.legacyReconstruction).toEqual({
        version: 1,
        issues: [{ field: "rarity", kind: "business_mismatch" }],
      });
      expect(await base.drafts.operations.steps(op.id)).toEqual([]);
      expect(await rpc("eth_getTransactionCount", [cfg.sender, "latest"])).toBe(
        nonce,
      );
      expect(await raw()).toEqual(before);
      expect(
        await base.db.pedigree.findUniqueOrThrow({
          where: { microchip: original.microchip },
        }),
      ).toEqual(original);
      await edit.engine.cancel(op.id, owner);
      await base.db.pedigree.update({
        where: { microchip: original.microchip },
        data: { rarity: "Super Special Rare" },
      });
      const corrected = await base.db.pedigree.findUniqueOrThrow({
        where: { microchip: original.microchip },
      });
      const replacement = await draft(owner);
      await edit.engine.prepare(replacement.id, owner, replacement.version);
      let state = await edit.engine.status(replacement.id, owner);
      for (let i = 0; i < 24 && state.state !== "COMPLETED"; i++) {
        state = await edit.engine.advance(replacement.id, owner, "resume");
        await rpc("anvil_mine", ["0x3"]);
      }
      expect(state.state).toBe("COMPLETED");
      const after = await raw();
      expect(chainSnapshot(after)).toEqual({
        ...chainSnapshot(before),
        image: after.imageUri,
      });
      expect(after.relation).toEqual(before.relation);
      expect(after.certify).toEqual(before.certify);
      expect(after.birthdate).toBe(before.birthdate);
      const row = await base.db.pedigree.findUniqueOrThrow({
        where: { microchip: original.microchip },
      });
      expect(databaseSnapshot(row)).toEqual({
        ...databaseSnapshot(corrected),
        image: after.imageUri,
      });
      const finalNonce = await rpc("eth_getTransactionCount", [
        cfg.sender,
        "latest",
      ]);
      expect(
        (await edit.engine.advance(replacement.id, owner, "resume")).state,
      ).toBe("COMPLETED");
      expect(await rpc("eth_getTransactionCount", [cfg.sender, "latest"])).toBe(
        finalNonce,
      );
      proofs.blocked = op.id;
      proofs.completed = replacement.id;
      proofs.steps = state.steps.map((s) => ({
        kind: s.kind,
        state: s.state,
        hash: s.hash,
      }));
      proofs.bookkeeping = {
        beforeCreatedAt: before.createdAt.toString(),
        afterCreatedAt: after.createdAt.toString(),
        beforeUpdatedAt: before.updatedAt.toString(),
        afterUpdatedAt: after.updatedAt.toString(),
      };
    }, 120000);
  },
);
