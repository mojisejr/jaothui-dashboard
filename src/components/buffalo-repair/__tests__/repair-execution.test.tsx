import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useRepairExecution, REPAIR_PENDING_KEY } from "../useRepairExecution";
import { weiToKub } from "../PreparedRepairReview";
import { RepairOperationProgress } from "../RepairOperationProgress";
import type {
  RepairExecutionView,
  RepairPrepareInput,
} from "~/server/services/buffalo-integrity/repair/execution-contract";
const mockPrepare = jest.fn(),
  mockApprove = jest.fn(),
  mockAdvance = jest.fn(),
  mockCancel = jest.fn(),
  mockLookup = jest.fn(),
  mockView = jest.fn();
const mockUuid = jest.fn(() => "12222222-2222-4222-8222-222222222222");
let mockEnabled = true;
jest.mock("~/utils/api", () => ({
  api: {
    useUtils: () => ({
      buffaloRepair: {
        getByKey: { fetch: mockLookup },
        view: { fetch: mockView },
      },
    }),
    buffaloRepair: {
      capability: {
        useQuery: () => ({
          data: {
            canPrepare: mockEnabled,
            canApprove: mockEnabled,
            canResume: mockEnabled,
            singleOnly: true,
          },
        }),
      },
      prepare: { useMutation: () => ({ mutateAsync: mockPrepare }) },
      approve: { useMutation: () => ({ mutateAsync: mockApprove }) },
      advance: { useMutation: () => ({ mutateAsync: mockAdvance }) },
      cancel: { useMutation: () => ({ mutateAsync: mockCancel }) },
    },
  },
}));
const key = "12222222-2222-4222-8222-222222222222",
  chip = "999000000008001";
