import { useRef, useState } from "react";
import { api } from "~/utils/api";
import {
  classDisplayName,
  parseCompetitionClass,
} from "~/lib/competition-classes";
import {
  EXPORT_CONTROLLED_LABELS,
  exportLayoutSchema,
  type ExportCategory,
  type ExportControlledField,
  type ExportLayout,
  type ExportPlan,
} from "~/lib/competition-export-layout";
import {
  readExportDiagnostics,
  type ExportLayoutDetail,
} from "~/lib/competition-export-protocol";
import { Alert, button, control, primary } from "./Workspace";
import { ExportDiagnostics, ExportPlanPreview } from "./ExportPlanPreview";
import { useUnsavedCompetitionChanges } from "./useUnsavedCompetitionChanges";
const fieldNames = { sex: "เพศ", color: "สี", level: "ระดับ" };
const displayClass = (value: string) => {
  const rule = parseCompetitionClass(value);
  const name = classDisplayName(value) || value;
  if (!rule || !value.trim().startsWith("@jaothui/class:")) return name;
  const bounds = [
    rule.minMonths === null
      ? ""
      : `${rule.minInclusive ? "ตั้งแต่" : "มากกว่า"} ${rule.minMonths} เดือน`,
    rule.maxMonths === null ? "" : `ถึง ${rule.maxMonths} เดือน`,
  ]
    .filter(Boolean)
    .join(" ");
  return [name, rule.group, bounds, rule.criteria].filter(Boolean).join(" • ");
};
const identity = () => crypto.randomUUID();
const move = <T,>(values: T[], index: number, direction: number) => {
  const next = [...values];
  const target = index + direction;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
};
const signature = (layout: ExportLayout) => JSON.stringify(layout);
export function ExportLayoutEditor({
  detail,
  download,
  downloading = false,
}: {
  detail: ExportLayoutDetail;
  download: (format: "xlsx" | "docx") => Promise<void>;
  downloading?: boolean;
}) {
  const [snapshot, setSnapshot] = useState(detail);
  const [draft, setDraft] = useState<ExportLayout>(
    () => detail.layout ?? detail.proposedLayout,
  );
  const [savedSignature, setSavedSignature] = useState<string | null>(() =>
    detail.layout ? signature(detail.layout) : null,
  );
  const [preview, setPreview] = useState<{
    signature: string;
    plan: ExportPlan;
  } | null>(null);
  const [failureDiagnostics, setFailureDiagnostics] = useState(
    snapshot.plan.diagnostics.slice(0, 0),
  );
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [catalogChoice, setCatalogChoice] = useState("");
  const operation = useRef<{ signature: string; id: string }>();
  const pending = useRef(false);
  const previewMutation = api.competitions.previewExportLayout.useMutation();
  const saveMutation = api.competitions.saveExportLayout.useMutation();
  const utils = api.useUtils();
  const dirty = signature(draft) !== savedSignature;
  const busy =
    previewMutation.isPending ||
    saveMutation.isPending ||
    refreshing ||
    downloading;
  useUnsavedCompetitionChanges(dirty);
  const change = (next: ExportLayout) => {
    setDraft(next);
    setValidationErrors({});
    setPreview(null);
    setError("");
    setFailureDiagnostics([]);
    setMessage("");
    operation.current = undefined;
  };
  const editCategory = (index: number, patch: Partial<ExportCategory>) =>
    change({
      ...draft,
      categories: draft.categories.map((category, i) =>
        i === index ? { ...category, ...patch } : category,
      ),
    });
  const options = (field: ExportControlledField) =>
    [
      ...Object.entries(EXPORT_CONTROLLED_LABELS[field]),
      ...draft.aliases
        .filter((alias) => alias.field === field)
        .map(
          (alias) => [alias.canonicalValue, alias.labelTh] as [string, string],
        ),
    ].filter(
      ([value], index, all) =>
        all.findIndex((item) => item[0] === value) === index,
    );
  const label = (field: ExportControlledField, value: string) =>
    options(field).find((item) => item[0] === value)?.[1] ??
    `ยังไม่แปล: ${value || "(ค่าว่าง)"}`;
  const inspect = async () => {
    const validation = exportLayoutSchema.safeParse(draft);
    if (!validation.success) {
      setValidationErrors(
        Object.fromEntries(
          validation.error.issues.map((issue) => [
            issue.path.join("."),
            /[ก-๙]/.test(issue.message)
              ? issue.message
              : "กรุณาระบุข้อมูลให้ครบและถูกต้อง",
          ]),
        ),
      );
      setError(
        validation.error.issues
          .map(
            (issue) =>
              `${issue.path[0] === "categories" ? `หมวดที่ ${Number(issue.path[1]) + 1}` : "คำแปล"}: ${/[ก-๙]/.test(issue.message) ? issue.message : "กรุณาระบุข้อมูลให้ครบและถูกต้อง"}`,
          )
          .join(" • "),
      );
      return;
    }
    if (pending.current) return;
    pending.current = true;
    setError("");
    setMessage("");
    const sent = signature(draft);
    try {
      const result = await previewMutation.mutateAsync({
        id: snapshot.event._id,
        layout: draft,
      });
      setPreview({ signature: sent, plan: result.plan });
    } catch (e) {
      setFailureDiagnostics(readExportDiagnostics(e));
      setError(e instanceof Error ? e.message : "ตรวจรูปแบบไม่สำเร็จ");
    } finally {
      pending.current = false;
    }
  };
  const save = async () => {
    if (
      pending.current ||
      !preview ||
      preview.signature !== signature(draft) ||
      preview.plan.state !== "ready"
    )
      return;
    pending.current = true;
    setError("");
    setMessage("");
    const fingerprint = JSON.stringify({
      layout: draft,
      revision: snapshot.event._rev,
      catalog: snapshot.plan.catalogFingerprint,
    });
    if (operation.current?.signature !== fingerprint)
      operation.current = { signature: fingerprint, id: identity() };
    try {
      const next = await saveMutation.mutateAsync({
        id: snapshot.event._id,
        operationId: operation.current.id,
        expectedRevision: snapshot.event._rev,
        expectedCatalogFingerprint: snapshot.plan.catalogFingerprint,
        layout: draft,
      });
      setSnapshot(next);
      const accepted = next.layout ?? next.proposedLayout;
      setDraft(accepted);
      setSavedSignature(next.layout ? signature(accepted) : null);
      setPreview(null);
      setConflict(false);
      setMessage("บันทึกรูปแบบไฟล์แล้ว");
      operation.current = undefined;
    } catch (e) {
      setFailureDiagnostics(readExportDiagnostics(e));
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      setConflict(true);
    } finally {
      pending.current = false;
    }
  };
  const refresh = async () => {
    setRefreshing(true);
    setError("");
    try {
      const next = await utils.competitions.exportLayout.fetch({
        id: snapshot.event._id,
      });
      setSnapshot(next);
      setSavedSignature(next.layout ? signature(next.layout) : null);
      setPreview(null);
      operation.current = undefined;
      setMessage(
        "โหลดข้อมูลล่าสุดแล้ว ร่างของคุณยังอยู่ กรุณาเทียบกับรุ่นต้นทางและตรวจตัวอย่างใหม่",
      );
    } catch (e) {
      setFailureDiagnostics(readExportDiagnostics(e));
      setError(e instanceof Error ? e.message : "โหลดข้อมูลล่าสุดไม่สำเร็จ");
    } finally {
      setRefreshing(false);
    }
  };
  const addCategory = () => {
    const choice = JSON.parse(catalogChoice) as {
      level: string;
      raw: string;
      historical?: boolean;
    };
    const n = draft.categories.length + 1;
    const bindings = snapshot.bindings.filter(
      (binding) =>
        binding.catalogValue === choice.raw || binding.rawType === choice.raw,
    );
    const rawTypes = [
      ...new Set([choice.raw, ...bindings.map((binding) => binding.rawType)]),
    ];
    change({
      ...draft,
      categories: [
        ...draft.categories,
        {
          id: identity(),
          level: choice.level,
          catalogValue: choice.historical ? undefined : choice.raw,
          historical: choice.historical,
          registrationTypeValues: rawTypes,
          posterNumber: String(n),
          fullLabelTh: parseCompetitionClass(choice.raw)?.name ?? choice.raw,
          shortLabelTh: (
            parseCompetitionClass(choice.raw)?.name ?? choice.raw
          ).slice(0, 100),
          groups: [
            { color: "black", sex: "male" },
            { color: "black", sex: "female" },
            { color: "albino", sex: "male" },
            { color: "albino", sex: "female" },
          ],
        },
      ],
    });
  };
  const ready =
    !!snapshot.layout && snapshot.plan.state === "ready" && !dirty && !busy;
  return (
    <section
      className="glass-card min-w-0 space-y-6 rounded-3xl p-4 text-base md:p-6"
      aria-label="รูปแบบไฟล์ของงานนี้"
    >
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">รูปแบบไฟล์ของงานนี้</h2>
        <p>
          จัดลำดับรุ่นและชื่อภาษาไทยในไฟล์ โดยไม่เปลี่ยนกติกา รุ่นที่สมัคร
          หรือข้อมูลใบสมัคร
        </p>
        <p className="text-sm text-text-muted">
          ใบสมัคร {snapshot.rowCount} รายการ • รวมทุกสถานะและทุกระดับ •
          แยกชีตตามสีและเพศ
        </p>
      </div>
      {!snapshot.layout ? (
        <Alert>
          งานนี้ยังไม่มีรูปแบบไฟล์ที่บันทึกไว้ ร่างด้านล่างเป็นข้อเสนอ
          กรุณาตรวจลำดับตามป้ายของงานก่อนบันทึก
        </Alert>
      ) : null}
      {dirty ? (
        <Alert>
          มีร่างที่ยังไม่บันทึก กรุณาดูตัวอย่างและบันทึกก่อนดาวน์โหลด
        </Alert>
      ) : null}
      {snapshot.ageWarningCount ? (
        <Alert>
          มี {snapshot.ageWarningCount}{" "}
          รายการที่อายุไม่ครบหรือคำนวณจากวันตัดอายุ หมายเหตุจะคงอยู่ในไฟล์
          ไม่คำนวณอายุจากวันที่ดาวน์โหลด
        </Alert>
      ) : null}
      {error ? <Alert error>{error}</Alert> : null}
      {failureDiagnostics.length ? (
        <ExportDiagnostics
          plan={{ ...snapshot.plan, diagnostics: failureDiagnostics }}
        />
      ) : null}
      {message ? <Alert>{message}</Alert> : null}
      <div className="space-y-2">
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() => void refresh()}
        >
          โหลดข้อมูลล่าสุดโดยเก็บร่าง
        </button>
        <p className="text-sm text-text-muted">
          ใช้เมื่อชุดรุ่นหรือค่าต้นทางเปลี่ยนหลังเปิดหน้านี้
          ร่างที่กำลังแก้จะยังอยู่เพื่อเทียบและตรวจทาน
        </p>
      </div>
      {conflict ? (
        <div className="space-y-3 rounded-xl border border-orange-300/30 p-4">
          <p>
            ร่างยังอยู่ หากข้อมูลเปลี่ยนจากที่อื่น
            ให้โหลดข้อมูลล่าสุดเพื่อเทียบก่อนลองบันทึกใหม่
          </p>
        </div>
      ) : null}
      {snapshot.plan.catalogFingerprint !== draft.reviewedCatalogFingerprint ? (
        <Alert>
          ชุดรุ่นต้นทางเปลี่ยนแล้ว กรุณาตรวจการผูกรุ่นของแต่ละหมวด{" "}
          <button
            type="button"
            className={`${button} mt-3`}
            disabled={busy}
            onClick={() =>
              change({
                ...draft,
                reviewedCatalogFingerprint: snapshot.plan.catalogFingerprint,
              })
            }
          >
            ยืนยันตรวจชุดรุ่นล่าสุดแล้ว
          </button>
        </Alert>
      ) : null}
      <fieldset disabled={busy} className="min-w-0 space-y-5">
        <legend className="mb-3 text-lg font-semibold">
          หมวดรุ่นตามลำดับในไฟล์
        </legend>
        {draft.categories.map((category, index) => (
          <section
            key={category.id}
            aria-label={`หมวดที่ ${index + 1}`}
            className="min-w-0 space-y-4 rounded-2xl border border-white/20 bg-black/20 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="break-words text-lg font-medium">
                {index + 1}. {category.fullLabelTh || "ยังไม่ระบุชื่อ"}
              </h3>
              <div className="flex flex-wrap gap-2">
                <button
                  className={button}
                  type="button"
                  disabled={index === 0}
                  aria-label={`เลื่อนหมวดที่ ${index + 1} ขึ้น`}
                  onClick={() =>
                    change({
                      ...draft,
                      categories: move(draft.categories, index, -1),
                    })
                  }
                >
                  ↑ ขึ้น
                </button>
                <button
                  className={button}
                  type="button"
                  disabled={index === draft.categories.length - 1}
                  aria-label={`เลื่อนหมวดที่ ${index + 1} ลง`}
                  onClick={() =>
                    change({
                      ...draft,
                      categories: move(draft.categories, index, 1),
                    })
                  }
                >
                  ↓ ลง
                </button>
                <button
                  className={button}
                  type="button"
                  onClick={() =>
                    change({
                      ...draft,
                      categories: [
                        ...draft.categories.slice(0, index + 1),
                        {
                          ...category,
                          id: identity(),
                          groups: category.groups.map((group) => ({
                            ...group,
                          })),
                        },
                        ...draft.categories.slice(index + 1),
                      ],
                    })
                  }
                >
                  คัดลอกหมวด
                </button>
                <button
                  className={button}
                  type="button"
                  onClick={() =>
                    change({
                      ...draft,
                      categories: draft.categories.filter(
                        (_, i) => i !== index,
                      ),
                    })
                  }
                >
                  นำหมวดนี้ออก
                </button>
              </div>
            </div>
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <label className="min-w-0 space-y-2 text-sm">
                เลขรุ่นตามป้าย
                <input
                  className={control}
                  maxLength={40}
                  value={category.posterNumber}
                  aria-invalid={
                    !!validationErrors[`categories.${index}.posterNumber`]
                  }
                  aria-describedby={
                    validationErrors[`categories.${index}.posterNumber`]
                      ? `${category.id}-posterNumber-error`
                      : undefined
                  }
                  onChange={(e) =>
                    editCategory(index, { posterNumber: e.target.value })
                  }
                />
                {validationErrors[`categories.${index}.posterNumber`] ? (
                  <span
                    id={`${category.id}-posterNumber-error`}
                    className="block text-sm text-orange-100"
                  >
                    {validationErrors[`categories.${index}.posterNumber`]}
                  </span>
                ) : null}
              </label>
              <label className="min-w-0 space-y-2 text-sm">
                ระดับ
                <select
                  className={control}
                  value={category.level}
                  onChange={(e) =>
                    editCategory(index, { level: e.target.value })
                  }
                >
                  {options("level").map(([value, text]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-0 space-y-2 text-sm">
                ชื่อรุ่นเต็มภาษาไทย
                <input
                  className={control}
                  maxLength={1000}
                  value={category.fullLabelTh}
                  aria-invalid={
                    !!validationErrors[`categories.${index}.fullLabelTh`]
                  }
                  aria-describedby={
                    validationErrors[`categories.${index}.fullLabelTh`]
                      ? `${category.id}-fullLabelTh-error`
                      : undefined
                  }
                  onChange={(e) =>
                    editCategory(index, { fullLabelTh: e.target.value })
                  }
                />
                {validationErrors[`categories.${index}.fullLabelTh`] ? (
                  <span
                    id={`${category.id}-fullLabelTh-error`}
                    className="block text-sm text-orange-100"
                  >
                    {validationErrors[`categories.${index}.fullLabelTh`]}
                  </span>
                ) : null}
              </label>
              <label className="min-w-0 space-y-2 text-sm">
                ชื่อย่อภาษาไทยสำหรับชีต
                <input
                  className={control}
                  maxLength={100}
                  value={category.shortLabelTh}
                  aria-invalid={
                    !!validationErrors[`categories.${index}.shortLabelTh`]
                  }
                  aria-describedby={
                    validationErrors[`categories.${index}.shortLabelTh`]
                      ? `${category.id}-shortLabelTh-error`
                      : undefined
                  }
                  onChange={(e) =>
                    editCategory(index, { shortLabelTh: e.target.value })
                  }
                />
                {validationErrors[`categories.${index}.shortLabelTh`] ? (
                  <span
                    id={`${category.id}-shortLabelTh-error`}
                    className="block text-sm text-orange-100"
                  >
                    {validationErrors[`categories.${index}.shortLabelTh`]}
                  </span>
                ) : null}
              </label>
            </div>
            <label className="block min-w-0 space-y-2 text-sm">
              รุ่นต้นทางในชุดรุ่น
              <select
                className={control}
                value={category.catalogValue ?? ""}
                onChange={(e) =>
                  editCategory(index, {
                    catalogValue: e.target.value || undefined,
                    historical: !e.target.value,
                  })
                }
              >
                <option value="">รุ่นเดิมนอกชุดรุ่นปัจจุบัน</option>
                {snapshot.event.catalogs[
                  category.level === "province" ? "province" : "national"
                ].map((value) => (
                  <option key={value} value={value}>
                    {displayClass(value)}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="min-w-0 space-y-2">
              <legend className="text-sm">
                ใบสมัครที่ผูกกับหมวดนี้ (เลือกค่ารุ่นต้นทางให้ตรง)
              </legend>
              {[
                ...new Set([
                  ...category.registrationTypeValues,
                  ...snapshot.bindings.map((binding) => binding.rawType),
                  ...(category.catalogValue ? [category.catalogValue] : []),
                ]),
              ].map((raw) => (
                <label
                  key={raw}
                  className="flex min-h-12 items-start gap-3 break-words py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 shrink-0 accent-orange-500"
                    checked={category.registrationTypeValues.includes(raw)}
                    onChange={(e) =>
                      editCategory(index, {
                        registrationTypeValues: e.target.checked
                          ? [...category.registrationTypeValues, raw]
                          : category.registrationTypeValues.filter(
                              (value) => value !== raw,
                            ),
                      })
                    }
                  />
                  <span className="min-w-0 break-words">
                    {displayClass(raw)}
                    <span className="block text-text-muted">
                      พบ{" "}
                      {snapshot.bindings
                        .filter((binding) => binding.rawType === raw)
                        .reduce((sum, binding) => sum + binding.count, 0)}{" "}
                      ใบสมัคร
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <fieldset className="min-w-0 space-y-3">
              <legend className="text-sm">ลำดับกลุ่มสีและเพศ</legend>
              {category.groups.map((group, groupIndex) => (
                <div
                  key={groupIndex}
                  className="flex min-w-0 flex-wrap items-end gap-3 rounded-xl bg-black/20 p-3"
                >
                  <label className="min-w-0 flex-1 space-y-2 text-sm">
                    สี
                    <select
                      className={control}
                      value={group.color}
                      onChange={(e) =>
                        editCategory(index, {
                          groups: category.groups.map((item, i) =>
                            i === groupIndex
                              ? { ...item, color: e.target.value }
                              : item,
                          ),
                        })
                      }
                    >
                      {options("color").map(([value, text]) => (
                        <option key={value} value={value}>
                          {text}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="min-w-0 flex-1 space-y-2 text-sm">
                    เพศ
                    <select
                      className={control}
                      value={group.sex}
                      onChange={(e) =>
                        editCategory(index, {
                          groups: category.groups.map((item, i) =>
                            i === groupIndex
                              ? { ...item, sex: e.target.value }
                              : item,
                          ),
                        })
                      }
                    >
                      {options("sex").map(([value, text]) => (
                        <option key={value} value={value}>
                          {text}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className={button}
                    aria-label={`เลื่อนกลุ่มที่ ${groupIndex + 1} ของหมวดที่ ${index + 1} ขึ้น`}
                    disabled={groupIndex === 0}
                    onClick={() =>
                      editCategory(index, {
                        groups: move(category.groups, groupIndex, -1),
                      })
                    }
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={button}
                    aria-label={`เลื่อนกลุ่มที่ ${groupIndex + 1} ของหมวดที่ ${index + 1} ลง`}
                    disabled={groupIndex === category.groups.length - 1}
                    onClick={() =>
                      editCategory(index, {
                        groups: move(category.groups, groupIndex, 1),
                      })
                    }
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={button}
                    aria-label={`นำกลุ่มที่ ${groupIndex + 1} ของหมวดที่ ${index + 1} ออก`}
                    onClick={() =>
                      editCategory(index, {
                        groups: category.groups.filter(
                          (_, i) => i !== groupIndex,
                        ),
                      })
                    }
                  >
                    นำออก
                  </button>
                </div>
              ))}
              <button
                type="button"
                className={button}
                onClick={() =>
                  editCategory(index, {
                    groups: [
                      ...category.groups,
                      { color: "black", sex: "male" },
                    ],
                  })
                }
              >
                เพิ่มกลุ่มสีและเพศ
              </button>
            </fieldset>
          </section>
        ))}
        <div className="space-y-3 rounded-xl border border-white/20 p-4">
          <label className="block min-w-0 space-y-2 text-sm">
            เพิ่มหมวดจากรุ่นต้นทาง (รวมรุ่นที่ยังไม่มีใบสมัคร)
            <select
              className={control}
              value={catalogChoice}
              onChange={(e) => setCatalogChoice(e.target.value)}
            >
              <option value="">เลือกรุ่นต้นทาง</option>
              {(["national", "province"] as const).flatMap((level) =>
                snapshot.event.catalogs[level].map((raw) => (
                  <option
                    key={`${level}-${raw}`}
                    value={JSON.stringify({ level, raw })}
                  >
                    {label("level", level)} • {displayClass(raw)}
                  </option>
                )),
              )}
              {[
                ...new Set(snapshot.bindings.map((binding) => binding.rawType)),
              ].map((raw) => (
                <option
                  key={`historical-${raw}`}
                  value={JSON.stringify({
                    level: "national",
                    raw,
                    historical: true,
                  })}
                >
                  รุ่นเดิม • {displayClass(raw)} (เลือกระดับหลังเพิ่ม)
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={button}
            disabled={!catalogChoice}
            onClick={addCategory}
          >
            เพิ่มหมวดจากรุ่นที่เลือก
          </button>
        </div>
        <section className="space-y-3">
          <h3 className="text-lg font-medium">ค่าต้นทางที่พบในใบสมัคร</h3>
          <p className="text-sm text-text-muted">
            ใช้เทียบการผูกรุ่นและคำแปล แสดงเฉพาะค่าประเภทและจำนวน
            ไม่มีข้อมูลเจ้าของ
          </p>
          {snapshot.bindings.map((binding, index) => (
            <p
              key={index}
              className="break-words rounded-xl bg-black/20 p-3 text-sm"
            >
              {displayClass(binding.rawType)} • ระดับ:{" "}
              {binding.level || "(ค่าว่าง)"} • สี:{" "}
              {binding.color || "(ค่าว่าง)"} • เพศ: {binding.sex || "(ค่าว่าง)"}{" "}
              • {binding.count} ใบสมัคร
            </p>
          ))}
        </section>
        <section className="space-y-4" aria-label="คำแปลค่าต้นทาง">
          <h3 className="text-lg font-medium">คำแปลและค่าต้นทางเดิม</h3>
          <p className="text-sm text-text-muted">
            เพิ่มคำเรียกเดิมที่ระบบยังไม่รู้จัก แล้วเลือกความหมายที่ถูกต้อง
            ค่ามาตรฐาน เช่น male หรือ albino ไม่สามารถเปลี่ยนความหมายได้
          </p>
          {draft.aliases.map((alias, index) => (
            <fieldset
              key={index}
              className="grid min-w-0 gap-3 rounded-xl border border-white/20 p-4 md:grid-cols-2"
            >
              <legend className="px-2 text-sm">คำแปลที่ {index + 1}</legend>
              <label className="space-y-2 text-sm">
                ประเภทค่า
                <select
                  className={control}
                  value={alias.field}
                  onChange={(e) => {
                    const field = e.target.value as ExportControlledField;
                    change({
                      ...draft,
                      aliases: draft.aliases.map((item, i) =>
                        i === index
                          ? {
                              ...item,
                              field,
                              canonicalValue: Object.keys(
                                EXPORT_CONTROLLED_LABELS[field],
                              )[0]!,
                              labelTh: Object.values(
                                EXPORT_CONTROLLED_LABELS[field],
                              )[0]!,
                            }
                          : item,
                      ),
                    });
                  }}
                >
                  {Object.entries(fieldNames).map(([value, text]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm">
                ค่าต้นทาง (เว้นว่างเฉพาะข้อมูลที่ขาด)
                <input
                  className={control}
                  value={alias.rawValue}
                  maxLength={2000}
                  onChange={(e) =>
                    change({
                      ...draft,
                      aliases: draft.aliases.map((item, i) =>
                        i === index
                          ? { ...item, rawValue: e.target.value }
                          : item,
                      ),
                    })
                  }
                />
              </label>
              <label className="space-y-2 text-sm">
                ความหมาย
                <select
                  className={control}
                  value={
                    alias.canonicalValue.startsWith("custom-")
                      ? "custom"
                      : alias.canonicalValue
                  }
                  onChange={(e) => {
                    const value = e.target.value;
                    change({
                      ...draft,
                      aliases: draft.aliases.map((item, i) =>
                        i === index
                          ? {
                              ...item,
                              canonicalValue:
                                value === "custom"
                                  ? `custom-${identity()}`
                                  : value,
                              labelTh:
                                value === "unspecified"
                                  ? "ไม่ระบุ"
                                  : (EXPORT_CONTROLLED_LABELS[alias.field][
                                      value
                                    ] ?? ""),
                            }
                          : item,
                      ),
                    });
                  }}
                >
                  {Object.entries(EXPORT_CONTROLLED_LABELS[alias.field]).map(
                    ([value, text]) => (
                      <option key={value} value={value}>
                        {text}
                      </option>
                    ),
                  )}
                  <option value="unspecified">
                    ไม่ระบุ (เฉพาะค่าว่างจริง)
                  </option>
                  <option value="custom">กำหนดความหมายอื่นเป็นภาษาไทย</option>
                </select>
              </label>
              <label className="space-y-2 text-sm">
                คำแสดงภาษาไทย
                <input
                  className={control}
                  value={alias.labelTh}
                  maxLength={1000}
                  readOnly={!alias.canonicalValue.startsWith("custom-")}
                  onChange={(e) =>
                    change({
                      ...draft,
                      aliases: draft.aliases.map((item, i) =>
                        i === index
                          ? { ...item, labelTh: e.target.value }
                          : item,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                className={button}
                onClick={() =>
                  change({
                    ...draft,
                    aliases: draft.aliases.filter((_, i) => i !== index),
                  })
                }
              >
                นำคำแปลนี้ออก
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            className={button}
            onClick={() =>
              change({
                ...draft,
                aliases: [
                  ...draft.aliases,
                  {
                    field: "color",
                    rawValue: "",
                    canonicalValue: "black",
                    labelTh: "ดำ",
                  },
                ],
              })
            }
          >
            เพิ่มคำแปลค่าต้นทาง
          </button>
        </section>
      </fieldset>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() => void inspect()}
        >
          {previewMutation.isPending
            ? "กำลังตรวจรูปแบบ…"
            : "ดูตัวอย่างลำดับชีต"}
        </button>
        <button
          type="button"
          className={primary}
          disabled={
            busy ||
            !preview ||
            preview.signature !== signature(draft) ||
            preview.plan.state !== "ready"
          }
          onClick={() => void save()}
        >
          {saveMutation.isPending ? "กำลังบันทึก…" : "บันทึกรูปแบบไฟล์"}
        </button>
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() => {
            setDraft(snapshot.layout ?? snapshot.proposedLayout);
            setSavedSignature(
              snapshot.layout ? signature(snapshot.layout) : null,
            );
            setPreview(null);
            setError("");
            setMessage("ใช้รูปแบบล่าสุดแทนร่างแล้ว");
          }}
        >
          ใช้รูปแบบที่บันทึกแทนร่าง
        </button>
      </div>
      <ExportPlanPreview
        plan={
          preview?.signature === signature(draft) ? preview.plan : snapshot.plan
        }
        draft={!!preview && preview.signature === signature(draft)}
      />
      <section
        className="space-y-4 border-t border-white/20 pt-5"
        aria-label="ดาวน์โหลดไฟล์"
      >
        <h3 className="text-lg font-semibold">ดาวน์โหลดไฟล์</h3>
        <p>
          Excel มีสารบัญพร้อมลิงก์เปิดแต่ละชีตและกลับสารบัญ ส่วน ZIP มีใบสมัคร
          DOCX รายตัว ระบบจะตรวจความครบถ้วนล่าสุดก่อนสร้างไฟล์ทุกครั้ง
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className={primary}
            disabled={!ready}
            onClick={() => void download("xlsx")}
          >
            ดาวน์โหลด Excel
          </button>
          <button
            type="button"
            className={button}
            disabled={!ready}
            onClick={() => void download("docx")}
          >
            ดาวน์โหลดใบสมัคร DOCX (ZIP)
          </button>
        </div>
        {!ready ? (
          <p className="text-sm text-text-muted">
            ดาวน์โหลดได้หลังบันทึกการตั้งค่าที่ตรวจครบ
            และไม่มีร่างที่ยังไม่บันทึก
          </p>
        ) : null}
      </section>
    </section>
  );
}
