import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { ZodIssue } from "zod";
import { api } from "~/utils/api";
import { useAuth } from "~/context/auth.context";
import {
  competitionInputSchema,
  blankInput,
  inputFromCompetition,
  formatDay,
  type Competition,
  type CompetitionInput,
  type Impact,
} from "~/lib/competitions";
import { Status, Alert, button, primary, control, EventNav } from "./Workspace";
import { ThaiDateInput } from "./ThaiDateInput";
import {
  dateDraftFromIso,
  dateDraftIso,
  dateDraftNeedsReview,
  type DateDraft,
} from "~/lib/competition-thai-date";
import { ClassCatalogEditor } from "./ClassCatalogEditor";
import { ClassAgeTester } from "./ClassAgeTester";
import { validateCompetitionCatalog } from "~/lib/competition-classes";
const dateFields = [
  "startAt",
  "endAt",
  "registrationStartAt",
  "registrationDeadline",
  "buffaloAgeDeadline",
] as const;
type DateField = (typeof dateFields)[number];
function dateDrafts(input: CompetitionInput): Record<DateField, DateDraft> {
  return Object.fromEntries(
    dateFields.map((key) => [key, dateDraftFromIso(input[key])]),
  ) as Record<DateField, DateDraft>;
}
type Action =
  | "publish"
  | "close-registration"
  | "open-registration"
  | "close-event"
  | "clone";
