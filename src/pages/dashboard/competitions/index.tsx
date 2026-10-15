import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "~/utils/api";
import { useAuth } from "~/context/auth.context";
import {
  Workspace,
  Status,
  Alert,
  control,
  button,
  primary,
} from "~/components/competitions/Workspace";
import {
  lifecycleLabels,
  registrationLabels,
  formatDay,
  type CompetitionFilters,
} from "~/lib/competitions";
export default function Competitions() {
  const { isAuth } = useAuth();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<CompetitionFilters>({
    search: "",
    page: 1,
    pageSize: 12,
  });
  useEffect(() => {
    const t = setTimeout(
      () => setFilters((v) => ({ ...v, search, page: 1 })),
      300,
    );
    return () => clearTimeout(t);
  }, [search]);
  const query = api.competitions.list.useQuery(filters, { enabled: isAuth });
  const setFilter = (
    k: "lifecycle" | "registrationStatus" | "eventType",
    v: string,
  ) => setFilters((f) => ({ ...f, [k]: v || undefined, page: 1 }));
  return (
    <Workspace title="จัดการการแข่งขัน">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-2xl text-text-muted">
          สร้างงาน ตั้งค่ารุ่น และควบคุมการรับสมัคร • วันที่ทั้งหมดใช้เวลาไทย
        </p>
        <Link href="/dashboard/competitions/new" className={primary}>
          สร้างงานแข่งขัน
        </Link>
      </div>
      <section
        aria-label="ค้นหาและกรองงาน"
        className="glass-card grid gap-4 rounded-3xl p-4 md:grid-cols-2 lg:grid-cols-4"
      >
        <label className="space-y-2 text-sm">
          ค้นหาชื่องาน
          <input
            className={control}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="พิมพ์ชื่องาน"
            type="search"
          />
        </label>
        <label className="space-y-2 text-sm">
          สถานะงาน
          <select
            className={control}
            value={filters.lifecycle ?? ""}
            onChange={(e) => setFilter("lifecycle", e.target.value)}
          >
            <option value="">ทุกสถานะงาน</option>
            {Object.entries(lifecycleLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm">
          การรับสมัคร
          <select
            className={control}
            value={filters.registrationStatus ?? ""}
            onChange={(e) => setFilter("registrationStatus", e.target.value)}
          >
            <option value="">ทุกสถานะรับสมัคร</option>
            {Object.entries(registrationLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm">
          ประเภทฟอร์ม
          <select
            className={control}
            value={filters.eventType ?? ""}
            onChange={(e) => setFilter("eventType", e.target.value)}
          >
            <option value="">ทุกประเภท</option>
            <option value="normal">ทั่วไป</option>
            <option value="royal">Royal</option>
          </select>
        </label>
        <label className="space-y-2 text-sm">
          วันเริ่มงานตั้งแต่
          <input
            type="date"
            className={control}
            value={filters.startFrom ?? ""}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                startFrom: e.target.value || undefined,
                page: 1,
              }))
            }
          />
        </label>
        <label className="space-y-2 text-sm">
          วันเริ่มงานถึง
          <input
            type="date"
            className={control}
            value={filters.startTo ?? ""}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                startTo: e.target.value || undefined,
                page: 1,
              }))
            }
          />
        </label>
        <button
          className={button}
          onClick={() => {
            setSearch("");
            setFilters({ search: "", page: 1, pageSize: 12 });
          }}
        >
          ล้างตัวกรอง
        </button>
      </section>
      {query.isPending ? (
        <p role="status">กำลังโหลดรายการงาน…</p>
      ) : query.error ? (
        <>
          <Alert error>{query.error.message}</Alert>
          <button className={button} onClick={() => void query.refetch()}>
            ลองโหลดอีกครั้ง
          </button>
        </>
      ) : query.data ? (
        <>
          <p aria-live="polite" className="tabular-nums">
            พบ {query.data.total} งาน {query.isFetching ? "• กำลังอัปเดต…" : ""}
          </p>
          {query.data.items.length === 0 ? (
            <Alert>
              ไม่พบงานที่ตรงกับตัวกรอง ลองล้างตัวกรองหรือสร้างงานใหม่
            </Alert>
          ) : (
            <div className="grid min-w-0 gap-6 lg:grid-cols-2">
              {query.data.items.map((item) => (
                <article
                  key={item._id}
                  className="glass-card min-w-0 space-y-4 rounded-3xl p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h2 className="min-w-0 break-words text-xl font-semibold">
                      {item.title}
                    </h2>
                    <span className="text-sm text-text-muted">
                      {item.eventType === "royal"
                        ? "Royal"
                        : item.eventType === "normal"
                          ? "ทั่วไป"
                          : "ยังไม่ระบุประเภท"}
                    </span>
                  </div>
                  <Status event={item} />
                  <p className="text-text-muted">
                    วันจัดงาน {formatDay(item.startAt)} –{" "}
                    {formatDay(item.endAt)}
                  </p>
                  <p className="text-text-muted">
                    รับสมัครถึง {formatDay(item.registrationDeadline)}{" "}
                    (สิ้นวันไทย)
                  </p>
                  <p className="tabular-nums">
                    ผู้สมัคร {item.registrationCount} รายการ
                  </p>
                  {item.policy.warnings.length > 0 ? (
                    <Alert>
                      ข้อมูลเดิมมีจุดที่ต้องตรวจ {item.policy.warnings.length}{" "}
                      รายการ — เปิดงานเพื่อดูรายละเอียด
                    </Alert>
                  ) : null}
                  <Link
                    className={button}
                    href={`/dashboard/competitions/${encodeURIComponent(item._id)}`}
                    aria-label={`จัดการ ${item.title}`}
                  >
                    จัดการงาน
                  </Link>
                </article>
              ))}
            </div>
          )}
          <nav
            aria-label="เปลี่ยนหน้ารายการงาน"
            className="flex flex-wrap items-center justify-center gap-4"
          >
            <button
              className={button}
              disabled={filters.page === 1 || query.isFetching}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            >
              ก่อนหน้า
            </button>
            <span className="tabular-nums">
              หน้า {filters.page} /{" "}
              {Math.max(1, Math.ceil(query.data.total / filters.pageSize))}
            </span>
            <button
              className={button}
              disabled={
                filters.page * filters.pageSize >= query.data.total ||
                query.isFetching
              }
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            >
              ถัดไป
            </button>
          </nav>
        </>
      ) : null}
    </Workspace>
  );
}
