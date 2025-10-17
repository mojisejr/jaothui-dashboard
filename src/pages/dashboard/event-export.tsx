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

  const { data: eventsData, isLoading: eventsLoading, error: eventsError } = api.sanity.getEventsForExport.useQuery();
  const exportMutation = api.sanity.exportEventData.useMutation();

  const handleExport = async () => {
    if (!selectedEvent) {
      toast.error("Please select an event to export");
      return;
    }

    setIsExporting(true);
    try {
      const result = await exportMutation.mutateAsync({ eventId: selectedEvent });
      
      if (result.success && result.data) {
        // Create blob from buffer and trigger download
        const blob = new Blob([result.data.buffer], { 
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = result.data.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        toast.success(`Successfully exported ${result.data.recordCount} records`);
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

  const selectedEventTitle = eventsData?.data?.find((e: SanityEvent) => e._id === selectedEvent)?.title ?? "";

  return (
    <div className="min-h-screen bg-base-200 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-base-content mb-2">
            Event Export
          </h1>
          <p className="text-base-content/70">
            Export event registration data to Excel file
          </p>
        </div>

        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text font-medium flex items-center gap-2">
                  <FiCalendar className="w-4 h-4" />
                  Select Event
                </span>
              </label>
              
              <select 
                className="select select-bordered w-full"
                value={selectedEvent}
                onChange={(e) => setSelectedEvent(e.target.value)}
                disabled={eventsLoading || isExporting}
              >
                <option value="">Choose an event...</option>
                {eventsData?.data?.map((event: SanityEvent) => (
                  <option key={event._id} value={event._id}>
                    {event.title}
                  </option>
                ))}
              </select>

              {eventsLoading && (
                <div className="flex items-center gap-2 mt-2">
                  <FiLoader className="w-4 h-4 animate-spin" />
                  <span className="text-sm text-base-content/70">
                    Loading events...
                  </span>
                </div>
              )}

              {eventsError && (
                <div className="alert alert-error mt-2">
                  <span>Failed to load events. Please refresh the page.</span>
                </div>
              )}
            </div>

            {selectedEvent && (
              <div className="mt-6 p-4 bg-base-200 rounded-lg">
                <h3 className="font-medium mb-2">Export Preview</h3>
                <div className="text-sm text-base-content/70 space-y-1">
                  <p><strong>Event:</strong> {selectedEventTitle}</p>
                  <p><strong>Format:</strong> Excel (.xlsx)</p>
                  <p><strong>Columns:</strong> ลำดับ | เลขไมโครชิพ | ชื่อควาย | วัน/เดือน/ปีเกิด | อายุ (เดือน) | พ่อ | แม่ | ชื่อฟาร์ม | เบอร์โทรศัพท์</p>
                </div>
              </div>
            )}

            <div className="card-actions justify-end mt-6">
              <button
                className="btn btn-primary"
                onClick={handleExport}
                disabled={!selectedEvent || isExporting || exportMutation.isPending}
              >
                {isExporting || exportMutation.isPending ? (
                  <>
                    <FiLoader className="w-4 h-4 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <FiDownload className="w-4 h-4" />
                    Export to Excel
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
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </div>
              <div>
                <h3 className="font-bold">Export Information</h3>
                <div className="text-sm">
                  <ul className="list-disc list-inside space-y-1 mt-2">
                    <li>Data is exported from Sanity CMS event registration records</li>
                    <li>Excel file includes all registered buffaloes for the selected event</li>
                    <li>Age is automatically calculated in months from birthday</li>
                    <li>File is downloaded directly to your computer</li>
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
