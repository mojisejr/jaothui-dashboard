import dayjs from "dayjs";

/** Same calendar-day / ceiling-month convention as source calculateRegistrationAge. */
export function previewCompetitionAge(
  birthday: string,
  cutoff: string | undefined,
  royalAlbino = false,
): number | null {
  const validDay = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  };
  if (!cutoff || !validDay(birthday) || !validDay(cutoff) || birthday > cutoff)
    return null;
  const start = dayjs(`${birthday}T00:00:00`).subtract(
    royalAlbino ? 1 : 0,
    "day",
  );
  const end = dayjs(`${cutoff}T00:00:00`);
  const months = end.diff(start, "month");
  return months + (end.diff(start.add(months, "month"), "day") > 0 ? 1 : 0);
}
