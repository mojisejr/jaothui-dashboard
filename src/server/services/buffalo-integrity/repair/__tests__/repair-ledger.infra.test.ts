/** @jest-environment node */
import { randomUUID } from "crypto";
import { type Prisma, PrismaClient } from "@prisma/client";
import { PostgresOperationRepository } from "../../operations/postgres";
import { OperationEngine } from "../../operations/engine";
import {
  domain,
  intent as createIntent,
  fakeChain,
  plan as chainPlan,
} from "../../operations/testing-fixtures";
import { payloadHash, asJson } from "../../operations/hash";
import { type Json } from "../../operations/types";
import { readRepairDatabaseSnapshot } from "../db-projection";
import {
  type RepairIntent,
  type RepairExecutionManifest,
} from "../execution-contract";
const url = process.env.BUFFALO_REPAIR_TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  "real PG fenced repair ledger and atomic completion",
  () => {
    let db: PrismaClient, other: PrismaClient;
    let serial = Number(String(Date.now()).slice(-9));
    const owner = `repair-ledger:${randomUUID()}`;
    beforeAll(() => {
      const u = new URL(url!);
      if (
        u.hostname !== "127.0.0.1" ||
        u.port !== "55437" ||
        u.pathname !== "/repair_feasibility"
      )
        throw Error("DISPOSABLE_REPAIR_DATABASE_REQUIRED");
      db = new PrismaClient({ datasources: { db: { url: url! } }, log: [] });
      other = new PrismaClient({ datasources: { db: { url: url! } }, log: [] });
    });
    afterAll(async () => {
      await Promise.all([db?.$disconnect(), other?.$disconnect()]);
    });
    async function fixture() {
      const key = randomUUID(),
        chip = `997${String(++serial).padStart(12, "0")}`,
        token = BigInt(chip) * 10n;
      await db.pedigree.create({
        data: {
          microchip: chip,
          name: "Original",
          birthday: new Date("2024-01-01"),
          sex: "Male",
          color: "Black",
          createdAt: "original-created",
          updatedAt: "original-updated",
          detail: "detail",
          dna: "DNA",
          tokenId: token,
        },
      });
      const snapshot = await db.$transaction((tx) =>
        readRepairDatabaseSnapshot(tx),
      );
      const target = {
        sourceMicrochip: chip,
        desiredMicrochip: chip,
        desiredTokenId: String(token + 1n),
        evidence: [
          { kind: "physical_scan" as const, reference: "isolated-fixture" },
        ],
      };
      const manifest: RepairExecutionManifest = {
        version: 1,
        operationId: key,
        mode: "database_only",
        createdAt: Date.now(),
        expiresAt: Date.now() + 300000,
        domain: { ...domain, chainId: 96 },
        targets: [target],
        reservationChips: [chip],
        reservationTokens: [String(token), String(token + 1n)],
        database: {
          targets: [
            {
              sourceMicrochip: chip,
              desiredMicrochip: chip,
              desiredTokenId: String(token + 1n),
              baseline: snapshot.rows.find((row) => row.microchip === chip)!
                .baseline,
            },
          ],
          references: [],
          catalogDigest: snapshot.catalogDigest,
          closureChips: [chip],
          closureTokens: [String(token), String(token + 1n)],
        },
        chain: {
          pin: {},
          metadataCounter: "0",
          tokens: [],
          aliases: [],
          steps: [],
        },
        assets: [],
        fees: { perStep: [], totalMaxFeeWei: "0" },
        effects: {},
        coverage: {},
      };
      const intent: RepairIntent = {
        kind: "identity_repair",
        mode: "database_only",
        operationId: key,
        approvalFingerprint: payloadHash({ fixture: key }),
        manifestHash: payloadHash(manifest),
        manifest,
      };
      return {
        key,
        chip,
        token,
        intent,
        repo: new PostgresOperationRepository(db),
        otherRepo: new PostgresOperationRepository(other),
      };
    }
    async function ready(f: Awaited<ReturnType<typeof fixture>>) {
      const op = await f.repo.create(owner, f.key, f.intent, domain),
        claim = (await f.repo.claim(op.id, owner, randomUUID()))!;
      await f.repo.readyDatabaseRepair(
        claim,
        {
          kind: "database_repair",
          domain,
          approvalFingerprint: f.intent.approvalFingerprint,
          context: {},
        },
        op.version,
      );
      return { op, claim, version: (await f.repo.get(op.id, owner)).version };
    }
    test("same key is one operation; lost prepare response is owner-scoped readonly lookup", async () => {
      const f = await fixture();
      const ops = await Promise.all([
        f.repo.create(owner, f.key, f.intent, domain),
        f.otherRepo.create(owner, f.key, f.intent, domain),
      ]);
      expect(ops[0].id).toBe(f.key);
      expect(ops[1].id).toBe(f.key);
      expect((await f.repo.getByKey(owner, f.key))?.id).toBe(f.key);
      expect(await f.repo.getByKey("other", f.key)).toBeNull();
      await expect(
        f.repo.create(
          owner,
          f.key,
          { ...f.intent, approvalFingerprint: "b".repeat(64) },
          domain,
        ),
      ).rejects.toThrow("IDEMPOTENCY_PAYLOAD_CONFLICT");
    });
    test("shared old/new token and chip reservations block both create and edit", async () => {
      const f = await fixture();
      await f.repo.create(owner, f.key, f.intent, domain);
      await expect(
        f.otherRepo.create(
          "creator",
          randomUUID(),
          {
            ...createIntent,
            buffalo: { ...createIntent.buffalo, microchip: f.chip },
          },
          domain,
        ),
      ).rejects.toThrow("COW_ALREADY_RESERVED");
      await expect(
        f.otherRepo.create(
          "editor",
          randomUUID(),
          {
            kind: "edit",
            microchip: "996000000000001",
            tokenId: String(f.token + 1n),
            patch: { name: "changed" },
          },
          domain,
        ),
      ).rejects.toThrow("COW_ALREADY_RESERVED");
    });
    test("DB-only approval/advance never enters generic signer or chain path", async () => {
      const f = await fixture(),
        op = await f.repo.create(owner, f.key, f.intent, domain),
        chain = fakeChain(),
        engine = new OperationEngine(f.repo, chain);
      await expect(engine.prepare(op.id, owner, op.version)).rejects.toThrow(
        "REPAIR_DATABASE_EXECUTOR_REQUIRED",
      );
      expect(chain.prepare).not.toHaveBeenCalled();
      expect(chain.sign).not.toHaveBeenCalled();
      const claim = (await f.repo.claim(op.id, owner, randomUUID()))!;
      await f.repo.readyDatabaseRepair(
        claim,
        {
          kind: "database_repair",
          domain,
          approvalFingerprint: f.intent.approvalFingerprint,
          context: {},
        },
        op.version,
      );
      await f.repo.release(claim);
      await expect(engine.advance(op.id, owner, "resume")).rejects.toThrow(
        "REPAIR_DATABASE_EXECUTOR_REQUIRED",
      );
      expect(chain.nonce).not.toHaveBeenCalled();
    });
    test("COMPLETED, proof, projection and reservation release commit once; lost response resumes stored proof", async () => {
      const f = await fixture(),
        r = await ready(f);
      const proof = await f.repo.completeDatabaseRepair(r.claim, r.version);
      const saved = await f.otherRepo.get(r.op.id, owner);
      expect(saved.state).toBe("COMPLETED");
      expect(saved.result).toEqual(asJson(proof));
      expect(await f.repo.steps(r.op.id)).toEqual([]);
      expect(
        (
          await other.pedigree.findUniqueOrThrow({
            where: { microchip: f.chip },
          })
        ).tokenId,
      ).toBe(f.token + 1n);
      expect(
        await other.$queryRaw`SELECT key FROM buffalo_integrity.reservation WHERE operation_id=${r.op.id}::uuid`,
      ).toEqual([]);
      await f.repo.release(r.claim);
      const restart = (await f.otherRepo.claim(r.op.id, owner, randomUUID()))!;
      expect(
        await f.otherRepo.completeDatabaseRepair(restart, r.version),
      ).toEqual(proof);
      const events = await db.$queryRaw<
        { count: bigint }[]
      >`SELECT count(*) FROM buffalo_integrity.event WHERE operation_id=${r.op.id}::uuid AND kind='COMPLETED'`;
      expect(events[0]!.count).toBe(1n);
      await f.otherRepo.release(restart);
    });
    test("failure after row mutation and before completion event rolls everything back", async () => {
      const f = await fixture(),
        r = await ready(f);
      const seam = f.repo as unknown as {
        event(
          tx: Prisma.TransactionClient,
          id: string,
          kind: string,
          detail?: Json,
          stepId?: string | null,
        ): Promise<void>;
      };
      const original = seam.event.bind(f.repo),
        spy = jest.spyOn(seam, "event").mockImplementation(async (...args) => {
          if (args[2] === "COMPLETED") throw Error("INJECTED_COMMIT_BOUNDARY");
          return original(...args);
        });
      await expect(
        f.repo.completeDatabaseRepair(r.claim, r.version),
      ).rejects.toThrow("INJECTED_COMMIT_BOUNDARY");
      spy.mockRestore();
      expect((await f.otherRepo.get(r.op.id, owner)).state).toBe("READY");
      expect(
        (
          await other.pedigree.findUniqueOrThrow({
            where: { microchip: f.chip },
          })
        ).tokenId,
      ).toBe(f.token);
      expect(
        await other.$queryRaw`SELECT id FROM buffalo_integrity.event WHERE operation_id=${r.op.id}::uuid AND kind='REPAIR_DATABASE_PROJECTED'`,
      ).toEqual([]);
      expect(
        (
          await other.$queryRaw<
            unknown[]
          >`SELECT key FROM buffalo_integrity.reservation WHERE operation_id=${r.op.id}::uuid`
        ).length,
      ).toBe(3);
      await f.repo.completeDatabaseRepair(r.claim, r.version);
      await f.repo.release(r.claim);
    });
    test("stale fence/version and missing reservations cannot mutate", async () => {
      const f = await fixture(),
        r = await ready(f);
      await expect(
        f.repo.completeDatabaseRepair(
          { ...r.claim, fence: String(BigInt(r.claim.fence) + 1n) },
          r.version,
        ),
      ).rejects.toThrow("STALE_OPERATION_LEASE");
      await expect(
        f.repo.completeDatabaseRepair(r.claim, r.version - 1),
      ).rejects.toThrow("STALE_OPERATION_REVISION");
      await db.$executeRaw`DELETE FROM buffalo_integrity.reservation WHERE operation_id=${r.op.id}::uuid`;
      await expect(
        f.repo.completeDatabaseRepair(r.claim, r.version),
      ).rejects.toThrow("REPAIR_RESERVATION_LOST");
      expect(
        (await db.pedigree.findUniqueOrThrow({ where: { microchip: f.chip } }))
          .tokenId,
      ).toBe(f.token);
      await f.repo.release(r.claim);
    });
    test("generic no-chain completion guard remains for create/edit", async () => {
      const f = await fixture(),
        op = await f.repo.create(
          owner,
          randomUUID(),
          {
            ...createIntent,
            buffalo: { ...createIntent.buffalo, microchip: f.chip },
          },
          domain,
        ),
        claim = (await f.repo.claim(op.id, owner, randomUUID()))!;
      await f.repo.ready(claim, chainPlan);
      await expect(
        f.repo.complete(claim, {
          database: "db",
          storage: "storage",
          manifest: "manifest",
        }),
      ).rejects.toThrow("NO_CHAIN_PROOF");
      await f.repo.cancel(claim);
      await f.repo.release(claim);
    });
    test("chain completion revalidates the committed DB proof atomically and cannot publish stale success", async () => {
      const f = await fixture();
      const manifest = { ...f.intent.manifest, mode: "chain" as const };
      const requested = {
        ...f.intent,
        mode: "chain" as const,
        manifest,
        manifestHash: payloadHash(manifest),
      };
      const op = await f.repo.create(owner, f.key, requested, domain);
      const claim = (await f.repo.claim(op.id, owner, randomUUID()))!;
      await f.repo.ready(claim, chainPlan);
      // Synthetic confirmed prerequisite isolates the SQL boundary; actual contract proof is a separate fork suite.
      const step = await f.repo.reserveStep(
        claim,
        {
          kind: "batch",
          call: { to: domain.manager, data: "0x1234", value: "0", effects: [] },
        },
        0,
        chainPlan,
      );
      await f.repo.markStep(
        claim,
        step,
        "CONFIRMED",
        {
          transactionHash: "fixture-hash",
          blockHash: "fixture-block",
          blockNumber: "1",
          status: "success",
        },
        { details: { fixture: true } },
      );
      await f.repo.setState(claim, "PROJECTING");
      const proof = await f.repo.projectRepairDatabase(claim);
      await f.repo.setState(claim, "VERIFYING");
      await other.pedigree.update({
        where: { microchip: f.chip },
        data: { name: "external-after-verify" },
      });
      await expect(
        f.repo.complete(claim, {
          database: proof.database,
          storage: "fixture",
          manifest: requested.manifestHash,
        }),
      ).rejects.toThrow("REPAIR_BASELINE_CHANGED");
      expect((await f.repo.get(op.id, owner)).state).toBe("VERIFYING");
      await other.pedigree.update({
        where: { microchip: f.chip },
        data: { name: "Original" },
      });
      await f.repo.complete(claim, {
        database: proof.database,
        storage: "fixture",
        manifest: requested.manifestHash,
      });
      expect((await f.repo.get(op.id, owner)).state).toBe("COMPLETED");
      await f.repo.release(claim);
    });
    async function pairFixture(swapKeys = true) {
      const a = await fixture(),
        b = await fixture();
      await Promise.all(
        [a, b].map((f) =>
          db.pedigree.update({
            where: { microchip: f.chip },
            data: { name: `Cow-${f.chip}`, dna: `DNA-${f.chip}` },
          }),
        ),
      );
      const rewards = await Promise.all(
        [a, b].map((f) =>
          db.reward.create({
            data: {
              id: randomUUID(),
              microchip: f.chip,
              eventName: "pair-event",
              rewardName: f.chip,
            },
          }),
        ),
      );
      const snapshot = await db.$transaction((tx) =>
        readRepairDatabaseSnapshot(tx),
      );
      const members = [a, b];
      const targets = members.map((f, index) => ({
        ...f.intent.manifest.targets[0]!,
        desiredMicrochip: swapKeys ? members[1 - index]!.chip : f.chip,
        desiredTokenId: String(swapKeys ? f.token : members[1 - index]!.token),
      }));
      const chips = members.map((f) => f.chip),
        tokens = members.map((f) => String(f.token));
      const manifest: RepairExecutionManifest = {
        ...a.intent.manifest,
        targets,
        reservationChips: chips,
        reservationTokens: tokens,
        database: {
          targets: targets.map((target) => ({
            sourceMicrochip: target.sourceMicrochip,
            desiredMicrochip: target.desiredMicrochip,
            desiredTokenId: target.desiredTokenId,
            baseline: snapshot.rows.find(
              (row) => row.microchip === target.sourceMicrochip,
            )!.baseline,
          })),
          references: snapshot.references.filter((ref) =>
            ref.chips.some((chip) => chips.includes(chip)),
          ),
          catalogDigest: snapshot.catalogDigest,
          closureChips: chips,
          closureTokens: tokens,
        },
      };
      return {
        ...a,
        intent: { ...a.intent, manifest, manifestHash: payloadHash(manifest) },
        members,
        rewards,
      };
    }
    test("pair PK swap commits both physical identities and Reward ownership; lost response cannot swap twice", async () => {
      const f = await pairFixture(),
        r = await ready(f);
      const proof = await f.repo.completeDatabaseRepair(r.claim, r.version);
      for (const [index, member] of f.members.entries()) {
        const target = f.intent.manifest.database.targets[index]!;
        expect(
          (
            await other.pedigree.findUniqueOrThrow({
              where: { microchip: target.desiredMicrochip },
            })
          ).tokenId,
        ).toBe(member.token);
        expect(
          (
            await other.pedigree.findUniqueOrThrow({
              where: { microchip: target.desiredMicrochip },
            })
          ).dna,
        ).toBe(`DNA-${member.chip}`);
        expect(
          await other.reward.findUnique({
            where: { id: f.rewards[index]!.id },
          }),
        ).toEqual({ ...f.rewards[index], microchip: target.desiredMicrochip });
      }
      expect(
        await db.pedigree.count({
          where: { microchip: { startsWith: "__repair_" } },
        }),
      ).toBe(0);
      await f.repo.release(r.claim);
      const restarted = (await f.otherRepo.claim(
        r.op.id,
        owner,
        randomUUID(),
      ))!;
      expect(
        await f.otherRepo.completeDatabaseRepair(restarted, r.version),
      ).toEqual(proof);
      expect(
        (
          await other.pedigree.findUniqueOrThrow({
            where: { microchip: f.members[1]!.chip },
          })
        ).tokenId,
      ).toBe(f.token);
      await f.otherRepo.release(restarted);
    });
    test("pair token-binding repair leaves PKs and Reward ownership unchanged", async () => {
      const f = await pairFixture(false),
        r = await ready(f);
      await f.repo.completeDatabaseRepair(r.claim, r.version);
      for (const [index, member] of f.members.entries()) {
        expect(
          (
            await other.pedigree.findUniqueOrThrow({
              where: { microchip: member.chip },
            })
          ).tokenId,
        ).toBe(f.members[1 - index]!.token);
        expect(
          await other.reward.findUnique({
            where: { id: f.rewards[index]!.id },
          }),
        ).toEqual(f.rewards[index]);
      }
      await f.repo.release(r.claim);
    });
    test("pair failure after SQL projection rolls back both rows, rewards and ledger event", async () => {
      const f = await pairFixture(),
        r = await ready(f);
      const seam = f.repo as unknown as {
        event(
          tx: Prisma.TransactionClient,
          id: string,
          kind: string,
          detail?: Json,
          stepId?: string | null,
        ): Promise<void>;
      };
      const original = seam.event.bind(f.repo);
      const spy = jest
        .spyOn(seam, "event")
        .mockImplementation(async (...args) => {
          if (args[2] === "COMPLETED") throw Error("PAIR_COMMIT_INTERRUPTED");
          return original(...args);
        });
      await expect(
        f.repo.completeDatabaseRepair(r.claim, r.version),
      ).rejects.toThrow("PAIR_COMMIT_INTERRUPTED");
      spy.mockRestore();
      for (const [index, member] of f.members.entries()) {
        expect(
          (
            await other.pedigree.findUniqueOrThrow({
              where: { microchip: member.chip },
            })
          ).tokenId,
        ).toBe(member.token);
        expect(
          await other.reward.findUnique({
            where: { id: f.rewards[index]!.id },
          }),
        ).toEqual(f.rewards[index]);
      }
      expect((await f.repo.get(r.op.id, owner)).state).toBe("READY");
      expect(
        await db.pedigree.count({
          where: { microchip: { startsWith: "__repair_" } },
        }),
      ).toBe(0);
      await f.repo.completeDatabaseRepair(r.claim, r.version);
      await f.repo.release(r.claim);
    });
    test("pair outside collision blocks without changing either row", async () => {
      const f = await pairFixture(),
        outsider = await fixture(),
        r = await ready(f);
      await other.pedigree.update({
        where: { microchip: outsider.chip },
        data: { tokenId: f.token },
      });
      await expect(
        f.repo.completeDatabaseRepair(r.claim, r.version),
      ).rejects.toThrow("REPAIR_EXPANDED_SCOPE_REQUIRED");
      for (const member of f.members)
        expect(
          (
            await other.pedigree.findUniqueOrThrow({
              where: { microchip: member.chip },
            })
          ).tokenId,
        ).toBe(member.token);
      await f.repo.release(r.claim);
    });
  },
);
