import {
  dateDraftFromIso,
  emptyDateDraft,
  resolveDateDraft,
  dateYearOptions,
} from "../competition-thai-date";

it("roundtrips Buddhist years without a timezone conversion", () => {
  const draft = dateDraftFromIso("2026-10-25");
  expect(draft).toEqual({ day: "25", month: "10", beYear: "2569" });
  expect(resolveDateDraft(draft)).toEqual({
    status: "valid",
    iso: "2026-10-25",
  });
});
it.each(["2026-04-31", "2026-02-29", "1900-02-29", "2026-13-01", "2026-10-00"])(
  "rejects impossible dates without repairing %s",
  (value) => {
    expect(resolveDateDraft(dateDraftFromIso(value)).status).toBe("invalid");
  },
);
it.each(["2024-02-29", "2000-02-29", "0001-01-01", "9999-12-31"])(
  "preserves exact valid %s",
  (value) => {
    expect(resolveDateDraft(dateDraftFromIso(value))).toEqual({
      status: "valid",
      iso: value,
    });
  },
);
it("distinguishes an optional empty date from unfinished edits and does not retain old ISO", () => {
  expect(resolveDateDraft(emptyDateDraft())).toEqual({ status: "empty" });
  expect(
    resolveDateDraft({ ...dateDraftFromIso("2026-10-25"), day: "" }).status,
  ).toBe("incomplete");
  expect(
    resolveDateDraft({ day: "31", month: "4", beYear: "2569" }).status,
  ).toBe("invalid");
  expect(
    resolveDateDraft({ day: "29", month: "2", beYear: "2569" }).status,
  ).toBe("invalid");
});
it("treats optional limits separately from year choices", () => {
  expect(
    resolveDateDraft(dateDraftFromIso("2026-10-25"), { maxDate: "2026-10-24" })
      .status,
  ).toBe("invalid");
  expect(
    resolveDateDraft(dateDraftFromIso("2026-10-25"), { minDate: "2026-10-26" })
      .status,
  ).toBe("invalid");
  expect(dateYearOptions(2560, 2570, "2500")).toContain(2500);
  expect(dateYearOptions(2560, 2570, "2590")).toContain(2590);
});
