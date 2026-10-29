import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from "@testing-library/react";
import DurableEdit from "../DurableEdit";
const mockCreate = jest.fn(),
  mockPrepare = jest.fn(),
  mockAdvance = jest.fn(),
  mockFetchDetails = jest.fn(),
  mockCancel = jest.fn(),
  mockViewFetch = jest.fn();
const mockRefetch = jest.fn(),
  mockListRefetch = jest.fn(),
  mockViewRefetch = jest.fn();
let mockListError: unknown, mockViewError: unknown;
const detail = {
  tokenId: 901,
  microchip: "999000000004001",
  name: "Synthetic",
  origin: "Thailand",
  color: "Black",
  detail: "original detail",
  sex: "Male",
  birthday: "2024/06/30",
  height: "155",
  certNo: "CERT",
  dna: "https://dna.test/original",
  rarity: "Rare",
  fatherId: "father",
  motherId: "mother",
  createdAt: "1234567890000",
  updatedAt: "1234567890000",
  revision: "ab".repeat(32),
  sync: { status: "matched" },
};
const baseJob = {
  id: "00000000-0000-4000-8000-000000000041",
  state: "RECOVERY_REQUIRED",
  version: 4,
  microchip: detail.microchip,
  publishedMicrochip: detail.microchip,
  actualToken: "901",
  fields: ["color"],
  patch: { color: "White" },
  canResume: true,
  restorationPending: true,
  legacyDifferences: [],
  environment: "local-fork",
  steps: [{ kind: "batch", state: "CONFIRMED", hash: "0xoriginalbatch" }],
};
let mockDetail: typeof detail | null = detail,
  mockJobs: unknown[] = [],
  mockQueryError: unknown,
  mockView: unknown;
