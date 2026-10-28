import { render, screen } from "@testing-library/react";
import {
  IdentityDiagnosisLink,
  identityDiagnosisHref,
} from "../IdentityDiagnosisLink";
const chip = "999000000008001";
test.each([
  "TOKEN_MAPPING_CONFLICT",
  "CANONICAL_CHIP_CONFLICT",
  "AMBIGUOUS_DB_TOKEN",
])("%s links only the source record to read-only diagnosis", (code) => {
  render(<IdentityDiagnosisLink microchip={chip} code={code} />);
  const href = screen
    .getByRole("link", { name: "ตรวจตัวตนก่อนเสนอซ่อม" })
    .getAttribute("href")!;
  const url = new URL(href, "http://localhost");
  expect(url.pathname).toBe("/dashboard/repair-buffalo");
  expect([...url.searchParams]).toEqual([["microchip", chip]]);
});
test.each([
  "DATABASE_READ_FAILED",
  "CHAIN_CHECK_UNAVAILABLE",
  "INTEGRITY_FEATURE_DISABLED",
  "INTEGRITY_WRITES_PAUSED",
  "CHAIN_DOMAIN_CONFLICT",
  "TOKEN_NOT_INITIALIZED",
  "INTERNAL_ERROR",
  "constructor",
  undefined,
])(
  "%s never offers identity repair for a generic or unsupported failure",
  (code) => {
    render(<IdentityDiagnosisLink microchip={chip} code={code} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  },
);
test.each(["", "x".repeat(129), "\ud800"])(
  "unrepresentable or out-of-bounds source is rejected",
  (source) => {
    expect(identityDiagnosisHref(source, "TOKEN_MAPPING_CONFLICT")).toBeNull();
  },
);
test.each([
  "999",
  "999000000008001&desiredTokenId=1",
  " 999000000008001 ",
  "javascript:alert(1)",
  "legacy, key with spaces",
])("exact legacy source %s is safely encoded as one query value", (source) => {
  const href = identityDiagnosisHref(source, "TOKEN_MAPPING_CONFLICT");
  expect(href).not.toBeNull();
  const url = new URL(href!, "http://localhost");
  expect(url.pathname).toBe("/dashboard/repair-buffalo");
  expect([...url.searchParams]).toEqual([["microchip", source]]);
});
