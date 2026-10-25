/** Date-only UI state. Never send these Buddhist-era parts to the API. */
export type DateDraft = {
  day: string;
  month: string;
  beYear: string;
  sourceError?: string;
};
export type DateResolution =
  | { status: "empty" }
  | { status: "incomplete" | "invalid"; message: string }
  | { status: "valid"; iso: string };
export const emptyDateDraft = (): DateDraft => ({
  day: "",
  month: "",
  beYear: "",
});
export function dateDraftFromIso(value?: string): DateDraft {
  if (value === undefined || value === "") return emptyDateDraft();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match)
    return {
      ...emptyDateDraft(),
      sourceError: "วันที่เดิมไม่ถูกต้อง กรุณาตรวจและเลือกใหม่",
    };
  return {
    day: String(Number(match[3])),
    month: String(Number(match[2])),
    beYear: String(Number(match[1]) + 543),
  };
}
export function resolveDateDraft(
  draft: DateDraft,
  limits: { minDate?: string; maxDate?: string } = {},
): DateResolution {
  if (draft.sourceError)
    return { status: "invalid", message: draft.sourceError };
  const parts = [draft.day, draft.month, draft.beYear];
  if (parts.every((part) => !part)) return { status: "empty" };
  if (parts.some((part) => !part))
    return {
      status: "incomplete",
      message: "กรุณาเลือกวัน เดือน และปี พ.ศ. ให้ครบ",
    };
  const [day, month, beYear] = parts.map(Number) as [number, number, number];
  const year = beYear - 543;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    parts.some((part) => !/^\d+$/.test(part)) ||
    year < 1 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > (days[month - 1] ?? 0)
  )
    return {
      status: "invalid",
      message: "วันที่ไม่มีในปฏิทิน กรุณาเลือกวันใหม่",
    };
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (
    (limits.minDate !== undefined && iso < limits.minDate) ||
    (limits.maxDate !== undefined && iso > limits.maxDate)
  )
    return {
      status: "invalid",
      message: "วันที่อยู่นอกช่วงที่กำหนด กรุณาตรวจอีกครั้ง",
    };
  return { status: "valid", iso };
}
export function dateYearOptions(
  from: number,
  to: number,
  selected: string,
): number[] {
  const years = Array.from(
    { length: Math.max(0, to - from + 1) },
    (_, index) => from + index,
  );
  const year = Number(selected);
  if (
    Number.isInteger(year) &&
    year >= 544 &&
    year <= 10542 &&
    !years.includes(year)
  )
    years.push(year);
  return years.sort((a, b) => b - a);
}
export const dateDraftIso = (draft: DateDraft) => {
  const result = resolveDateDraft(draft);
  return result.status === "valid" ? result.iso : undefined;
};
export const dateDraftNeedsReview = (draft: DateDraft) =>
  ["incomplete", "invalid"].includes(resolveDateDraft(draft).status);
