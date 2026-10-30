import {
  clearCompetitionReturn,
  consumeCompetitionReturn,
  rememberCompetitionReturn,
  safeCompetitionReturnTarget,
} from "../competition-return-target";
const qr =
  "/dashboard/competitions/check-in/v1.ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
beforeEach(() => sessionStorage.clear());
it.each([qr, "/dashboard/competitions/event.one/applications/entry-one"])(
  "allows the concrete competition destination %s",
  (path) => {
    expect(safeCompetitionReturnTarget(path)).toBe(path);
    rememberCompetitionReturn(path);
    expect(consumeCompetitionReturn()).toBe(path);
    expect(consumeCompetitionReturn()).toBe("/dashboard");
  },
);
it.each([
  "https://evil.example",
  "//evil.example",
  "/dashboard/competitions/check-in/../../outside",
  "/dashboard/competitions/check-in/%2f%2fevil.example",
  `${qr}?next=https://evil.example`,
  `${qr}#fragment`,
  "/dashboard",
  "javascript:alert(1)",
  [qr],
  undefined,
])("rejects an unowned or encoded destination", (path) => {
  expect(safeCompetitionReturnTarget(path)).toBeNull();
  rememberCompetitionReturn(path);
  expect(consumeCompetitionReturn()).toBe("/dashboard");
});
it("clears a remembered pass on logout", () => {
  rememberCompetitionReturn(qr);
  clearCompetitionReturn();
  expect(consumeCompetitionReturn()).toBe("/dashboard");
});
