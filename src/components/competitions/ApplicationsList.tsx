import Link from "next/link";
import { useState } from "react";
import { api } from "~/utils/api";
import { useAuth } from "~/context/auth.context";
import {
  applicationStatus,
  approvalLabels,
  type ApplicationFilters,
} from "~/lib/competition-applications";
import { Alert, button, control } from "./Workspace";
const emptyFilters: ApplicationFilters = { search: "", page: 1, pageSize: 20 };
export function ApplicationsList({ id }: { id: string }) {
  const { isAuth } = useAuth();
  const [filters, setFilters] = useState<ApplicationFilters>(emptyFilters);
  const query = api.competitions.applications.useQuery(
    { id, ...filters },
    { enabled: isAuth && !!id, refetchOnWindowFocus: false },
  );
  const change = <K extends keyof ApplicationFilters>(
    key: K,
    value: ApplicationFilters[K],
  ) => setFilters((v) => ({ ...v, [key]: value, page: 1 }));
  const facets = query.data?.facets;
  return (
    <div className="min-w-0 space-y-6">
      <section
        className="glass-card min-w-0 space-y-4 rounded-3xl p-5"
        aria-label="ค้นหาใบสมัคร"
      >
        <h2 className="text-xl font-semibold">รายการใบสมัคร</h2>
        <div className="grid min-w-0 gap-4 md:grid-cols-3">
          <label className="min-w-0 space-y-2 text-sm">
            ค้นหาชื่อควาย เจ้าของ หรือไมโครชิพ
            <input
              type="search"
              className={control}
              value={filters.search}
              onChange={(e) => change("search", e.target.value)}
            />
          </label>
          <label className="min-w-0 space-y-2 text-sm">
            สถานะใบสมัคร
            <select
              className={control}
              value={filters.status ?? ""}
              onChange={(e) =>
                change(
                  "status",
                  e.target.value
                    ? (e.target.value as ApplicationFilters["status"])
                    : undefined,
                )
              }
            >
              <option value="">ทุกสถานะ</option>
              {Object.entries(approvalLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 space-y-2 text-sm">
            รุ่นแข่งขัน
            <select
              className={control}
              value={filters.type ?? ""}
              onChange={(e) => change("type", e.target.value || undefined)}
            >
              <option value="">ทุกรุ่น</option>
              {facets?.types.map((v) => <option key={v}>{v}</option>)}
            </select>
          </label>
          <label className="min-w-0 space-y-2 text-sm">
            ชุดรุ่น
            <select
              className={control}
              value={filters.level ?? ""}
              onChange={(e) =>
                change(
                  "level",
                  e.target.value
                    ? (e.target.value as ApplicationFilters["level"])
                    : undefined,
                )
              }
            >
              <option value="">ทุกชุด</option>
              <option value="national">รุ่นแข่งขัน</option>
              <option value="province">จังหวัดจากข้อมูลเดิม</option>
            </select>
          </label>
          <label className="min-w-0 space-y-2 text-sm">
            เพศ
            <select
              className={control}
              value={filters.sex ?? ""}
              onChange={(e) => change("sex", e.target.value || undefined)}
            >
              <option value="">ทุกเพศ</option>
              {facets?.sexes.map((v) => <option key={v}>{v}</option>)}
            </select>
          </label>
          <label className="min-w-0 space-y-2 text-sm">
            สี
            <select
              className={control}
              value={filters.color ?? ""}
              onChange={(e) => change("color", e.target.value || undefined)}
            >
              <option value="">ทุกสี</option>
              {facets?.colors.map((v) => <option key={v}>{v}</option>)}
            </select>
          </label>
        </div>
        <button
          type="button"
          className={button}
          onClick={() => setFilters(emptyFilters)}
        >
          ล้างตัวกรอง
        </button>
        {query.data ? (
          <p className="break-words text-sm text-text-muted">
            ตามตัวกรอง (ทุกสถานะ) {query.data.counts.total} • รอตรวจ{" "}
            {query.data.counts.pending} • อนุมัติ {query.data.counts.accepted} •
            ไม่อนุมัติ {query.data.counts.rejected}
          </p>
        ) : null}
      </section>
      {query.isPending ? (
        <p role="status">กำลังโหลดใบสมัคร…</p>
      ) : query.error ? (
        <div className="space-y-3">
          <Alert error>{query.error.message}</Alert>
          <button className={button} onClick={() => void query.refetch()}>
            ลองโหลดใหม่
          </button>
        </div>
      ) : query.data ? (
        <>
          <p aria-live="polite">
            พบ {query.data.total} รายการ{" "}
            {query.isFetching ? "• กำลังปรับรายการ…" : ""}
          </p>
          {!query.data.items.length ? (
            <Alert>ไม่พบใบสมัครตามตัวกรอง ลองล้างตัวกรองหรือเปลี่ยนคำค้น</Alert>
          ) : (
            <ul className="space-y-4" aria-label="ใบสมัครแข่งขัน">
              {query.data.items.map((entry) => (
                <li
                  key={entry._id}
                  className="glass-card min-w-0 space-y-3 rounded-3xl p-5"
                >
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                    <h3 className="break-words text-lg font-semibold">
                      {entry.name || "ไม่ระบุชื่อควาย"}
                    </h3>
                    <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm">
                      {approvalLabels[applicationStatus(entry)]}
                    </span>
                  </div>
                  <p className="break-words">{entry.type || "ไม่ระบุรุ่น"}</p>
                  <p className="break-words text-sm text-text-muted">
                    ไมโครชิพ {entry.microchip || "ไม่ระบุ"} • เจ้าของ{" "}
                    {entry.ownerName || "ไม่ระบุ"} • {entry.sex || "ไม่ระบุเพศ"}{" "}
                    / {entry.color || "ไม่ระบุสี"}
                  </p>
                  <p className="text-sm text-text-muted">
                    {entry.isAdminRegistration
                      ? "ลงทะเบียนโดยเจ้าหน้าที่"
                      : "ใบสมัครออนไลน์ / ข้อมูลเดิม"}
                  </p>
                  <Link
                    className={button}
                    href={`/dashboard/competitions/${encodeURIComponent(id)}/applications/${encodeURIComponent(entry._id)}`}
                  >
                    ตรวจใบสมัคร
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div
            className="flex flex-wrap items-center gap-3"
            aria-label="เปลี่ยนหน้าใบสมัคร"
          >
            <button
              className={button}
              disabled={filters.page <= 1 || query.isFetching}
              onClick={() => setFilters((v) => ({ ...v, page: v.page - 1 }))}
            >
              หน้าก่อน
            </button>
            <span>
              หน้า {filters.page} /{" "}
              {Math.max(1, Math.ceil(query.data.total / filters.pageSize))}
            </span>
            <button
              className={button}
              disabled={
                filters.page * filters.pageSize >= query.data.total ||
                query.isFetching
              }
              onClick={() => setFilters((v) => ({ ...v, page: v.page + 1 }))}
            >
              หน้าถัดไป
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
