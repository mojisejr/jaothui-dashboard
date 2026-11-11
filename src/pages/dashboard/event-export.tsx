/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import Link from "next/link";
import type { ExportDiagnostic } from "~/lib/competition-export-layout";
import { ExportDiagnostics } from "~/components/competitions/ExportPlanPreview";
import React, { useState } from "react";
import { api } from "~/utils/api";
import { FiDownload, FiCalendar, FiLoader } from "react-icons/fi";
import { toast } from "react-hot-toast";

interface SanityEvent {
  _id: string;
  title: string;
  _type: string;
}

export default function EventExport() {
  const [selectedEvent, setSelectedEvent] = useState<string>("");
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [exportWarnings, setExportWarnings] = useState<string[]>([]);
  const [exportDiagnostics, setExportDiagnostics] = useState<
    ExportDiagnostic[]
  >([]);

  const {
    data: eventsData,
    isLoading: eventsLoading,
    error: eventsError,
  } = api.sanity.getEventsForExport.useQuery();
  const layoutQuery = api.competitions.exportLayout.useQuery(
    { id: selectedEvent },
    { enabled: !!selectedEvent, refetchOnWindowFocus: true },
  );
  const exportReady =
    !!selectedEvent &&
    layoutQuery.data?.plan.state === "ready" &&
    !!layoutQuery.data.layout &&
    !layoutQuery.isFetching &&
    !layoutQuery.error;
  const exportMutation = api.sanity.exportEventData.useMutation();
  const exportDocxMutation = api.sanity.exportEventDataToDocx.useMutation();

  const handleExport = async () => {
    if (!selectedEvent) {
      toast.error("Please select an event to export");
      return;
    }

    if (!exportReady) {
      toast.error("กรุณาตั้งค่ารูปแบบไฟล์และแก้รายการที่ขาดก่อนดาวน์โหลด");
      return;
    }
    setIsExporting(true);
    setExportWarnings([]);
    setExportDiagnostics([]);
    try {
      const result = await exportMutation.mutateAsync({
        eventId: selectedEvent,
      });

      if (result.success && result.data) {
        setExportWarnings(result.data.warnings);
        // Determine MIME type based on file extension
        const isZipFile = result.data.filename.endsWith(".zip");
        const mimeType = isZipFile
          ? "application/zip"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

        // Convert base64 back to binary data
        const base64String = result.data.buffer;
        const byteCharacters = atob(base64String);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const buffer = new Uint8Array(byteNumbers);
        const blob = new Blob([buffer], { type: mimeType });

        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = result.data.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        // Show compression info if applicable
        if (result.data.isCompressed) {
          const originalSizeMB = (
            result.data.originalSize /
            (1024 * 1024)
          ).toFixed(1);
          const compressedSizeMB = (
            result.data.compressedSize /
            (1024 * 1024)
          ).toFixed(1);
          const compressionRatio = (
            (1 - result.data.compressedSize / result.data.originalSize) *
            100
          ).toFixed(0);

          toast.success(
            `Successfully exported ${result.data.recordCount} records in ${result.data.sheetCount} sheets (Compressed: ${originalSizeMB}MB → ${compressedSizeMB}MB, ${compressionRatio}% smaller)`,
          );
        } else {
          toast.success(
            `Successfully exported ${result.data.recordCount} records in ${result.data.sheetCount} sheets`,
          );
        }
      } else {
        setExportDiagnostics(result.diagnostics ?? []);
        toast.error(result.error ?? "Export failed");
      }
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportDocx = async () => {
    if (!selectedEvent) {
      toast.error("Please select an event to export");
      return;
    }

    if (!exportReady) {
      toast.error("กรุณาตั้งค่ารูปแบบไฟล์และแก้รายการที่ขาดก่อนดาวน์โหลด");
      return;
    }
    setIsExportingDocx(true);
    setExportWarnings([]);
    setExportDiagnostics([]);
    try {
      const result = await exportDocxMutation.mutateAsync({
        eventId: selectedEvent,
      });

      if (result.success && result.data) {
        setExportWarnings(result.data.warnings);
        // Convert base64 back to binary data for ZIP file
        const base64String = result.data.buffer;
        const byteCharacters = atob(base64String);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const buffer = new Uint8Array(byteNumbers);
        const blob = new Blob([buffer], { type: "application/zip" });

        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = result.data.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        toast.success(
          `Successfully exported ${result.data.recordCount} buffalo registration forms (${result.data.fileCount} DOCX files in ZIP)`,
        );
      } else {
        setExportDiagnostics(result.diagnostics ?? []);
        toast.error(result.error ?? "Export failed");
      }
    } catch (error) {
      console.error("DOCX Export error:", error);
      toast.error("DOCX export failed. Please try again.");
    } finally {
      setIsExportingDocx(false);
    }
  };

  return (
    <div className="min-h-screen bg-base-200 p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-base-content">
            ส่งออกใบสมัครการแข่งขัน
          </h1>
          <p className="text-base-content/70">
            เลือกงานเพื่อดาวน์โหลดตาราง Excel หรือใบสมัคร DOCX
          </p>
        </div>

        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text flex items-center gap-2 font-medium">
                  <FiCalendar className="h-4 w-4" />
                  เลือกงาน
                </span>
              </label>

              <select
                aria-label="เลือกงาน"
                className="select select-bordered w-full"
                value={selectedEvent}
                onChange={(e) => {
                  setSelectedEvent(e.target.value);
                  setExportWarnings([]);
                  setExportDiagnostics([]);
                }}
                disabled={eventsLoading || isExporting || isExportingDocx}
              >
                <option value="">เลือกงานการแข่งขัน</option>
                {eventsData?.data?.map((event: SanityEvent) => (
                  <option key={event._id} value={event._id}>
                    {event.title}
                  </option>
                ))}
              </select>

              {eventsLoading && (
                <div className="mt-2 flex items-center gap-2">
                  <FiLoader className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-base-content/70">
                    กำลังโหลดรายชื่องาน…
                  </span>
                </div>
              )}

              {(Boolean(eventsError) || eventsData?.success === false) && (
                <div className="alert alert-error mt-2">
                  <span>
                    โหลดรายการงานไม่สำเร็จ กรุณารีเฟรชหน้าแล้วลองอีกครั้ง
                  </span>
                </div>
              )}
            </div>

            {selectedEvent ? (
              <section
                aria-label="ความพร้อมส่งออก"
                className="mt-4 space-y-3 rounded-xl border border-white/20 p-4"
              >
                {layoutQuery.isPending || layoutQuery.isFetching ? (
                  <p role="status">กำลังตรวจความพร้อมส่งออก…</p>
                ) : layoutQuery.error ? (
                  <div role="alert">
                    <p>{layoutQuery.error.message}</p>
                    <button
                      type="button"
                      className="btn mt-2 min-h-12"
                      onClick={() => void layoutQuery.refetch()}
                    >
                      ตรวจความพร้อมอีกครั้ง
                    </button>
                  </div>
                ) : layoutQuery.data ? (
                  <>
                    <h2 className="font-semibold">
                      {exportReady
                        ? "ดาวน์โหลดไฟล์ของงานนี้"
                        : layoutQuery.data.layout
                          ? "ตรวจรูปแบบไฟล์ก่อนส่งออก"
                          : "งานนี้ยังไม่ได้บันทึกรูปแบบไฟล์"}
                    </h2>
                    {!exportReady && (
                      <p>
                        {layoutQuery.data.layout
                          ? "เปิดการตั้งค่า แก้รายการที่ระบบระบุ แล้วกด “ดูตัวอย่างลำดับชีต” เมื่อผ่านแล้วให้บันทึกรูปแบบเพื่อดาวน์โหลด"
                          : "เปิดการตั้งค่า ตรวจลำดับรุ่นตามป้ายงาน แล้วกด “ดูตัวอย่างลำดับชีต” เมื่อผ่านแล้วให้กด “บันทึกรูปแบบไฟล์” จากนั้นดาวน์โหลดได้ในหน้าเดียวกัน"}
                      </p>
                    )}
                    <Link
                      className={
                        exportReady
                          ? "link"
                          : "btn btn-primary h-auto min-h-12 w-full sm:w-auto"
                      }
                      href={`/dashboard/competitions/${encodeURIComponent(selectedEvent)}/export`}
                    >
                      {exportReady
                        ? "แก้ไขรูปแบบไฟล์"
                        : "ตั้งค่ารูปแบบไฟล์เพื่อดาวน์โหลด"}
                    </Link>
                    {layoutQuery.data.layout && (
                      <ExportDiagnostics plan={layoutQuery.data.plan} />
                    )}
                    {exportReady && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <button
                          className="btn btn-primary"
                          onClick={handleExport}
                          disabled={
                            !exportReady ||
                            isExporting ||
                            exportMutation.isPending ||
                            isExportingDocx ||
                            exportDocxMutation.isPending
                          }
                        >
                          {isExporting || exportMutation.isPending ? (
                            <>
                              <FiLoader className="h-4 w-4 animate-spin" />
                              กำลังสร้างตาราง…
                            </>
                          ) : (
                            <>
                              <FiDownload className="h-4 w-4" />
                              ดาวน์โหลด Excel
                            </>
                          )}
                        </button>

                        <button
                          className="btn btn-secondary"
                          onClick={handleExportDocx}
                          disabled={
                            !exportReady ||
                            isExporting ||
                            exportMutation.isPending ||
                            isExportingDocx ||
                            exportDocxMutation.isPending
                          }
                        >
                          {isExportingDocx || exportDocxMutation.isPending ? (
                            <>
                              <FiLoader className="h-4 w-4 animate-spin" />
                              กำลังสร้างใบสมัคร…
                            </>
                          ) : (
                            <>
                              <FiDownload className="h-4 w-4" />
                              ดาวน์โหลดใบสมัคร DOCX (ZIP)
                            </>
                          )}
                        </button>
                      </div>
                    )}
                    {exportDiagnostics.length ? (
                      <ExportDiagnostics
                        plan={{
                          ...layoutQuery.data.plan,
                          diagnostics: exportDiagnostics,
                        }}
                      />
                    ) : null}
                  </>
                ) : null}
              </section>
            ) : null}
            {exportWarnings.length > 0 && (
              <div role="status" className="alert alert-warning mt-4">
                <div>
                  <p className="font-medium">ข้อควรตรวจสอบในไฟล์ส่งออก</p>
                  <ul className="list-inside list-disc">
                    {exportWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>

        <details className="mt-4 rounded-lg bg-base-100 p-4">
          <summary className="cursor-pointer">ข้อมูลในไฟล์ดาวน์โหลด</summary>
          <p className="mt-2">
            Excel รวมใบสมัครทุกสถานะ แยกตามรุ่น ระดับ สี และเพศ ไฟล์ใหญ่กว่า 10
            MB จะดาวน์โหลดเป็น ZIP
          </p>
          <p>DOCX แยกใบสมัครหนึ่งไฟล์ต่อควายหนึ่งตัว รวมใน ZIP เดียว</p>
          <p>
            ใช้อายุที่บันทึกไว้ก่อน รวมถึง 0 เดือน หากไม่มี
            ระบบจะใช้วันเกิดกับวันตัดอายุของงาน พร้อมหมายเหตุในไฟล์
          </p>
        </details>
      </div>
    </div>
  );
}
