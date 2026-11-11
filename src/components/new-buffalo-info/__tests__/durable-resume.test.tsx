import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from "@testing-library/react";
import DurableCreate from "../DurableCreate";
const mockView = jest.fn();
const mockAdvance = jest.fn();
const mockCreate = jest.fn(),
  mockListRefetch = jest.fn(),
  mockViewRefetch = jest.fn();
let mockViewError: unknown;
let mockList: { data?: unknown[]; isPending: boolean; error?: unknown };
const job = {
  id: "00000000-0000-4000-8000-000000000031",
  state: "AWAITING_METADATA_ACTION",
  version: 4,
  microchip: "999000000000031",
  actualToken: "1364",
  input: { name: "Synthetic", microchip: "999000000000031" },
  imageReady: true,
  prepared: true,
  canEdit: false,
  imageUrl: "http://127.0.0.1:18551/operations/owned/source.jpg",
  environment: "local-fork",
  steps: [{ kind: "mint", state: "CONFIRMED", hash: "0xknownhash" }],
};
jest.mock("~/utils/api", () => ({
  api: {
    buffaloCreate: {
      list: { useQuery: () => ({ ...mockList, refetch: mockListRefetch }) },
      view: {
        useQuery: (input: { id: string }) => {
          mockView(input);
          return {
            data:
              input.id === job.id
                ? mockList.data?.find(
                    (item: unknown) => (item as { id: string }).id === job.id,
                  )
                : undefined,
            refetch: mockViewRefetch,
            error: mockViewError,
          };
        },
      },
      create: { useMutation: () => ({ mutateAsync: mockCreate }) },
      revise: { useMutation: () => ({ mutateAsync: jest.fn() }) },
      prepare: { useMutation: () => ({ mutateAsync: jest.fn() }) },
      advance: { useMutation: () => ({ mutateAsync: mockAdvance }) },
    },
  },
}));
beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  mockList = { data: [job], isPending: false };
  mockViewError = undefined;
});
test("fresh polling snapshots cannot postpone continuation of an existing mint", async () => {
  jest.useFakeTimers();
  try {
    const pending = { ...job, state: "CHAIN_PENDING", canResume: true };
    mockList = { data: [pending], isPending: false };
    mockAdvance.mockImplementation(() => new Promise(() => undefined));
    const page = render(<DurableCreate />);
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      mockList = { data: [{ ...pending }], isPending: false };
      page.rerender(<DurableCreate />);
    }
    expect(mockAdvance).toHaveBeenCalledTimes(1);
    expect(mockAdvance).toHaveBeenCalledWith({
      id: job.id,
      version: job.version,
      action: "resume",
    });
    expect(mockCreate).not.toHaveBeenCalled();
    page.unmount();
  } finally {
    jest.useRealTimers();
  }
});
test("server-backed pending operation resumes after reload with no local selection and never mints again", async () => {
  const first = render(<DurableCreate />);
  await waitFor(() =>
    expect(document.querySelector("[data-actual-token]")).toHaveTextContent(
      "1364",
    ),
  );
  expect(
    screen.queryByRole("button", { name: /^สร้าง NFT$/ }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^บันทึกทะเบียน$/ })).toBeEnabled();
  first.unmount();
  localStorage.clear();
  render(<DurableCreate />);
  await waitFor(() => expect(mockView).toHaveBeenCalledWith({ id: job.id }));
  expect(screen.getByText(/0xknownhash/)).toBeInTheDocument();
  expect(mockAdvance).not.toHaveBeenCalled();
  expect(mockCreate).not.toHaveBeenCalled();
});
test("create is disabled until durable pending inventory has loaded", () => {
  mockList = { isPending: true };
  render(<DurableCreate />);
  expect(
    screen.getByRole("button", { name: "บันทึกร่างและเพิ่มรูป" }),
  ).toBeDisabled();
});
test("metadata is unavailable before a canonical mint and no automatic action skips it", async () => {
  mockList = {
    data: [{ ...job, state: "READY", steps: [], actualToken: null }],
    isPending: false,
  };
  render(<DurableCreate />);
  await waitFor(() => expect(mockView).toHaveBeenCalledWith({ id: job.id }));
  expect(mockAdvance).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("button", { name: /^บันทึกทะเบียน$/ }),
  ).not.toBeInTheDocument();
});

