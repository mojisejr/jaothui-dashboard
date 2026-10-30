import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "~/utils/api";
import { useAuth } from "~/context/auth.context";
import {
  registrationLabel,
  registrationLabels,
  SOURCE_POLICY_UPGRADE_MESSAGE,
  type ApplicationFilters,
} from "~/lib/competition-applications";
import { Alert, button, control } from "./Workspace";
import {
  checkInLabels,
  CHECK_IN_UPGRADE_MESSAGE,
  hasCheckInCapability,
} from "~/lib/competition-check-in";
const statusOptionsByRequirement = {
  not_required: ["registered"],
  required: ["pending", "accepted", "rejected"],
  unknown: ["needs_type_review"],
} as const;
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
  const registrationCounts = query.data?.registrationCounts;
  const arrivalCounts = query.data?.checkInCounts;
  const arrivalAvailable = query.data?.checkInVersion === 1 && !!arrivalCounts;
  const requirement = query.data?.approvalRequirement;
  const statusOptions = statusOptionsByRequirement[requirement ?? "unknown"];
  useEffect(() => {
    if (!requirement) return;
    setFilters((current) =>
      current.registrationStatus &&
      !statusOptions.includes(current.registrationStatus as never)
        ? { ...current, registrationStatus: undefined, page: 1 }
        : current,
    );
  }, [requirement, statusOptions]);
  if (
    query.data &&
    (query.data.registrationPolicyVersion !== 1 ||
      !query.data.registrationCounts)
  )
    return <Alert error>{SOURCE_POLICY_UPGRADE_MESSAGE}</Alert>;
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
              value={filters.registrationStatus ?? ""}
              onChange={(e) =>
                change(
                  "registrationStatus",
                  e.target.value
                    ? (e.target
                        .value as ApplicationFilters["registrationStatus"])
                    : undefined,
                )
              }
            >
              <option value="">ทุกสถานะ</option>
              {statusOptions.map((value) => (
                <option key={value} value={value}>
                  {registrationLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 space-y-2 text-sm">
            สถานะหน้างาน
            <select
              className={control}
              value={filters.checkInStatus ?? ""}
              disabled={!arrivalAvailable}
              onChange={(event) =>
                change(
                  "checkInStatus",
                  event.target.value
                    ? (event.target
                        .value as ApplicationFilters["checkInStatus"])
                    : undefined,
                )
              }
            >
              <option value="">ทุกสถานะรายงานตัว</option>
              <option value="not_checked_in">ยังไม่รายงานตัว</option>
              <option value="checked_in">รายงานตัวแล้ว</option>
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
        {registrationCounts ? (
          <p className="break-words text-sm text-text-muted">
            ตามตัวกรอง (ทุกสถานะ) {registrationCounts.total}
            {statusOptions.map((status) => (
              <span key={status}>
                {" "}
                • {registrationLabels[status]} {registrationCounts[status]}
              </span>
            ))}
          </p>
        ) : null}
        {arrivalCounts && arrivalAvailable ? (
          <p className="break-words text-sm text-text-muted">
            รายงานตัวตามคำค้นและตัวกรองใบสมัคร: {arrivalCounts.total} รายการ •
            รายงานตัวแล้ว {arrivalCounts.checked_in} • ยังไม่รายงานตัว{" "}
            {arrivalCounts.not_checked_in}
          </p>
        ) : query.data ? (
          <p className="text-sm text-text-muted">{CHECK_IN_UPGRADE_MESSAGE}</p>
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
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm">
                        {registrationLabel(entry)}
                      </span>
                      {hasCheckInCapability(entry) && entry.checkInStatus ? (
                        <span
                          className={`rounded-full border px-3 py-1 text-sm ${entry.checkInStatus === "checked_in" ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-200" : "border-white/20 text-text-muted"}`}
                        >
                          {checkInLabels[entry.checkInStatus]}
                        </span>
                      ) : null}
                    </div>
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
                    {entry.approvalRequirement === "required"
                      ? "ตรวจใบสมัคร"
                      : "ดูใบสมัคร"}
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
