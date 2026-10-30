import { useState } from "react";
import { useRouter } from "next/router";
import { z } from "zod";
import { useAuth } from "~/context/auth.context";
import { api } from "~/utils/api";
import {
  Alert,
  button,
  EventNav,
  primary,
  Workspace,
} from "~/components/competitions/Workspace";
import { formatDay } from "~/lib/competitions";
export default function CompetitionExportPage() {
  const router = useRouter();
  const { isAuth, token } = useAuth();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  const query = api.competitions.exportData.useQuery(
    { id },
    { enabled: isAuth && !!id, refetchOnWindowFocus: false },
  );
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function download(format: "xlsx" | "docx") {
    if (!token || busy) return;
    setBusy(format);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/competitions/export?id=${encodeURIComponent(id)}&format=${format}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) {
        const body: unknown = await response.json();
        throw new Error(z.object({ message: z.string() }).parse(body).message);
      }
      if (response.headers.get("X-Competition-Id") !== id)
        throw new Error("งานในไฟล์ตอบกลับไม่ตรงกับงานที่เลือก");
      const blob = await response.blob();
      if (!blob.size) throw new Error("ไฟล์ส่งออกว่าง");
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename = decodeURIComponent(
        disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1] ??
          `competition.${format === "xlsx" ? "xlsx" : "zip"}`,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(
        `สร้างไฟล์ ${format === "xlsx" ? "Excel" : "ZIP ใบสมัคร DOCX"} แล้ว ${response.headers.get("X-Record-Count") ?? ""} รายการ กรุณาตรวจไฟล์ในโฟลเดอร์ดาวน์โหลด`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "ดาวน์โหลดไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }
  return (
    <Workspace title="ส่งออกใบสมัครการแข่งขัน">
      {query.isPending ? (
        <p role="status">กำลังโหลดข้อมูลส่งออก…</p>
      ) : query.error ? (
        <>
          <Alert error>{query.error.message}</Alert>
          <button className={button} onClick={() => void query.refetch()}>
            ลองอีกครั้ง
          </button>
        </>
      ) : query.data ? (
        <>
          <EventNav event={query.data.event} active="export" />
          <section className="glass-card min-w-0 space-y-5 rounded-3xl p-4 md:p-6">
            <h2 className="text-xl font-semibold">ข้อมูลที่ส่งออก</h2>
            <p>
              รวมทุกสถานะตามประเภทงาน: สมัครสำเร็จ รอตรวจสอบ อนุมัติแล้ว
              ไม่อนุมัติ และต้องตรวจประเภทงาน มีสถานะกำกับในไฟล์
            </p>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-text-muted">จำนวนใบสมัคร</dt>
                <dd className="tabular-nums">{query.data.rowCount} รายการ</dd>
              </div>
              <div>
                <dt className="text-sm text-text-muted">วันตัดอายุของงาน</dt>
                <dd>{formatDay(query.data.event.buffaloAgeDeadline)}</dd>
              </div>
            </dl>
            <p>
              ใช้อายุที่บันทึกไว้ในใบสมัคร รวม 0 เดือน
              หากไม่มีจึงคำนวณจากวันเกิดกับวันตัดอายุของงาน
              ไม่ใช้วันปัจจุบันและไม่จัดรุ่นย้อนหลัง
            </p>
            {query.data.registrations.some((entry) => !!entry.ageWarning) ? (
              <Alert>
                มี{" "}
                {
                  query.data.registrations.filter((entry) => !!entry.ageWarning)
                    .length
                }{" "}
                รายการที่ไม่มีอายุเดิมหรือข้อมูลอายุไม่ครบ หมายเหตุจะอยู่ในไฟล์
                กรุณาตรวจสอบก่อนใช้งาน
              </Alert>
            ) : null}
            {!query.data.rowCount ? (
              <Alert>
                ยังไม่มีใบสมัคร ดาวน์โหลดไฟล์สรุปงานที่ระบุว่าไม่มีข้อมูลได้
              </Alert>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <button
                className={primary}
                disabled={!!busy}
                onClick={() => void download("xlsx")}
              >
                {busy === "xlsx" ? "กำลังสร้าง Excel…" : "ดาวน์โหลด Excel"}
              </button>
              <button
                className={button}
                disabled={!!busy}
                onClick={() => void download("docx")}
              >
                {busy === "docx"
                  ? "กำลังสร้างใบสมัคร…"
                  : "ดาวน์โหลดใบสมัคร DOCX (ZIP)"}
              </button>
            </div>
            <p className="text-sm text-text-muted">
              Excel แยกชีตตามรุ่น สี เพศ และชุดรุ่น • ZIP มีใบสมัคร DOCX
              รายตัวและไฟล์ข้อมูลงาน • ไฟล์มีข้อมูลเจ้าของและเบอร์โทรศัพท์
            </p>
            {error ? <Alert error>{error}</Alert> : null}
            {message ? <Alert>{message}</Alert> : null}
          </section>
        </>
      ) : null}
    </Workspace>
  );
}