test("slow double click uses one mutation and preserves durable operation identity", async () => {
  mockAdvance.mockImplementationOnce(() => new Promise(() => undefined));
  render(<DurableCreate />);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: /^บันทึกทะเบียน$/ }),
    ).toBeEnabled(),
  );
  const button = screen.getByRole("button", { name: /^บันทึกทะเบียน$/ });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(mockAdvance).toHaveBeenCalledTimes(1);
  expect(mockAdvance).toHaveBeenCalledWith({
    id: job.id,
    version: job.version,
    action: "metadata",
  });
});
test("expired auth leaves a persistent live message and stops resume mutations", async () => {
  mockList = {
    ...mockList,
    error: { data: { code: "UNAUTHORIZED" }, message: "UNAUTHORIZED" },
  };
  render(<DurableCreate />);
  await waitFor(() =>
    expect(
      screen.getByRole("link", { name: "เข้าสู่ระบบอีกครั้ง" }),
    ).toHaveAttribute("href", "/"),
  );
  expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent(
    "เซสชันหมดอายุ",
  );
  expect(
    screen.queryByRole("button", { name: /^บันทึกทะเบียน$/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /^สร้าง NFT$/ }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("รายการที่บันทึกไว้")).toBeDisabled();
  expect(mockAdvance).not.toHaveBeenCalled();
});

test("create inventory failure retries list, never disabled empty view", () => {
  mockList = {
    isPending: false,
    error: {
      data: {
        diagnostic: {
          code: "DATABASE_READ_FAILED",
          reason: "อ่านทะเบียนไม่สำเร็จ",
          stage: "database_read",
          outcome: "not_started",
          nextAction: "retry_read",
          requestId: "list-ref",
        },
      },
    },
  };
  render(<DurableCreate />);
  fireEvent.click(
    screen.getByRole("button", { name: "โหลดรายการที่บันทึกไว้อีกครั้ง" }),
  );
  expect(mockListRefetch).toHaveBeenCalledTimes(1);
  expect(mockViewRefetch).not.toHaveBeenCalled();
  expect(mockCreate).not.toHaveBeenCalled();
});
test("failed status read pauses mint and allows exactly status query retry", async () => {
  mockViewError = Error("network");
  render(<DurableCreate />);
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: /^บันทึกทะเบียน$/ }),
    ).not.toBeInTheDocument(),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "โหลดสถานะรายการเดิมอีกครั้ง" }),
  );
  expect(mockViewRefetch).toHaveBeenCalledTimes(1);
  expect(mockListRefetch).not.toHaveBeenCalled();
  expect(mockAdvance).not.toHaveBeenCalled();
});

