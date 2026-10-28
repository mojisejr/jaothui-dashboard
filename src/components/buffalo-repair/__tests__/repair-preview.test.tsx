import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import RepairDiagnosisScreen from "../RepairDiagnosisScreen";
import { emptyTarget, proposalFor } from "../useRepairPreview";
const mockStart = jest.fn(),
  mockPage = jest.fn(),
  mockPreview = jest.fn();
jest.mock("~/utils/api", () => ({
  api: {
    useUtils: () => ({
      buffaloRepair: {
        startScan: { fetch: mockStart },
        scanPage: { fetch: mockPage },
      },
    }),
    buffaloRepair: {
      preview: { useMutation: () => ({ mutateAsync: mockPreview }) },
    },
  },
}));
const a = "999000000008001",
  b = "999000000008002";
const session = () => ({
  scan: "server-signed-scan",
  pin: {
    scanId: "scan-A",
    scanCount: 40,
    pageSize: 20,
    expiresAt: Date.now() + 1800000,
    blockNumber: "100",
    blockHash: "0xblock",
    nft: "0xnft",
    manager: "0xmanager",
    chainId: 96,
  },
});
function preview(pair = false, blocked = false) {
  return {
    status: blocked ? "needs_review" : "ready_for_operator_review",
    blockers: blocked ? ["EXPANDED_SCOPE_REQUIRED"] : [],
    digest: "preview-fingerprint",
    manifest: {
      authority: "preview_only",
      pin: session().pin,
      changes: (pair ? [a, b] : [a]).map((microchip, i) => ({
        sourceMicrochip: microchip,
        desiredMicrochip: microchip,
        desiredTokenId: String(i + 1),
        database: { microchip, tokenId: String(i + 9) },
        chain: { microchip },
        databaseChange: true,
        chainChange: false,
        evidence: [{ kind: "physical_scan", reference: `evidence-${i}` }],
      })),
      coverage: { range: { first: "1", last: "40" }, count: 40 },
      closure: { database: [], canonical: [], aliases: [] },
      references: [],
      assets: { verification: "complete", tokens: [] },
      effects: {
        dnaClearedThenRestored: [] as string[],
        metadataCounterIncrement: 0,
        nativeCreatedAtResets: [] as string[],
        nativeUpdatedAtResets: [] as string[],
      },
    },
  };
}
async function scan() {
  fireEvent.click(screen.getByRole("button", { name: "เริ่มตรวจขอบเขต" }));
  await screen.findByText("2. ระบุตัวตนที่หลักฐานยืนยัน");
}
function fill(index = 0) {
  const values: Record<string, string> = {
    source: index ? b : a,
    chip: index ? b : a,
    token: String(index + 1),
    evidence: `physical-scan-${index}`,
  };
  for (const [name, value] of Object.entries(values))
    fireEvent.change(document.getElementById(`repair-${name}-${index}`)!, {
      target: { value },
    });
}
beforeEach(() => {
  jest.clearAllMocks();
  mockStart.mockResolvedValue(session());
  mockPage.mockImplementation(async ({ offset }: { offset: number }) => ({
    offset,
    count: 20,
    nextOffset: offset === 0 ? 20 : null,
    receipt: `signed-page-${offset}`,
  }));
  mockPreview.mockResolvedValue(preview());
});
test("bounded pages supply exact signed receipts and DB-only preview never exposes execution", async () => {
  render(<RepairDiagnosisScreen />);
  await scan();
  fill();
  fireEvent.click(
    screen.getByRole("button", { name: "ตรวจข้อเสนอและดูก่อน–หลัง" }),
  );
  await screen.findByText("ผลตรวจและข้อเสนอการเปลี่ยนแปลง");
  expect(mockStart).toHaveBeenCalledTimes(1);
  expect(mockPage.mock.calls).toEqual([
    [{ scan: "server-signed-scan", offset: 0 }],
    [{ scan: "server-signed-scan", offset: 20 }],
  ]);
  expect(mockPreview).toHaveBeenCalledWith(
    expect.objectContaining({
      scan: "server-signed-scan",
      pages: ["signed-page-0", "signed-page-20"],
    }),
  );
  expect(
    screen.getByText("ไม่ต้องส่งธุรกรรมแก้ตัวตนบน blockchain"),
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "เปิดสรุปสำหรับตรวจทาน" }),
  );
  expect(
    screen.getByText(/ข้อเสนอนี้ยังเป็น preview_only/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", {
      name: /ส่งธุรกรรม|เริ่มซ่อม|ยืนยันการซ่อม/,
    }),
  ).not.toBeInTheDocument();
});
test("pause keeps completed page receipt and resumes same scan from the next page", async () => {
  let resolve!: (page: unknown) => void;
  mockPage.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(<RepairDiagnosisScreen />);
  fireEvent.click(screen.getByRole("button", { name: "เริ่มตรวจขอบเขต" }));
  await waitFor(() => expect(mockPage).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "พักการอ่าน" }));
  await act(async () => {
    resolve({ offset: 0, count: 20, nextOffset: 20, receipt: "signed-page-0" });
  });
  expect(mockPage).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/พักการอ่านแล้ว/)).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "อ่านต่อจากหน้าที่ค้าง" }),
  );
  await screen.findByText("2. ระบุตัวตนที่หลักฐานยืนยัน");
  expect(mockStart).toHaveBeenCalledTimes(1);
  expect(mockPage).toHaveBeenLastCalledWith({
    scan: "server-signed-scan",
    offset: 20,
  });
});
test("failed page retries its offset without replacing successful receipts", async () => {
  mockPage
    .mockResolvedValueOnce({
      offset: 0,
      count: 20,
      nextOffset: 20,
      receipt: "signed-page-0",
    })
    .mockRejectedValueOnce(Error("network"));
  render(<RepairDiagnosisScreen />);
  fireEvent.click(screen.getByRole("button", { name: "เริ่มตรวจขอบเขต" }));
  await screen.findByRole("button", { name: "อ่านหน้าที่ค้างอีกครั้ง" });
  fireEvent.click(
    screen.getByRole("button", { name: "อ่านหน้าที่ค้างอีกครั้ง" }),
  );
  await screen.findByText("2. ระบุตัวตนที่หลักฐานยืนยัน");
  fill();
  fireEvent.click(
    screen.getByRole("button", { name: "ตรวจข้อเสนอและดูก่อน–หลัง" }),
  );
  await waitFor(() =>
    expect(mockPreview).toHaveBeenCalledWith(
      expect.objectContaining({ pages: ["signed-page-0", "signed-page-20"] }),
    ),
  );
  expect(mockStart).toHaveBeenCalledTimes(1);
  expect(
    (mockPage.mock.calls as [{ offset: number }][]).map(
      (call: [{ offset: number }]) => call[0].offset,
    ),
  ).toEqual([0, 20, 20]);
});
test("pair evidence stays per cow and third-party closure blocks review without widening scope", async () => {
  mockPreview.mockResolvedValue(preview(true, true));
  render(<RepairDiagnosisScreen />);
  await scan();
  fireEvent.click(screen.getByLabelText("2 ตัว"));
  fill(0);
  fill(1);
  fireEvent.click(
    screen.getByRole("button", { name: "ตรวจข้อเสนอและดูก่อน–หลัง" }),
  );
  await screen.findByText(/พบควายตัวที่สาม/);
  expect(
    screen.getByRole("button", { name: "เปิดสรุปสำหรับตรวจทาน" }),
  ).toBeDisabled();
  const args = (mockPreview.mock.calls as [unknown][])[0]![0] as {
    proposal: { targets: unknown[] };
  };
  expect(args.proposal.targets).toHaveLength(2);
});
test("changing a reviewed identity makes old preview stale and keeps all typed evidence", async () => {
  render(<RepairDiagnosisScreen />);
  await scan();
  fill();
  fireEvent.click(
    screen.getByRole("button", { name: "ตรวจข้อเสนอและดูก่อน–หลัง" }),
  );
  await screen.findByText("ผลตรวจและข้อเสนอการเปลี่ยนแปลง");
  fireEvent.click(
    screen.getByRole("button", { name: "กลับไปตรวจข้อมูลและหลักฐาน" }),
  );
  fireEvent.change(document.getElementById("repair-chip-0")!, {
    target: { value: b },
  });
  expect(screen.getByText(/ข้อเสนอที่แสดงเป็นฉบับเก่า/)).toBeInTheDocument();
  expect(document.getElementById("repair-evidence-0")).toHaveValue(
    "physical-scan-0",
  );
  expect(screen.getByRole("button", { name: "4. สรุปตรวจทาน" })).toBeDisabled();
});
test("server rejection preserves inputs and exact diagnostic, with no fake execution", async () => {
  mockPreview.mockRejectedValue({
    data: {
      diagnostic: {
        code: "REPAIR_BASELINE_CHANGED",
        stage: "identity",
        reason: "หลักฐานเปลี่ยน กรุณาอ่านชุดใหม่",
        requestId: "repair-reference",
        outcome: "not_started",
        nextAction: "refresh_record",
      },
    },
  });
  render(<RepairDiagnosisScreen />);
  await scan();
  fill();
  fireEvent.change(document.getElementById("repair-previous-0")!, {
    target: { value: "old-typo-exact" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "ตรวจข้อเสนอและดูก่อน–หลัง" }),
  );
  await screen.findByText("หลักฐานเปลี่ยน กรุณาอ่านชุดใหม่");
  expect(document.getElementById("repair-previous-0")).toHaveValue(
    "old-typo-exact",
  );
  expect(screen.getByText(/repair-reference/)).toBeInTheDocument();
  const requested = (
    mockPreview.mock.calls as [
      {
        proposal: {
          targets: { confirmedPreviousCanonicalMicrochip?: string }[];
        };
      },
    ][]
  )[0]![0];
  expect(
    requested.proposal.targets[0]?.confirmedPreviousCanonicalMicrochip,
  ).toBe("old-typo-exact");
});

