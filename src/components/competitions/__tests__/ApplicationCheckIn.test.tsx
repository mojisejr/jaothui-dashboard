import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApplicationCheckIn } from "../ApplicationCheckIn";
import { applicationSchema } from "~/lib/competition-applications";

const mockConfirm = jest.fn();
const mockUndo = jest.fn();
const mockInvalidateList = jest.fn();
const mockInvalidateDetail = jest.fn();
const mockRouter = {
  beforePopState: jest.fn(),
  replace: jest.fn(),
  asPath: "/dashboard/competitions/event1/applications/entry1",
};
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));
jest.mock("~/utils/api", () => ({
  api: {
    useUtils: () => ({
      competitions: {
        applications: { invalidate: mockInvalidateList },
        application: { invalidate: mockInvalidateDetail },
      },
    }),
    competitions: {
      checkIn: { useMutation: () => ({ mutateAsync: mockConfirm }) },
      undoCheckIn: { useMutation: () => ({ mutateAsync: mockUndo }) },
    },
  },
}));
const entry = () =>
  applicationSchema.parse({
    _id: "entry1",
    _rev: "r1",
    name: "เจ้าทุย",
    type: "รุ่นหนึ่ง",
    microchip: "000123",
    registrationPolicyVersion: 1,
    approvalRequirement: "not_required",
    registrationStatus: "registered",
    checkInVersion: 1,
    checkInStatus: "not_checked_in",
    checkedInAt: null,
    checkedInBy: null,
    checkInEligibility: { eligible: true, reason: null },
    checkInHistory: [],
  });
