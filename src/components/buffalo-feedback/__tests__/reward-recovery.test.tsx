import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import NewRewardPage from "~/pages/dashboard/new-reward";
const mockSave = jest.fn(),
  mockGet = jest.fn(),
  mockUpload = jest.fn(),
  mockDownload = jest.fn(),
  mockRefresh = jest.fn(),
  mockRefetch = jest.fn(),
  mockSetData = jest.fn();
let mockQueryError: unknown;
const cow = { name: "Synthetic", microchip: "999000000008001", Reward: [] };
jest.mock("~/components/layout/BaseLayout", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("~/utils/api", () => ({
  api: {
    useUtils: () => ({
      reward: { getById: { fetch: mockGet } },
      ped: { searchByMicrochip: { fetch: mockRefresh, setData: mockSetData } },
    }),
    ped: {
      searchByMicrochip: {
        useQuery: () => ({
          data: cow,
          isSuccess: true,
          error: mockQueryError,
          refetch: mockRefetch,
        }),
      },
    },
    reward: {
      addNewReward: { useMutation: () => ({ mutateAsync: mockSave }) },
    },
  },
}));
jest.mock("~/server/services/supabase/supabase", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: mockUpload,
        download: mockDownload,
        getPublicUrl: (path: string) => ({
          data: {
            publicUrl: `https://storage.test/storage/v1/object/public/slipstorage/${path}`,
          },
        }),
      }),
    },
  },
}));
let uuidCount = 0;
beforeAll(() => {
  Object.defineProperty(crypto, "randomUUID", {
    value: () =>
      `00000000-0000-4000-8000-${String(++uuidCount).padStart(12, "0")}`,
    configurable: true,
  });
  Object.defineProperty(crypto, "subtle", {
    value: { digest: async () => new Uint8Array(32).fill(1).buffer },
    configurable: true,
  });
  Object.defineProperty(Blob.prototype, "arrayBuffer", {
    value: async () => new ArrayBuffer(4),
    configurable: true,
  });
});
beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  mockQueryError = undefined;
  mockUpload.mockResolvedValue({ data: { path: "path" }, error: null });
  mockDownload.mockResolvedValue({ data: null, error: Error("absent") });
  mockGet.mockResolvedValue(null);
  mockRefresh.mockResolvedValue(cow);
  mockRefetch.mockResolvedValue({ data: cow });
  mockSave.mockImplementation(async (input: unknown) => input);
});
function fill() {
  fireEvent.change(screen.getByLabelText(/ภาพตอนรับรางวัล/), {
    target: { files: [new File(["png"], "reward.png", { type: "image/png" })] },
  });
  fireEvent.change(screen.getByLabelText("ชื่องาน"), {
    target: { value: "Event" },
  });
  fireEvent.change(screen.getByLabelText("รางวัล"), {
    target: { value: "Award" },
  });
}
test("upload success then DB failure preserves form and asset; retry same UUID saves once", async () => {
  mockSave.mockRejectedValueOnce(Error("lost response"));
  render(<NewRewardPage />);
  fill();
  fireEvent.submit(
    screen.getByRole("button", { name: "บันทึกรางวัล" }).closest("form")!,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "ตรวจสอบและดำเนินการรายการเดิม" }),
    ).toBeEnabled(),
  );
  expect(screen.getByLabelText("ชื่องาน")).toHaveValue("Event");
  expect(screen.queryByText(/บันทึกรางวัลสำเร็จแล้ว/)).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "ตรวจสอบและดำเนินการรายการเดิม" }),
  );
  await screen.findByText("บันทึกรางวัลสำเร็จแล้ว: Award");
  expect(mockUpload).toHaveBeenCalledTimes(1);
  expect(mockGet).toHaveBeenCalledTimes(1);
  const calls = mockSave.mock.calls as [
    { id: string; eventDate: Date | null },
  ][];
  expect(calls[0]![0].id).toBe(calls[1]![0].id);
  expect(calls[0]![0].eventDate).toBeNull();
});
test("lost response after commit and reload reconciles saved record without second mutation or upload", async () => {
  let saved: unknown;
  mockSave.mockImplementationOnce(async (input: unknown) => {
    saved = input;
    throw Error("network");
  });
  const first = render(<NewRewardPage />);
  fill();
  fireEvent.submit(
    screen.getByRole("button", { name: "บันทึกรางวัล" }).closest("form")!,
  );
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "ตรวจสอบและดำเนินการรายการเดิม" }),
    ).toBeEnabled(),
  );
  first.unmount();
  mockGet.mockImplementation(async () => saved);
  render(<NewRewardPage />);
  fireEvent.click(
    await screen.findByRole("button", {
      name: "ตรวจสอบและดำเนินการรายการเดิม",
    }),
  );
  await screen.findByText("บันทึกรางวัลสำเร็จแล้ว: Award");
  expect(mockSave).toHaveBeenCalledTimes(1);
  expect(mockUpload).toHaveBeenCalledTimes(1);
});
test("double click sends once; only intentional next reward creates another key", async () => {
  let release!: (value: unknown) => void;
  mockSave.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  render(<NewRewardPage />);
  fill();
  const button = screen.getByRole("button", { name: "บันทึกรางวัล" });
  fireEvent.submit(button.closest("form")!);
  fireEvent.submit(button.closest("form")!);
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
  release((mockSave.mock.calls as [unknown][])[0]![0]);
  await screen.findByText("บันทึกรางวัลสำเร็จแล้ว: Award");
  fireEvent.click(screen.getByRole("button", { name: "เพิ่มรางวัลถัดไป" }));
  fill();
  fireEvent.submit(
    screen.getByRole("button", { name: "บันทึกรางวัล" }).closest("form")!,
  );
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(2));
  const calls = mockSave.mock.calls as [{ id: string }][];
  expect(calls[0]![0].id).not.toBe(calls[1]![0].id);
});
test("completed save plus refresh failure remains saved; upload failure never saves DB", async () => {
  mockRefresh.mockRejectedValue(Error("DB read failed"));
  render(<NewRewardPage />);
  fill();
  fireEvent.submit(
    screen.getByRole("button", { name: "บันทึกรางวัล" }).closest("form")!,
  );
  await screen.findByText("บันทึกรางวัลสำเร็จแล้ว: Award");
  expect(
    screen.getByText(/บันทึกสำเร็จแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ/),
  ).toBeInTheDocument();
});
test("failed upload is visible, clears busy, retains input and cannot become saved", async () => {
  mockUpload.mockResolvedValue({ data: null, error: Error("upload failed") });
  render(<NewRewardPage />);
  fill();
  fireEvent.submit(
    screen.getByRole("button", { name: "บันทึกรางวัล" }).closest("form")!,
  );
  await screen.findByText(/ยังยืนยันการรับไฟล์ไม่ได้/);
  expect(mockSave).not.toHaveBeenCalled();
  expect(screen.getByLabelText("รางวัล")).toHaveValue("Award");
  expect(
    screen.getByRole("button", { name: "ตรวจสอบและดำเนินการรายการเดิม" }),
  ).toBeEnabled();
});

