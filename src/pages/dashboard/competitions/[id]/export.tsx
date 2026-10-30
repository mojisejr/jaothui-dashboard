import { useState } from "react";
import { useRouter } from "next/router";
import { z } from "zod";
import { useAuth } from "~/context/auth.context";
import { api } from "~/utils/api";
import {
  Alert,
  button,
  EventNav,
  Workspace,
} from "~/components/competitions/Workspace";
import {
  exportDiagnosticSchema,
  type ExportDiagnostic,
} from "~/lib/competition-export-layout";
import { ExportDiagnostics } from "~/components/competitions/ExportPlanPreview";
import { ExportLayoutEditor } from "~/components/competitions/ExportLayoutEditor";
export default function CompetitionExportPage() {
  const router = useRouter();
  const { isAuth, token } = useAuth();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  const query = api.competitions.exportLayout.useQuery(
    { id },
    { enabled: isAuth && !!id, refetchOnWindowFocus: false },
  );
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [downloadDiagnostics, setDownloadDiagnostics] = useState<
    ExportDiagnostic[]
  >([]);
  const [message, setMessage] = useState("");
  async function download(format: "xlsx" | "docx") {
    if (!token || busy) return;
    setBusy(format);
    setError("");
    setDownloadDiagnostics([]);
    setMessage("");
    try {
      const response = await fetch(
        `/api/competitions/export?id=${encodeURIComponent(id)}&format=${format}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) {
        const body: unknown = await response.json();
        const failure = z
          .object({
            message: z.string(),
            diagnostics: z.array(exportDiagnosticSchema).optional(),
          })
          .parse(body);
        setDownloadDiagnostics(failure.diagnostics ?? []);
        throw new Error(failure.message);
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
          <ExportLayoutEditor
            key={query.data.event._id}
            detail={query.data}
            download={download}
            downloading={!!busy}
          />
          {error ? <Alert error>{error}</Alert> : null}
          {downloadDiagnostics.length ? (
            <ExportDiagnostics
              plan={{ ...query.data.plan, diagnostics: downloadDiagnostics }}
            />
          ) : null}
          {message ? <Alert>{message}</Alert> : null}
        </>
      ) : null}
    </Workspace>
  );
}