const props = () => ({
  id: "event1",
  entry: entry(),
  busy: false,
  onBusy: jest.fn(),
  onUpdated: jest.fn(),
  reload: jest.fn(),
});
beforeEach(() => {
  jest.clearAllMocks();
  let sequence = 0;
  Object.defineProperty(global.crypto, "randomUUID", {
    configurable: true,
    value: () =>
      `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
  });
});
it("does not confirm on opening and requires explicit confirmation, then invalidates list and detail", async () => {
  const inputs = props();
  const next = {
    ...inputs.entry,
    _rev: "r2",
    checkInStatus: "checked_in",
    checkedInAt: "2026-10-30T08:00:00Z",
    checkedInBy: "dashboard-shared",
  };
  mockConfirm.mockResolvedValue(next);
  render(<ApplicationCheckIn {...inputs} />);
  expect(mockConfirm).not.toHaveBeenCalled();
  expect(screen.getByText(/รุ่น รุ่นหนึ่ง • ไมโครชิพ 000123/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันรายงานตัว" }));
  await screen.findByText("บันทึกการรายงานตัวแล้ว");
  expect(mockConfirm).toHaveBeenCalledWith(
    expect.objectContaining({
      id: "event1",
      registrationId: "entry1",
      expectedRevision: "r1",
    }),
  );
  expect(inputs.onUpdated).toHaveBeenCalledWith(next);
  expect(mockInvalidateList).toHaveBeenCalledWith({ id: "event1" });
  expect(mockInvalidateDetail).toHaveBeenCalledWith({
    id: "event1",
    registrationId: "entry1",
  });
});
it("blocks eligibility failures and never offers a usable confirmation", () => {
  const inputs = props();
  inputs.entry.checkInEligibility = {
    eligible: false,
    reason: "ยังไม่ถึงวันจัดงาน",
  };
  render(<ApplicationCheckIn {...inputs} />);
  expect(screen.getByText("ยังไม่ถึงวันจัดงาน")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "ยืนยันรายงานตัว" }),
  ).toBeDisabled();
  expect(mockConfirm).not.toHaveBeenCalled();
});
it("requires a substantive undo reason and preserves the same retry payload after uncertain save", async () => {
  const inputs = props();
  inputs.entry.checkInStatus = "checked_in";
  inputs.entry.checkedInAt = "2026-10-30T08:00:00Z";
  inputs.entry.checkedInBy = "dashboard-shared";
  inputs.entry.checkInHistory = [
    {
      action: "confirm",
      at: "2026-10-30T08:00:00Z",
      actor: "dashboard-shared",
      reason: null,
    },
  ];
  mockUndo.mockRejectedValue(new Error("การเชื่อมต่อขัดข้อง"));
  render(<ApplicationCheckIn {...inputs} />);
  expect(
    screen.queryByRole("button", { name: "ยืนยันรายงานตัว" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "ยกเลิกการรายงานตัว" }));
  fireEvent.click(
    screen.getByRole("button", { name: "ยืนยันยกเลิกการรายงานตัว" }),
  );
  expect(
    await screen.findByText(/กรุณาระบุเหตุผลยกเลิกอย่างน้อย/),
  ).toBeVisible();
  expect(mockUndo).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("เหตุผลยกเลิกการรายงานตัว"), {
    target: { value: "ตรวจและเลือกใบสมัครผิดรุ่น" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "ยืนยันยกเลิกการรายงานตัว" }),
  );
  await screen.findByText(/การเชื่อมต่อขัดข้อง/);
  fireEvent.click(
    screen.getByRole("button", { name: "ยืนยันยกเลิกการรายงานตัว" }),
  );
  await waitFor(() => expect(mockUndo).toHaveBeenCalledTimes(2));
  expect(mockUndo.mock.calls[0]).toEqual(mockUndo.mock.calls[1]);
  expect(screen.getByLabelText("เหตุผลยกเลิกการรายงานตัว")).toHaveValue(
    "ตรวจและเลือกใบสมัครผิดรุ่น",
  );
  expect(inputs.onUpdated).not.toHaveBeenCalled();
});
it("stops duplicate clicks while the first confirmation is pending", async () => {
  let complete!: (value: ReturnType<typeof entry>) => void;
  mockConfirm.mockReturnValue(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  const inputs = props();
  render(<ApplicationCheckIn {...inputs} />);
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันรายงานตัว" }));
  fireEvent.click(screen.getByRole("button", { name: "กำลังบันทึก…" }));
  expect(mockConfirm).toHaveBeenCalledTimes(1);
  complete({
    ...inputs.entry,
    checkInStatus: "checked_in",
    checkedInAt: "2026-10-30T08:00:00Z",
    checkedInBy: "dashboard-shared",
  });
  await screen.findByText("บันทึกการรายงานตัวแล้ว");
});
it("requires refresh on revision conflict and retries using the refreshed revision", async () => {
  const inputs = props();
  mockConfirm
    .mockRejectedValueOnce(
      Object.assign(new Error("ข้อมูลใหม่แล้ว"), {
        data: { code: "CONFLICT" },
      }),
    )
    .mockResolvedValue({ ...inputs.entry, _rev: "r3" });
  inputs.reload.mockResolvedValue({ ...inputs.entry, _rev: "r2" });
  const view = render(<ApplicationCheckIn {...inputs} />);
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันรายงานตัว" }));
  await screen.findByText(/ข้อมูลใหม่แล้ว/);
  expect(
    screen.getByRole("button", { name: "ยืนยันรายงานตัว" }),
  ).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "โหลดสถานะรายงานตัวล่าสุด" }),
  );
  await screen.findByText("โหลดสถานะล่าสุดแล้ว กรุณาตรวจข้อมูลก่อนยืนยัน");
  view.rerender(
    <ApplicationCheckIn {...inputs} entry={{ ...inputs.entry, _rev: "r2" }} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันรายงานตัว" }));
  await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(2));
  expect((mockConfirm.mock.calls as unknown[][])[1]?.[0]).toMatchObject({
    expectedRevision: "r2",
  });
});
it("fails closed when the source omitted the check-in contract", () => {
  const inputs = props();
  delete inputs.entry.checkInVersion;
  render(<ApplicationCheckIn {...inputs} />);
  expect(screen.getByText(/ระบบต้นทางยังไม่รองรับการรายงานตัว/)).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "ยืนยันรายงานตัว" }),
  ).not.toBeInTheDocument();
});
it("shows the returned not-reported state when a lost confirmation is replayed after another device undid it", async () => {
  const inputs = props();
  const latest = { ...inputs.entry, _rev: "after-undo" };
  mockConfirm
    .mockRejectedValueOnce(new Error("การเชื่อมต่อขัดข้อง"))
    .mockResolvedValueOnce(latest);
  render(<ApplicationCheckIn {...inputs} />);
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันรายงานตัว" }));
  await screen.findByText(/การเชื่อมต่อขัดข้อง/);
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันรายงานตัว" }));
  expect(
    await screen.findByText(
      "สถานะล่าสุด: ยังไม่รายงานตัว กรุณาตรวจประวัติก่อนดำเนินการอีกครั้ง",
    ),
  ).toBeVisible();
  expect(screen.queryByText("บันทึกการรายงานตัวแล้ว")).not.toBeInTheDocument();
  expect(mockConfirm.mock.calls[0]).toEqual(mockConfirm.mock.calls[1]);
  expect(inputs.onUpdated).toHaveBeenCalledWith(latest);
});
it("shows the returned reported state when a lost undo is replayed after another device confirmed again", async () => {
  const inputs = props();
  inputs.entry.checkInStatus = "checked_in";
  inputs.entry.checkedInAt = "2026-10-30T08:00:00Z";
  inputs.entry.checkedInBy = "dashboard-shared";
  const latest = {
    ...inputs.entry,
    _rev: "after-reconfirm",
    checkedInAt: "2026-10-30T09:00:00Z",
  };
  mockUndo
    .mockRejectedValueOnce(new Error("การเชื่อมต่อขัดข้อง"))
    .mockResolvedValueOnce(latest);
  render(<ApplicationCheckIn {...inputs} />);
  fireEvent.click(screen.getByRole("button", { name: "ยกเลิกการรายงานตัว" }));
  fireEvent.change(screen.getByLabelText("เหตุผลยกเลิกการรายงานตัว"), {
    target: { value: "เจ้าหน้าที่เลือกใบสมัครผิดรุ่น" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "ยืนยันยกเลิกการรายงานตัว" }),
  );
  await screen.findByText(/การเชื่อมต่อขัดข้อง/);
  fireEvent.click(
    screen.getByRole("button", { name: "ยืนยันยกเลิกการรายงานตัว" }),
  );
  expect(
    await screen.findByText(
      "สถานะล่าสุด: รายงานตัวแล้ว กรุณาตรวจประวัติก่อนดำเนินการอีกครั้ง",
    ),
  ).toBeVisible();
  expect(
    screen.queryByText("ยกเลิกการรายงานตัวแล้ว โดยเก็บประวัติเดิมไว้"),
  ).not.toBeInTheDocument();
  expect(mockUndo.mock.calls[0]).toEqual(mockUndo.mock.calls[1]);
  expect(inputs.onUpdated).toHaveBeenCalledWith(latest);
});
