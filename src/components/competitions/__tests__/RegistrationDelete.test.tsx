import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ApplicationDeletePanel } from "../ApplicationDeletePanel";
import { RegistrationRecount } from "../RegistrationRecount";
import { applicationSchema } from "~/lib/competition-applications";
import { type Competition } from "~/lib/competitions";

const mockRouter = { replace: jest.fn() };
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));
const mockDelete = jest.fn();
const mockRecount = jest.fn();
const mockInvalidateApplications = jest.fn();
const mockInvalidateEvent = jest.fn();
jest.mock("~/utils/api", () => ({
  api: {
    useUtils: () => ({
      competitions: {
        applications: { invalidate: mockInvalidateApplications },
        get: { invalidate: mockInvalidateEvent },
      },
    }),
    competitions: {
      deleteApplication: {
        useMutation: () => ({ mutateAsync: mockDelete, isPending: false }),
      },
      recountRegistrations: {
        useMutation: () => ({ mutateAsync: mockRecount, isPending: false }),
      },
    },
  },
}));
const event = { _id: "event1", _rev: "event-rev1" } as Competition;
const entry = applicationSchema.parse({
  _id: "entry1",
  _rev: "registration-rev1",
  name: "เจ้าทุยทดสอบ",
  microchip: "chip1",
  approval: null,
});
const REASON = "สมัครทดสอบระบบ ไม่ใช่ผู้สมัครจริง";
beforeEach(() => {
  jest.clearAllMocks();
  let sequence = 0;
  Object.defineProperty(global.crypto, "randomUUID", {
    configurable: true,
    value: () =>
      `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
  });
  jest.spyOn(window, "confirm").mockReturnValue(true);
});

describe("delete application", () => {
  const panel = (reload = jest.fn()) =>
    render(
      <ApplicationDeletePanel event={event} entry={entry} reload={reload} />,
    );
  it("needs a meaningful reason before the delete button is usable", () => {
    panel();
    const action = screen.getByRole("button", { name: "ลบใบสมัครนี้" });
    expect(action).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/เหตุผลที่ลบ/), {
      target: { value: "  สั้นไป  " },
    });
    expect(action).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/เหตุผลที่ลบ/), {
      target: { value: REASON },
    });
    expect(action).toBeEnabled();
  });
  it("does nothing when the operator cancels the confirmation", () => {
    (window.confirm as jest.Mock).mockReturnValue(false);
    panel();
    fireEvent.change(screen.getByLabelText(/เหตุผลที่ลบ/), {
      target: { value: REASON },
    });
    fireEvent.click(screen.getByRole("button", { name: "ลบใบสมัครนี้" }));
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining('"เจ้าทุยทดสอบ" (ไมโครชิพ chip1)'),
    );
    expect(mockDelete).not.toHaveBeenCalled();
  });
  it("sends both revisions and the trimmed reason, then returns to the refreshed list", async () => {
    mockDelete.mockResolvedValue({
      registrationId: "entry1",
      previousCount: 2,
      registrationCount: 1,
    });
    panel();
    fireEvent.change(screen.getByLabelText(/เหตุผลที่ลบ/), {
      target: { value: `  ${REASON}  ` },
    });
    fireEvent.click(screen.getByRole("button", { name: "ลบใบสมัครนี้" }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalled());
    expect(mockDelete).toHaveBeenCalledWith({
      id: "event1",
      registrationId: "entry1",
      expectedRevision: "event-rev1",
      registrationRevision: "registration-rev1",
      reason: REASON,
      operationId: "00000000-0000-4000-8000-000000000001",
    });
    expect(mockInvalidateApplications).toHaveBeenCalledWith({ id: "event1" });
    expect(mockInvalidateEvent).toHaveBeenCalledWith({ id: "event1" });
    expect(mockRouter.replace).toHaveBeenCalledWith(
      "/dashboard/competitions/event1/applications?deleted=1",
    );
  });
  it("reuses the operation id when the same delete is retried after a network failure", async () => {
    mockDelete
      .mockRejectedValueOnce(new Error("ติดต่อระบบไม่สำเร็จ"))
      .mockResolvedValueOnce({
        registrationId: "entry1",
        previousCount: 1,
        registrationCount: 0,
      });
    panel();
    fireEvent.change(screen.getByLabelText(/เหตุผลที่ลบ/), {
      target: { value: REASON },
    });
    fireEvent.click(screen.getByRole("button", { name: "ลบใบสมัครนี้" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ติดต่อระบบไม่สำเร็จ",
    );
    fireEvent.click(screen.getByRole("button", { name: "ลบใบสมัครนี้" }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(2));
    const ids = mockDelete.mock.calls.map(
      ([input]: [{ operationId: string }]) => input.operationId,
    );
    expect(ids[0]).toBe(ids[1]);
  });
  it("stops on a conflict and offers to reload the latest data", async () => {
    const reload = jest.fn().mockResolvedValue(undefined);
    mockDelete.mockRejectedValue(
      Object.assign(new Error("ข้อมูลถูกแก้ไขแล้ว"), {
        data: { code: "CONFLICT" },
      }),
    );
    panel(reload);
    fireEvent.change(screen.getByLabelText(/เหตุผลที่ลบ/), {
      target: { value: REASON },
    });
    fireEvent.click(screen.getByRole("button", { name: "ลบใบสมัครนี้" }));
    const again = await screen.findByRole("button", {
      name: "โหลดข้อมูลล่าสุด",
    });
    expect(screen.getByRole("button", { name: "ลบใบสมัครนี้" })).toBeDisabled();
    fireEvent.click(again);
    expect(reload).toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

describe("recount registrations", () => {
  it("reports a corrected count and refreshes the event", async () => {
    mockRecount.mockResolvedValue({
      previousCount: 2,
      registrationCount: 0,
      changed: true,
    });
    render(<RegistrationRecount event={event} />);
    fireEvent.click(
      screen.getByRole("button", { name: "ตรวจนับผู้สมัครใหม่" }),
    );
    expect(
      await screen.findByText(
        "ปรับจำนวนผู้สมัครจาก 2 เป็น 0 รายการแล้ว ตอนนี้แก้รุ่นและกติกาได้ตามปกติ",
      ),
    ).toBeInTheDocument();
    expect(mockRecount).toHaveBeenCalledWith({
      id: "event1",
      expectedRevision: "event-rev1",
      operationId: "00000000-0000-4000-8000-000000000001",
    });
    expect(mockInvalidateEvent).toHaveBeenCalledWith({ id: "event1" });
  });
  it("says so when the count is already correct", async () => {
    mockRecount.mockResolvedValue({
      previousCount: 3,
      registrationCount: 3,
      changed: false,
    });
    render(<RegistrationRecount event={event} />);
    fireEvent.click(
      screen.getByRole("button", { name: "ตรวจนับผู้สมัครใหม่" }),
    );
    expect(
      await screen.findByText("จำนวนผู้สมัครถูกต้องแล้ว (3 รายการ)"),
    ).toBeInTheDocument();
  });
  it("shows the source message while registrations are still syncing", async () => {
    mockRecount.mockRejectedValue(
      Object.assign(
        new Error("ข้อมูลผู้สมัครกำลังอัปเดต กรุณาลองตรวจนับอีกครั้ง"),
        { data: { code: "CONFLICT" } },
      ),
    );
    render(<RegistrationRecount event={event} />);
    fireEvent.click(
      screen.getByRole("button", { name: "ตรวจนับผู้สมัครใหม่" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ข้อมูลผู้สมัครกำลังอัปเดต",
    );
  });
});
