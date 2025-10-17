import { useState } from "react";
import { api } from "~/utils/api";

interface EventSelectorProps {
  onEventSelect: (eventName: string) => void;
  selectedEvent?: string;
}

export const EventSelector = ({ onEventSelect, selectedEvent }: EventSelectorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const { data: eventsData, isLoading, error } = api.sanity.getAvailableEvents.useQuery();

  const handleEventSelect = (eventName: string) => {
    onEventSelect(eventName);
    setIsOpen(false);
  };

  if (isLoading) {
    return (
      <div className="form-control">
        <label className="label label-text">เลือกอีเวนต์</label>
        <div className="select select-bordered bg-neutral">
          <div className="loading loading-spinner loading-sm"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="form-control">
        <label className="label label-text">เลือกอีเวนต์</label>
        <div className="alert alert-error">
          <span>ไม่สามารถโหลดข้อมูลอีเวนต์ได้</span>
        </div>
      </div>
    );
  }

  const events = (eventsData?.events as string[]) ?? [];

  return (
    <div className="form-control">
      <label className="label label-text">เลือกอีเวนต์</label>
      <div className="dropdown">
        <div
          tabIndex={0}
          role="button"
          className={`select select-bordered bg-neutral w-full ${isOpen ? "select-active" : ""}`}
          onClick={() => setIsOpen(!isOpen)}
        >
          {selectedEvent ?? "เลือกอีเวนต์..."}
        </div>
        {isOpen && (
          <div
            tabIndex={0}
            className="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-full max-h-60 overflow-auto"
          >
            {events.length === 0 ? (
              <div className="p-2 text-gray-500">ไม่มีอีเวนต์ให้เลือก</div>
            ) : (
              events.map((event) => (
                <li key={String(event)}>
                  <a
                    onClick={() => handleEventSelect(event)}
                    className={`block w-full text-left px-2 py-1 hover:bg-base-200 rounded ${
                      selectedEvent === event ? "bg-primary text-primary-content" : ""
                    }`}
                  >
                    {event}
                  </a>
                </li>
              ))
            )}
          </div>
        )}
      </div>
      {eventsData && (
        <label className="label label-text-alt">
          พบ {eventsData.totalCount ?? 0} รายการทั้งหมด
        </label>
      )}
    </div>
  );
};
