/** Schema-compatible class rules. Keep this pure codec identical in Event and Dashboard. */
export type CompetitionClass = {
  name: string;
  kind: "age" | "special";
  minMonths: number | null;
  maxMonths: number | null;
  minInclusive: boolean;
  group: string;
  criteria: string;
};
export const COMPETITION_CLASS_PREFIX = "@jaothui/class:v1:";
const reserved = "@jaothui/class:";
const clean = (value: string) => value.trim().replace(/\s+/g, " ");
const withoutSP = (value: string) => clean(value.replace(/^\s*\[SP\]\s*/i, ""));
const digits = (value: string) =>
  value.replace(/[๐-๙]/g, (d) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(d)));
function valid(rule: unknown): rule is CompetitionClass {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) return false;
  const r = rule as CompetitionClass;
  if (
    Object.keys(r).some(
      (k) =>
        ![
          "name",
          "kind",
          "minMonths",
          "maxMonths",
          "minInclusive",
          "group",
          "criteria",
        ].includes(k),
    )
  )
    return false;
  if (
    typeof r.name !== "string" ||
    !withoutSP(r.name) ||
    withoutSP(r.name).startsWith(reserved) ||
    r.name.length > 300 ||
    !["age", "special"].includes(r.kind) ||
    typeof r.minInclusive !== "boolean" ||
    typeof r.group !== "string" ||
    r.group.length > 100 ||
    typeof r.criteria !== "string" ||
    r.criteria.length > 1000
  )
    return false;
  for (const bound of [r.minMonths, r.maxMonths])
    if (
      bound !== null &&
      (!Number.isInteger(bound) || bound < 0 || bound > 1200)
    )
      return false;
  if (r.kind === "age" && r.minMonths === null && r.maxMonths === null)
    return false;
  const low = r.minMonths === null ? 0 : r.minMonths + (r.minInclusive ? 0 : 1);
  return r.maxMonths === null || low <= r.maxMonths;
}
export function encodeCompetitionClass(rule: CompetitionClass): string {
  if (!valid(rule)) throw new Error("เงื่อนไขรุ่นแข่งขันไม่ถูกต้อง");
  const encoded =
    COMPETITION_CLASS_PREFIX +
    JSON.stringify({
      name: withoutSP(rule.name),
      kind: rule.kind,
      minMonths: rule.minMonths,
      maxMonths: rule.maxMonths,
      minInclusive: rule.minInclusive,
      group: clean(rule.group),
      criteria: rule.criteria.trim(),
    });
  if (encoded.length > 2000)
    throw new Error("ข้อมูลรุ่นแข่งขันยาวเกิน 2000 ตัวอักษร");
  return encoded;
}
export function parseCompetitionClass(value: string): CompetitionClass | null {
  if (typeof value !== "string" || !value.trim() || value.length > 2000)
    return null;
  const raw = value.trim();
  if (raw.startsWith(reserved)) {
    if (!raw.startsWith(COMPETITION_CLASS_PREFIX)) return null;
    try {
      const parsed: unknown = JSON.parse(
        raw.slice(COMPETITION_CLASS_PREFIX.length),
      );
      return valid(parsed) ? { ...parsed, name: withoutSP(parsed.name) } : null;
    } catch {
      return null;
    }
  }
  const special = /^\[SP\]/i.test(raw),
    name = withoutSP(raw),
    text = digits(name);
  let minMonths: number | null = null,
    maxMonths: number | null = null,
    minInclusive = true;
  // A calf's age and teeth are manual criteria, never an inferred mother's age.
  const calfAge = /ลูก.*(?:อายุ|เดือน)|อายุลูก/.test(text);
  // Legacy descriptive division names may precede exactly one complete age clause.
  // Never discard another age condition, a number, or a calf reference in the prefix.
  let ageText = text;
  const suffix =
    /((?:อายุ\s*)?(?:มากกว่า|เกิน|ตั้งแต่|อย่างน้อย|ขั้นต่ำ|at least|>=|≥|ไม่เกิน|<=|≤)\s*\d[\s\S]*|(?:อายุ\s*)?\d+\s*เดือนขึ้นไป)$/.exec(
      text,
    );
  if (!calfAge && suffix && suffix.index > 0) {
    const prefix = text.slice(0, suffix.index).trim();
    if (
      prefix.startsWith("รุ่น") &&
      !/อายุ|เดือน|มากกว่า|เกิน|ตั้งแต่|อย่างน้อย|ขั้นต่ำ|ลูก|\d/.test(prefix)
    )
      ageText = suffix[0];
  }
  const range =
    /^(?:รุ่น)?(?:อายุ)?\s*(มากกว่า|เกิน|ตั้งแต่|อย่างน้อย|ขั้นต่ำ|at least|>=|≥)?\s*(\d+)\s*(?:เดือน)?\s*(?:แต่)?\s*(?:ถึง|ไม่เกิน|ถึงไม่เกิน|แต่ไม่เกิน)\s*(\d+)\s*(?:เดือน)?$/.exec(
      ageText,
    );
  const upper = /^(?:รุ่น)?(?:อายุ)?\s*(?:ไม่เกิน|<=|≤)\s*(\d+)\s*เดือน$/.exec(
    ageText,
  );
  const upward = /^(?:รุ่น)?(?:อายุ)?\s*(\d+)\s*เดือนขึ้นไป$/.exec(ageText);
  const lower =
    /^(?:รุ่น)?(?:อายุ)?\s*(มากกว่า|เกิน|ตั้งแต่|อย่างน้อย|ขั้นต่ำ|at least|>=|≥)\s*(\d+)\s*เดือน(?:ขึ้นไป)?$/.exec(
      ageText,
    );
  if (!calfAge && range) {
    minMonths = Number(range[2]);
    maxMonths = Number(range[3]);
    minInclusive = !["มากกว่า", "เกิน"].includes(range[1] ?? "");
  } else if (!calfAge && upper) maxMonths = Number(upper[1]);
  else if (!calfAge && lower) {
    minMonths = Number(lower[2]);
    minInclusive = !["มากกว่า", "เกิน"].includes(lower[1] ?? "");
  } else if (!calfAge && upward) {
    minMonths = Number(upward[1]);
  } else if (!calfAge && /เดือน|อายุ|มากกว่า|ไม่เกิน|ขั้นต่ำ/.test(text))
    return null;
  const rule: CompetitionClass = {
    name,
    kind:
      special || (minMonths === null && maxMonths === null) ? "special" : "age",
    minMonths,
    maxMonths,
    minInclusive,
    group: "",
    criteria: special ? name : "",
  };
  return valid(rule) ? rule : null;
}
export function classDisplayName(value: string): string {
  const rule = parseCompetitionClass(value);
  return rule
    ? rule.kind === "special"
      ? `[SP] ${rule.name}`
      : rule.name
    : "";
}
export function normalizeClassName(value: string): string {
  if (value.trim().startsWith(reserved))
    return withoutSP(classDisplayName(value));
  return withoutSP(value);
}
export function isCompetitionClassEligible(
  age: number,
  value: string,
): boolean {
  const r = parseCompetitionClass(value);
  return (
    !!r &&
    Number.isFinite(age) &&
    age >= 0 &&
    (r.minMonths === null ||
      (r.minInclusive ? age >= r.minMonths : age > r.minMonths)) &&
    (r.maxMonths === null || age <= r.maxMonths)
  );
}
export function getEligibleCompetitionClasses(
  age: number,
  values: string[],
): string[] {
  return [
    ...new Set(
      (values ?? [])
        .filter((v) => isCompetitionClassEligible(age, v))
        .map(classDisplayName),
    ),
  ];
}
export function validateCompetitionCatalog(values: string[]): string[] {
  const errors: string[] = [],
    names = new Set<string>();
  if (values.length > 200) errors.push("เพิ่มรุ่นแข่งขันได้ไม่เกิน 200 รุ่น");
  values.forEach((value, i) => {
    if (!parseCompetitionClass(value)) {
      errors.push(
        `รุ่นที่ ${i + 1}: ชื่อหรือเงื่อนไขอายุไม่ชัดเจน กรุณาตรวจสอบ`,
      );
      return;
    }
    const name = normalizeClassName(value);
    if (names.has(name)) errors.push(`รุ่นที่ ${i + 1}: ชื่อรุ่นซ้ำ ${name}`);
    names.add(name);
  });
  return errors;
}
export function generateCompetitionClassName(rule: CompetitionClass): string {
  const bounds = [
    rule.minMonths === null
      ? ""
      : `${rule.minInclusive ? "ตั้งแต่" : "มากกว่า"} ${rule.minMonths} เดือน`,
    rule.maxMonths === null ? "" : `ไม่เกิน ${rule.maxMonths} เดือน`,
  ]
    .filter(Boolean)
    .join(" ถึง ");
  return [
    clean(rule.group),
    bounds || (rule.kind === "special" ? "รุ่นพิเศษ" : ""),
  ]
    .filter(Boolean)
    .join(" — ");
}
