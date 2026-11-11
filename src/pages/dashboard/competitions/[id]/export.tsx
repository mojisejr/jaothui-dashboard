import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { z } from "zod";
import { useAuth } from "~/context/auth.context";
import { rememberCompetitionReturn } from "~/lib/competition-return-target";
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
  const id = typeof router.query.id === "string" ? router.query.id : "";
  return <CompetitionExport key={id} id={id} />;
}
function CompetitionExport({ id }: { id: string }) {
  const { isAuth, token, logout } = useAuth();
  const query = api.competitions.exportLayout.useQuery(
    { id, order: "automatic" },
    { enabled: isAuth && !!id, refetchOnWindowFocus: false },
  );
  const [busy, setBusy] = useState("");
  const [loginRequired, setLoginRequired] = useState(false);
  const signInAgain = () => {
    logout();
    rememberCompetitionReturn(
      `/dashboard/competitions/${encodeURIComponent(id)}/export`,
    );
  };
  const [error, setError] = useState("");
  const [downloadDiagnostics, setDownloadDiagnostics] = useState<
    ExportDiagnostic[]
  >([]);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const [file, setFile] = useState<{ url: string; filename: string } | null>(
    null,
  );
  useEffect(
    () => () => {
      if (file) URL.revokeObjectURL(file.url);
    },
    [file],
  );
  const controller = useRef<AbortController>();
  useEffect(() => () => controller.current?.abort(), []);
  async function download(format: "xlsx" | "docx") {
    if (!token || inFlight.current) return;
    inFlight.current = true;
    const request = new AbortController();
    controller.current = request;
    setFile(null);
    setLoginRequired(false);
    setBusy(format);
    setError("");
    setDownloadDiagnostics([]);
    setMessage("");
    try {
      const response = await fetch(
        `/api/competitions/export?id=${encodeURIComponent(id)}&format=${format}&order=automatic`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: request.signal,
        },
      );
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const failure = z
          .object({
            message: z.string(),
            code: z.string().optional(),
            diagnostics: z.array(exportDiagnosticSchema).optional(),
          })
          .safeParse(body);
        if (!failure.success)
          throw new Error("สร้างไฟล์ไม่สำเร็จ กรุณาลองดาวน์โหลดอีกครั้ง");
        setLoginRequired(failure.data.code === "STAFF_LOGIN_REQUIRED");
        setDownloadDiagnostics(failure.data.diagnostics ?? []);
        throw new Error(failure.data.message);
      }
      if (response.headers.get("X-Competition-Id") !== id)
        throw new Error("งานในไฟล์ตอบกลับไม่ตรงกับงานที่เลือก");
      const blob = await response.blob();
      const type =
        format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/zip";
      if (blob.type !== type || blob.size < 4)
        throw new Error("รูปแบบไฟล์ตอบกลับไม่ถูกต้อง กรุณาลองอีกครั้ง");
      // XLSX and DOCX bundles both begin with the local file header of a ZIP.
      const signature = await new Promise<number>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          resolve(new DataView(reader.result as ArrayBuffer).getUint32(0));
        reader.onerror = () =>
          reject(new Error("อ่านไฟล์ที่ดาวน์โหลดไม่สำเร็จ"));
        reader.readAsArrayBuffer(blob.slice(0, 4));
      });
      if (signature !== 0x504b0304)
        throw new Error("ข้อมูลไฟล์ตอบกลับไม่ถูกต้อง กรุณาลองอีกครั้ง");
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename = decodeURIComponent(
        disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1] ??
          `competition.${format === "xlsx" ? "xlsx" : "zip"}`,
      );
      if (!filename.endsWith(format === "xlsx" ? ".xlsx" : ".zip"))
        throw new Error("ชื่อไฟล์ตอบกลับไม่ตรงกับรูปแบบที่เลือก");
      if (request.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      setFile({ url, filename });
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setMessage(
        `สร้างไฟล์ ${format === "xlsx" ? "Excel" : "ZIP ใบสมัคร DOCX"} แล้ว ${response.headers.get("X-Record-Count") ?? ""} รายการ กรุณาตรวจไฟล์ในโฟลเดอร์ดาวน์โหลด`,
      );
    } catch (e) {
      if (request.signal.aborted) return;
      setError(e instanceof Error ? e.message : "ดาวน์โหลดไม่สำเร็จ");
    } finally {
      inFlight.current = false;
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
          {query.error.data?.code === "UNAUTHORIZED" ? (
            <button className={button} onClick={signInAgain}>
              เข้าสู่ระบบอีกครั้ง
            </button>
          ) : (
            <button className={button} onClick={() => void query.refetch()}>
              ลองอีกครั้ง
            </button>
          )}
        </>
      ) : query.data ? (
        <>
          <EventNav event={query.data.event} active="export" />
          <ExportLayoutEditor
            key={query.data.event._id}
            detail={query.data}
            download={download}
            downloading={!!busy}
            downloadStatus={
              <>
                {busy && (
                  <p role="status">
                    กำลังเตรียมไฟล์ {busy === "xlsx" ? "Excel" : "Word"}…
                  </p>
                )}
                {error && <Alert error>{error}</Alert>}
                {loginRequired && (
                  <button
                    type="button"
                    className={button}
                    onClick={signInAgain}
                  >
                    เข้าสู่ระบบอีกครั้ง
                  </button>
                )}
                {downloadDiagnostics.length > 0 && (
                  <ExportDiagnostics
                    plan={{
                      ...query.data.plan,
                      diagnostics: downloadDiagnostics,
                    }}
                  />
                )}
                {message && <p role="status">{message}</p>}
                {file && (
                  <a
                    className={button}
                    download={file.filename}
                    href={file.url}
                  >
                    บันทึกไฟล์อีกครั้ง
                  </a>
                )}
              </>
            }
          />
        </>
      ) : null}
    </Workspace>
  );
}
