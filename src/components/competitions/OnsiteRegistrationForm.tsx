import { ThaiDateInput } from "./ThaiDateInput";
import {
  emptyDateDraft,
  dateDraftFromIso,
  dateDraftIso,
  dateDraftNeedsReview,
} from "~/lib/competition-thai-date";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import type { Competition } from "~/lib/competitions";
import { formatDay } from "~/lib/competitions";
import type {
  CompetitionMetadata,
  OnsiteRegistration,
} from "~/lib/competition-applications";
import {
  blankOnsiteForm,
  onsiteAge,
  onsiteClasses,
  onsiteCriteria,
  validateOnsite,
  blockingDuplicateCount,
  type OnsiteForm,
} from "~/lib/competition-onsite";
import { api } from "~/utils/api";
import { Alert, button, control, primary } from "./Workspace";

type PendingRequest = {
  id: string;
  operationId: string;
  expectedRevision: string;
  registration: OnsiteRegistration;
};
export function OnsiteRegistrationForm({
  event,
  refresh,
}: {
  event: Competition;
  refresh: () => Promise<unknown>;
}) {
  const router = useRouter();
  const [form, setForm] = useState(blankOnsiteForm);
  const [birthdayDraft, setBirthdayDraft] = useState(emptyDateDraft);
  const [metadata, setMetadata] = useState<CompetitionMetadata | null>(null);
  const [looking, setLooking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [savedId, setSavedId] = useState("");
  const [retry, setRetry] = useState<PendingRequest | null>(null);
  const submitting = useRef(false);
  const lookupSequence = useRef(0);
  const utils = api.useUtils();
  const mutation = api.competitions.onsite.useMutation();
  const locked = mutation.isPending || !!retry;
  const duplicateCount =
    metadata?.microchip === form.microchip.trim()
      ? blockingDuplicateCount(event, form.level, metadata)
      : 0;
  const age = onsiteAge(event, form);
  const classes = onsiteClasses(event, form);
  const criteria = onsiteCriteria(event, form);
  const dirty =
    JSON.stringify(form) !== JSON.stringify(blankOnsiteForm()) ||
    JSON.stringify(birthdayDraft) !== JSON.stringify(emptyDateDraft()) ||
    !!retry;
  useEffect(() => {
    if (!dirty) return;
    const confirmLeave = () =>
      window.confirm(
        retry
          ? "ยังยืนยันผลลงทะเบียนไม่ได้ ควรลองคำขอเดิมก่อนออก ต้องการออกจากหน้านี้หรือไม่?"
          : "ยังมีข้อมูลลงทะเบียนที่ไม่ได้บันทึก ต้องการออกจากหน้านี้หรือไม่?",
      );
    const unload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const click = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const anchor =
        e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.download ||
        (anchor.target && anchor.target !== "_self")
      )
        return;
      const destination = new URL(anchor.href, window.location.href);
      if (
        destination.origin !== window.location.origin ||
        (destination.pathname === window.location.pathname &&
          destination.search === window.location.search)
      )
        return;
      if (!confirmLeave()) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    router.beforePopState(() => {
      if (confirmLeave()) return true;
      void router.replace(router.asPath, undefined, {
        shallow: true,
        scroll: false,
      });
      return false;
    });
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
      router.beforePopState(() => true);
    };
  }, [dirty, retry, router]);
  const change = (field: keyof OnsiteForm, value: string) => {
    setSavedId("");
    setMessage("");
    setError("");
    setForm((old) => ({
      ...old,
      [field]: value,
      ...(["birthday", "color", "level"].includes(field) ? { type: "" } : {}),
    }));
    if (field === "microchip") {
      lookupSequence.current++;
      setMetadata(null);
      setLooking(false);
    }
  };
  async function lookup() {
    const microchip = form.microchip.trim();
    if (!microchip) {
      setError("กรุณาระบุไมโครชิพก่อนค้นหา");
      return;
    }
    const sequence = ++lookupSequence.current;
    setLooking(true);
    setError("");
    setMetadata(null);
    try {
      const result = await utils.competitions.metadata.fetch({
        id: event._id,
        microchip,
      });
      if (sequence === lookupSequence.current) setMetadata(result);
    } catch (e) {
      if (sequence === lookupSequence.current)
        setError(e instanceof Error ? e.message : "ค้นหาข้อมูลไม่สำเร็จ");
    } finally {
      if (sequence === lookupSequence.current) setLooking(false);
    }
  }
  function applyMetadata() {
    const data = metadata?.metadata;
    if (!data || metadata.microchip !== form.microchip.trim()) return;
    setBirthdayDraft(dateDraftFromIso(data.birthday));
    setForm((old) => ({
      ...old,
      name: data.name,
      birthday: data.birthday,
      fatherName: data.fatherName,
      motherName: data.motherName,
      sex:
        data.sex === "female"
          ? "female"
          : data.sex === "male"
            ? "male"
            : old.sex,
      color:
        data.color === "albino"
          ? "albino"
          : data.color === "black"
            ? "black"
            : data.color === "white"
              ? "white"
              : old.color,
      type: "",
    }));
    setMessage(
      "นำข้อมูลที่ตรวจแล้วมาใส่ฟอร์ม กรุณาตรวจชื่อและวันเกิดก่อนบันทึก",
    );
  }
  async function submit(request?: PendingRequest) {
    if (submitting.current) return;
    if (!request) {
      if (dateDraftNeedsReview(birthdayDraft)) {
        setError("กรุณาเลือกวันเกิดให้ครบและถูกต้องก่อนบันทึก");
        return;
      }
      const problem = validateOnsite(event, form, duplicateCount);
      if (problem) {
        setError(problem);
        return;
      }
      if (metadata?.microchip !== form.microchip.trim()) {
        setError("กรุณาค้นหาไมโครชิพเพื่อตรวจรายการซ้ำก่อนบันทึก");
        return;
      }
    }
    const next = request ?? {
      id: event._id,
      operationId: crypto.randomUUID(),
      expectedRevision: event._rev,
      registration: {
        ...form,
        name: form.name.trim(),
        ownerName: form.ownerName.trim(),
        ownerTel: form.ownerTel.trim(),
        microchip: form.microchip.trim(),
        duplicateOverrideReason: form.duplicateOverrideReason?.trim()
          ? form.duplicateOverrideReason.trim()
          : undefined,
      },
    };
    submitting.current = true;
    setError("");
    setMessage("");
    try {
      const result = await mutation.mutateAsync(next);
      setRetry(null);
      setSavedId(result._id);
      setMessage(
        "บันทึกลงทะเบียนหน้างานแล้ว • ไม่มีการสร้างบัญชี LINE ให้ผู้สมัคร",
      );
      setForm(blankOnsiteForm());
      setBirthdayDraft(emptyDateDraft());
      setMetadata(null);
      try {
        await refresh();
      } catch {
        setError(
          "บันทึกใบสมัครสำเร็จแล้ว แต่โหลดข้อมูลงานล่าสุดไม่สำเร็จ กรุณาโหลดหน้าใหม่ก่อนลงทะเบียนรายการถัดไป",
        );
      }
    } catch (e) {
      const code = (e as { data?: { code?: string } }).data?.code;
      const text = e instanceof Error ? e.message : "บันทึกไม่สำเร็จ";
      setError(text);
      if (
        [
          "BAD_REQUEST",
          "CONFLICT",
          "NOT_FOUND",
          "UNAUTHORIZED",
          "FORBIDDEN",
        ].includes(code ?? "")
      ) {
        setRetry(null);
        try {
          await refresh();
        } catch {
          setError(
            `${text} • โหลดข้อมูลงานล่าสุดไม่สำเร็จ กรุณาโหลดหน้าใหม่ก่อนลองอีกครั้ง`,
          );
        }
      } else {
        setRetry(next);
        setError(
          `${text} • ยังยืนยันผลไม่ได้ กรุณาลองคำขอเดิมอีกครั้งเพื่อป้องกันรายการซ้ำ`,
        );
      }
    } finally {
      submitting.current = false;
    }
  }
  return (
    <section
      className="glass-card min-w-0 space-y-5 rounded-3xl p-4 md:p-6"
      aria-label="ฟอร์มลงทะเบียนหน้างาน"
    >
      <p>
        วันตัดอายุ: {formatDay(event.buffaloAgeDeadline)} •
        ปัดเดือนขึ้นตามระบบเดิม
      </p>
      {event.eventType === "royal" ? (
        <p className="text-sm text-text-muted">
          Royal สีที่ไม่ใช่สีดำใช้วันเกิดย้อนหลัง 1 วันตามกติกาเดิม
          ข้อมูลรูปและที่อยู่ที่ไม่มีจะแสดงว่าไม่ได้แนบ
        </p>
      ) : null}
      {!event.policy.onsiteAllowed ? (
        <Alert error>
          งานนี้ไม่เปิดลงทะเบียนหน้างานแล้ว
          การปิดงานหรือสิ้นวันจบงานจะหยุดรับรายการใหม่
        </Alert>
      ) : (
        <Alert>
          เจ้าหน้าที่ลงทะเบียนได้ถึงสิ้นวันจบงาน แม้ปิดรับสมัครผู้ใช้ทั่วไปแล้ว
        </Alert>
      )}
      {error ? <Alert error>{error}</Alert> : null}
      {message ? <Alert>{message}</Alert> : null}
      {savedId ? (
        <Link
          className={button}
          href={`/dashboard/competitions/${encodeURIComponent(event._id)}/applications/${encodeURIComponent(savedId)}`}
        >
          ดูใบสมัครที่บันทึก
        </Link>
      ) : null}
      {retry ? (
        <div className="space-y-3">
          <p>
            ฟอร์มถูกเก็บไว้เป็นคำขอเดิม
            ยังไม่ควรส่งเป็นรายการใหม่หรือเปลี่ยนข้อมูล
          </p>
          <button
            type="button"
            className={primary}
            disabled={mutation.isPending}
            onClick={() => void submit(retry)}
          >
            ลองคำขอเดิมอีกครั้ง
          </button>
        </div>
      ) : null}
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <fieldset
          disabled={locked || !event.policy.onsiteAllowed}
          className="min-w-0 space-y-5 disabled:opacity-70"
        >
          <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
            <label className="min-w-0 space-y-2 text-sm">
              เลขไมโครชิพ *
              <input
                className={control}
                value={form.microchip}
                maxLength={100}
                onChange={(e) => change("microchip", e.target.value)}
              />
            </label>
            <button
              type="button"
              className={`${button} self-end`}
              disabled={looking}
              onClick={() => void lookup()}
            >
              {looking ? "กำลังค้นหา…" : "ค้นหาข้อมูลและตรวจซ้ำ"}
            </button>
          </div>
          {metadata ? (
            <section
              className="space-y-3 rounded-xl border border-white/20 p-4"
              aria-label="ตรวจข้อมูลไมโครชิพ"
            >
              <h2 className="text-lg font-semibold">ตรวจข้อมูลก่อนนำมาใช้</h2>
              {metadata.metadata ? (
                <>
                  <dl className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <dt className="text-sm text-text-muted">ชื่อควาย</dt>
                      <dd className="break-words">
                        {metadata.metadata.name || "ไม่ระบุ"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-text-muted">วันเกิด</dt>
                      <dd>{formatDay(metadata.metadata.birthday)}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-text-muted">เพศ / สี</dt>
                      <dd>
                        {metadata.metadata.sex || "ไม่ระบุ"} /{" "}
                        {metadata.metadata.color || "ไม่ระบุ"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-text-muted">พ่อ / แม่</dt>
                      <dd className="break-words">
                        {metadata.metadata.fatherName || "ไม่ระบุ"} /{" "}
                        {metadata.metadata.motherName || "ไม่ระบุ"}
                      </dd>
                    </div>
                  </dl>
                  <button
                    type="button"
                    className={button}
                    onClick={applyMetadata}
                  >
                    ตรวจแล้ว นำข้อมูลมาใส่ฟอร์ม
                  </button>
                </>
              ) : metadata.lookupUnavailable ? (
                <Alert>
                  {metadata.lookupWarning ??
                    "ค้นทะเบียนต้นทางไม่ได้ในขณะนี้ ตรวจรายการซ้ำในงานแล้ว กรอกข้อมูลด้วยตนเองได้"}
                </Alert>
              ) : (
                <p>ไม่พบข้อมูลทะเบียนต้นทาง กรอกข้อมูลด้วยตนเองได้</p>
              )}
              <p role="status">
                พบใบสมัครไมโครชิพนี้ในงาน {metadata.duplicateCount} รายการ
              </p>
              {metadata.duplicateRegistrations.length ? (
                <ul className="space-y-2">
                  {metadata.duplicateRegistrations.map((entry) => (
                    <li key={entry._id} className="break-words">
                      {entry.name} • {entry.type} •{" "}
                      {entry.level === "national"
                        ? "ระดับประเทศ"
                        : entry.level === "province"
                          ? "ระดับจังหวัด / ท้องถิ่น"
                          : "ไม่ทราบระดับ"}{" "}
                      • {entry.ownerName}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            {(
              [
                ["name", "ชื่อควาย *"],
                ["birthday", "วันเกิด *"],
                ["ownerName", "ชื่อเจ้าของ *"],
                ["ownerTel", "เบอร์โทรศัพท์ *"],
                ["farmName", "ชื่อฟาร์ม"],
                ["province", "จังหวัด"],
                ["fatherName", "ชื่อพ่อ"],
                ["motherName", "ชื่อแม่"],
              ] as const
            ).map(([key, label]) =>
              key === "birthday" ? (
                <ThaiDateInput
                  key={key}
                  label="วันเกิด"
                  value={birthdayDraft}
                  required
                  onChange={(draft) => {
                    setBirthdayDraft(draft);
                    change("birthday", dateDraftIso(draft) ?? "");
                  }}
                />
              ) : (
                <label className="min-w-0 space-y-2 text-sm" key={key}>
                  {label}
                  <input
                    className={control}
                    type={key === "ownerTel" ? "tel" : "text"}
                    required={["name", "ownerName", "ownerTel"].includes(key)}
                    value={form[key]}
                    onChange={(e) => change(key, e.target.value)}
                  />
                </label>
              ),
            )}
            <label className="min-w-0 space-y-2 text-sm">
              เพศ *
              <select
                className={control}
                value={form.sex}
                onChange={(e) => change("sex", e.target.value)}
              >
                <option value="male">ผู้</option>
                <option value="female">เมีย</option>
              </select>
            </label>
            <label className="min-w-0 space-y-2 text-sm">
              สี *
              <select
                className={control}
                value={form.color}
                onChange={(e) => change("color", e.target.value)}
              >
                <option value="black">ดำ</option>
                <option value="albino">เผือก</option>
                <option value="white">ขาว (ข้อมูลเดิม)</option>
              </select>
            </label>
            {event.catalogs.province.length ? (
              <label className="min-w-0 space-y-2 text-sm">
                ระดับการแข่งขัน
                <select
                  className={control}
                  value={form.level}
                  onChange={(e) => change("level", e.target.value)}
                >
                  <option value="national">ระดับประเทศ</option>
                  <option value="province">ระดับจังหวัด / ท้องถิ่น</option>
                </select>
              </label>
            ) : null}
            <label className="min-w-0 space-y-2 text-sm">
              รุ่นแข่งขัน *
              <select
                className={control}
                value={form.type}
                onChange={(e) => change("type", e.target.value)}
                required
              >
                <option value="">เลือกรุ่นที่เข้าเกณฑ์</option>
                {classes.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p role="status">
            {age === null
              ? "ระบุวันเกิดที่ถูกต้องเพื่อแสดงอายุและรุ่นที่สมัครได้"
              : `อายุที่ใช้จัดรุ่น: ${age} เดือน • เข้าเกณฑ์ ${classes.length} รุ่น`}
          </p>
          {criteria ? (
            <Alert>เจ้าหน้าที่ต้องตรวจคุณสมบัติเพิ่มเติม: {criteria}</Alert>
          ) : null}
          {metadata?.microchip === form.microchip.trim() &&
          metadata.duplicateCount > 0 &&
          duplicateCount === 0 ? (
            <p role="status" className="text-sm">
              ใบสมัครเดิมอยู่คนละระดับ ลงทะเบียนระดับนี้ได้โดยไม่ต้องระบุเหตุผล
            </p>
          ) : null}
          {duplicateCount > 0 ? (
            <label className="block min-w-0 space-y-2 text-sm">
              เหตุผลที่ยืนยันลงทะเบียนซ้ำ * (อย่างน้อย 10 ตัวอักษร)
              <textarea
                className={control}
                value={form.duplicateOverrideReason ?? ""}
                onChange={(e) =>
                  change("duplicateOverrideReason", e.target.value)
                }
                minLength={10}
                maxLength={1000}
                required
              />
            </label>
          ) : null}
          <p className="text-sm text-text-muted">
            บันทึกโดยบัญชีทีมงานร่วม ผู้สมัครไม่จำเป็นต้องมีบัญชี LINE
          </p>
          <button className={primary} type="submit" disabled={looking}>
            {mutation.isPending ? "กำลังบันทึก…" : "บันทึกลงทะเบียนหน้างาน"}
          </button>
        </fieldset>
      </form>
    </section>
  );
}
