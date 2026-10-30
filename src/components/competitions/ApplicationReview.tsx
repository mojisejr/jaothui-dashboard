import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { api } from "~/utils/api";
import {
  applicationStatus,
  approvalLabels,
  notificationLabels,
  registrationLabel,
  hasRegistrationPolicy,
  SOURCE_POLICY_UPGRADE_MESSAGE,
  type Application,
} from "~/lib/competition-applications";
import { formatDay } from "~/lib/competitions";
import { Alert, button, control, primary } from "./Workspace";
import { useUnsavedCompetitionChanges } from "./useUnsavedCompetitionChanges";

function reviewTime(value: string) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? new Intl.DateTimeFormat("th-TH", {
        timeZone: "Asia/Bangkok",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(parsed)
    : value;
}
function shown(value: unknown) {
  return typeof value === "string" && value ? value : "ไม่มีข้อมูล";
}
export function ApplicationReview({
  id,
  initial,
  reload,
}: {
  id: string;
  initial: Application;
  reload: () => Promise<Application | undefined>;
}) {
  const [entry, setEntry] = useState(initial);
  const [comment, setComment] = useState(initial.approval?.comment ?? "");
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [conflict, setConflict] = useState(false);
  const [loading, setLoading] = useState(false);
  const operation = useRef<{ fingerprint: string; id: string }>();
  const pending = useRef(false);
  useUnsavedCompetitionChanges(comment !== (entry.approval?.comment ?? ""));
  const approval = api.competitions.approval.useMutation();
  const retry = api.competitions.retryNotification.useMutation();
  const utils = api.useUtils();
  const busy = approval.isPending || retry.isPending || loading;
  const op = (fingerprint: string) => {
    if (operation.current?.fingerprint !== fingerprint)
      operation.current = { fingerprint, id: crypto.randomUUID() };
    return operation.current.id;
  };
  const accept = (next: Application, preserveComment = false) => {
    setEntry(next);
    if (!preserveComment) setComment(next.approval?.comment ?? "");
    operation.current = undefined;
    setConflict(false);
    void utils.competitions.applications.invalidate({ id });
  };
  const failed = (e: unknown) => {
    setFailure(e instanceof Error ? e.message : "ดำเนินการไม่สำเร็จ");
    if ((e as { data?: { code?: string } })?.data?.code === "CONFLICT")
      setConflict(true);
  };
  async function save(result: boolean) {
    if (pending.current || entry.approvalRequirement !== "required") return;
    if (!result && !comment.trim()) {
      setFailure("กรุณาระบุเหตุผลที่ไม่อนุมัติ");
      return;
    }
    pending.current = true;
    setFailure("");
    setMessage("");
    const body = {
      id,
      registrationId: entry._id,
      expectedRevision: entry._rev,
      result,
      comment: comment.trim(),
    };
    try {
      const next = await approval.mutateAsync({
        ...body,
        operationId: op(JSON.stringify({ action: "approval", ...body })),
      });
      accept(next);
      setMessage("บันทึกผลการตรวจแล้ว การส่ง LINE เป็นขั้นตอนแยกด้านล่าง");
    } catch (e) {
      failed(e);
    } finally {
      pending.current = false;
    }
  }
  async function send() {
    if (
      pending.current ||
      !entry.approval ||
      entry.approvalRequirement !== "required"
    )
      return;
    pending.current = true;
    setFailure("");
    setMessage("");
    const body = {
      id,
      registrationId: entry._id,
      expectedRevision: entry.approval._rev,
    };
    try {
      const next = await retry.mutateAsync({
        ...body,
        operationId: op(JSON.stringify({ action: "notification", ...body })),
      });
      accept(next, true);
      setMessage("ตรวจผลการส่ง LINE ด้านล่าง ผลอนุมัติไม่ได้ถูกบันทึกซ้ำ");
    } catch (e) {
      failed(e);
    } finally {
      pending.current = false;
    }
  }
  async function refresh() {
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    setFailure("");
    setMessage("");
    try {
      const next = await reload();
      if (next) {
        setEntry(next);
        operation.current = undefined;
        setConflict(false);
        setMessage(
          "โหลดข้อมูลล่าสุดแล้ว ข้อความที่กำลังกรอกยังอยู่ กรุณาตรวจผลก่อนบันทึกใหม่",
        );
      }
    } catch (e) {
      failed(e);
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }
  const state = entry.approval?.notificationState ?? "";
  const canSend =
    !!entry.approval &&
    typeof entry.approval.approvementResult === "boolean" &&
    entry.deliveryEnabled &&
    entry.hasLineRecipient &&
    !["sent", "sending", "review-required"].includes(state);
  const images = entry.images.flatMap((group) => group.images);
  if (!hasRegistrationPolicy(entry))
    return <Alert error>{SOURCE_POLICY_UPGRADE_MESSAGE}</Alert>;
  const canReview = entry.approvalRequirement === "required";
  return (
    <div className="min-w-0 space-y-6">
      <Link
        className={button}
        href={`/dashboard/competitions/${encodeURIComponent(id)}/applications`}
      >
        กลับรายการใบสมัคร
      </Link>
      {message ? <Alert>{message}</Alert> : null}
      {failure ? <Alert error>{failure}</Alert> : null}
      <section
        className="glass-card min-w-0 space-y-4 rounded-3xl p-5"
        aria-label="ข้อมูลใบสมัคร"
      >
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <h2 className="break-words text-xl font-semibold">
            {entry.name || "ไม่ระบุชื่อควาย"}
          </h2>
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm">
            {registrationLabel(entry)}
          </span>
        </div>
        <dl className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["รุ่นที่สมัคร", entry.type],
            ["ชุดรุ่น", entry.level],
            ["ไมโครชิพ", entry.microchip],
            ["วันเกิด", formatDay(entry.birthday)],
            [
              "อายุที่บันทึกในใบสมัคร",
              typeof entry.buffaloAge === "number"
                ? `${entry.buffaloAge} เดือน`
                : "ไม่มีอายุที่บันทึก • ต้องตรวจข้อมูลเดิม",
            ],
            ["เพศ", entry.sex],
            ["สี", entry.color],
            ["ชื่อเจ้าของ", entry.ownerName],
            ["โทรศัพท์", entry.ownerTel],
            ["ฟาร์ม", entry.farmName],
            ["จังหวัด", entry.province],
            ["พ่อพันธุ์", entry.fatherName],
            ["แม่พันธุ์", entry.motherName],
            [
              "ช่องทางสมัคร",
              entry.isAdminRegistration
                ? "เจ้าหน้าที่ลงทะเบียนหน้างาน"
                : "ออนไลน์ / ข้อมูลเดิม",
            ],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-sm text-text-muted">{label}</dt>
              <dd className="mt-1 break-words">{shown(value)}</dd>
            </div>
          ))}
        </dl>
        <p className="break-all text-sm text-text-muted">
          รหัสใบสมัคร {entry._id}
        </p>
        <button
          className={button}
          disabled={busy}
          onClick={() => void refresh()}
        >
          {loading ? "กำลังโหลด…" : "โหลดข้อมูลล่าสุด"}
        </button>
        {conflict ? (
          <Alert error>
            ข้อมูลมีการเปลี่ยนแปลง
            กรุณาโหลดข้อมูลล่าสุดก่อนตรวจและบันทึกอีกครั้ง
            ข้อความที่กรอกจะยังอยู่
          </Alert>
        ) : null}
      </section>
      <section
        className="glass-card min-w-0 space-y-4 rounded-3xl p-5"
        aria-label="ที่อยู่ผู้สมัคร"
      >
        <h2 className="text-lg font-semibold">ที่อยู่ผู้สมัคร</h2>
        {entry.address ? (
          <p className="break-words">
            {[
              entry.address.address,
              entry.address.district,
              entry.address.amphoe,
              entry.address.province,
              entry.address.zipcode,
            ]
              .filter(Boolean)
              .join(" ") || "เอกสารที่อยู่ไม่มีรายละเอียด"}
          </p>
        ) : (
          <p className="text-text-muted">ไม่มีเอกสารที่อยู่แนบในใบสมัครนี้</p>
        )}
      </section>
      <section
        className="glass-card min-w-0 space-y-4 rounded-3xl p-5"
        aria-label="รูปประกอบใบสมัคร"
      >
        <h2 className="text-lg font-semibold">รูปประกอบใบสมัคร</h2>
        {images.length ? (
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            {images.map((image, index) => (
              <figure
                className="min-w-0 space-y-2"
                key={`${image.imageTitle}-${index}`}
              >
                {image.url ? (
                  <>
                    <a
                      className={`${button} w-full`}
                      href={image.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      เปิดภาพ {image.imageTitle || index + 1}
                    </a>
                    <Image
                      unoptimized
                      src={image.url}
                      width={800}
                      height={600}
                      alt={image.imageTitle || `รูปประกอบใบสมัคร ${index + 1}`}
                      className="h-auto max-h-96 w-full rounded-xl object-contain"
                    />
                  </>
                ) : (
                  <p>
                    ไม่พบไฟล์ภาพสำหรับ{" "}
                    {image.imageTitle || `ภาพที่ ${index + 1}`}
                  </p>
                )}
                <figcaption className="break-words text-sm text-text-muted">
                  {image.imageTitle || `ภาพที่ ${index + 1}`}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <p className="text-text-muted">ไม่มีรูปแนบในใบสมัครนี้</p>
        )}
      </section>
      {!canReview ? (
        <section
          className="glass-card min-w-0 space-y-4 rounded-3xl p-5"
          aria-label="กติกาการสมัคร"
        >
          <h2 className="text-lg font-semibold">
            {entry.approvalRequirement === "not_required"
              ? "งานประเภทนี้ไม่ต้องรออนุมัติ"
              : "งานเก่าไม่ระบุประเภท"}
          </h2>
          {entry.approvalRequirement === "unknown" ? (
            <p>
              เก็บข้อมูลย้อนหลังและผลเดิมไว้ตามเดิม
              ไม่จัดประเภทหรือแก้ไขผลอนุมัติอัตโนมัติ
            </p>
          ) : null}
          {entry.approval ? (
            <div className="space-y-2" aria-label="ประวัติผลตรวจเดิม">
              <p>
                ประวัติผลตรวจเดิม: {approvalLabels[applicationStatus(entry)]}
              </p>
              {entry.approval.approvementDate ? (
                <p>
                  เวลาตรวจเดิม: {reviewTime(entry.approval.approvementDate)}
                </p>
              ) : null}
              {entry.approval.comment ? (
                <p className="break-words">
                  หมายเหตุเดิม: {entry.approval.comment}
                </p>
              ) : null}
              {entry.approval.notificationState ? (
                <p>
                  ประวัติ LINE:{" "}
                  {notificationLabels[entry.approval.notificationState] ??
                    entry.approval.notificationState}
                </p>
              ) : null}
              {entry.approvalRequirement === "not_required" &&
              entry.approval.approvementResult === false ? (
                <Alert>
                  มีประวัติไม่อนุมัติเดิม โปรดตรวจสอบประวัติก่อนนำข้อมูลไปใช้
                  ผลเดิมไม่ได้ถูกแก้ไข
                </Alert>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : (
        <>
          <section
            className="glass-card min-w-0 space-y-4 rounded-3xl p-5"
            aria-label="ตรวจและอนุมัติ"
          >
            <h2 className="text-lg font-semibold">ตรวจและอนุมัติ</h2>
            <p>ผลปัจจุบัน: {approvalLabels[applicationStatus(entry)]}</p>
            <p className="text-sm text-text-muted">
              ดำเนินการด้วยบัญชีทีมงานร่วม ระบบเก็บผลและเวลา
              ไม่ระบุว่าเป็นเจ้าหน้าที่รายใด
            </p>
            {entry.approval?.approvementDate ? (
              <p className="break-words text-sm text-text-muted">
                เวลาตรวจล่าสุด: {reviewTime(entry.approval.approvementDate)}{" "}
                (เวลาไทย)
              </p>
            ) : null}
            <label className="block min-w-0 space-y-2 text-sm">
              หมายเหตุ / เหตุผลที่ไม่อนุมัติ (จำเป็นเมื่อไม่อนุมัติ)
              <textarea
                className={control}
                rows={4}
                maxLength={3000}
                value={comment}
                disabled={busy}
                onChange={(e) => {
                  setComment(e.target.value);
                  setFailure("");
                }}
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                className={primary}
                disabled={busy || conflict}
                onClick={() => void save(true)}
              >
                {approval.isPending ? "กำลังบันทึก…" : "บันทึกอนุมัติ"}
              </button>
              <button
                className={button}
                disabled={busy || conflict}
                onClick={() => void save(false)}
              >
                บันทึกไม่อนุมัติ
              </button>
            </div>
          </section>
          <section
            className="glass-card min-w-0 space-y-4 rounded-3xl p-5"
            aria-label="ผลการส่ง LINE"
          >
            <h2 className="text-lg font-semibold">ผลการส่ง LINE</h2>
            {!entry.approval ||
            typeof entry.approval.approvementResult !== "boolean" ? (
              <p>ยังไม่มีผลตรวจสำหรับส่งแจ้ง</p>
            ) : (
              <>
                <p>
                  {notificationLabels[state] ??
                    (state
                      ? `สถานะข้อมูลเดิม: ${state}`
                      : "ยังไม่มีประวัติการส่ง")}
                </p>
                {!entry.hasLineRecipient ? (
                  <p>
                    ไม่มีบัญชี LINE ผู้สมัครที่เชื่อมกับใบสมัครนี้
                    จะไม่ส่งไปยังบัญชีทีมงานแทน
                  </p>
                ) : null}
                {!entry.deliveryEnabled && state !== "sent" ? (
                  <Alert>
                    ระบบปิดการส่ง LINE อยู่ บันทึกผลการตรวจได้ตามปกติ
                  </Alert>
                ) : null}
                <p className="text-sm text-text-muted">
                  คำว่า LINE รับคำขอส่งแล้ว หมายถึงผู้ให้บริการรับคำขอ
                  ไม่ยืนยันว่าผู้สมัครเปิดอ่าน การลองส่งไม่เปลี่ยนผลอนุมัติ
                </p>
                {entry.hasLineRecipient &&
                !["sent", "review-required"].includes(state) ? (
                  <button
                    className={button}
                    disabled={busy || !canSend || conflict}
                    onClick={() => void send()}
                  >
                    {retry.isPending ? "กำลังส่ง…" : "ส่ง / ลองส่ง LINE"}
                  </button>
                ) : null}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
