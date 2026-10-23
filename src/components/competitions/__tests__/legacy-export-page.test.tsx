import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import EventExport from "~/pages/dashboard/event-export";
import { toast } from "react-hot-toast";

const mockEvents = jest.fn();
const mockExcel = jest.fn();
const mockDocx = jest.fn();
jest.mock("~/utils/api", () => ({
  api: {
    sanity: {
      getEventsForExport: { useQuery: () => mockEvents() as unknown },
      exportEventData: {
        useMutation: () => ({ mutateAsync: mockExcel, isPending: false }),
      },
      exportEventDataToDocx: {
        useMutation: () => ({ mutateAsync: mockDocx, isPending: false }),
      },
    },
  },
}));
jest.mock("react-hot-toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
const mockCreateUrl = jest.fn();
const mockRevokeUrl = jest.fn();
let click: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  mockEvents.mockReturnValue({
    data: {
      success: true,
      data: [
        { _id: "event.one", title: "ชื่อซ้ำ", _type: "event" },
        { _id: "event.two", title: "ชื่อซ้ำ", _type: "event" },
      ],
    },
    isLoading: false,
  });
  Object.defineProperty(window.URL, "createObjectURL", {
    configurable: true,
    value: mockCreateUrl.mockReturnValue("blob:download"),
  });
  Object.defineProperty(window.URL, "revokeObjectURL", {
    configurable: true,
    value: mockRevokeUrl,
  });
  click = jest
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => undefined);
});
afterEach(() => click.mockRestore());

it("preserves ID selection and native XLSX/DOCX downloads while displaying age warnings", async () => {
  const warnings = [
    "ไม่มีอายุที่บันทึกไว้ คำนวณจากวันตัดอายุของงาน (1 รายการ)",
    "อายุไม่ถูกต้อง ต้องตรวจสอบ (1 รายการ)",
  ];
  const data = {
    buffer: btoa("PK synthetic bytes"),
    filename: "event.one.xlsx",
    recordCount: 3,
    sheetCount: 3,
    fileCount: 3,
    isCompressed: false,
    originalSize: 18,
    compressedSize: 18,
    warnings,
  };
  mockExcel.mockResolvedValue({ success: true, data });
  mockDocx.mockResolvedValue({
    success: true,
    data: { ...data, filename: "event.one.zip" },
  });
  render(<EventExport />);
  fireEvent.change(screen.getByRole("combobox", { name: "Select Event" }), {
    target: { value: "event.one" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Export to Excel" }));
  await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
  expect(mockExcel).toHaveBeenCalledWith({ eventId: "event.one" });
  const blob = (mockCreateUrl.mock.calls as unknown[][])[0]?.[0] as Blob;
  expect(blob.type).toBe(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  expect(blob.size).toBe(18);
  expect(screen.getByRole("status")).toHaveTextContent(warnings[0]!);
  expect(mockRevokeUrl).toHaveBeenCalledWith("blob:download");
  fireEvent.click(screen.getByRole("button", { name: "Export to DOCX" }));
  await waitFor(() => expect(click).toHaveBeenCalledTimes(2));
  expect(mockDocx).toHaveBeenCalledWith({ eventId: "event.one" });
  expect(((mockCreateUrl.mock.calls as unknown[][])[1]?.[0] as Blob).type).toBe(
    "application/zip",
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Select Event" }), {
    target: { value: "event.two" },
  });
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
it("shows source failure without downloading an empty success or showing success feedback", async () => {
  mockExcel.mockResolvedValue({
    success: false,
    data: null,
    error: "ส่งออกข้อมูลไม่สำเร็จ",
  });
  render(<EventExport />);
  fireEvent.change(screen.getByRole("combobox", { name: "Select Event" }), {
    target: { value: "event.two" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Export to Excel" }));
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith("ส่งออกข้อมูลไม่สำเร็จ"),
  );
  expect(mockExcel).toHaveBeenCalledWith({ eventId: "event.two" });
  expect(mockCreateUrl).not.toHaveBeenCalled();
  expect(toast.success).not.toHaveBeenCalled();
});
it("surfaces legacy picker failure envelopes instead of silently displaying an empty picker", () => {
  mockEvents.mockReturnValue({
    data: { success: false, data: [], error: "Failed" },
    isLoading: false,
  });
  render(<EventExport />);
  expect(
    screen.getByText("โหลดรายการงานไม่สำเร็จ กรุณารีเฟรชหน้าแล้วลองอีกครั้ง"),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Export to Excel" }),
  ).toBeDisabled();
});
