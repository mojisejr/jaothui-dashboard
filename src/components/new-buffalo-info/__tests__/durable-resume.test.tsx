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
  expect(screen.getByRole("button", { name: "Mint NFT" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Mint Metadata" })).toBeEnabled();
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
    screen.getByRole("button", { name: "บันทึกข้อมูลและไปต่อ" }),
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
  expect(screen.getByRole("button", { name: "Mint Metadata" })).toBeDisabled();
});

test("slow double click uses one mutation and preserves durable operation identity", async () => {
  mockAdvance.mockImplementationOnce(() => new Promise(() => undefined));
  render(<DurableCreate />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Mint Metadata" })).toBeEnabled(),
  );
  const button = screen.getByRole("button", { name: "Mint Metadata" });
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
  expect(screen.getByRole("button", { name: "Mint Metadata" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Mint NFT" })).toBeDisabled();
  expect(
    screen.getByRole("combobox", { name: "รายการที่บันทึกไว้" }),
  ).toBeDisabled();
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
      screen.getByRole("button", { name: "Mint Metadata" }),
    ).toBeDisabled(),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "โหลดสถานะรายการเดิมอีกครั้ง" }),
  );
  expect(mockViewRefetch).toHaveBeenCalledTimes(1);
  expect(mockListRefetch).not.toHaveBeenCalled();
  expect(mockAdvance).not.toHaveBeenCalled();
});
