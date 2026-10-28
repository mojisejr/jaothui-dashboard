/** @jest-environment node */
import { keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { assertReceiptTransaction } from "../receipt-transaction";
import type { Plan, Step } from "../types";

async function fixture() {
  const account = privateKeyToAccount(`0x${"1".repeat(64)}`);
  const to = `0x${"2".repeat(40)}` as const;
  const bytes = await account.signTransaction({
    type: "legacy",
    chainId: 96,
    to,
    nonce: 1,
    gas: 21000n,
    gasPrice: 25n,
    value: 0n,
    data: "0x1234",
  });
  const hash = keccak256(bytes);
  const envelope = {
    chainId: 96,
    from: account.address,
    to,
    nonce: 1,
    gas: "21000",
    gasPrice: "25",
    value: "0",
    data: "0x1234",
  };
  const step = {
    chainId: 96,
    sender: account.address,
    expected: { to, data: "0x1234", value: "0", effects: [] },
    signedBytes: bytes,
    hash,
    envelope,
  } as unknown as Step;
  const plan = { maxFeeWei: "1000000" } as Plan;
  const transaction = {
    hash,
    from: account.address,
    to,
    nonce: 1,
    input: "0x1234",
    value: 0n,
    type: "legacy",
    chainId: undefined,
  };
  return { step, plan, transaction, hash };
}
test("missing RPC chainId is proved from the exact EIP155 signed legacy envelope", async () => {
  const c = await fixture();
  await expect(
    assertReceiptTransaction(c.transaction, c.step, c.hash, c.plan),
  ).resolves.toBeUndefined();
});
test("an explicit wrong RPC chainId still fails", async () => {
  const c = await fixture();
  await expect(
    assertReceiptTransaction(
      { ...c.transaction, chainId: 97 },
      c.step,
      c.hash,
      c.plan,
    ),
  ).rejects.toThrow("RECEIPT_TRANSACTION_MISMATCH");
});
test("wrong receipt hash or changed calldata cannot use the legacy fallback", async () => {
  const c = await fixture();
  await expect(
    assertReceiptTransaction(
      c.transaction,
      c.step,
      `0x${"3".repeat(64)}`,
      c.plan,
    ),
  ).rejects.toThrow("RECEIPT_TRANSACTION_MISMATCH");
  await expect(
    assertReceiptTransaction(
      { ...c.transaction, input: "0x5678" },
      c.step,
      c.hash,
      c.plan,
    ),
  ).rejects.toThrow("RECEIPT_TRANSACTION_MISMATCH");
});
test("missing chainId on typed transactions and altered signed evidence fail closed", async () => {
  const c = await fixture();
  await expect(
    assertReceiptTransaction(
      { ...c.transaction, type: "eip1559" },
      c.step,
      c.hash,
      c.plan,
    ),
  ).rejects.toThrow("RECEIPT_TRANSACTION_MISMATCH");
  await expect(
    assertReceiptTransaction(
      c.transaction,
      { ...c.step, chainId: 97 },
      c.hash,
      c.plan,
    ),
  ).rejects.toThrow("RECEIPT_TRANSACTION_MISMATCH");
  await expect(
    assertReceiptTransaction(
      c.transaction,
      { ...c.step, signedBytes: "0x1234" },
      c.hash,
      c.plan,
    ),
  ).rejects.toThrow("RECEIPT_TRANSACTION_MISMATCH");
});
