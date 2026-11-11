import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { EditProof } from "../EditStatus";

type Props = ComponentProps<typeof EditProof>;
type Job = Props["job"];
const checkedAt = "2026-11-11T05:01:11.000Z";
const base = {
  id: "safe-operation",
  state: "DRAFT",
  reason: null,
  environment: "production",
  canResume: true,
  canCancel: true,
  actualToken: "101",
  microchip: "999000000000101",
  fields: ["microchip"],
  patch: { microchip: "999000000000102" },
  steps: [],
  progress: {
    name: "ตัวอย่าง ก",
    before: { microchip: "999000000000101" },
    phases: [2000, 3000, 1000],
    currentPhase: null,
    checkedAt,
  },
};
const confirmed = [
  { kind: "batch", state: "CONFIRMED", hash: "hash-batch" },
  { kind: "uri", state: "CONFIRMED", hash: "hash-uri" },
];
function job(overrides: Record<string, unknown> = {}): Job {
  return { ...base, ...overrides } as unknown as Job;
}
const view = (j: Job, overrides: Partial<Props> = {}) =>
  render(
    <EditProof
      job={j}
      busy={false}
      onResume={jest.fn()}
      onDone={jest.fn()}
      onCancel={jest.fn()}
      {...overrides}
    />,
  );
