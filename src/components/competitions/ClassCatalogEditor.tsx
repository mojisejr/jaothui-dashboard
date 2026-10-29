import { useEffect, useRef, useState } from "react";
import {
  COMPETITION_CLASS_PREFIX,
  encodeCompetitionClass,
  generateCompetitionClassName,
  parseCompetitionClass,
  validateCompetitionCatalog,
  type CompetitionClass,
} from "~/lib/competition-classes";
import { button, control } from "./Workspace";

type Row = {
  id: number;
  raw: string;
  rule: CompetitionClass;
  automatic: boolean;
  unresolved: boolean;
};
const blank = (): CompetitionClass => ({
  name: "ไม่เกิน 12 เดือน",
  kind: "age",
  minMonths: null,
  maxMonths: 12,
  minInclusive: true,
  group: "",
  criteria: "",
});

export function ClassCatalogEditor({
  title,
  addLabel = "เพิ่มรุ่น",
  values,
  onChange,
  disabled = false,
}: {
  title: string;
  addLabel?: string;
  values: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
}) {
  const sequence = useRef(0);
  const emitted = useRef<string>();
  const makeRows = (items: string[]): Row[] =>
    items.map((raw) => {
      const parsed = parseCompetitionClass(raw);
      return {
        id: sequence.current++,
        raw,
        rule: parsed ?? {
          ...blank(),
          name: raw.startsWith("@jaothui/class:") ? "" : raw,
        },
        automatic:
          raw.trim().startsWith(COMPETITION_CLASS_PREFIX) &&
          !!parsed &&
          parsed.name === generateCompetitionClassName(parsed),
        unresolved: !parsed,
      };
    });
  const [rows, setRows] = useState<Row[]>(() => makeRows(values));
  const signature = JSON.stringify(values);
  useEffect(() => {
    if (signature !== emitted.current)
      setRows(makeRows(JSON.parse(signature) as string[]));
    // Incoming server/reset values replace local rows; emitted form changes retain row IDs and partial inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  const publish = (next: Row[]) => {
    setRows(next);
    const raw = next.map((row) => row.raw);
    emitted.current = JSON.stringify(raw);
    onChange(raw);
  };
  const edit = (
    id: number,
    patch: Partial<CompetitionClass>,
    automatic?: boolean,
  ) => {
    publish(
      rows.map((row) => {
        if (row.id !== id) return row;
        const auto = automatic ?? row.automatic;
        const rule = { ...row.rule, ...patch };
        if (auto) rule.name = generateCompetitionClassName(rule);
        let raw: string;
        try {
          raw = encodeCompetitionClass(rule);
        } catch {
          raw = COMPETITION_CLASS_PREFIX + JSON.stringify(rule);
        }
        return { ...row, rule, raw, automatic: auto, unresolved: false };
      }),
    );
  };
  const errors = validateCompetitionCatalog(values);
  return (
    <section className="min-w-0 space-y-4" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {title} ({rows.length})
        </h2>
        <button
          type="button"
          className={button}
          disabled={disabled || rows.length >= 200}
          onClick={() => {
            const rule = blank();
            publish([
              ...rows,
              {
                id: sequence.current++,
                rule,
                raw: encodeCompetitionClass(rule),
                automatic: true,
                unresolved: false,
              },
            ]);
          }}
        >
          {addLabel}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">
          ยังไม่มีรุ่น กดเพิ่มรุ่น หรือคัดลอกชุดรุ่นจากงานเดิม
        </p>
      ) : null}
      {rows.map((row, index) => (
        <fieldset
          key={row.id}
          disabled={disabled}
          className="min-w-0 space-y-4 rounded-2xl border border-white/20 bg-black/20 p-4"
        >
          <legend className="max-w-full break-words px-2 font-medium">
            {title} รุ่นที่ {index + 1}
          </legend>
          {row.unresolved ? (
            <p className="text-sm text-orange-100">
              ข้อมูลเดิมอ่านเงื่อนไขไม่ชัดเจน
              กรุณากำหนดชื่อและเกณฑ์ใหม่ก่อนบันทึก ไม่มีการแปลงรุ่นนี้อัตโนมัติ
            </p>
          ) : null}
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <label className="min-w-0 space-y-2 text-sm">
              กลุ่มการแข่งขัน
              <input
                className={control}
                maxLength={100}
                value={row.rule.group}
                placeholder="เช่น ควายงาม / ควายยักษ์ / พิเศษ"
                onChange={(e) => edit(row.id, { group: e.target.value })}
              />
            </label>
            <label className="min-w-0 space-y-2 text-sm">
              วิธีตรวจคุณสมบัติ
              <select
                className={control}
                value={row.rule.kind}
                onChange={(e) =>
                  edit(row.id, {
                    kind: e.target.value as CompetitionClass["kind"],
                  })
                }
              >
                <option value="age">ตามช่วงอายุ</option>
                <option value="special">เงื่อนไขพิเศษ</option>
              </select>
            </label>
            <label className="min-w-0 space-y-2 text-sm">
              ขอบเขตขั้นต่ำ
              <select
                className={control}
                value={row.rule.minInclusive ? "inclusive" : "exclusive"}
                onChange={(e) =>
                  edit(row.id, { minInclusive: e.target.value === "inclusive" })
                }
              >
                <option value="inclusive">ตั้งแต่ (รวมเดือนที่ระบุ)</option>
                <option value="exclusive">มากกว่า (ไม่รวมเดือนที่ระบุ)</option>
              </select>
            </label>
            <label className="min-w-0 space-y-2 text-sm">
              อายุขั้นต่ำ (เดือน)
              <input
                className={control}
                type="number"
                min={0}
                max={1200}
                step={1}
                value={row.rule.minMonths ?? ""}
                placeholder="ไม่กำหนด"
                onChange={(e) =>
                  edit(row.id, {
                    minMonths:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </label>
            <label className="min-w-0 space-y-2 text-sm">
              อายุสูงสุด (เดือน รวมเดือนที่ระบุ)
              <input
                className={control}
                type="number"
                min={0}
                max={1200}
                step={1}
                value={row.rule.maxMonths ?? ""}
                placeholder="ไม่กำหนด"
                onChange={(e) =>
                  edit(row.id, {
                    maxMonths:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </label>
            <label className="min-w-0 space-y-2 text-sm">
              วิธีตั้งชื่อรุ่น
              <select
                className={control}
                value={row.automatic ? "auto" : "custom"}
                onChange={(e) => edit(row.id, {}, e.target.value === "auto")}
              >
                <option value="auto">สร้างชื่อจากกลุ่มและช่วงอายุ</option>
                <option value="custom">กำหนดชื่อแสดงเอง</option>
              </select>
            </label>
            <label className="min-w-0 space-y-2 text-sm md:col-span-2">
              ชื่อรุ่น
              <input
                className={control}
                maxLength={300}
                value={row.rule.name}
                readOnly={row.automatic}
                onChange={(e) => edit(row.id, { name: e.target.value }, false)}
              />
            </label>
            {row.rule.kind === "special" ? (
              <label className="min-w-0 space-y-2 text-sm md:col-span-2">
                เงื่อนไขให้เจ้าหน้าที่ตรวจเพิ่มเติม
                <textarea
                  className={control}
                  rows={2}
                  maxLength={1000}
                  value={row.rule.criteria}
                  placeholder="เช่น ฟันแท้ 1–2 คู่ / ลูกตามอายุไม่เกิน 4 เดือน"
                  onChange={(e) => edit(row.id, { criteria: e.target.value })}
                />
              </label>
            ) : null}
          </div>
          <p className="break-words text-sm text-orange-100">
            ชื่อแสดง: {row.rule.name || "ยังไม่ระบุชื่อ"}
            {row.rule.kind === "special"
              ? " • รุ่นพิเศษ: ตรวจช่วงอายุอัตโนมัติ และเจ้าหน้าที่ตรวจคุณสมบัติอื่นเพิ่มเติม"
              : ""}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={button}
              disabled={rows.length >= 200}
              onClick={() => {
                const next = [...rows];
                next.splice(index + 1, 0, { ...row, id: sequence.current++ });
                publish(next);
              }}
            >
              คัดลอกรุ่นที่ {index + 1}
            </button>
            <button
              type="button"
              className={button}
              onClick={() => publish(rows.filter((item) => item.id !== row.id))}
            >
              ลบรุ่นที่ {index + 1}
            </button>
          </div>
        </fieldset>
      ))}
      {errors.length ? (
        <ul
          aria-label={`ข้อผิดพลาด${title}`}
          className="space-y-2 break-words text-sm text-orange-100"
        >
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
