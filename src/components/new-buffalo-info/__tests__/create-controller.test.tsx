import { act, renderHook } from "@testing-library/react";
import { useCreateController } from "../useCreateController";

const id = "00000000-0000-4000-8000-000000000012";
const base = {
  id,
  version: 2,
  state: "READY",
  steps: [] as { kind: string; state: string }[],
  actualToken: null as string | null,
  reason: null as string | null,
  prepared: true,
  imageReady: true,
  canEdit: true,
  canResume: true,
  progress: null as null | {
    fileRetry?: { nextAt: string | null; exhausted: boolean };
    unknownRetry?: { nextAt: string | null; exhausted: boolean };
  },
};
let mockJob: typeof base;
const mockAdvance = jest.fn();
const mockDetail = jest.fn();
jest.mock("~/utils/api", () => ({
  api: {
    buffaloCreate: {
      list: { useQuery: () => ({ data: [mockJob], refetch: jest.fn() }) },
      view: {
        useQuery: (input: { id: string }) => ({
          data: input.id === mockJob.id ? mockJob : undefined,
          refetch: mockDetail,
        }),
      },
      create: { useMutation: () => ({ mutateAsync: jest.fn() }) },
      revise: { useMutation: () => ({ mutateAsync: jest.fn() }) },
      prepare: { useMutation: () => ({ mutateAsync: jest.fn() }) },
      advance: { useMutation: () => ({ mutateAsync: mockAdvance }) },
    },
  },
}));
beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  mockJob = { ...base };
  mockAdvance.mockReset();
  mockDetail.mockReset().mockImplementation(async () => ({ data: mockJob }));
});
afterEach(() => jest.useRealTimers());
async function tick(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

test("a reserved mint resumes after reload, stops at the registration gate and cannot mint twice", async () => {
  const gate = {
    ...base,
    version: 3,
    state: "AWAITING_METADATA_ACTION",
    actualToken: "1369",
    steps: [{ kind: "mint", state: "CONFIRMED" }],
  };
  mockJob = {
    ...base,
    reason: "WALLET_QUEUE_BUSY",
    steps: [{ kind: "mint", state: "RESERVED" }],
  };
  mockAdvance.mockResolvedValue(gate);
  const page = renderHook(useCreateController);
  await act(async () => {
    await page.result.current.action("mint");
    await page.result.current.action("metadata");
  });
  expect(mockAdvance).not.toHaveBeenCalled();
  await tick(2200);
  expect(mockAdvance.mock.calls).toEqual([
    [{ id, version: 2, action: "resume" }],
  ]);
  expect(page.result.current.job?.actualToken).toBe("1369");
  await tick(10000);
  expect(mockAdvance).toHaveBeenCalledTimes(1);
  await act(async () => {
    await page.result.current.action("mint");
    await page.result.current.action("resume");
    await page.result.current.action("metadata");
  });
  expect(mockAdvance.mock.calls[1]).toEqual([
    { id, version: 3, action: "metadata" },
  ]);
});

test.each([
  ["RECOVERY_REQUIRED", "fileRetry", "autoPublication"],
  ["BROADCAST_UNKNOWN", "unknownRetry", "autoReconcile"],
] as const)(
  "%s observes its journaled retry time across polls, stops at exhaustion",
  async (state, key, mode) => {
    mockJob = {
      ...base,
      state,
      reason:
        state === "RECOVERY_REQUIRED" ? "PUBLIC_ASSET_READBACK_PENDING" : null,
    };
    const page = renderHook(useCreateController);
    await tick(6000);
    expect(mockAdvance).not.toHaveBeenCalled();
    const nextAt = new Date(Date.now() + 5000).toISOString();
    mockJob = { ...mockJob, progress: { [key]: { exhausted: false, nextAt } } };
    page.rerender();
    await act(async () => {
      await page.result.current.action("resume");
    });
    await tick(4000);
    mockJob = { ...mockJob };
    page.rerender();
    expect(mockAdvance).not.toHaveBeenCalled();
    // Another tab can consume the budget without changing the operation revision.
    mockAdvance.mockImplementationOnce(async () => {
      mockJob = {
        ...mockJob,
        progress: { [key]: { exhausted: true, nextAt: null } },
      };
      return mockJob;
    });
    await tick(1200);
    expect(mockAdvance.mock.calls).toEqual([
      [{ id, version: 2, action: "resume", mode }],
    ]);
    expect(page.result.current.autoContinuing).toBe(false);
    await tick(30000);
    expect(mockAdvance).toHaveBeenCalledTimes(1);
  },
);

test("photo preview waits for review, with zero advance calls", async () => {
  const previous = global.fetch;
  try {
    mockJob = { ...base, state: "DRAFT", prepared: false, imageReady: false };
    Object.defineProperty(global, "fetch", {
      configurable: true,
      writable: true,
      value: jest.fn(async () => {
        mockJob = { ...mockJob, version: 3, imageReady: true };
        return { ok: true } as Response;
      }),
    });
    const page = renderHook(useCreateController);
    const photo = new File(["data"], "photo.png", { type: "image/png" });
    await act(async () => {
      await page.result.current.upload(photo);
    });
    expect(page.result.current.step).toBe(1);
    act(() => page.result.current.reviewImage());
    expect(page.result.current.step).toBe(2);
    await tick(10000);
    expect(mockAdvance).not.toHaveBeenCalled();
  } finally {
    global.fetch = previous;
  }
});

test("unacknowledged transport requests pause after three failures and wait for new durable evidence", async () => {
  mockJob = { ...base, state: "PROJECTING" };
  mockAdvance.mockRejectedValue(new Error("connection lost"));
  mockDetail.mockRejectedValue(new Error("offline"));
  const page = renderHook(useCreateController);
  await tick(30000);
  // React effects schedule the next wait after each settled request.
  await tick(10000);
  await tick(11000);
  expect(mockAdvance).toHaveBeenCalledTimes(3);
  expect(page.result.current.automationStopped).toBe(true);
  await tick(60000);
  expect(mockAdvance).toHaveBeenCalledTimes(3);
  mockJob = { ...mockJob, state: "COMPLETED", version: 3 };
  page.rerender();
  expect(page.result.current.error).toBeNull();
  expect(page.result.current.autoContinuing).toBe(false);
});

test("an expired session during automatic continuation stops requests and retains the selected operation", async () => {
  mockJob = { ...base, state: "CHAIN_PENDING" };
  mockAdvance.mockRejectedValue({ data: { code: "UNAUTHORIZED" } });
  const page = renderHook(useCreateController);
  await tick(2500);
  await tick(120000);
  expect(page.result.current.authLost).toBe(true);
  expect(mockDetail).not.toHaveBeenCalled();
  expect(mockAdvance).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem("buffalo-create-operation")).toBe(id);
});

