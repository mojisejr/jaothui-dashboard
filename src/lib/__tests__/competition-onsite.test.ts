import { competitionSchema } from "~/lib/competitions";
import {
  blankOnsiteForm,
  onsiteAge,
  onsiteClasses,
  validateOnsite,
  blockingDuplicateCount,
} from "~/lib/competition-onsite";
import { metadataSchema } from "~/lib/competition-applications";
const event = competitionSchema.parse({
  _id: "event-test",
  _rev: "rev",
  title: "งาน",
  registrationCount: 1,
  buffaloAgeDeadline: "2026-10-16",
  eventType: "normal",
  catalogs: {
    national: [
      "ไม่เกิน 12 เดือน",
      "มากกว่า 12 เดือน ถึง 15 เดือน",
      "[SP] ฟันน้ำนม",
    ],
    province: [],
  },
  policy: {
    today: "2026-10-16",
    lifecycle: "ongoing",
    publicRegistration: "closed-manual",
    publicVisible: true,
    onsiteAllowed: true,
    warnings: [],
  },
});
it("uses cutoff and ceiling months, limiting onsite classes to matching intervals", () => {
  const form = { ...blankOnsiteForm(), birthday: "2025-10-15" };
  expect(onsiteAge(event, form)).toBe(13);
  expect(onsiteClasses(event, form)).toEqual([
    "มากกว่า 12 เดือน ถึง 15 เดือน",
    "[SP] ฟันน้ำนม",
  ]);
  expect(onsiteAge(event, { ...form, birthday: "2026-02-30" })).toBeNull();
  expect(
    onsiteAge({ ...event, buffaloAgeDeadline: undefined }, form),
  ).toBeNull();
});
it("keeps Royal nonblack convention including legacy white; exact age differs from normal", () => {
  const form = {
    ...blankOnsiteForm(),
    birthday: "2025-10-16",
    color: "white" as const,
  };
  expect(onsiteAge(event, form)).toBe(12);
  expect(onsiteAge({ ...event, eventType: "royal" }, form)).toBe(13);
});
it("allows public-closed staff but denies ended events, wrong classes and unexplained duplicates", () => {
  const form = {
    ...blankOnsiteForm(),
    name: "ทดสอบ",
    microchip: "123",
    ownerName: "เจ้าของ",
    ownerTel: "0800000000",
    birthday: "2025-10-16",
    type: "ไม่เกิน 12 เดือน",
  };
  expect(validateOnsite(event, form, 0)).toBeNull();
  expect(
    validateOnsite(
      event,
      { ...form, type: "มากกว่า 12 เดือน ถึง 15 เดือน" },
      0,
    ),
  ).toMatch(/ตรงกับอายุ/);
  expect(validateOnsite(event, form, 1)).toMatch(/เหตุผล/);
  expect(
    validateOnsite(
      event,
      { ...form, duplicateOverrideReason: "ผู้ดูแลตรวจแล้ว ลงต่างรุ่นพิเศษ" },
      1,
    ),
  ).toBeNull();
  expect(
    validateOnsite(
      { ...event, policy: { ...event.policy, onsiteAllowed: false } },
      form,
      0,
    ),
  ).toMatch(/ไม่เปิด/);
});

it("counts only same-level or unknown-level normal duplicates; Royal and unlisted stay conservative", () => {
  const entry = (level?: "national" | "province" | null) => ({
    _id: `id-${String(level)}`,
    name: "ควาย",
    type: "รุ่น",
    ownerName: "เจ้าของ",
    level,
  });
  const metadata = {
    duplicateCount: 2,
    duplicateRegistrations: [entry("national"), entry("province")],
  };
  expect(blockingDuplicateCount(event, "national", metadata)).toBe(1);
  expect(
    blockingDuplicateCount(event, "province", {
      duplicateCount: 1,
      duplicateRegistrations: [entry("national")],
    }),
  ).toBe(0);
  expect(
    blockingDuplicateCount(event, "province", {
      duplicateCount: 1,
      duplicateRegistrations: [entry(undefined)],
    }),
  ).toBe(1);
  expect(
    blockingDuplicateCount(event, "province", {
      duplicateCount: 3,
      duplicateRegistrations: [entry("national")],
    }),
  ).toBe(2);
  expect(
    blockingDuplicateCount({ eventType: "royal" }, "province", {
      duplicateCount: 1,
      duplicateRegistrations: [entry("national")],
    }),
  ).toBe(1);
  expect(
    blockingDuplicateCount({ eventType: undefined }, "province", {
      duplicateCount: 1,
      duplicateRegistrations: [entry("national")],
    }),
  ).toBe(1);
});
it("accepts source metadata with and without the additive level field", () => {
  const base = { found: false, microchip: "1", duplicateCount: 1 };
  const row = { _id: "a", name: "n", type: "t", ownerName: "o" };
  expect(
    metadataSchema.parse({ ...base, duplicateRegistrations: [row] })
      .duplicateRegistrations[0]?.level,
  ).toBeUndefined();
  expect(
    metadataSchema.parse({
      ...base,
      duplicateRegistrations: [{ ...row, level: null }],
    }).duplicateRegistrations[0]?.level,
  ).toBeNull();
  expect(
    metadataSchema.parse({
      ...base,
      duplicateRegistrations: [{ ...row, level: "province" }],
    }).duplicateRegistrations[0]?.level,
  ).toBe("province");
});