test("completion shows verified values, one continuation and no support action", () => {
  const done = jest.fn();
  view(job({ state: "COMPLETED", canCancel: false, steps: confirmed }), {
    onDone: done,
  });
  expect(
    screen.getByRole("heading", { name: "แก้ไขไมโครชิปสำเร็จ" }),
  ).toBeVisible();
  expect(screen.getByText("999000000000101")).toBeVisible();
  expect(screen.getByText("999000000000102")).toBeVisible();
  expect(screen.queryByRole("button", { name: /ผู้ดูแล/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "แก้ไขข้อมูลอื่น" }));
  expect(done).toHaveBeenCalledTimes(1);
});
test("no files or transaction URLs leak into the operator report, copy failure permits manual copy", async () => {
  const retry = {
    attempts: 4,
    exhausted: true,
    nextAt: null,
    deadlineAt: checkedAt,
  };
  view(
    job({
      state: "RECOVERY_REQUIRED",
      reason: "PUBLIC_ASSET_READBACK_PENDING",
      canCancel: false,
      steps: confirmed,
      fields: ["image"],
      patch: { image: "https://files.invalid/owner/source.jpg?secret=test" },
      progress: {
        ...base.progress,
        fileRetry: retry,
        readback: {
          asset: "image",
          problem: "content_differs",
          source: "public",
        },
      },
    }),
  );
  expect(
    screen.getByText(/รูปควายที่อ่านจากหน้าสาธารณะยังไม่ตรง/),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: /ทำต่อ|ตรวจไฟล์อีกครั้ง/ }),
  ).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "คัดลอกข้อมูลส่งผู้ดูแล" }),
  );
  const report = await screen.findByRole<HTMLTextAreaElement>("textbox", {
    name: "ข้อมูลส่งผู้ดูแล",
  });
  expect(report.value).toContain("safe-operation");
  expect(report.value).toContain("hash-uri");
  expect(report.value).not.toContain("files.invalid");
  expect(report.value).not.toContain("secret");
});
test("automatic file retries show measured server times and no manual action", () => {
  view(
    job({
      state: "RECOVERY_REQUIRED",
      reason: "PUBLIC_ASSET_READBACK_PENDING",
      canCancel: false,
      steps: confirmed,
      progress: {
        ...base.progress,
        fileRetry: {
          attempts: 1,
          exhausted: false,
          nextAt: checkedAt,
          deadlineAt: checkedAt,
        },
        readback: {
          asset: "metadata",
          problem: "unavailable",
          source: "origin",
        },
      },
    }),
  );
  expect(
    screen.getByText(/ยังอ่านไฟล์ข้อมูลทะเบียนจากที่เก็บต้นฉบับไม่ได้/),
  ).toBeVisible();
  expect(screen.getByText(/กำหนดตรวจครั้งถัดไป/)).toBeVisible();
  expect(screen.queryByRole("button")).toBeNull();
  expect(
    within(screen.getByRole("list")).getAllByText("ผ่านแล้ว", { exact: false }),
  ).toHaveLength(2);
});
test("receipted revert identifies the failed step; broadcast uncertainty never claims failure", () => {
  const page = view(
    job({
      state: "NEEDS_REVIEW",
      reason: "TRANSACTION_REVERTED",
      canCancel: false,
      steps: [
        confirmed[0],
        { kind: "uri", state: "REVERTED", hash: "hash-uri" },
      ],
    }),
  );
  expect(
    screen.getByRole("heading", {
      name: "เชนปฏิเสธขั้น “ปรับลิงก์ไฟล์ทะเบียน”",
    }),
  ).toBeVisible();
  page.rerender(
    <EditProof
      job={job({
        state: "BROADCAST_UNKNOWN",
        canCancel: false,
        steps: [confirmed[0]],
        progress: {
          ...base.progress,
          unknownRetry: { exhausted: true, attempts: 4 },
        },
      })}
      busy={false}
      onResume={jest.fn()}
    />,
  );
  expect(
    screen.getByRole("heading", { name: "ยังยืนยันผลการส่งธุรกรรมไม่ได้" }),
  ).toBeVisible();
  expect(screen.getByText(/ยืนยันขั้น “แก้ข้อมูลควาย” แล้ว/)).toBeVisible();
});
test("absent baseline on a name edit is declared, unavailable duration is not invented", () => {
  view(
    job({
      state: "DRAFT",
      fields: ["name"],
      patch: { name: "ชื่อใหม่" },
      progress: null,
    }),
  );
  expect(screen.getByText("ไม่มีข้อมูลยืนยัน")).toBeVisible();
  expect(screen.queryByText(/เวลาทำงานที่วัดได้/)).toBeNull();
});
test.each([
  ["DRAFT", "มีคำขอแก้ไขเดิมค้างอยู่"],
  ["READY", "ตรวจคำขอแล้ว พร้อมบันทึกบนเชน"],
  ["SIGNING", "กำลังลงนามธุรกรรม"],
  ["CHAIN_PENDING", "กำลังรอบล็อกเชนยืนยัน"],
  ["CHAIN_STEPS", "กำลังตรวจขั้นตอนบนบล็อกเชน"],
  ["BROADCAST_UNKNOWN", "กำลังตรวจผลธุรกรรมเดิม"],
  ["PROJECTING", "กำลังเผยแพร่ไฟล์และปรับทะเบียน"],
  ["VERIFYING", "กำลังตรวจข้อมูลที่เผยแพร่"],
  ["RETRYABLE", "รายการหยุดรอดำเนินการต่อ"],
  ["RECOVERY_REQUIRED", "รายการหยุดรอดำเนินการต่อ"],
  ["NEEDS_REVIEW", "รายการหยุดรอตรวจสอบ"],
  ["CANCELLED", "ยกเลิกคำขอแล้ว"],
  ["COMPLETED", "แก้ไขไมโครชิปสำเร็จ"],
])("presents %s in operator language", (state, title) => {
  view(job({ state }));
  expect(screen.getByRole("status")).toBeVisible();
  expect(screen.getByRole("heading", { name: title })).toBeVisible();
});
test("explains a verified conflicting token only when the diagnostic supplies it", () => {
  view(job({ state: "DRAFT" }), {
    feedback: {
      code: "MICROCHIP_ALREADY_BOUND",
      stage: "identity",
      reason: "ชิป 999000000000102 ใช้อยู่กับตัวอย่าง ข #102",
      nextAction: "contact_support",
      outcome: "not_started",
    },
  });
  expect(screen.getByText(/ใช้อยู่กับตัวอย่าง ข #102/)).toBeVisible();
  expect(
    screen.getByRole("button", { name: "กลับไปแก้ค่าที่กรอก" }),
  ).toBeEnabled();
  expect(screen.queryByRole("button", { name: /ผู้ดูแล/ })).toBeNull();
});