const warningLabels: Record<string, string> = {
  "incomplete-registration-dates": "วันเปิด–ปิดรับสมัครไม่ครบ",
  "incomplete-event-dates": "วันเริ่ม–จบงานไม่ครบ",
  "invalid-dates": "ช่วงวันที่ไม่ถูกต้อง",
  "duplicate-catalog-documents": "พบชุดรุ่นซ้ำในข้อมูลเดิม",
};
const fieldLabels: Record<string, string> = {
  title: "ชื่องาน",
  description: "รายละเอียดงาน",
  location: "สถานที่",
  startAt: "วันเริ่มงาน",
  endAt: "วันจบงาน",
  registrationStartAt: "วันเปิดรับสมัคร",
  registrationDeadline: "วันปิดรับสมัคร",
  buffaloAgeDeadline: "วันที่ใช้ตัดอายุควาย",
  eventType: "ประเภทฟอร์มสมัคร",
  imageAssetId: "รูปปก",
  national: "รุ่นแข่งขัน",
  province: "รุ่นจังหวัดจากข้อมูลเดิม",
};
function validationMessage(issue: ZodIssue) {
  const field = String(
    issue.path[0] === "catalogs" ? issue.path[1] : issue.path[0],
  );
  const label = fieldLabels[field] ?? "ข้อมูลการแข่งขัน";
  let guidance = "กรุณาตรวจข้อมูลให้ถูกต้อง";
  if (/[\u0e00-\u0e7f]/.test(issue.message)) guidance = issue.message;
  else if (issue.code === "too_big")
    guidance =
      issue.type === "array"
        ? `ระบุได้ไม่เกิน ${issue.maximum} รุ่น`
        : `ระบุได้ไม่เกิน ${issue.maximum} ตัวอักษร`;
  else if (issue.code === "too_small") guidance = "กรุณาระบุข้อมูลให้ครบ";
  else if (field.endsWith("At") || field.endsWith("Deadline"))
    guidance = "กรุณาเลือกวันที่ที่ถูกต้อง";
  else if (field === "eventType") guidance = "กรุณาเลือกประเภทฟอร์มจากรายการ";
  else if (field === "imageAssetId") guidance = "กรุณาอัปโหลดรูปปกอีกครั้ง";
  return `${label}: ${guidance}`;
}
export function CompetitionEditor({ existing }: { existing?: Competition }) {
  const router = useRouter();
  const { token } = useAuth();
  const [event, setEvent] = useState(existing);
  const [form, setForm] = useState<CompetitionInput>(() =>
    existing ? inputFromCompetition(existing) : blankInput(),
  );
  const [saved, setSaved] = useState(() =>
    JSON.stringify(existing ? inputFromCompetition(existing) : blankInput()),
  );
  const [dates, setDates] = useState(() =>
    dateDrafts(existing ? inputFromCompetition(existing) : blankInput()),
  );
  const [savedDates, setSavedDates] = useState(() =>
    JSON.stringify(
      dateDrafts(existing ? inputFromCompetition(existing) : blankInput()),
    ),
  );
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState(existing?.imageUrl ?? "");
  const [exception, setException] = useState(false);
  const [report, setReport] = useState<Impact>();
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [copyId, setCopyId] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const allowNavigation = useRef(false);
  const operation = useRef<{ fingerprint: string; id: string }>();
  const create = api.competitions.create.useMutation();
  const update = api.competitions.update.useMutation();
  const action = api.competitions.action.useMutation();
  const impact = api.competitions.impact.useMutation();
  const review = api.competitions.review.useMutation();
  const utils = api.useUtils();
  const { isAuth } = useAuth();
  const templates = api.competitions.list.useQuery(
    { search: "", page: 1, pageSize: 100 },
    { enabled: isAuth },
  );
  const locked = (event?.registrationCount ?? 0) > 0;
  const dirty =
    JSON.stringify(form) !== saved || JSON.stringify(dates) !== savedDates;
  const busy =
    create.isPending ||
    update.isPending ||
    action.isPending ||
    impact.isPending ||
    review.isPending ||
    uploading;
  useEffect(() => {
    if (!dirty) return;
    const confirmLeave = () =>
      allowNavigation.current ||
      window.confirm("ยังมีข้อมูลที่ไม่ได้บันทึก ต้องการออกจากหน้านี้หรือไม่?");
    const unload = (e: BeforeUnloadEvent) => {
      if (allowNavigation.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", unload);
    // Cancel before Next's Link handler runs; throwing from routeChangeStart
    // reaches the development error overlay instead of cleanly cancelling.
    const onLinkClick = (e: MouseEvent) => {
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
    document.addEventListener("click", onLinkClick, true);
    router.beforePopState(() => {
      if (confirmLeave()) return true;
      // popstate already changed the address bar. Restore it through Next,
      // retaining this editor and its unsaved fields with shallow navigation.
      void router.replace(router.asPath, undefined, {
        shallow: true,
        scroll: false,
      });
      return false;
    });
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", onLinkClick, true);
      router.beforePopState(() => true);
    };
  }, [dirty, router]);
  const change = <K extends keyof CompetitionInput>(
    key: K,
    value: CompetitionInput[K],
  ) => {
    setForm((v) => ({ ...v, [key]: value }));
    setReport(undefined);
    setFailure("");
    setMessage("");
  };
  const changeDate = (key: DateField, draft: DateDraft) => {
    setDates((old) => ({ ...old, [key]: draft }));
    change(key, dateDraftIso(draft));
  };
  const op = (fingerprint: string) => {
    if (operation.current?.fingerprint !== fingerprint)
      operation.current = { fingerprint, id: crypto.randomUUID() };
    return operation.current.id;
  };
  const accept = (v: Competition) => {
    const next = inputFromCompetition(v);
    setEvent(v);
    setForm(next);
    setDates(dateDrafts(next));
    setSavedDates(JSON.stringify(dateDrafts(next)));
    setSaved(JSON.stringify(next));
    setImageUrl(v.imageUrl ?? "");
    setReport(undefined);
    setException(false);
    operation.current = undefined;
    void utils.competitions.list.invalidate();
    void utils.competitions.get.invalidate();
  };
  const validate = () => {
    const unfinished = dateFields.filter((key) =>
      dateDraftNeedsReview(dates[key]),
    );
    if (unfinished.length) {
      setFailure(
        `กรุณาตรวจวันที่ให้ครบและถูกต้องก่อนบันทึก: ${unfinished.map((key) => fieldLabels[key]).join(" • ")}`,
      );
      return;
    }
    const parsed = competitionInputSchema.safeParse(form);
    if (!parsed.success) {
      setFailure(parsed.error.issues.map(validationMessage).join(" • "));
      return;
    }
    const catalogErrors = (["national", "province"] as const).flatMap(
      (level) => {
        if (
          event &&
          JSON.stringify(form.catalogs[level]) ===
            JSON.stringify(event.catalogs[level])
        )
          return [];
        return validateCompetitionCatalog(form.catalogs[level]).map(
          (error) => `${fieldLabels[level]}: ${error}`,
        );
      },
    );
    if (catalogErrors.length) {
      setFailure(catalogErrors.join(" • "));
      return;
    }
    return parsed.data;
  };
  async function save() {
    setFailure("");
    setMessage("");
    const input = validate();
    if (!input) return;
    try {
      const fingerprint = JSON.stringify({
        action: "save",
        revision: event?._rev,
        input,
      });
      const next = event
        ? await update.mutateAsync({
            id: event._id,
            expectedRevision: event._rev,
            operationId: op(fingerprint),
            input,
          })
        : await create.mutateAsync({ operationId: op(fingerprint), input });
      accept(next);
      setMessage("บันทึกแล้ว");
      if (!event) {
        allowNavigation.current = true;
        void router.replace(
          `/dashboard/competitions/${encodeURIComponent(next._id)}`,
        );
      }
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }
  async function runAction(name: Action) {
    if (!event || busy) return;
    setFailure("");
    setMessage("");
    if (dateFields.some((key) => dateDraftNeedsReview(dates[key]))) {
      setFailure(
        "กรุณาตรวจวันที่ให้ครบและถูกต้องก่อนเปลี่ยนสถานะหรือคัดลอกงาน",
      );
      return;
    }
    if (dirty) {
      setFailure("กรุณาบันทึกข้อมูลก่อนเปลี่ยนสถานะหรือคัดลอกงาน");
      return;
    }
    const labels: Record<Action, string> = {
      publish: "เผยแพร่งานให้ผู้ใช้เห็น",
      "close-registration":
        "ปิดรับสมัครทั่วไป (เจ้าหน้าที่ยังลงหน้างานได้จนจบงาน)",
      "open-registration": "เปิดรับสมัครตามช่วงวันที่ที่กำหนด",
      "close-event": "ปิดงานและหยุดรับสมัครทุกช่องทาง",
      clone: "คัดลอกการตั้งค่าและรุ่นเป็นงานร่างใหม่ โดยไม่คัดลอกผู้สมัคร",
    };
    if (!window.confirm(labels[name] + " ใช่หรือไม่?")) return;
    try {
      const next = await action.mutateAsync({
        id: event._id,
        expectedRevision: event._rev,
        operationId: op(`${name}:${event._rev}`),
        action: name,
      });
      if (name === "clone") {
        allowNavigation.current = true;
        accept(next);
        void router.push(
          `/dashboard/competitions/${encodeURIComponent(next._id)}`,
        );
      } else {
        accept(next);
        setMessage("อัปเดตสถานะแล้ว");
      }
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "เปลี่ยนสถานะไม่สำเร็จ");
    }
  }
  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFailure("");
    if (
      !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
        file.type,
      ) ||
      file.size > 4 * 1024 * 1024
    ) {
      setFailure("ใช้รูป JPG, PNG, WebP หรือ GIF ไม่เกิน 4 MB");
      e.target.value = "";
      return;
    }
    setUploading(true);
    try {
      const response = await fetch("/api/competitions/cover", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token ?? ""}`,
          "Content-Type": file.type,
          "x-file-name": encodeURIComponent(file.name),
        },
        body: file,
      });
      const payload: unknown = await response.json();
      const result = payload as {
        data?: { assetId: string; url: string };
        message?: string;
      };
      if (!response.ok || !result.data)
        throw new Error(result.message ?? "อัปโหลดไม่สำเร็จ");
      change("imageAssetId", result.data.assetId);
      setImageUrl(result.data.url);
      setMessage("อัปโหลดรูปแล้ว กรุณาบันทึกงานเพื่อใช้รูปนี้");
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }
  async function copyCatalog() {
    if (!copyId) return;
    try {
      const source = await utils.competitions.get.fetch({ id: copyId });
      if (
        (form.catalogs.national.length || form.catalogs.province.length) &&
        !window.confirm(
          "แทนที่ชุดรุ่นที่กำลังแก้ด้วยชุดรุ่นจากงานที่เลือกหรือไม่?",
        )
      )
        return;
      change("catalogs", {
        national: [...source.catalogs.national],
        province: [...source.catalogs.province],
      });
      setMessage("คัดลอกชุดรุ่นแล้ว กรุณาตรวจและบันทึก");
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "คัดลอกไม่สำเร็จ");
    }
  }
  async function makeReport() {
    if (!event) return;
    const input = validate();
    if (!input) return;
    setFailure("");
    try {
      setReport(
        await impact.mutateAsync({
          id: event._id,
          expectedRevision: event._rev,
          operationId: op(`report:${event._rev}:${JSON.stringify(input)}`),
          input,
        }),
      );
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "สร้างรายงานไม่สำเร็จ");
    }
  }
  async function applyReview() {
    if (!event || !report) return;
    const input = validate();
    if (!input) return;
    if (reference.trim().length < 10 || reason.trim().length < 10) {
      setFailure(
        "ระบุหลักฐานการตรวจของคุณนนท์และเหตุผลอย่างน้อยช่องละ 10 ตัวอักษร",
      );
      return;
    }
    if (
      !window.confirm(
        "ยืนยันว่าคุณนนท์ตรวจรายงานนี้ภายนอกระบบแล้ว? บัญชีร่วมไม่สามารถยืนยันตัวผู้อนุมัติได้ และจะไม่มีการแก้ใบสมัครเดิมอัตโนมัติ",
      )
    )
      return;
    try {
      const next = await review.mutateAsync({
        id: event._id,
        expectedRevision: event._rev,
        operationId: op(`review:${report.reportId}:${reference}:${reason}`),
        input,
        review: {
          reportId: report.reportId,
          reviewReference: reference,
          reason,
        },
      });
      accept(next);
      setMessage("บันทึกกติกาที่ตรวจผลกระทบแล้ว โดยรักษาใบสมัครเดิม");
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "บันทึกกติกาไม่สำเร็จ");
    }
  }
  return (
    <div className="space-y-6">
      {event ? <EventNav event={event} active="settings" /> : null}
      <div className="flex flex-wrap gap-3">
        <Link className={button} href="/dashboard/competitions">
          กลับรายการงาน
        </Link>
        {event ? (
          <span className="self-center text-sm text-text-muted">
            ผู้สมัคร {event.registrationCount} รายการ • บัญชีทีมงานร่วม
          </span>
        ) : null}
      </div>
      {event ? (
        <section className="glass-card space-y-4 rounded-3xl p-5">
          <Status event={event} />
          <p className="text-sm text-text-muted">
            ลงทะเบียนหน้างาน:{" "}
            {event.policy.onsiteAllowed
              ? "เจ้าหน้าที่ลงทะเบียนได้จนสิ้นวันจบงาน"
              : "ไม่เปิดให้ลงทะเบียน"}{" "}
            • วันนี้ {formatDay(event.policy.today)}
          </p>
          {event.policy.warnings.map((v) => (
            <Alert key={v}>
              {warningLabels[v] ?? v} — ตรวจข้อมูลก่อนเผยแพร่
              ไม่แก้ข้อมูลเก่าอัตโนมัติ
            </Alert>
          ))}
          <div className="flex flex-wrap gap-3">
            {event.policy.lifecycle === "draft" ? (
              <button
                className={primary}
                disabled={busy || dirty}
                onClick={() => void runAction("publish")}
              >
                เผยแพร่งาน
              </button>
            ) : null}
            {event.policy.lifecycle !== "draft" &&
            event.policy.lifecycle !== "closed" &&
            event.policy.lifecycle !== "ended" ? (
              <>
                <button
                  className={button}
                  disabled={busy || dirty || event.registrationActive === false}
                  onClick={() => void runAction("close-registration")}
                >
                  ปิดรับสมัคร
                </button>
                <button
                  className={button}
                  disabled={
                    busy || dirty || event.policy.publicRegistration === "open"
                  }
                  onClick={() => void runAction("open-registration")}
                >
                  เปิดรับสมัครตามกำหนด
                </button>
                <button
                  className={`${button} !border-red-300/40 !text-red-200`}
                  disabled={busy || dirty}
                  onClick={() => void runAction("close-event")}
                >
                  ปิดงาน
                </button>
              </>
            ) : null}
            <button
              className={button}
              disabled={busy || dirty}
              onClick={() => void runAction("clone")}
            >
              คัดลอกเป็นงานใหม่
            </button>
          </div>
          <p className="text-sm text-text-muted">
            หากเลยวันปิดรับสมัคร ต้องขยายวันปิดและบันทึกก่อนเปิดใหม่ •
            ปิดงานจะหยุดรับสมัครทั้งผู้ใช้และเจ้าหน้าที่
          </p>
        </section>
      ) : (
        <Alert>งานใหม่จะบันทึกเป็นร่าง ผู้ใช้ยังไม่เห็นจนกว่าจะเผยแพร่</Alert>
      )}
      {failure ? (
        <>
          <Alert error>{failure}</Alert>
          {event ? (
            <button
              className={button}
              disabled={busy}
              onClick={() => {
                if (
                  dirty &&
                  !window.confirm(
                    "โหลดข้อมูลล่าสุดจะทิ้งการแก้ไขที่ยังไม่บันทึก ต้องการดำเนินการหรือไม่?",
                  )
                )
                  return;
                void utils.competitions.get
                  .fetch({ id: event._id })
                  .then((v) => {
                    accept(v);
                    setFailure("");
                  })
                  .catch(() => setFailure("โหลดข้อมูลล่าสุดไม่สำเร็จ"));
              }}
            >
              โหลดข้อมูลล่าสุด
            </button>
          ) : null}
        </>
      ) : null}
      {message ? <Alert>{message}</Alert> : null}
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset
          disabled={busy}
          className="glass-card grid min-w-0 gap-5 rounded-3xl p-5 md:grid-cols-2"
        >
          <legend className="px-2 text-xl font-semibold">รายละเอียดงาน</legend>
          <label className="space-y-2 text-sm md:col-span-2">
            ชื่องาน <span className="text-orange-200">(จำเป็น)</span>
            <input
              required
              maxLength={300}
              className={control}
              value={form.title}
              onChange={(e) => change("title", e.target.value)}
            />
          </label>
          <label className="space-y-2 text-sm md:col-span-2">
            รายละเอียด
            <textarea
              rows={4}
              className={control}
              value={form.description}
              onChange={(e) => change("description", e.target.value)}
            />
          </label>
          <label className="space-y-2 text-sm md:col-span-2">
            สถานที่
            <input
              className={control}
              value={form.location}
              onChange={(e) => change("location", e.target.value)}
            />
          </label>
          {dateFields.slice(0, 4).map((key) => (
            <ThaiDateInput
              key={key}
              label={fieldLabels[key]!}
              value={dates[key]}
              onChange={(draft) => changeDate(key, draft)}
            />
          ))}
          <p className="text-sm text-orange-100 md:col-span-2">
            เลือกวันที่อย่างเดียว เปิดตั้งแต่ต้นวันและรับได้ถึงสิ้นวันปิด ตาม
            Asia/Bangkok แยกจากวันจบงานและวันตัดอายุ
          </p>
          <div className="space-y-3 md:col-span-2">
            <label className="block text-sm" htmlFor="competition-cover">
              รูปปก (JPG, PNG, WebP, GIF ไม่เกิน 4 MB)
            </label>
            <input
              ref={fileRef}
              id="competition-cover"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className={control}
              onChange={(e) => void upload(e)}
            />
            {uploading ? <p role="status">กำลังอัปโหลดรูป…</p> : null}
            {imageUrl ? (
              <div className="max-w-xl overflow-hidden rounded-2xl border border-white/20">
                <Image
                  unoptimized
                  width={1200}
                  height={675}
                  src={imageUrl}
                  alt={`รูปปก ${form.title || "งานแข่งขัน"}`}
                  className="aspect-video w-full object-contain"
                />
              </div>
            ) : (
              <p className="text-sm text-text-muted">ยังไม่มีรูปปก</p>
            )}
          </div>
        </fieldset>
        {locked ? (
          <Alert>
            มียอดสมัครแล้ว: วันตัดอายุ ประเภทฟอร์ม และชุดรุ่นถูกล็อก
            การแก้พิเศษต้องสร้างรายงานและให้คุณนนท์ตรวจภายนอกระบบก่อน
            บัญชีร่วมไม่ยืนยันตัวผู้ตรวจ
          </Alert>
        ) : null}
        {locked ? (
          <button
            type="button"
            className={button}
            disabled={busy}
            onClick={() => {
              if (exception && event) {
                setDates((current) => ({
                  ...current,
                  buffaloAgeDeadline: dateDraftFromIso(
                    event.buffaloAgeDeadline,
                  ),
                }));
                setForm((current) => ({
                  ...current,
                  buffaloAgeDeadline: event.buffaloAgeDeadline,
                  eventType: event.eventType,
                  catalogs: {
                    national: [...event.catalogs.national],
                    province: [...event.catalogs.province],
                  },
                }));
                setReference("");
                setReason("");
                setFailure("");
                setMessage("");
              }
              setException(!exception);
              setReport(undefined);
            }}
          >
            {" "}
            {exception
              ? "กลับไปแก้ข้อมูลทั่วไป"
              : "เตรียมเสนอแก้กติกาเป็นกรณีพิเศษ"}
          </button>
        ) : null}
        <fieldset
          disabled={busy || (locked && !exception)}
          className="glass-card grid min-w-0 gap-5 rounded-3xl p-5 md:grid-cols-2"
        >
          <legend className="px-2 text-xl font-semibold">
            กติกาและรุ่นแข่งขัน
          </legend>
          <ThaiDateInput
            label="วันที่ใช้ตัดอายุควาย"
            value={dates.buffaloAgeDeadline}
            onChange={(draft) => changeDate("buffaloAgeDeadline", draft)}
          />
          <label className="space-y-2 text-sm">
            ประเภทฟอร์มสมัคร
            <select
              className={control}
              value={form.eventType ?? ""}
              onChange={(e) =>
                change(
                  "eventType",
                  (e.target.value ||
                    undefined) as CompetitionInput["eventType"],
                )
              }
            >
              <option value="">เลือกก่อนเผยแพร่</option>
              <option value="normal">ทั่วไป</option>
              <option value="royal">Royal</option>
            </select>
          </label>
          <div className="space-y-3 md:col-span-2">
            <label htmlFor="catalog-source" className="text-sm">
              คัดลอกชุดรุ่นจากงานเดิม
            </label>
            <div className="flex min-w-0 flex-wrap gap-3">
              <select
                id="catalog-source"
                className={`${control} flex-1`}
                value={copyId}
                onChange={(e) => setCopyId(e.target.value)}
              >
                <option value="">เลือกงานต้นแบบ</option>
                {templates.data?.items
                  .filter((v) => v._id !== event?._id)
                  .map((v) => (
                    <option key={v._id} value={v._id}>
                      {v.title}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                className={button}
                disabled={!copyId}
                onClick={() => void copyCatalog()}
              >
                ใช้ชุดรุ่นนี้
              </button>
            </div>
            <p className="text-sm text-text-muted">
              แสดงงานต้นแบบล่าสุดสูงสุด 100 งาน • คัดลอกเฉพาะรุ่น
              ไม่คัดลอกใบสมัคร
            </p>
          </div>
          <div className="min-w-0 md:col-span-2">
            <ClassCatalogEditor
              title="รุ่นแข่งขัน"
              values={form.catalogs.national}
              disabled={busy || (locked && !exception)}
              onChange={(national) =>
                change("catalogs", { ...form.catalogs, national })
              }
            />
          </div>
          {form.catalogs.province.length > 0 ? (
            <div className="min-w-0 space-y-3 md:col-span-2">
              <p className="text-sm text-orange-100">
                งานเดิมมีรุ่นจังหวัด จึงแสดงเพื่อรักษาข้อมูลเดิม
                ไม่มีการย้ายหรือรวมรุ่นอัตโนมัติ
              </p>
              <ClassCatalogEditor
                title="รุ่นจังหวัดจากข้อมูลเดิม"
                values={form.catalogs.province}
                disabled={busy || (locked && !exception)}
                onChange={(province) =>
                  change("catalogs", { ...form.catalogs, province })
                }
              />
            </div>
          ) : null}
          <p className="text-sm text-text-muted md:col-span-2">
            กำหนดช่วงอายุเป็นเดือน
            ระบบปัดเศษวันขึ้นเป็นเดือนถัดไปและไม่ให้ลงข้ามช่วง
            รุ่นพิเศษเว้นอายุได้หากไม่มีข้อจำกัด
            เงื่อนไขฟันและคุณสมบัติอื่นให้เจ้าหน้าที่ตรวจ
          </p>
        </fieldset>
        <ClassAgeTester
          cutoff={form.buffaloAgeDeadline}
          royal={form.eventType === "royal"}
          values={[...form.catalogs.national, ...form.catalogs.province]}
        />
        {exception ? (
          <section className="glass-card space-y-4 rounded-3xl p-5">
            <h2 className="text-xl font-semibold">ตรวจผลกระทบก่อนแก้กติกา</h2>
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() => void makeReport()}
            >
              สร้างรายงานผลกระทบ
            </button>
            {report ? (
              <>
                <Alert>
                  ตรวจ {report.total} ใบสมัคร • ได้รับผลกระทบ {report.affected}{" "}
                  รายการ รายงานนี้ผูกกับข้อมูลและกติกาที่กำลังเสนอ
                  การแก้ฟอร์มจะทำให้ต้องสร้างใหม่
                </Alert>
                <div
                  className="max-h-80 overflow-auto rounded-xl border border-white/20"
                  role="region"
                  aria-label="รายการผลกระทบ"
                  tabIndex={0}
                >
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead>
                      <tr>
                        <th className="p-3">ใบสมัคร</th>
                        <th className="p-3">รุ่นที่สมัคร</th>
                        <th className="p-3">อายุเดิม</th>
                        <th className="p-3">อายุใหม่</th>
                        <th className="p-3">ผลตรวจ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.rows.map((row) => (
                        <tr
                          key={row.registrationId}
                          className="border-t border-white/10"
                        >
                          <td className="break-all p-3">
                            {row.registrationId}
                          </td>
                          <td className="p-3">
                            {row.type ?? "ไม่ระบุ"}
                            {row.special ? " (รุ่นพิเศษ)" : ""}
                            <p>{row.level ?? ""}</p>
                          </td>
                          <td className="p-3">
                            {String(row.oldAge ?? "ไม่ทราบ")} เดือน
                            {row.oldExactAge ? (
                              <p>
                                {row.oldExactAge.months} เดือน{" "}
                                {row.oldExactAge.days} วัน
                              </p>
                            ) : null}
                          </td>
                          <td className="p-3">
                            {String(row.newAge ?? "ไม่ทราบ")} เดือน
                            {row.newExactAge ? (
                              <p>
                                {row.newExactAge.months} เดือน{" "}
                                {row.newExactAge.days} วัน
                              </p>
                            ) : null}
                          </td>
                          <td className="p-3">
                            {row.invalidAge
                              ? "ต้องตรวจวันเกิด"
                              : row.affected
                                ? "มีผลกระทบ"
                                : "ไม่เปลี่ยน"}
                            {row.newEligible === false ? (
                              <p>รุ่นที่สมัครไม่เข้าเกณฑ์ใหม่</p>
                            ) : null}
                            {row.newPossibleClasses ? (
                              <p>
                                รุ่นตามเกณฑ์ใหม่:{" "}
                                {row.newPossibleClasses.join(" • ") || "ไม่มี"}
                              </p>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <label className="block space-y-2 text-sm">
                  หลักฐานอ้างอิงที่คุณนนท์ตรวจภายนอกระบบแล้ว
                  <input
                    className={control}
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="เช่น ลิงก์ข้อความและวันที่ตรวจ อย่างน้อย 10 ตัวอักษร"
                  />
                </label>
                <label className="block space-y-2 text-sm">
                  เหตุผลการแก้กติกา
                  <textarea
                    className={control}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className={primary}
                  disabled={
                    busy ||
                    reference.trim().length < 10 ||
                    reason.trim().length < 10
                  }
                  onClick={() => void applyReview()}
                >
                  บันทึกกติกาที่ผ่านการตรวจแล้ว
                </button>
              </>
            ) : null}
          </section>
        ) : null}
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            className={primary}
            disabled={busy || exception}
          >
            {busy
              ? "กำลังดำเนินการ…"
              : event
                ? "บันทึกการแก้ไข"
                : "บันทึกงานร่าง"}
          </button>
          <p aria-live="polite" className="text-sm text-text-muted">
            {dirty ? "มีข้อมูลที่ยังไม่บันทึก" : "ข้อมูลตรงกับที่บันทึก"}
            {exception ? " • ใช้การบันทึกผ่านรายงานผลกระทบเท่านั้น" : ""}
          </p>
        </div>
      </form>
    </div>
  );
}
