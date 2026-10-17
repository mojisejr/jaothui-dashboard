/** Calendar days are not browser-local instants. Chain/DB use UTC midnight. */
export function calendarDay(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error("INVALID_CALENDAR_DAY");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("INVALID_CALENDAR_DAY");
  }
  return value;
}

export function calendarToDate(value: string): Date {
  return new Date(`${calendarDay(value)}T00:00:00.000Z`);
}

export function calendarToSeconds(value: string): bigint {
  return BigInt(calendarToDate(value).getTime() / 1000);
}

export function dateToCalendar(value: Date): string {
  if (!Number.isFinite(value.getTime()))
    throw new Error("INVALID_CALENDAR_DAY");
  return calendarDay(value.toISOString().slice(0, 10));
}

export function secondsToCalendar(value: bigint): string {
  const milliseconds = Number(value) * 1000;
  if (!Number.isSafeInteger(milliseconds))
    throw new Error("INVALID_CHAIN_DATE");
  return dateToCalendar(new Date(milliseconds));
}

/** Old JSON Birthday = MM/DD/YYYY, IssuedAt = DD/MM/YYYY. Never guess locale. */
export function legacyCalendar(value: string, order: "MDY" | "DMY"): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return calendarDay(value);
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) throw new Error("INVALID_CALENDAR_DAY");
  const [, first, second, year] = match;
  return calendarDay(
    `${year}-${order === "MDY" ? first : second}-${order === "MDY" ? second : first}`,
  );
}