test("paused create copies the operation, evidence and support reference together", async () => {
  const writeText = jest.fn(async (_text: string) => undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  mockList.data = [
    {
      ...job,
      state: "NEEDS_REVIEW",
      reason: "MINT_EVENT_BINDING_MISMATCH",
      updatedAt: "2026-11-11T01:20:00Z",
      diagnostic: {
        code: "MINT_EVENT_BINDING_MISMATCH",
        requestId: "ref-42",
        reason: "ต้องตรวจสอบ",
        stage: "chain_read",
        outcome: "unknown",
        nextAction: "contact_support",
      },
    },
  ];
  render(<DurableCreate />);
  fireEvent.click(
    await screen.findByRole("button", { name: "คัดลอกข้อมูลส่งผู้ดูแล" }),
  );
  await screen.findByText("คัดลอกแล้ว ส่งข้อความนี้ให้ผู้ดูแลได้เลย");
  const report = writeText.mock.calls[0]?.[0];
  for (const value of [
    job.id,
    job.microchip,
    job.input.name,
    job.actualToken,
    "NEEDS_REVIEW",
    "ref-42",
    "MINT_EVENT_BINDING_MISMATCH",
    "0xknownhash",
    "2026-11-11T01:20:00Z",
  ])
    expect(report).toContain(value);
  expect(
    screen.queryByRole("button", { name: "คัดลอกรหัสอ้างอิง" }),
  ).not.toBeInTheDocument();
  expect(mockAdvance).not.toHaveBeenCalled();
});

test.each([
  [false, "รูปควาย JPEG / PNG ขนาดน้อยกว่า 2 MB"],
  [true, "ยืนยันข้อมูลและตรวจความพร้อม"],
])(
  "draft with imageReady=%s stays in form before registration",
  async (imageReady, text) => {
    mockList.data = [
      {
        ...job,
        prepared: false,
        canEdit: true,
        actualToken: null,
        state: "DRAFT",
        imageReady,
        steps: [],
      },
    ];
    render(<DurableCreate />);
    expect(await screen.findByText(String(text))).toBeInTheDocument();
    expect(
      screen.queryByLabelText("ความคืบหน้าการเพิ่มควาย"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "คัดลอกข้อมูลส่งผู้ดูแล" }),
    ).not.toBeInTheDocument();
  },
);
const fileJob = (checkedAt: string, exhausted = false) => ({
  ...job,
  state: "RECOVERY_REQUIRED",
  reason: "PUBLIC_ASSET_READBACK_PENDING",
  steps: [
    ...job.steps,
    { kind: "uri", state: "CONFIRMED", hash: "0xurihash" },
    { kind: "metadata", state: "CONFIRMED", hash: "0xmetadata" },
  ],
  progress: {
    checkedAt,
    phases: [3000, 11000, 1000],
    currentPhase: 2,
    readback: { asset: "image", problem: "unavailable", source: "origin" },
    fileRetry: {
      attempts: exhausted ? 4 : 3,
      exhausted,
      nextAt: exhausted
        ? null
        : new Date(Date.parse(checkedAt) + 60000).toISOString(),
      deadlineAt: new Date(Date.parse(checkedAt) + 300000).toISOString(),
    },
  },
});
test("only the active file phase ticks and the operator is not prompted to retry during a scheduled check", async () => {
  jest.useFakeTimers();
  try {
    mockList.data = [fileJob(new Date().toISOString())];
    render(<DurableCreate />);
    expect(
      await screen.findByRole("heading", { name: "กำลังตรวจไฟล์และทะเบียน" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/3 วิ\./)).toBeInTheDocument();
    expect(screen.getByText(/11 วิ\./)).toBeInTheDocument();
    await act(async () => jest.advanceTimersByTime(5000));
    expect(screen.getByText(/3 วิ\./)).toBeInTheDocument();
    expect(screen.getByText(/11 วิ\./)).toBeInTheDocument();
    expect(screen.getByText(/6 วิ\./)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(mockAdvance).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});
test("after the file budget ends explain the actual missing asset and offer only escalation", async () => {
  mockList.data = [fileJob(new Date().toISOString(), true)];
  render(<DurableCreate />);
  expect(
    await screen.findByText(/ยังอ่านรูปควายจากที่เก็บต้นฉบับไม่ได้/),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(
    screen.getByRole("button", { name: "คัดลอกข้อมูลส่งผู้ดูแล" }),
  ).toBeEnabled();
  expect(mockAdvance).not.toHaveBeenCalled();
});
test("a completed registration opens an empty draft without any support or mint action", async () => {
  localStorage.setItem("buffalo-create-operation", job.id);
  mockList.data = [{ ...job, state: "COMPLETED", progress: null }];
  render(<DurableCreate />);
  const fresh = await screen.findByRole("button", {
    name: "เพิ่มควายตัวถัดไป",
  });
  expect(screen.getAllByRole("button")).toHaveLength(1);
  fireEvent.click(fresh);
  expect(screen.getByLabelText("ชื่อควาย")).toHaveValue("");
  expect(
    screen.queryByLabelText("ความคืบหน้าการเพิ่มควาย"),
  ).not.toBeInTheDocument();
  expect(mockAdvance).not.toHaveBeenCalled();
});
test("a reserved mint paused by the operator has no spinner and offers continuation from the same reservation", async () => {
  mockList.data = [
    {
      ...job,
      state: "READY",
      reason: "INTEGRITY_WRITES_PAUSED",
      actualToken: null,
      canResume: true,
      steps: [{ kind: "mint", state: "RESERVED", hash: null }],
    },
  ];
  render(<DurableCreate />);
  expect(
    await screen.findByRole("heading", { name: "ระบบพักการบันทึก" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "ดำเนินการต่อรายการเดิม" }),
  ).toBeEnabled();
  expect(
    screen.queryByRole("button", { name: "สร้าง NFT" }),
  ).not.toBeInTheDocument();
  expect(document.querySelector(".loading-spinner")).toBeNull();
});
