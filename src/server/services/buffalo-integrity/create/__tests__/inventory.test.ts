/** @jest-environment node */
import { type PrismaClient } from "@prisma/client";
import { PostgresOperationRepository } from "../../operations/postgres";
import { operationStatus, type StatusStep } from "../../operations/status";
import { createView } from "../view";
import { type Operation, type OperationState } from "../../operations/types";
import { domain, intent } from "../../operations/testing-fixtures";
import { inventoryFailure } from "../inventory-read";
const states: OperationState[] = [
  "DRAFT",
  "READY",
  "SIGNING",
  "BROADCAST_UNKNOWN",
  "CHAIN_PENDING",
  "CHAIN_STEPS",
  "AWAITING_METADATA_ACTION",
  "PROJECTING",
  "VERIFYING",
  "COMPLETED",
  "RETRYABLE",
  "NEEDS_REVIEW",
  "RECOVERY_REQUIRED",
  "CANCELLED",
];
const op: Operation = {
  id: "00000000-0000-4000-8000-000000000001",
  owner: "shared:test",
  state: "DRAFT",
  intent,
  domain,
  intentHash: "hash",
  fence: "0",
  version: 2,
  actualToken: null,
  result: { imageHash: "ok" },
  reason: null,
  plan: null,
};
test.each(states)(
  "%s retains status/permissions and safe create DTO",
  (state) => {
    for (const hasSignedBytes of [false, true]) {
      const operation = { ...op, state, actualToken: "1371" };
      const steps: StatusStep[] = hasSignedBytes
        ? [
            {
              kind: "mint",
              state: "SIGNED",
              hash: "0xabc",
              receipt: null,
              hasSignedBytes,
            },
          ]
        : [];
      const dto = createView(
        operation,
        operationStatus(operation, steps),
        (key) => `https://asset.test/${key}`,
        undefined,
        null,
      );
      expect(dto).toMatchObject({
        id: op.id,
        state,
        version: 2,
        revision: 2,
        microchip: intent.buffalo.microchip,
        input: intent.buffalo,
        progress: null,
        prepared: false,
        canEdit: ["DRAFT", "READY"].includes(state) && !hasSignedBytes,
        canResume: ![
          "DRAFT",
          "COMPLETED",
          "CANCELLED",
          "NEEDS_REVIEW",
        ].includes(state),
        canCancel:
          !hasSignedBytes && !["COMPLETED", "CANCELLED"].includes(state),
        imageReady: state === "DRAFT",
        publishedImageUrl: "https://asset.test/buffalo/1371.jpg",
      });
      expect(JSON.stringify(dto)).not.toMatch(
        /hasSignedBytes|signedBytes|calldata|intentHash|fence|owner/,
      );
    }
  },
);
test.each([0, 1, 3, 30])(
  "%i rows use one parameterized data query without per-item get/steps",
  async (count) => {
    const query = jest
      .fn()
      .mockResolvedValue(
        Array.from({ length: count }, () => ({
          ...op,
          updated_at: new Date(),
          intent_hash: "hash",
          actual_token: null,
          inventory_steps: [],
        })),
      );
    const execute = jest.fn();
    const transaction = jest.fn(
      async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({ $queryRaw: query, $executeRaw: execute }),
    );
    const db = { $transaction: transaction } as unknown as PrismaClient;
    const repo = new PostgresOperationRepository(db);
    const get = jest.spyOn(repo, "get"),
      steps = jest.spyOn(repo, "steps");
    await expect(
      repo.listCreateSnapshots("owner' OR true"),
    ).resolves.toHaveLength(count);
    expect(query).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(get).not.toHaveBeenCalled();
    expect(steps).not.toHaveBeenCalled();
    const calls = query.mock.calls as unknown[][];
    expect(calls[0]![1]).toBe("owner' OR true");
    const sql = (calls[0]![0] as TemplateStringsArray).join("?");
    expect(sql).toContain("LIMIT 30");
    expect(sql).toContain("intent->>'kind'='create'");
    expect(sql).toContain("signed_bytes IS NOT NULL");
  },
);
test("P2028 is not guessed from elapsed time, and unknown errors are not retryable", () => {
  expect(inventoryFailure({ code: "P2028" }, false)).toBe(
    "INVENTORY_READ_UNAVAILABLE",
  );
  expect(
    inventoryFailure(
      {
        code: "P2028",
        meta: { error: "Unable to start a transaction in the given time." },
      },
      true,
    ),
  ).toBe("INVENTORY_READ_UNAVAILABLE");
  expect(
    inventoryFailure({ code: "P2010", meta: { code: "57014" } }, true),
  ).toBe("INVENTORY_READ_UNAVAILABLE");
  expect(inventoryFailure(new Error("secret"), true)).toBe(
    "INVENTORY_READ_FAILED",
  );
});
