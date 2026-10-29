/** @jest-environment node */
import { randomUUID } from "crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { PostgresOperationRepository } from "../postgres";
import { domain, intent, plan } from "../testing-fixtures";

const url = process.env.BUFFALO_REPAIR_TEST_DATABASE_URL;
(url ? test : test.skip)(
  "SQL round trips can exceed three seconds without losing the fenced reservation",
  async () => {
    const parsed = new URL(url!);
    if (
      parsed.hostname !== "127.0.0.1" ||
      parsed.port !== "55437" ||
      parsed.pathname !== "/repair_feasibility"
    )
      throw Error("DISPOSABLE_DATABASE_REQUIRED");
    const db = new PrismaClient({
      datasources: { db: { url: url! } },
      log: [],
    });
    const repo = new PostgresOperationRepository(db);
    const owner = `sql-budget:${randomUUID()}`;
    let claim: Awaited<ReturnType<typeof repo.claim>> = null;
    try {
      const op = await repo.create(
        owner,
        randomUUID(),
        {
          ...intent,
          buffalo: {
            ...intent.buffalo,
            microchip: `997${String(Date.now()).slice(-12)}`,
          },
        },
        domain,
      );
      claim = await repo.claim(op.id, owner, "sql-latency-fixture");
      expect(claim).not.toBeNull();
      await repo.ready(claim!, plan);
      // Delay each SQL round trip in the client, never the server statement or RPC.
      const delayed = {
        $transaction: <T>(
          callback: (tx: Prisma.TransactionClient) => Promise<T>,
          options: { maxWait: number; timeout: number },
        ) =>
          db.$transaction(
            (tx) =>
              callback(
                new Proxy(tx, {
                  get(target, property) {
                    if (property === "$executeRaw" || property === "$queryRaw")
                      return async (...args: unknown[]) => {
                        await new Promise((resolve) =>
                          setTimeout(resolve, 500),
                        );
                        return Reflect.apply(
                          target[property],
                          target,
                          args,
                        ) as unknown;
                      };
                    return Reflect.get(target, property) as unknown;
                  },
                }),
              ),
            options,
          ),
      } as unknown as PrismaClient;
      const slow = new PostgresOperationRepository(delayed);
      const started = Date.now();
      const step = await slow.reserveStep(
        claim!,
        {
          kind: "setter",
          call: { to: domain.manager, data: "0x1234", value: "0", effects: [] },
        },
        0,
        plan,
      );
      expect(Date.now() - started).toBeGreaterThan(3000);
      expect(step.state).toBe("RESERVED");
      expect(step.signedBytes).toBeNull();
      expect((await repo.steps(op.id)).map((s) => s.id)).toEqual([step.id]);
      await expect(
        slow.reserveStep(
          { ...claim!, fence: "0" },
          {
            kind: "setter",
            call: step.expected,
          },
          1,
          plan,
        ),
      ).rejects.toThrow("STALE_OPERATION_LEASE");
    } finally {
      if (claim) {
        await repo.cancel(claim);
        await repo.release(claim);
      }
      await db.$disconnect();
    }
  },
  30000,
);