test("corrupted pending record is visible and never starts a new mutation", async () => {
  localStorage.setItem(
    "buffalo-reward-pending-v1",
    JSON.stringify({
      input: { id: "bad" },
      path: "foreign/file",
      digest: "bad",
      uploaded: true,
    }),
  );
  render(<NewRewardPage />);
  await screen.findByText(/ข้อมูลกู้คืนรางวัลในเครื่องไม่ครบ/);
  expect(mockSave).not.toHaveBeenCalled();
  expect(screen.getByLabelText("ชื่องาน")).toBeDisabled();
});

test("chosen file input remains mounted through uncertain save and resets only on next reward", async () => {
  mockSave.mockRejectedValueOnce(Error("lost response"));
  render(<NewRewardPage />);
  fill();
  const fileInput = screen.getByLabelText(/ภาพตอนรับรางวัล/);
  fireEvent.submit(
    screen.getByRole("button", { name: "บันทึกรางวัล" }).closest("form")!,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "ตรวจสอบและดำเนินการรายการเดิม" }),
    ).toBeEnabled(),
  );
  expect(screen.getByLabelText(/ภาพตอนรับรางวัล/)).toBe(fileInput);
  fireEvent.click(
    screen.getByRole("button", { name: "ตรวจสอบและดำเนินการรายการเดิม" }),
  );
  await screen.findByText("บันทึกรางวัลสำเร็จแล้ว: Award");
  fireEvent.click(screen.getByRole("button", { name: "เพิ่มรางวัลถัดไป" }));
  expect(screen.getByLabelText(/ภาพตอนรับรางวัล/)).not.toBe(fileInput);
});

test("known saved reward shows only one refresh warning and correct confirmed text", async () => {
  const readError = {
    data: {
      diagnostic: {
        code: "DATABASE_READ_FAILED",
        stage: "database_read",
        reason: "อ่านไม่สำเร็จ",
        requestId: "refresh-ref",
        outcome: "not_started",
        nextAction: "retry_read",
      },
    },
  };
  mockSave.mockImplementation(async (input: unknown) => {
    mockQueryError = readError;
    return input;
  });
  mockRefresh.mockRejectedValue(readError);
  render(<NewRewardPage />);
  fill();
  fireEvent.submit(
    screen.getByRole("button", { name: "บันทึกรางวัล" }).closest("form")!,
  );
  await screen.findByText("บันทึกรางวัลสำเร็จแล้ว: Award");
  await waitFor(() =>
    expect(
      screen.getAllByText(/บันทึกสำเร็จแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ/),
    ).toHaveLength(1),
  );
  expect(
    screen.queryByText(/เก็บข้อมูลเดิมไว้จนยืนยันการบันทึก/),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/ยืนยันการบันทึกรายการนี้แล้ว/)).toBeInTheDocument();
  mockQueryError = undefined;
  mockRefresh.mockResolvedValue(cow);
  fireEvent.click(screen.getByRole("button", { name: "โหลดทะเบียนอีกครั้ง" }));
  await waitFor(() =>
    expect(
      screen.queryByText(/บันทึกสำเร็จแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ/),
    ).not.toBeInTheDocument(),
  );
  expect(mockSave).toHaveBeenCalledTimes(1);
});