const input: Omit<RepairPrepareInput, "key"> = {
  scan: "signed-scan",
  pages: ["signed-page"],
  proposal: {
    targets: [
      {
        sourceMicrochip: "bad chip",
        desiredMicrochip: chip,
        desiredTokenId: "1",
        evidence: [{ kind: "physical_scan", reference: "scanner-a" }],
      },
    ],
    knownAliases: ["old alias"],
  },
};
function result(patch: Partial<RepairExecutionView> = {}): RepairExecutionView {
  return {
    id: key,
    key,
    state: "DRAFT",
    version: 0,
    mode: "database_only",
    manifestHash: "a".repeat(64),
    approvalFingerprint: "b".repeat(64),
    review: {
      targets: input.proposal.targets,
      beforeAfter: [
        {
          sourceMicrochip: "bad chip",
          desiredMicrochip: chip,
          desiredTokenId: "1",
          before: {
            database: { microchip: "bad chip", tokenId: "9" },
            chain: {
              microchip: chip,
              tokenId: "1",
              tokenUri: "https://assets.test/before.json",
              dna: "DNA-A",
            },
          },
          after: {
            database: { microchip: chip, tokenId: "1" },
            chain: {
              microchip: chip,
              tokenId: "1",
              tokenUri: "https://assets.test/after.json",
              dna: "DNA-A",
            },
          },
        },
      ],
      effects: {
        metadataCounterIncrement: 0,
        nftNativeTimestampsReset: [],
        dnaClearedThenRestored: [],
      },
      assets: [],
      fees: { perStep: [], totalMaxFeeWei: "0" },
    },
    steps: [],
    canApprove: true,
    canResume: false,
    canCancel: true,
    ...patch,
  };
}
function Harness({ request = input }: { request?: typeof input }) {
  const controller = useRepairExecution();
  return (
    <>
      <button
        disabled={controller.busy}
        onClick={() => void controller.prepare(request)}
      >
        prepare
      </button>
      <button
        disabled={controller.busy}
        onClick={() => void controller.refreshPreparation(request)}
      >
        refresh evidence
      </button>
      <RepairOperationProgress controller={controller} />
    </>
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  mockEnabled = true;
  Object.defineProperty(crypto, "randomUUID", {
    configurable: true,
    value: mockUuid,
  });
  mockLookup.mockResolvedValue(null);
  mockView.mockResolvedValue(result());
  mockPrepare.mockImplementation(async () => {
    expect(JSON.parse(localStorage.getItem(REPAIR_PENDING_KEY)!)).toEqual({
      version: 1,
      key,
    });
    return result();
  });
  mockApprove.mockResolvedValue(
    result({
      state: "READY",
      version: 1,
      canApprove: false,
      canResume: true,
      canCancel: false,
    }),
  );
  mockAdvance.mockResolvedValue(
    result({
      state: "COMPLETED",
      version: 2,
      canApprove: false,
      canResume: false,
      canCancel: false,
    }),
  );
});
async function prepare() {
  await waitFor(() => expect(screen.getByText("prepare")).toBeEnabled());
  fireEvent.click(screen.getByText("prepare"));
  await screen.findByText("แผนซ่อมที่ต้องตรวจทานก่อนยืนยัน");
}
test("persists UUID before prepare, shows exact review, and one case approval starts the same operation", async () => {
  render(<Harness />);
  await prepare();
  expect(mockPrepare).toHaveBeenCalledWith({ ...input, key });
  expect(
    screen.getByText("ที่อยู่ไฟล์ NFT: https://assets.test/before.json"),
  ).toBeInTheDocument();
  expect(
    screen.getByText("ที่อยู่ไฟล์ NFT: https://assets.test/after.json"),
  ).toBeInTheDocument();
  expect(screen.getByText("รวมสูงสุด 0 KUB")).toBeInTheDocument();
  expect(mockApprove).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "ยืนยันแผนนี้และเริ่มซ่อม" }),
  );
  await screen.findByText("ซ่อมสำเร็จและตรวจหลักฐานครบแล้ว");
  expect(mockApprove).toHaveBeenCalledWith({
    id: key,
    expectedVersion: 0,
    manifestHash: "a".repeat(64),
  });
  expect(mockAdvance).toHaveBeenCalledWith({ id: key, expectedVersion: 1 });
  expect(mockPrepare).toHaveBeenCalledTimes(1);
});
test("receipt review uses the saved operation and never automatically advances or approves", async () => {
  localStorage.setItem(REPAIR_PENDING_KEY, JSON.stringify({ version: 1, key }));
  mockLookup.mockResolvedValue(
    result({
      state: "NEEDS_REVIEW",
      canApprove: false,
      canResume: false,
      canReviewReceipt: true,
    }),
  );
  mockAdvance.mockResolvedValue(
    result({
      state: "CHAIN_STEPS",
      canApprove: false,
      canResume: true,
      canReviewReceipt: false,
      version: 1,
    }),
  );
  render(<Harness />);
  fireEvent.click(
    await screen.findByRole("button", {
      name: "ตรวจหลักฐานธุรกรรมเดิมอีกครั้ง",
    }),
  );
  await screen.findByRole("button", { name: "ดำเนินการต่อรายการเดิม" });
  expect(mockAdvance).toHaveBeenCalledTimes(1);
  expect(mockAdvance).toHaveBeenCalledWith({
    id: key,
    expectedVersion: 0,
    reviewReceipt: true,
  });
  expect(mockApprove).not.toHaveBeenCalled();
  expect(mockPrepare).not.toHaveBeenCalled();
});
test("lost prepare reload only looks up the same UUID and never automatically prepares or approves", async () => {
  mockPrepare.mockRejectedValue(new Error("network"));
  const first = render(<Harness />);
  await waitFor(() => expect(screen.getByText("prepare")).toBeEnabled());
  fireEvent.click(screen.getByText("prepare"));
  await screen.findByText(/ไม่ได้รับผลยืนยันจากระบบ/);
  first.unmount();
  mockLookup.mockResolvedValue(result());
  render(<Harness />);
  await screen.findByText("แผนซ่อมที่ต้องตรวจทานก่อนยืนยัน");
  expect(mockLookup).toHaveBeenCalledWith({ key });
  expect(mockPrepare).toHaveBeenCalledTimes(1);
  expect(mockApprove).not.toHaveBeenCalled();
});
test("uncertain prepare retry checks lookup first and preserves original request despite form edits", async () => {
  mockPrepare.mockRejectedValueOnce(new Error("network"));
  const page = render(<Harness />);
  await waitFor(() => expect(screen.getByText("prepare")).toBeEnabled());
  fireEvent.click(screen.getByText("prepare"));
  await screen.findByText(/ไม่ได้รับผลยืนยันจากระบบ/);
  page.rerender(<Harness request={{ ...input, scan: "changed" }} />);
  fireEvent.click(
    screen.getByRole("button", {
      name: "ตรวจรายการเดิมก่อนเตรียมคำขอเดิมอีกครั้ง",
    }),
  );
  await screen.findByText("แผนซ่อมที่ต้องตรวจทานก่อนยืนยัน");
  expect(mockLookup).toHaveBeenCalledTimes(1);
  expect(mockPrepare.mock.calls[1]).toEqual([{ ...input, key }]);
  expect(mockLookup.mock.invocationCallOrder[0]).toBeLessThan(
    mockPrepare.mock.invocationCallOrder[1]!,
  );
});
test("lost approval freezes writes; read reconciliation resumes without another approval", async () => {
  mockApprove.mockRejectedValueOnce(new Error("lost"));
  render(<Harness />);
  await prepare();
  fireEvent.click(
    screen.getByRole("button", { name: "ยืนยันแผนนี้และเริ่มซ่อม" }),
  );
  await screen.findByText(/ไม่ได้รับผลยืนยันจากระบบ/);
  expect(
    screen.getByRole("button", { name: "ยืนยันแผนนี้และเริ่มซ่อม" }),
  ).toBeDisabled();
  expect(mockAdvance).not.toHaveBeenCalled();
  mockView.mockResolvedValue(
    result({
      state: "READY",
      version: 1,
      canApprove: false,
      canResume: true,
      canCancel: false,
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "อ่านสถานะล่าสุด" }));
  await screen.findByRole("button", { name: "ดำเนินการต่อรายการเดิม" });
  fireEvent.click(
    screen.getByRole("button", { name: "ดำเนินการต่อรายการเดิม" }),
  );
  await screen.findByText("ซ่อมสำเร็จและตรวจหลักฐานครบแล้ว");
  expect(mockApprove).toHaveBeenCalledTimes(1);
});
test("double click while approval is in flight sends one approval", async () => {
  let resolve!: (view: RepairExecutionView) => void;
  mockApprove.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(<Harness />);
  await prepare();
  const button = screen.getByRole("button", {
    name: "ยืนยันแผนนี้และเริ่มซ่อม",
  });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(mockApprove).toHaveBeenCalledTimes(1);
  await act(async () =>
    resolve(result({ state: "READY", canApprove: false, canResume: false })),
  );
});
test("reload with pending key and no saved operation never creates a fresh intent", async () => {
  localStorage.setItem(REPAIR_PENDING_KEY, JSON.stringify({ version: 1, key }));
  render(<Harness />);
  await screen.findByText(/ยังไม่พบรายการเดิมที่ยืนยันได้/);
  fireEvent.click(screen.getByText("prepare"));
  await waitFor(() => expect(mockLookup).toHaveBeenCalledTimes(2));
  expect(mockPrepare).not.toHaveBeenCalled();
  expect(mockUuid).not.toHaveBeenCalled();
});
test("explicit fresh evidence after reload checks absence and reuses the saved key without approval", async () => {
  localStorage.setItem(REPAIR_PENDING_KEY, JSON.stringify({ version: 1, key }));
  render(<Harness request={{ ...input, scan: "fresh scan" }} />);
  await screen.findByText(/ยังไม่พบรายการเดิมที่ยืนยันได้/);
  fireEvent.click(screen.getByText("refresh evidence"));
  await screen.findByText("แผนซ่อมที่ต้องตรวจทานก่อนยืนยัน");
  expect(mockLookup).toHaveBeenCalledTimes(2);
  expect(mockPrepare).toHaveBeenCalledWith({
    ...input,
    scan: "fresh scan",
    key,
  });
  expect(mockLookup.mock.invocationCallOrder[1]).toBeLessThan(
    mockPrepare.mock.invocationCallOrder[0]!,
  );
  expect(mockUuid).not.toHaveBeenCalled();
  expect(mockApprove).not.toHaveBeenCalled();
});
test("fresh evidence restores an operation that already exists instead of replacing it", async () => {
  localStorage.setItem(REPAIR_PENDING_KEY, JSON.stringify({ version: 1, key }));
  render(<Harness />);
  await screen.findByText(/ยังไม่พบรายการเดิมที่ยืนยันได้/);
  mockLookup.mockResolvedValue(result());
  fireEvent.click(screen.getByText("refresh evidence"));
  await screen.findByText("แผนซ่อมที่ต้องตรวจทานก่อนยืนยัน");
  expect(mockPrepare).not.toHaveBeenCalled();
  expect(mockApprove).not.toHaveBeenCalled();
});
test("fresh evidence cannot write when the existing-key lookup fails", async () => {
  localStorage.setItem(REPAIR_PENDING_KEY, JSON.stringify({ version: 1, key }));
  render(<Harness />);
  await screen.findByText(/ยังไม่พบรายการเดิมที่ยืนยันได้/);
  mockLookup.mockRejectedValue(new Error("unavailable"));
  fireEvent.click(screen.getByText("refresh evidence"));
  await screen.findByText(/ไม่ได้รับผลยืนยันจากระบบ/);
  expect(mockPrepare).not.toHaveBeenCalled();
  expect(mockUuid).not.toHaveBeenCalled();
});
test("corrupted local recovery data blocks creation without deleting the evidence", async () => {
  localStorage.setItem(REPAIR_PENDING_KEY, '{"bad":true}');
  render(<Harness />);
  await screen.findByText(/อ่านข้อมูลกู้คืนในเครื่องไม่ได้/);
  fireEvent.click(screen.getByText("prepare"));
  expect(mockPrepare).not.toHaveBeenCalled();
  expect(localStorage.getItem(REPAIR_PENDING_KEY)).toBe('{"bad":true}');
});
test("writeoff still restores status and permits server-authorized recovery, while new prepare is blocked", async () => {
  mockEnabled = false;
  localStorage.setItem(REPAIR_PENDING_KEY, JSON.stringify({ version: 1, key }));
  mockLookup.mockResolvedValue(
    result({
      state: "CHAIN_STEPS",
      canApprove: false,
      canResume: true,
      canCancel: false,
    }),
  );
  render(<Harness />);
  await screen.findByRole("button", { name: "ดำเนินการต่อรายการเดิม" });
  fireEvent.click(
    screen.getByRole("button", { name: "ดำเนินการต่อรายการเดิม" }),
  );
  await screen.findByText("ซ่อมสำเร็จและตรวจหลักฐานครบแล้ว");
  expect(mockPrepare).not.toHaveBeenCalled();
  expect(mockAdvance).toHaveBeenCalledTimes(1);
});
test("pair prepare stays blocked even if the handler is called directly", async () => {
  render(
    <Harness
      request={{
        ...input,
        proposal: {
          ...input.proposal,
          targets: [...input.proposal.targets, ...input.proposal.targets],
        },
      }}
    />,
  );
  await waitFor(() => expect(screen.getByText("prepare")).toBeEnabled());
  fireEvent.click(screen.getByText("prepare"));
  expect(mockPrepare).not.toHaveBeenCalled();
});
test("completed plus failed refresh remains saved with read retry and no writable action", async () => {
  localStorage.setItem(REPAIR_PENDING_KEY, JSON.stringify({ version: 1, key }));
  mockLookup.mockResolvedValue(
    result({
      state: "COMPLETED",
      canApprove: false,
      canResume: false,
      canCancel: false,
    }),
  );
  render(<Harness />);
  await screen.findByText("ซ่อมสำเร็จและตรวจหลักฐานครบแล้ว");
  mockView.mockRejectedValue(new Error("offline"));
  fireEvent.click(screen.getByRole("button", { name: "อ่านสถานะล่าสุด" }));
  await screen.findByText(/ยืนยันว่าซ่อมสำเร็จแล้ว/);
  expect(
    screen.getByText("ซ่อมสำเร็จและตรวจหลักฐานครบแล้ว"),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "ยืนยันแผนนี้และเริ่มซ่อม" }),
  ).not.toBeInTheDocument();
});

