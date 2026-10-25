import { useId, useState } from "react";
import {
  dateYearOptions,
  emptyDateDraft,
  resolveDateDraft,
  type DateDraft,
} from "~/lib/competition-thai-date";
import { control } from "./Workspace";

const months = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];
/** Fully controlled draft parts: consumers own resync, dirty tracking and submit guards. */
export function ThaiDateInput({
  label,
  value,
  onChange,
  disabled,
  required,
  minDate,
  maxDate,
  yearFrom,
  yearTo,
  hint,
}: {
  label: string;
  value: DateDraft;
  onChange: (value: DateDraft) => void;
  disabled?: boolean;
  required?: boolean;
  minDate?: string;
  maxDate?: string;
  yearFrom?: number;
  yearTo?: number;
  hint?: string;
}) {
  const id = useId();
  const currentYear = new Date().getUTCFullYear() + 543;
  const [extraYears, setExtraYears] = useState(0);
  const from = Math.max(544, (yearFrom ?? currentYear - 30) - extraYears);
  const to = Math.min(10542, (yearTo ?? currentYear + 10) + extraYears);
  const result = resolveDateDraft(value, { minDate, maxDate });
  const invalid = result.status === "invalid" || result.status === "incomplete";
  const describedBy =
    [invalid ? `${id}-error` : "", hint ? `${id}-hint` : ""]
      .filter(Boolean)
      .join(" ") || undefined;
  const select = (key: "day" | "month" | "beYear", selected: string) =>
    onChange({
      day: value.day,
      month: value.month,
      beYear: value.beYear,
      [key]: selected,
    });
  const hasParts = !!(
    value.day ||
    value.month ||
    value.beYear ||
    value.sourceError
  );
  return (
    <fieldset
      disabled={disabled}
      className="min-w-0 space-y-2"
      aria-describedby={describedBy}
    >
      <legend className="mb-2 text-sm">
        {label}
        {required ? " *" : ""} <span className="text-text-muted">(พ.ศ.)</span>
      </legend>
      <div className="grid min-w-0 grid-cols-[minmax(0,0.8fr)_minmax(0,1.15fr)_minmax(0,1fr)] gap-2">
        <select
          className={`${control} px-2`}
          aria-label={`${label}—วัน`}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          required={required}
          value={value.day}
          onChange={(e) => select("day", e.target.value)}
        >
          <option value="">วัน</option>
          {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>
        <select
          className={`${control} px-2`}
          aria-label={`${label}—เดือน`}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          required={required}
          value={value.month}
          onChange={(e) => select("month", e.target.value)}
        >
          <option value="">เดือน</option>
          {months.map((name, index) => (
            <option key={name} value={index + 1}>
              {name}
            </option>
          ))}
        </select>
        <select
          className={`${control} px-2`}
          aria-label={`${label}—ปี พ.ศ.`}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          required={required}
          value={value.beYear}
          onChange={(e) =>
            e.target.value === "expand"
              ? setExtraYears((old) => old + 30)
              : select("beYear", e.target.value)
          }
        >
          <option value="">ปี พ.ศ.</option>
          {dateYearOptions(from, to, value.beYear).map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
          {from > 544 || to < 10542 ? (
            <option value="expand">แสดงปีเพิ่มเติม…</option>
          ) : null}
        </select>
      </div>
      {invalid ? (
        <p id={`${id}-error`} role="status" className="text-sm text-orange-100">
          {result.message}
        </p>
      ) : null}
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-text-muted">
          {hint}
        </p>
      ) : null}
      {hasParts ? (
        <button
          type="button"
          className="min-h-12 rounded-xl px-3 text-sm text-text-muted underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-orange"
          aria-label={`ล้าง${label}`}
          onClick={() => onChange(emptyDateDraft())}
        >
          ล้างวันที่
        </button>
      ) : null}
    </fieldset>
  );
}