jest.mock("~/utils/api", () => ({
  api: {
    useUtils: () => ({
      buffaloEdit: {
        details: { fetch: mockFetchDetails, setData: jest.fn() },
        list: { fetch: async () => mockJobs },
        view: { fetch: mockViewFetch },
      },
    }),
    buffaloEdit: {
      details: {
        useQuery: () => ({
          data: mockDetail,
          error: mockQueryError,
          isSuccess: !mockQueryError,
          refetch: mockRefetch,
        }),
      },
      list: {
        useQuery: () => ({
          data: mockJobs,
          error: mockListError,
          refetch: mockListRefetch,
          isPending: false,
        }),
      },
      view: {
        useQuery: () => ({
          data: mockView,
          error: mockViewError,
          refetch: mockViewRefetch,
        }),
      },
      create: { useMutation: () => ({ mutateAsync: mockCreate }) },
      prepare: { useMutation: () => ({ mutateAsync: mockPrepare }) },
      advance: { useMutation: () => ({ mutateAsync: mockAdvance }) },
      cancel: { useMutation: () => ({ mutateAsync: mockCancel }) },
    },
  },
}));
beforeAll(() => {
  Object.defineProperty(globalThis, "fetch", {
    value: jest.fn(),
    writable: true,
    configurable: true,
  });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    value: () => "00000000-0000-4000-8000-000000000042",
    configurable: true,
  });
});
beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  mockDetail = detail;
  mockJobs = [];
  mockQueryError = undefined;
  mockView = undefined;
  mockListError = undefined;
  mockViewError = undefined;
  mockFetchDetails.mockResolvedValue(detail);
  mockRefetch.mockResolvedValue({ data: [] });
});
test("fresh polling snapshots cannot indefinitely postpone a READY edit", async () => {
  jest.useFakeTimers();
  try {
    const ready = { ...baseJob, state: "READY", version: 2, steps: [] };
    mockJobs = [ready];
    mockView = ready;
    mockAdvance.mockImplementation(() => new Promise(() => undefined));
    const page = render(<DurableEdit />);
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      mockView = { ...ready };
      page.rerender(<DurableEdit />);
    }
    expect(mockAdvance).toHaveBeenCalledTimes(1);
    expect(mockAdvance).toHaveBeenCalledWith({ id: ready.id, version: 2 });
    expect(mockCreate).not.toHaveBeenCalled();
    page.unmount();
  } finally {
    jest.useRealTimers();
  }
});
test("saved edit leaves the input dialog before slow preparation and shows waiting guidance", async () => {
  mockCreate.mockResolvedValue({ ...baseJob, state: "DRAFT", version: 0 });
  mockPrepare.mockImplementation(() => new Promise(() => undefined));
  render(<DurableEdit />);
  fireEvent.click(screen.getByRole("button", { name: "แก้ไขชื่อ" }));
  fireEvent.change(document.getElementById("edit-value")!, {
    target: { value: "new name" },
  });
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันการแก้ไข" }));
  await waitFor(() => expect(mockPrepare).toHaveBeenCalled());
  expect(document.querySelector("dialog")).not.toHaveAttribute("open");
  expect(document.querySelector("[data-edit-progress]")).toHaveFocus();
  expect(screen.getByText(/กรุณาอยู่หน้านี้จนขึ้น/)).toBeInTheDocument();
  expect(mockAdvance).not.toHaveBeenCalled();
});
test("failed preparation can resume the saved draft after the dialog closes without creating another edit", async () => {
  const draft = {
    ...baseJob,
    state: "DRAFT",
    version: 0,
    canResume: false,
    steps: [],
  };
  mockCreate.mockResolvedValue(draft);
  mockPrepare
    .mockRejectedValueOnce(Error("network failed"))
    .mockResolvedValueOnce({ ...draft, state: "READY", version: 1 });
  mockAdvance.mockResolvedValueOnce({
    ...draft,
    state: "COMPLETED",
    version: 2,
  });
  render(<DurableEdit />);
  fireEvent.click(screen.getByRole("button", { name: "แก้ไขชื่อ" }));
  fireEvent.change(document.getElementById("edit-value")!, {
    target: { value: "keep name" },
  });
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันการแก้ไข" }));
  const resume = await screen.findByRole("button", {
    name: "ดำเนินการต่อรายการเดิม",
  });
  await waitFor(() => expect(resume).toBeEnabled());
  fireEvent.click(resume);
  await waitFor(() =>
    expect(mockAdvance).toHaveBeenCalledWith({ id: draft.id, version: 1 }),
  );
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(mockPrepare).toHaveBeenCalledTimes(2);
});
test("search/detail/field/dialog keeps one confirmation and double click sends one durable edit", async () => {
  mockCreate.mockImplementation(() => new Promise(() => undefined));
  render(<DurableEdit />);
  fireEvent.click(screen.getByRole("button", { name: "แก้ไขชื่อ" }));
  fireEvent.change(document.querySelector<HTMLInputElement>("#edit-value")!, {
    target: { value: "new" },
  });
  const confirm = screen.getByRole("button", { name: "ยืนยันการแก้ไข" });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect((mockCreate.mock.calls as [{ key: string }][])[0]![0]).toMatchObject({
    microchip: detail.microchip,
    tokenId: "901",
    expectedRevision: detail.revision,
    patch: { name: "new" },
  });
  await waitFor(() =>
    expect(
      document.querySelector<HTMLInputElement>("#edit-value")!,
    ).toBeDisabled(),
  );
  expect(mockAdvance).not.toHaveBeenCalled();
});
test("reload/re-auth recovers batch preservation from server without another create", async () => {
  mockJobs = [baseJob];
  const first = render(<DurableEdit />);
  await waitFor(() =>
    expect(screen.getByText(/0xoriginalbatch/)).toBeInTheDocument(),
  );
  expect(screen.getByText(/กำลังกู้คืน DNA/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "แก้ไขชื่อ" })).toBeDisabled();
  first.unmount();
  render(<DurableEdit />);
  await waitFor(() =>
    expect(screen.getByText(/0xoriginalbatch/)).toBeInTheDocument(),
  );
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockAdvance).not.toHaveBeenCalled();
});
test("identity conflict remains readable while every editing entry is blocked", () => {
  mockDetail = { ...detail, sync: { status: "identity_conflict" } };
  render(<DurableEdit />);
  expect(screen.getByDisplayValue("Synthetic")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "แก้ไขชื่อ" })).toBeDisabled();
  expect(mockCreate).not.toHaveBeenCalled();
});
test("expired auth links to login and stops mutations while retaining operation", async () => {
  mockJobs = [baseJob];
  mockQueryError = { data: { code: "UNAUTHORIZED" }, message: "UNAUTHORIZED" };
  render(<DurableEdit />);
  await waitFor(() =>
    expect(
      screen.getByRole("link", { name: "เข้าสู่ระบบอีกครั้ง" }),
    ).toHaveAttribute("href", "/"),
  );
  expect(
    screen.getByRole("button", { name: "ดำเนินการต่อรายการเดิม" }),
  ).toBeDisabled();
  expect(mockAdvance).not.toHaveBeenCalled();
});
test("name dialog preserves entered value on stale rejection and never calls advance", async () => {
  mockCreate.mockRejectedValue(new Error("STALE_EDIT_RECORD"));
  render(<DurableEdit />);
  fireEvent.click(screen.getByRole("button", { name: "แก้ไขชื่อ" }));
  fireEvent.change(document.querySelector<HTMLInputElement>("#edit-value")!, {
    target: { value: "keep me" },
  });
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันการแก้ไข" }));
  await waitFor(() =>
    expect(
      document.querySelector<HTMLInputElement>("#edit-value")!,
    ).toHaveValue("keep me"),
  );
  await waitFor(() =>
    expect(
      screen.getAllByText(/ข้อมูลเปลี่ยนหลังจากเปิด/).length,
    ).toBeGreaterThan(0),
  );
  expect(mockAdvance).not.toHaveBeenCalled();
});
test("COMPLETED microchip update refetches the new DB identity before marking details refreshed", async () => {
  mockJobs = [
    {
      ...baseJob,
      state: "COMPLETED",
      publishedMicrochip: "999000000004002",
      restorationPending: false,
      canResume: false,
    },
  ];
  mockView = mockJobs[0];
  render(<DurableEdit />);
  await waitFor(() =>
    expect(mockFetchDetails).toHaveBeenCalledWith("999000000004002"),
  );
});
test("failed raw upload keeps the same unsigned draft and allows retry with preserved file", async () => {
  const draft = {
    ...baseJob,
    state: "DRAFT",
    version: 0,
    fields: ["image"],
    patch: { image: "https://upload.test/source.jpg" },
    canResume: false,
  };
  mockCreate.mockResolvedValue(draft);
  mockViewFetch.mockResolvedValue({ ...draft, version: 1 });
  mockPrepare.mockResolvedValue({ ...draft, state: "READY", version: 2 });
  mockAdvance.mockResolvedValue({
    ...draft,
    state: "CHAIN_PENDING",
    version: 3,
  });
  const fetch = jest
    .spyOn(globalThis, "fetch")
    .mockRejectedValueOnce(new Error("network failed"))
    .mockResolvedValueOnce({ ok: true } as Response);
  try {
    render(<DurableEdit />); // image field is absent without image so enter DNA upload through same transport
    fireEvent.click(screen.getByRole("button", { name: "แก้ไขDNA" }));
    fireEvent.change(screen.getByLabelText(/อัปโหลดภาพ DNA/), {
      target: { files: [new File(["png"], "dna.png", { type: "image/png" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันการแก้ไข" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "ยืนยันการแก้ไข" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันการแก้ไข" }));
    await waitFor(() => expect(mockPrepare).toHaveBeenCalled());
    expect((mockCreate.mock.calls as [{ key: string }][])[0]![0].key).toBe(
      (mockCreate.mock.calls as [{ key: string }][])[1]![0].key,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  } finally {
    fetch.mockRestore();
  }
});

test("editing only father never submits untouched legacy mother as a requested patch", async () => {
  mockDetail = {
    ...detail,
    fatherId: "999000000004011",
    motherId: "legacy DB mother",
  };
  mockCreate.mockImplementation(() => new Promise(() => undefined));
  render(<DurableEdit />);
  fireEvent.click(screen.getByRole("button", { name: "แก้ไขข้อมูลพ่อแม่" }));
  fireEvent.change(screen.getByLabelText("microchip พ่อ"), {
    target: { value: "999000000004012" },
  });
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันการแก้ไข" }));
  expect(mockCreate).toHaveBeenCalledWith(
    expect.objectContaining({ patch: { fatherId: "999000000004012" } }),
  );
});
test("unchanged parent dialog explains no change and creates no operation", async () => {
  render(<DurableEdit />);
  fireEvent.click(screen.getByRole("button", { name: "แก้ไขข้อมูลพ่อแม่" }));
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันการแก้ไข" }));
  await waitFor(() =>
    expect(
      screen.getAllByText(/ยังไม่มีช่องที่เปลี่ยนแปลง/).length,
    ).toBeGreaterThan(0),
  );
  expect(mockCreate).not.toHaveBeenCalled();
});

const readFailure = {
  data: {
    diagnostic: {
      code: "DATABASE_READ_FAILED",
      stage: "database_read",
      reason: "อ่านทะเบียนไม่สำเร็จ ยังสรุปไม่ได้ว่าไม่มีข้อมูล",
      requestId: "read-reference",
      outcome: "not_started",
      nextAction: "retry_read",
    },
  },
};
test("list failure explains disabled edits and retries list only", () => {
  mockListError = readFailure;
  render(<DurableEdit />);
  expect(screen.getByRole("button", { name: "แก้ไขชื่อ" })).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "โหลดรายการแก้ไขเดิมอีกครั้ง" }),
  );
  expect(mockListRefetch).toHaveBeenCalledTimes(1);
  expect(mockRefetch).not.toHaveBeenCalled();
  expect(mockViewRefetch).not.toHaveBeenCalled();
  expect(screen.getByText(/อ้างอิงคำขอ: read-reference/)).toBeInTheDocument();
});
test("view failure exposes stale operation and retries view without another mutation", async () => {
  mockJobs = [baseJob];
  mockViewError = readFailure;
  render(<DurableEdit />);
  fireEvent.click(
    screen.getByRole("button", { name: "โหลดสถานะรายการอีกครั้ง" }),
  );
  expect(mockViewRefetch).toHaveBeenCalledTimes(1);
  expect(mockAdvance).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "ดำเนินการต่อรายการเดิม" }),
  ).toBeDisabled();
});
test("repeated search of absent microchip gives explicit not-found and repeats the read", () => {
  mockDetail = null;
  render(<DurableEdit />);
  fireEvent.change(screen.getByLabelText("ค้นหาควายด้วย microchip"), {
    target: { value: "999000000004099" },
  });
  fireEvent.click(screen.getByRole("button", { name: "ค้นหา" }));
  expect(screen.getByText(/ไม่พบควายสำหรับ microchip/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "ค้นหา" }));
  expect(mockRefetch).toHaveBeenCalledTimes(1);
});
test("DNA rejects unsupported file before creating a durable operation and leaves typed URL intact", () => {
  render(<DurableEdit dnaOnly />);
  fireEvent.click(screen.getByRole("button", { name: "แก้ไขDNA" }));
  fireEvent.change(screen.getByLabelText(/อัปโหลดภาพ DNA/), {
    target: {
      files: [new File(["pdf"], "dna.pdf", { type: "application/pdf" })],
    },
  });
  expect(screen.getByRole("button", { name: "ยืนยันการแก้ไข" })).toBeDisabled();
  expect(screen.getByText(/กรุณาเลือกภาพ JPEG หรือ PNG/)).toBeInTheDocument();
  expect(mockCreate).not.toHaveBeenCalled();
  expect(screen.getByLabelText("DNA", { selector: "#edit-value" })).toHaveValue(
    detail.dna,
  );
});
test("completed write remains completed when fresh details fail", async () => {
  mockJobs = [{ ...baseJob, state: "COMPLETED", canResume: false }];
  mockView = mockJobs[0];
  mockFetchDetails.mockRejectedValue(Error("down"));
  render(<DurableEdit />);
  await screen.findByText(/บันทึกสำเร็จแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ/);
  expect(
    screen.getByText("แก้ไขช่องที่ร้องขอและตรวจสอบสำเร็จแล้ว"),
  ).toBeInTheDocument();
  expect(mockCreate).not.toHaveBeenCalled();
});