test("a busy account retries only resume of the reserved mint, then waits for the second gesture", async () => {
  mockJob = { ...base, steps: [{ kind: "mint", state: "RESERVED" }] };
  mockAdvance
    .mockRejectedValueOnce({ code: "ACCOUNT_OPERATION_BUSY", reason: "busy" })
    .mockImplementationOnce(async () => {
      mockJob = {
        ...mockJob,
        state: "AWAITING_METADATA_ACTION",
        version: 3,
        actualToken: "1369",
        steps: [{ kind: "mint", state: "CONFIRMED" }],
      };
      return mockJob;
    });
  const page = renderHook(useCreateController);
  await tick(2200);
  expect(page.result.current.autoContinuing).toBe(true);
  await tick(5500);
  expect(page.result.current.autoContinuing).toBe(false);
  expect(page.result.current.error).toBeNull();
  expect(mockAdvance.mock.calls).toEqual([
    [{ id, version: 2, action: "resume" }],
    [{ id, version: 2, action: "resume" }],
  ]);
});

test("a cached active inventory cannot replace a saved selection during hydration", async () => {
  localStorage.setItem("buffalo-create-operation", "previously-selected");
  mockJob = { ...base, state: "CHAIN_PENDING" };
  const page = renderHook(useCreateController);
  expect(page.result.current.id).toBe("previously-selected");
  expect(page.result.current.job).toBeUndefined();
  await tick(12000);
  expect(mockAdvance).not.toHaveBeenCalled();
});

test("a paused reserved mint stays idle across reads until the operator resumes the same operation", async () => {
  mockJob = {
    ...base,
    reason: "INTEGRITY_WRITES_PAUSED",
    steps: [{ kind: "mint", state: "RESERVED" }],
  };
  const page = renderHook(useCreateController);
  await tick(30000);
  expect(page.result.current.autoContinuing).toBe(false);
  expect(mockAdvance).not.toHaveBeenCalled();
  await act(async () => {
    await page.result.current.action("mint");
    await page.result.current.action("resume");
  });
  expect(mockAdvance.mock.calls).toEqual([
    [{ id, version: 2, action: "resume" }],
  ]);
});