test("fee display uses exact decimal KUB without losing large wei precision", () => {
  expect(weiToKub("1000000000000000001")).toBe("1.000000000000000001");
  expect(weiToKub("3000000000000000")).toBe("0.003");
  expect(weiToKub("12345678901234567890123456789")).toBe(
    "12345678901.234567890123456789",
  );
  expect(weiToKub("0")).toBe("0");
});

test("lost advance followed by reload reads completed operation without a second mutation", async () => {
  mockAdvance.mockRejectedValueOnce(new Error("response lost after commit"));
  const page = render(<Harness />);
  await prepare();
  fireEvent.click(
    screen.getByRole("button", { name: "ยืนยันแผนนี้และเริ่มซ่อม" }),
  );
  await screen.findByText(/ไม่ได้รับผลยืนยันจากระบบ/);
  page.unmount();
  mockLookup.mockResolvedValue(
    result({
      state: "COMPLETED",
      version: 2,
      canApprove: false,
      canResume: false,
      canCancel: false,
    }),
  );
  render(<Harness />);
  await screen.findByText("ซ่อมสำเร็จและตรวจหลักฐานครบแล้ว");
  expect(mockAdvance).toHaveBeenCalledTimes(1);
  expect(mockApprove).toHaveBeenCalledTimes(1);
  expect(mockPrepare).toHaveBeenCalledTimes(1);
});
test("partial DNA state preserves operation and exposes distinct NFT timestamp and manager effects", async () => {
  const draft = result();
  localStorage.setItem(REPAIR_PENDING_KEY, JSON.stringify({ version: 1, key }));
  mockLookup.mockResolvedValue(
    result({
      state: "RECOVERY_REQUIRED",
      mode: "chain",
      canApprove: false,
      canCancel: false,
      canResume: true,
      review: {
        ...draft.review,
        effects: {
          metadataCounterIncrement: 1,
          nftNativeTimestampsReset: ["1"],
          dnaClearedThenRestored: ["1"],
        },
        fees: {
          perStep: [{ stepId: "dna_restore", maxFeeWei: "1000000000000000" }],
          totalMaxFeeWei: "1000000000000000",
        },
      },
      steps: [
        { kind: "batch", state: "CONFIRMED", hash: "0x123", receipt: null },
        {
          kind: "dna_restore",
          tokenId: "2",
          state: "RESERVED",
          hash: null,
          receipt: null,
        },
      ],
    }),
  );
  render(<Harness />);
  await screen.findByText(/มีส่วนที่ต้องกู้คืน/);
  expect(screen.getByText(/เวลาภายในสัญญา NFT จะเปลี่ยน/)).toBeInTheDocument();
  expect(
    screen.getByText(/ตัวนับการแก้ข้อมูล Manager จะเพิ่ม/),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/ข้อมูล DNA จะถูกล้างแล้วใส่กลับ/),
  ).toBeInTheDocument();
  expect(screen.getByText("รวมสูงสุด 0.001 KUB")).toBeInTheDocument();
  expect(
    screen.getByText(/NFT 2.*ใส่ DNA กลับ: เตรียมไว้/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "ยืนยันแผนนี้และเริ่มซ่อม" }),
  ).not.toBeInTheDocument();
});
test("another operation response cannot replace the persisted reference", async () => {
  mockPrepare.mockResolvedValue(
    result({ id: "33333333-3333-4333-8333-333333333333" }),
  );
  render(<Harness />);
  await waitFor(() => expect(screen.getByText("prepare")).toBeEnabled());
  fireEvent.click(screen.getByText("prepare"));
  await screen.findByText(/คำตอบไม่ตรงกับเลขรายการ/);
  expect(JSON.parse(localStorage.getItem(REPAIR_PENDING_KEY)!)).toEqual(
    expect.objectContaining({ key }),
  );
  expect(
    screen.queryByRole("button", { name: "ยืนยันแผนนี้และเริ่มซ่อม" }),
  ).not.toBeInTheDocument();
});
