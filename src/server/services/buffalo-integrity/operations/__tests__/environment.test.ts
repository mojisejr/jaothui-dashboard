import { executionEnvironment, transactionLink } from "../environment";
const hash = `0x${"a".repeat(64)}`;
test("a pinned production execution has real explorer links while local receipts never do", () => {
  expect(executionEnvironment("production:checkpoint")).toBe("mainnet");
  expect(transactionLink("production:checkpoint", hash)).toBe(`https://www.kubscan.com/tx/${hash}`);
  expect(transactionLink("anvil-instance", hash)).toBeNull();
  expect(executionEnvironment("anvil-instance")).toBe("local-fork");
  expect(transactionLink("production:checkpoint", "https://untrusted.test/tx")).toBeNull();
  expect(transactionLink("production:checkpoint", null)).toBeNull();
});