test("failed fresh start retries startScan rather than silently reusing old complete scan", async () => {
  render(<RepairDiagnosisScreen />);
  await scan();
  fireEvent.click(screen.getByRole("button", { name: "1. ตรวจขอบเขต" }));
  mockStart.mockRejectedValueOnce(Error("network"));
  fireEvent.click(screen.getByRole("button", { name: "เริ่มหลักฐานชุดใหม่" }));
  await screen.findByRole("button", { name: "เริ่มอ่านหลักฐานชุดใหม่" });
  fireEvent.click(
    screen.getByRole("button", { name: "เริ่มอ่านหลักฐานชุดใหม่" }),
  );
  await screen.findByText("2. ระบุตัวตนที่หลักฐานยืนยัน");
  expect(mockStart).toHaveBeenCalledTimes(3);
  expect(mockPage).toHaveBeenCalledTimes(4);
});
test("server error during repeated preview marks retained preview stale even when inputs unchanged", async () => {
  render(<RepairDiagnosisScreen />);
  await scan();
  fill();
  fireEvent.click(
    screen.getByRole("button", { name: "ตรวจข้อเสนอและดูก่อน–หลัง" }),
  );
  await screen.findByText("ผลตรวจและข้อเสนอการเปลี่ยนแปลง");
  fireEvent.click(
    screen.getByRole("button", { name: "กลับไปตรวจข้อมูลและหลักฐาน" }),
  );
  mockPreview.mockRejectedValueOnce(Error("network"));
  fireEvent.click(
    screen.getByRole("button", { name: "ตรวจข้อเสนอและดูก่อน–หลัง" }),
  );
  await screen.findByRole("button", { name: "ตรวจข้อเสนอเดิมอีกครั้ง" });
  expect(screen.getByText(/ข้อเสนอที่แสดงเป็นฉบับเก่า/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "4. สรุปตรวจทาน" })).toBeDisabled();
});
test("positive pair keeps both identities and shows DNA/native effects separately", async () => {
  const result = preview(true);
  for (const change of result.manifest.changes) change.chainChange = true;
  result.manifest.effects = {
    dnaClearedThenRestored: ["1", "2"],
    metadataCounterIncrement: 2,
    nativeCreatedAtResets: ["1", "2"],
    nativeUpdatedAtResets: ["1", "2"],
  };
  mockPreview.mockResolvedValue(result);
  render(<RepairDiagnosisScreen />);
  await scan();
  fireEvent.click(screen.getByLabelText("2 ตัว"));
  fill();
  fill(1);
  fireEvent.click(
    screen.getByRole("button", { name: "ตรวจข้อเสนอและดูก่อน–หลัง" }),
  );
  await screen.findByText("ผลตรวจและข้อเสนอการเปลี่ยนแปลง");
  expect(screen.getByText(/คืนค่า DNA เดิมของ NFT: 1, 2/)).toBeInTheDocument();
  expect(
    screen.getByText("ตัวนับ metadata เพิ่มที่คาด: 2"),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "เปิดสรุปสำหรับตรวจทาน" }),
  ).toBeEnabled();
});

