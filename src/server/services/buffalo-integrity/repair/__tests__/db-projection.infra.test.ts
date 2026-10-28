/** @jest-environment node */
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import {
  applyRepairDatabaseProjection,
  readRepairDatabaseSnapshot,
  type RepairDatabaseProjection,
} from "../db-projection";
import { payloadHash } from "../../operations/hash";
const url = process.env.BUFFALO_REPAIR_TEST_DATABASE_URL;
const infra = url ? describe : describe.skip;
infra(
  "isolated PG repair projection with actual FK/catalog and concurrent writers",
  () => {
    let db: PrismaClient, observer: PrismaClient;
    let serial = Number(String(Date.now()).slice(-9));
    beforeAll(async () => {
      const parsed = new URL(url!);
      if (
        parsed.hostname !== "127.0.0.1" ||
        parsed.port !== "55437" ||
        parsed.pathname !== "/repair_feasibility"
      )
        throw Error("DISPOSABLE_REPAIR_DATABASE_REQUIRED");
      db = new PrismaClient({ datasources: { db: { url: url! } }, log: [] });
      observer = new PrismaClient({
        datasources: { db: { url: url! } },
        log: [],
      });
      const version = await db.$queryRaw<
        { server_version: string }[]
      >`SHOW server_version`;
      expect(version[0]!.server_version).toMatch(/^15\./);
    });
    afterAll(async () => {
      await Promise.all([db?.$disconnect(), observer?.$disconnect()]);
    });
    async function fixture(rename = false) {
      const source = `998${String(++serial).padStart(12, "0")}`,
        desired = rename ? `998${String(++serial).padStart(12, "0")}` : source;
      const token = String(BigInt(source) * 10n);
      await db.pedigree.create({
        data: {
          microchip: source,
          name: `fixture-${source}`,
          birthday: new Date("2024-01-01"),
          sex: "Male",
          color: "Black",
          createdAt: "original-created",
          updatedAt: "original-updated",
          detail: "preserved",
          dna: "preserved-DNA",
          image: "https://example.test/original",
          tokenId: BigInt(token),
        },
      });
      const reward = await db.reward.create({
        data: {
          id: randomUUID(),
          microchip: source,
          eventName: "original-event",
          rewardName: "original-reward",
          eventDate: new Date("2024-02-02"),
        },
      });
      const snapshot = await db.$transaction((tx) =>
        readRepairDatabaseSnapshot(tx),
      );
      const projection: RepairDatabaseProjection = {
        targets: [
          {
            sourceMicrochip: source,
            desiredMicrochip: desired,
            desiredTokenId: String(BigInt(token) + 1n),
            baseline: snapshot.rows.find((row) => row.microchip === source)!
              .baseline,
          },
        ],
        references: snapshot.references.filter((ref) =>
          ref.chips.includes(source),
        ),
        catalogDigest: snapshot.catalogDigest,
        closureChips: [...new Set([source, desired])],
        closureTokens: [token, String(BigInt(token) + 1n)],
      };
      return { source, desired, reward, projection };
    }
    async function apply(projection: RepairDatabaseProjection) {
      return db.$transaction((tx) =>
        applyRepairDatabaseProjection(tx, projection, "a".repeat(64)),
      );
    }
    test("identity-only update preserves all business fields and every Reward value", async () => {
      const f = await fixture();
      const before = await db.pedigree.findUniqueOrThrow({
        where: { microchip: f.source },
      });
      const proof = await apply(f.projection);
      const after = await db.pedigree.findUniqueOrThrow({
        where: { microchip: f.desired },
      });
      expect(after).toEqual({ ...before, tokenId: before.tokenId + 1n });
      expect(
        await db.reward.findUnique({ where: { id: f.reward.id } }),
      ).toEqual(f.reward);
      expect(proof.kind).toBe("database_repair");
    });
    test("PK move cascades only the reviewed Reward ownership and is idempotent on proof readback", async () => {
      const f = await fixture(true);
      const proof = await apply(f.projection);
      expect(
        await db.pedigree.findUnique({ where: { microchip: f.source } }),
      ).toBeNull();
      expect(
        await db.reward.findUnique({ where: { id: f.reward.id } }),
      ).toEqual({ ...f.reward, microchip: f.desired });
      const replay = await db.$transaction((tx) =>
        applyRepairDatabaseProjection(tx, f.projection, "a".repeat(64), proof),
      );
      expect(replay).toEqual(proof);
      await db.pedigree.update({
        where: { microchip: f.desired },
        data: { name: "external-change" },
      });
      await expect(
        db.$transaction((tx) =>
          applyRepairDatabaseProjection(
            tx,
            f.projection,
            "a".repeat(64),
            proof,
          ),
        ),
      ).rejects.toThrow("REPAIR_BASELINE_CHANGED");
    });
    test("throw after projection rolls back identity and FK changes together", async () => {
      const f = await fixture(true);
      await expect(
        db.$transaction(async (tx) => {
          await applyRepairDatabaseProjection(tx, f.projection, "a".repeat(64));
          throw Error("INJECTED_CRASH");
        }),
      ).rejects.toThrow("INJECTED_CRASH");
      expect(
        await db.pedigree.findUnique({ where: { microchip: f.desired } }),
      ).toBeNull();
      expect(
        (
          await db.pedigree.findUniqueOrThrow({
            where: { microchip: f.source },
          })
        ).tokenId.toString(),
      ).toBe(f.projection.closureTokens[0]);
      expect(
        await db.reward.findUnique({ where: { id: f.reward.id } }),
      ).toEqual(f.reward);
    });
    test("stale baseline or stale Reward reference rejects before mutation", async () => {
      const f = await fixture();
      await db.reward.update({
        where: { id: f.reward.id },
        data: { rewardName: "changed" },
      });
      await expect(apply(f.projection)).rejects.toThrow(
        "REPAIR_BASELINE_CHANGED",
      );
      expect(
        (
          await db.pedigree.findUniqueOrThrow({
            where: { microchip: f.source },
          })
        ).tokenId.toString(),
      ).toBe(f.projection.closureTokens[0]);
    });
    test("external duplicate token binding cannot pass uniqueness check", async () => {
      const f = await fixture(),
        other = await fixture();
      await db.pedigree.update({
        where: { microchip: other.source },
        data: { tokenId: BigInt(f.projection.targets[0]!.desiredTokenId) },
      });
      await expect(apply(f.projection)).rejects.toThrow(
        "REPAIR_EXPANDED_SCOPE_REQUIRED",
      );
    });
    test("new genealogy reference blocks a PK move, even without an FK", async () => {
      const f = await fixture(true),
        other = await fixture();
      await db.pedigree.update({
        where: { microchip: other.source },
        data: { fatherId: f.source },
      });
      const snapshot = await db.$transaction((tx) =>
        readRepairDatabaseSnapshot(tx),
      );
      f.projection.references = snapshot.references.filter((ref) =>
        ref.chips.includes(f.source),
      );
      await expect(apply(f.projection)).rejects.toThrow(
        "REPAIR_REFERENCE_OWNERSHIP_REQUIRED",
      );
    });
    test("table lock prevents external writer phantom while uncommitted projection is invisible", async () => {
      const f = await fixture();
      let entered!: () => void, release!: () => void;
      const acquired = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const transaction = db.$transaction(
        async (tx) => {
          await applyRepairDatabaseProjection(tx, f.projection, "a".repeat(64));
          entered();
          await held;
        },
        { timeout: 5000 },
      );
      await acquired;
      try {
        expect(
          (
            await observer.pedigree.findUniqueOrThrow({
              where: { microchip: f.source },
            })
          ).tokenId.toString(),
        ).toBe(f.projection.closureTokens[0]);
        await expect(
          observer.$transaction(async (tx) => {
            await tx.$executeRaw`SET LOCAL lock_timeout='100ms'`;
            await tx.pedigree.update({
              where: { microchip: f.source },
              data: { name: "racing" },
            });
          }),
        ).rejects.toThrow();
      } finally {
        release();
        await transaction;
      }
      expect(
        (
          await observer.pedigree.findUniqueOrThrow({
            where: { microchip: f.source },
          })
        ).name,
      ).toBe(`fixture-${f.source}`);
    });
    test("catalog mismatch and duplicate pair identities fail closed", async () => {
      const f = await fixture();
      await expect(
        apply({ ...f.projection, catalogDigest: payloadHash("changed") }),
      ).rejects.toThrow("REPAIR_BASELINE_CHANGED");
      await expect(
        apply({
          ...f.projection,
          targets: [...f.projection.targets, ...f.projection.targets],
        }),
      ).rejects.toThrow("REPAIR_MANIFEST_INVALID");
    });
  },
);
