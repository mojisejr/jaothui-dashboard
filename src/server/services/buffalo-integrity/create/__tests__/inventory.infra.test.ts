/** @jest-environment node */
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import { inventoryRead } from "../inventory-read";
import { PostgresOperationRepository } from "../../operations/postgres";
import { domain, intent } from "../../operations/testing-fixtures";
const url = process.env.BUFFALO_INVENTORY_TEST_DATABASE_URL;
(url ? describe : describe.skip)("isolated inventory PostgreSQL", () => {
  let db: PrismaClient;
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (
      parsed.hostname !== "127.0.0.1" ||
      parsed.port !== "55448" ||
      parsed.pathname !== "/inventory_reliability"
    )
      throw Error("DEDICATED_INVENTORY_DB_REQUIRED");
    db = new PrismaClient({
      datasources: { db: { url: url! + "?connection_limit=1" } },
      log: [],
    });
    await db.$connect();
  });
  afterAll(async () => {
    await db?.$disconnect();
  });
  test("real acquisition contention differs from elapsed interactive expiry; logs redact SQL/provider text", async () => {
    const log = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    let release!: () => void;
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const held = db.$transaction(
      async () => {
        entered();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      },
      { timeout: 7000 },
    );
    try {
      await ready;
      await expect(
        inventoryRead(db, (tx) => tx.$queryRaw`SELECT 1`),
      ).rejects.toMatchObject({ code: "INVENTORY_ACQUISITION_TIMEOUT" });
      release();
      await held;
      await expect(
        inventoryRead(db, async (tx) => {
          await new Promise((resolve) => setTimeout(resolve, 3150));
          return tx.$queryRaw`SELECT 'sensitive payload'`;
        }),
      ).rejects.toMatchObject({ code: "INVENTORY_TRANSACTION_EXPIRED" });
      const events = log.mock.calls.map(
        ([value]) =>
          JSON.parse(value as string) as {
            code: string;
            stage: string;
            requestId: string;
            elapsedMs: number;
          },
      );
      expect(events.map((e) => [e.code, e.stage])).toEqual([
        ["INVENTORY_ACQUISITION_TIMEOUT", "acquisition"],
        ["INVENTORY_TRANSACTION_EXPIRED", "statement"],
      ]);
      expect(events.every((e) => e.requestId && e.elapsedMs >= 900)).toBe(true);
      expect(JSON.stringify(log.mock.calls)).not.toMatch(
        /sensitive payload|SELECT|postgresql|expired transaction/i,
      );
    } finally {
      release?.();
      await held;
      log.mockRestore();
    }
  }, 15000);
  test("0/1/3/30 inventory stays one data query and owner-scoped; coherent operation+step snapshot, capped and ordered", async () => {
    const owner = `inventory:${randomUUID()}`;
    const other = `foreign:${randomUUID()}`;
    const repo = new PostgresOperationRepository(db);
    const ids: string[] = [];
    let sequence = 0;
    const freshIntent = () => ({
      ...intent,
      buffalo: {
        ...intent.buffalo,
        microchip: `999${String(Date.now() + sequence++).slice(-12)}`,
      },
    });
    const fixtureDomain = {
      ...domain,
      nft: `0x${randomUUID().replaceAll("-", "").padEnd(40, "0")}`,
    };
    const fixtureHash = `0x${randomUUID().replaceAll("-", "")}`;
    const query = jest.spyOn(db, "$transaction");
    try {
      for (const count of [0, 1, 3, 30]) {
        while (ids.length < count) {
          const op = await repo.create(
            owner,
            randomUUID(),
            freshIntent(),
            fixtureDomain,
          );
          ids.push(op.id);
        }
        query.mockClear();
        const rows = await repo.listCreateSnapshots(owner);
        expect(rows).toHaveLength(count);
        expect(query).toHaveBeenCalledTimes(1);
        expect(rows.every((r) => r.operation.owner === owner)).toBe(true);
      }
      const foreign = await repo.create(
        other,
        randomUUID(),
        freshIntent(),
        fixtureDomain,
      );
      ids.push(foreign.id);
      const cancelled = await repo.create(
        owner,
        randomUUID(),
        freshIntent(),
        fixtureDomain,
      );
      ids.push(cancelled.id);
      await db.$executeRaw`UPDATE buffalo_integrity.operation SET state='CANCELLED' WHERE id=${cancelled.id}::uuid`;
      await db.$executeRaw`UPDATE buffalo_integrity.operation SET state='COMPLETED',actual_token='1371' WHERE id=${ids[0]}::uuid`;
      await db.$executeRaw`INSERT INTO buffalo_integrity.step(id,operation_id,ordinal,kind,expected,chain_id,sender,state,signed_bytes,transaction_hash,nonce,calldata_hash,transaction_envelope) VALUES (${randomUUID()}::uuid,${ids[1]}::uuid,0,'mint','{}'::jsonb,96,${fixtureDomain.nft},'SIGNED','private-signed-payload',${fixtureHash},0,'0xcalldata','{}'::jsonb)`;
      const extra = await repo.create(
        owner,
        randomUUID(),
        freshIntent(),
        fixtureDomain,
      );
      ids.push(extra.id);
      const rows = await repo.listCreateSnapshots(owner);
      expect(rows).toHaveLength(30);
      expect(
        rows.some(
          (r) =>
            r.operation.id === foreign.id ||
            r.operation.id === cancelled.id ||
            r.operation.state === "COMPLETED",
        ),
      ).toBe(false);
      expect(rows[0]!.operation.id).toBe(extra.id);
      expect(
        rows.find((r) => r.operation.id === ids[1])!.steps[0],
      ).toMatchObject({ hasSignedBytes: true, hash: fixtureHash, kind: "mint" });
      expect(JSON.stringify(rows)).not.toContain("private-signed-payload");
      // A concurrent atomic writer changes operation+step state together. Each
      // one-statement inventory read must see the old pair or the new pair.
      const pair = ids[1]!;
      const writer = new PrismaClient({
        datasources: { db: { url: url! } },
        log: [],
      });
      const writePair = (
        state: "READY" | "SIGNING",
        stepState: "RESERVED" | "SIGNED",
      ) =>
        writer.$transaction(async (tx) => {
          await tx.$executeRaw`UPDATE buffalo_integrity.operation SET state=${state} WHERE id=${pair}::uuid`;
          await tx.$queryRaw`SELECT pg_sleep(0.005)::text`;
          await tx.$executeRaw`UPDATE buffalo_integrity.step SET state=${stepState} WHERE operation_id=${pair}::uuid`;
        });
      try {
        await writePair("READY", "RESERVED");
        await Promise.all([
          (async () => {
            for (let i = 0; i < 12; i++)
              await writePair(
                i % 2 ? "READY" : "SIGNING",
                i % 2 ? "RESERVED" : "SIGNED",
              );
          })(),
          (async () => {
            for (let i = 0; i < 12; i++) {
              const snapshot = (await repo.listCreateSnapshots(owner)).find(
                (row) => row.operation.id === pair,
              )!;
              expect(["READY/RESERVED", "SIGNING/SIGNED"]).toContain(
                `${snapshot.operation.state}/${snapshot.steps[0]!.state}`,
              );
            }
          })(),
        ]);
      } finally {
        await writer.$disconnect();
      }
    } finally {
      query.mockRestore();
      // Keep the append-only synthetic journal in this dedicated local fixture DB.
      // The orchestrator stops the disposable cluster after evidence is captured.
    }
  }, 20000);
});