test("entry query prepopulates source only, never the desired chip or NFT", async () => {
  const original = window.location.href;
  window.history.replaceState(
    null,
    "",
    `/dashboard/repair-buffalo?microchip=${a}&desiredTokenId=999&desiredMicrochip=${b}`,
  );
  try {
    render(<RepairDiagnosisScreen />);
    await scan();
    expect(document.getElementById("repair-source-0")).toHaveValue(a);
    expect(document.getElementById("repair-chip-0")).toHaveValue("");
    expect(document.getElementById("repair-token-0")).toHaveValue("");
  } finally {
    window.history.replaceState(null, "", original);
  }
});

test("malformed source and known aliases preserve exact spaces/commas; desired chip remains strict", () => {
  const target = {
    ...emptyTarget(),
    sourceMicrochip: " legacy-X ",
    desiredMicrochip: a,
    desiredTokenId: "1",
    evidenceReference: "physical-proof",
  };
  const proposal = proposalFor(
    [target],
    " old alias, exact \n0099bad\n\n trailing  ",
  );
  expect(proposal.targets[0]?.sourceMicrochip).toBe(" legacy-X ");
  expect(proposal.knownAliases).toEqual([
    " old alias, exact ",
    "0099bad",
    " trailing  ",
  ]);
  for (const desiredMicrochip of ["legacy-X", ` ${a}`, `${a} `])
    expect(() => proposalFor([{ ...target, desiredMicrochip }], "")).toThrow();
  expect(() =>
    proposalFor([{ ...target, sourceMicrochip: "x".repeat(129) }], ""),
  ).toThrow();
  expect(() => proposalFor([target], "x".repeat(129))).toThrow();
});
test("legacy source query prefill preserves exact malformed key and leaves desired fields empty", async () => {
  const original = window.location.href,
    source = " legacy, key &desiredTokenId=999 ";
  window.history.replaceState(
    null,
    "",
    `/dashboard/repair-buffalo?microchip=${encodeURIComponent(source)}`,
  );
  try {
    render(<RepairDiagnosisScreen />);
    await scan();
    expect(document.getElementById("repair-source-0")).toHaveValue(source);
    expect(document.getElementById("repair-source-0")).not.toHaveAttribute(
      "pattern",
    );
    expect(document.getElementById("repair-source-0")).toHaveAttribute(
      "maxlength",
      "128",
    );
    expect(document.getElementById("repair-chip-0")).toHaveValue("");
    expect(document.getElementById("repair-chip-0")).toHaveAttribute(
      "pattern",
      "[0-9]{15}",
    );
    expect(document.getElementById("repair-token-0")).toHaveValue("");
  } finally {
    window.history.replaceState(null, "", original);
  }
});
