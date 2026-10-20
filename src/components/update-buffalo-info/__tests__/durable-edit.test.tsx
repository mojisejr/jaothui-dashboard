import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import DurableEdit from "../DurableEdit";
const mockCreate = jest.fn(),
  mockPrepare = jest.fn(),
  mockAdvance = jest.fn(),
  mockFetchDetails = jest.fn(),
  mockCancel = jest.fn(),
  mockViewFetch = jest.fn();
const mockRefetch = jest.fn();
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
        details: { fetch: mockFetchDetails },
        list: { fetch: async () => mockJobs },
        view: { fetch: mockViewFetch },
      },
    }),
    buffaloEdit: {
      details: {
        useQuery: () => ({
          data: mockDetail,
          error: mockQueryError,
          refetch: mockRefetch,
        }),
      },
      list: {
        useQuery: () => ({
          data: mockJobs,
          refetch: mockRefetch,
          isPending: false,
        }),
      },
      view: { useQuery: () => ({ data: mockView, refetch: mockRefetch }) },
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
  mockFetchDetails.mockResolvedValue(detail);
  mockRefetch.mockResolvedValue({ data: [] });
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
