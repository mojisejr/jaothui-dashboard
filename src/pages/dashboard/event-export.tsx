/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
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

  const {
    data: eventsData,
    isLoading: eventsLoading,
    error: eventsError,
  } = api.sanity.getEventsForExport.useQuery();
  const exportMutation = api.sanity.exportEventData.useMutation();
  const exportDocxMutation = api.sanity.exportEventDataToDocx.useMutation();

  const handleExport = async () => {
    if (!selectedEvent) {
      toast.error("Please select an event to export");
      return;
    }

    setIsExporting(true);
    setExportWarnings([]);
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

    setIsExportingDocx(true);
    setExportWarnings([]);
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
        toast.error(result.error ?? "Export failed");
      }
    } catch (error) {
      console.error("DOCX Export error:", error);
      toast.error("DOCX export failed. Please try again.");
    } finally {
      setIsExportingDocx(false);
    }
  };

  const selectedEventTitle =
    eventsData?.data?.find((e: SanityEvent) => e._id === selectedEvent)
      ?.title ?? "";

  return (
    <div className="min-h-screen bg-base-200 p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-base-content">
            Event Export
          </h1>
          <p className="text-base-content/70">
            Export event registration data to Excel or DOCX format
          </p>
        </div>

        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text flex items-center gap-2 font-medium">
                  <FiCalendar className="h-4 w-4" />
                  Select Event
                </span>
              </label>

              <select
                aria-label="Select Event"
                className="select select-bordered w-full"
                value={selectedEvent}
                onChange={(e) => {
                  setSelectedEvent(e.target.value);
                  setExportWarnings([]);
                }}
                disabled={eventsLoading || isExporting || isExportingDocx}
              >
                <option value="">Choose an event...</option>
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
                    Loading events...
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

            {selectedEvent && (
              <div className="mt-6 space-y-4">
                <div className="rounded-lg bg-base-200 p-4">
                  <h3 className="mb-2 font-medium">Excel Export Preview</h3>
                  <div className="space-y-1 text-sm text-base-content/70">
                    <p>
                      <strong>Event:</strong> {selectedEventTitle}
                    </p>
                    <p>
                      <strong>Format:</strong> Multi-sheet Excel (.xlsx) with
                      hierarchical headers or ZIP (.zip) for large files
                    </p>
                    <p>
                      <strong>Structure:</strong> Summary sheet and separate
                      sheets per Class-Level-Color-Sex combination
                    </p>
                    <p>
                      <strong>Headers:</strong> Event identity → Class / Level /
                      Color / Sex → Registration rows
                    </p>
                    <p>
                      <strong>Compression:</strong> Auto-compressed when file
                      size {">"} 10MB
                    </p>
                    <p>
                      <strong>Columns:</strong> ลำดับ | เลขไมโครชิพ | ชื่อควาย |
                      วัน/เดือน/ปีเกิด | อายุ (เดือน) | พ่อ | แม่ | ชื่อฟาร์ม |
                      เบอร์โทรศัพท์
                    </p>
                  </div>
                </div>

                <div className="rounded-lg bg-base-200 p-4">
                  <h3 className="mb-2 font-medium">DOCX Export Preview</h3>
                  <div className="space-y-1 text-sm text-base-content/70">
                    <p>
                      <strong>Event:</strong> {selectedEventTitle}
                    </p>
                    <p>
                      <strong>Format:</strong> Individual DOCX registration
                      forms bundled in ZIP (.zip)
                    </p>
                    <p>
                      <strong>Structure:</strong> One registration form per
                      buffalo
                    </p>
                    <p>
                      <strong>Layout:</strong> Professional table-based Thai
                      registration form
                    </p>
                    <p>
                      <strong>Sections:</strong> Competition Type | Buffalo Info
                      | Pedigree | Owner Information
                    </p>
                    <p>
                      <strong>Language:</strong> Thai field labels with
                      automatic color/sex translation
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="card-actions mt-6 justify-end gap-3">
              <button
                className="btn btn-primary"
                onClick={handleExport}
                disabled={
                  !selectedEvent ||
                  isExporting ||
                  exportMutation.isPending ||
                  isExportingDocx ||
                  exportDocxMutation.isPending
                }
              >
                {isExporting || exportMutation.isPending ? (
                  <>
                    <FiLoader className="h-4 w-4 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <FiDownload className="h-4 w-4" />
                    Export to Excel
                  </>
                )}
              </button>

              <button
                className="btn btn-secondary"
                onClick={handleExportDocx}
                disabled={
                  !selectedEvent ||
                  isExporting ||
                  exportMutation.isPending ||
                  isExportingDocx ||
                  exportDocxMutation.isPending
                }
              >
                {isExportingDocx || exportDocxMutation.isPending ? (
                  <>
                    <FiLoader className="h-4 w-4 animate-spin" />
                    Exporting DOCX...
                  </>
                ) : (
                  <>
                    <FiDownload className="h-4 w-4" />
                    Export to DOCX
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <div className="alert alert-info">
            <div className="flex items-start gap-2">
              <div className="shrink-0">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  className="h-6 w-6 shrink-0 stroke-current"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  ></path>
                </svg>
              </div>
              <div>
                <h3 className="font-bold">Export Information</h3>
                <div className="text-sm">
                  <ul className="mt-2 list-inside list-disc space-y-1">
                    <li>
                      ข้อมูลมาจากระบบการแข่งขันเดียวกับหน้าจัดการใบสมัคร
                      รวมทุกสถานะใบสมัคร
                    </li>
                    <li>
                      <strong>Excel Export:</strong> Multiple sheets organized
                      by competition type, color, and sex with hierarchical
                      headers
                    </li>
                    <li>
                      <strong>DOCX Export:</strong> Individual registration
                      forms (one per buffalo) bundled in a ZIP file
                    </li>
                    <li>
                      ใช้อายุที่บันทึกไว้ก่อน รวม 0 เดือน; หากไม่มี
                      ใช้วันเกิดกับวันตัดอายุของงานเท่านั้น พร้อมหมายเหตุในไฟล์
                    </li>
                    <li>
                      DOCX forms include Thai field labels with automatic
                      color/sex translation (black→ดำ, male→ผู้)
                    </li>
                    <li>
                      Excel files larger than 10MB are automatically compressed
                      to ZIP format
                    </li>
                    <li>
                      Father and mother names come from user input during
                      registration
                    </li>
                    <li>Files are downloaded directly to your computer</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