test.each(["TOKEN_MAPPING_CONFLICT", "CANONICAL_CHIP_CONFLICT"])(
  "confirmed %s displays the read-only diagnosis entry without choosing desired identity",
  (reason) => {
    const conflicting = {
      ...detail,
      sync: { status: "identity_conflict", reason },
    };
    mockDetail = conflicting;
    render(<DurableEdit />);
    expect(
      screen.getByRole("link", { name: "ตรวจตัวตนก่อนเสนอซ่อม" }),
    ).toHaveAttribute(
      "href",
      `/dashboard/repair-buffalo?microchip=${detail.microchip}`,
    );
    expect(screen.getByRole("button", { name: "แก้ไขชื่อ" })).toBeDisabled();
  },
);
test.each([
  "DATABASE_READ_FAILED",
  "CHAIN_CHECK_UNAVAILABLE",
  "INTEGRITY_FEATURE_DISABLED",
])("%s read/config error has no diagnosis entry", (reason) => {
  const unavailable = { ...detail, sync: { status: "unavailable", reason } };
  mockDetail = unavailable;
  render(<DurableEdit />);
  expect(
    screen.queryByRole("link", { name: "ตรวจตัวตนก่อนเสนอซ่อม" }),
  ).not.toBeInTheDocument();
});
test("stale cached identity after a failed details read does not offer a diagnosis link", () => {
  const conflicting = {
    ...detail,
    sync: { status: "identity_conflict", reason: "TOKEN_MAPPING_CONFLICT" },
  };
  mockDetail = conflicting;
  mockQueryError = readFailure;
  render(<DurableEdit />);
  expect(
    screen.queryByRole("link", { name: "ตรวจตัวตนก่อนเสนอซ่อม" }),
  ).not.toBeInTheDocument();
});

test("ambiguous DB token from edit preflight offers the source-only diagnosis link inside the dialog", async () => {
  mockCreate.mockRejectedValue({
    data: {
      diagnostic: {
        code: "AMBIGUOUS_DB_TOKEN",
        stage: "identity",
        reason: "ทะเบียนหลายตัวผูกกับ NFT เดียวกัน",
        requestId: "ambiguous-ref",
        outcome: "not_started",
        nextAction: "contact_support",
      },
    },
  });
  render(<DurableEdit />);
  fireEvent.click(screen.getByRole("button", { name: "แก้ไขชื่อ" }));
  fireEvent.change(document.getElementById("edit-value")!, {
    target: { value: "preserved proposed name" },
  });
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันการแก้ไข" }));
  const link = await screen.findByRole("link", {
    name: "ตรวจตัวตนก่อนเสนอซ่อม",
  });
  expect(link).toHaveAttribute(
    "href",
    `/dashboard/repair-buffalo?microchip=${detail.microchip}`,
  );
  expect(document.getElementById("edit-value")).toHaveValue(
    "preserved proposed name",
  );
  expect(mockAdvance).not.toHaveBeenCalled();
});
