import { useState } from "react";
import { getEligibleCompetitionClasses } from "~/lib/competition-classes";
import { previewCompetitionAge } from "~/lib/competition-age-preview";
import { formatDay } from "~/lib/competitions";
import { control } from "./Workspace";

export function ClassAgeTester({
  cutoff,
  royal,
  values,
}: {
  cutoff?: string;
  royal: boolean;
  values: string[];
}) {
  const [birthday, setBirthday] = useState("");
  const [albino, setAlbino] = useState(false);
  const age = previewCompetitionAge(birthday, cutoff, royal && albino);
  const eligible =
    age === null ? [] : getEligibleCompetitionClasses(age, values);
  return (
    <section
      className="glass-card min-w-0 space-y-4 rounded-3xl p-5"
      aria-label="ทดลองคำนวณรุ่นจากวันเกิด"
    >
      <h2 className="text-lg font-semibold">ทดลองคำนวณรุ่นจากวันเกิด</h2>
      <p className="text-sm text-text-muted">
        ใช้วันตัดอายุ {formatDay(cutoff)} • คงการปัดเดือนขึ้น: 9 เดือน 1 วัน =
        10 เดือน สมัครได้เฉพาะช่วงที่ตรงกัน
      </p>
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <label className="min-w-0 space-y-2 text-sm">
          วันเกิดสำหรับทดลอง
          <input
            className={control}
            type="date"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
          />
        </label>
        {royal ? (
          <label className="min-w-0 space-y-2 text-sm">
            สีสำหรับทดลอง
            <select
              className={control}
              value={albino ? "albino" : "black"}
              onChange={(e) => setAlbino(e.target.value === "albino")}
            >
              <option value="black">ดำ</option>
              <option value="albino">เผือก</option>
            </select>
          </label>
        ) : null}
      </div>
      {royal ? (
        <p className="text-sm text-text-muted">
          Royal สีเผือกคงกติกาเดิม: ใช้วันเกิดย้อนหลัง 1 วันในการคำนวณ
        </p>
      ) : null}
      <div aria-live="polite" className="space-y-2">
        {!cutoff ? (
          <p>กรุณาระบุวันที่ใช้ตัดอายุควายก่อนทดลอง</p>
        ) : birthday && age === null ? (
          <p>วันเกิดต้องถูกต้องและไม่หลังวันตัดอายุ</p>
        ) : age !== null ? (
          <>
            <p>อายุที่ใช้จัดรุ่น: {age} เดือน</p>
            {eligible.length ? (
              <ul className="space-y-2">
                {eligible.map((name) => (
                  <li className="break-words" key={name}>
                    {name}
                  </li>
                ))}
              </ul>
            ) : (
              <p>ไม่พบรุ่นที่เข้าเกณฑ์</p>
            )}
            <p className="text-sm text-text-muted">
              รุ่นพิเศษยังต้องให้เจ้าหน้าที่ตรวจฟันและคุณสมบัติอื่น
              อายุของลูกตามไม่ใช่อายุแม่
            </p>
          </>
        ) : (
          <p>เลือกวันเกิดเพื่อดูรุ่นที่เข้าเกณฑ์</p>
        )}
      </div>
    </section>
  );
}
