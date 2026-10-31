import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { ExportLayoutEditor } from "../ExportLayoutEditor";
import { detailFixture, layoutFixture } from "~/test-fixtures/export-layout";
import { encodeCompetitionClass } from "~/lib/competition-classes";
import type { ExportLayoutDetail } from "~/lib/competition-export-protocol";
const mockPreview = jest.fn();
const mockSave = jest.fn();
const mockFetch = jest.fn();
const mockDownload = jest.fn();
const mockRouter = {
  beforePopState: jest.fn(),
  replace: jest.fn(),
  asPath: "/dashboard/competitions/event.one/export",
};
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));
jest.mock("~/utils/api", () => ({
  api: {
    useUtils: () => ({ competitions: { exportLayout: { fetch: mockFetch } } }),
    competitions: {
      previewExportLayout: {
        useMutation: () => ({ mutateAsync: mockPreview, isPending: false }),
      },
      saveExportLayout: {
        useMutation: () => ({ mutateAsync: mockSave, isPending: false }),
      },
    },
  },
}));
const detail = (): ExportLayoutDetail => detailFixture();
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(global.crypto, "randomUUID", {
    configurable: true,
    value: () => "00000000-0000-4000-8000-000000000001",
  });
  mockPreview.mockImplementation(async () => ({
    exportPresentationVersion: 1,
    plan: detail().plan,
    rowCount: 1,
    ageWarningCount: 0,
    persisted: false,
  }));
  mockSave.mockResolvedValue(detail());
});
it("uses saved readiness, ordered Thai preview and both download formats", () => {
  render(<ExportLayoutEditor detail={detail()} download={mockDownload} />);
  expect(screen.getByText("01-ลูก-ดำ-ผู้")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "ดาวน์โหลด Excel" }));
  fireEvent.click(
    screen.getByRole("button", { name: "ดาวน์โหลดใบสมัคร DOCX (ZIP)" }),
  );
  expect(mockDownload.mock.calls).toEqual([["xlsx"], ["docx"]]);
});
it("requires missing setup review and keeps downloads blocked for a local draft", () => {
  const data = detail();
  data.layout = null;
  data.plan.state = "missing-layout";
  data.plan.diagnostics = [
    { code: "LAYOUT_MISSING", message: "ยังไม่มีรูปแบบไฟล์" },
  ];
  render(<ExportLayoutEditor detail={data} download={mockDownload} />);
  expect(
    screen.getByText(/งานนี้ยังไม่มีรูปแบบไฟล์ที่บันทึกไว้/),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "ดาวน์โหลด Excel" }),
  ).toBeDisabled();
  expect(screen.getByText("ยังไม่มีรูปแบบไฟล์")).toBeVisible();
});
it("reorders categories and sex/color subgroups and saves only the reviewed preview with revision guards", async () => {
  const data = detail();
  const second = {
    ...layoutFixture().categories[0]!,
    id: "cat-two",
    fullLabelTh: "รุ่นควายรุ่น",
    posterNumber: "2",
  };
  data.layout!.categories.push(second);
  render(<ExportLayoutEditor detail={data} download={mockDownload} />);
  fireEvent.change(screen.getAllByLabelText("ชื่อย่อภาษาไทยสำหรับชีต")[0]!, {
    target: { value: "ลูกน้อย" },
  });
  expect(
    screen.getByRole("button", { name: "ดาวน์โหลด Excel" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "บันทึกรูปแบบไฟล์" }),
  ).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "เลื่อนกลุ่มที่ 1 ของหมวดที่ 1 ลง" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "เลื่อนหมวดที่ 1 ลง" }));
  fireEvent.click(screen.getByRole("button", { name: "ดูตัวอย่างลำดับชีต" }));
  await screen.findByText("ตรวจครบแล้ว บันทึกรูปแบบนี้ก่อนดาวน์โหลด");
  const previewInput = (mockPreview.mock.calls as unknown[][])[0]![0] as {
    layout: ReturnType<typeof layoutFixture>;
  };
  expect(previewInput.layout.categories.map((c) => c.id)).toEqual([
    "cat-two",
    "cat-one",
  ]);
  expect(previewInput.layout.categories[1]!.groups[0]!.sex).toBe("female");
  expect(data.event.catalogs.national).toEqual(["รุ่นลูกควาย", "รุ่นควายรุ่น"]);
  fireEvent.click(screen.getByRole("button", { name: "บันทึกรูปแบบไฟล์" }));
  await screen.findByText("บันทึกรูปแบบไฟล์แล้ว");
  expect(mockSave).toHaveBeenCalledWith(
    expect.objectContaining({
      id: "event.one",
      expectedRevision: "rev1",
      expectedCatalogFingerprint: "a".repeat(64),
      operationId: "00000000-0000-4000-8000-000000000001",
    }),
  );
});
it("invalidates a previous preview after edits and validates Thai names before requesting preview", async () => {
  render(<ExportLayoutEditor detail={detail()} download={mockDownload} />);
  fireEvent.click(screen.getByRole("button", { name: "ดูตัวอย่างลำดับชีต" }));
  await screen.findByText("ตรวจครบแล้ว บันทึกรูปแบบนี้ก่อนดาวน์โหลด");
  fireEvent.change(screen.getByLabelText("ชื่อรุ่นเต็มภาษาไทย"), {
    target: { value: "English class" },
  });
  expect(
    screen.getByRole("button", { name: "บันทึกรูปแบบไฟล์" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "ดูตัวอย่างลำดับชีต" }));
  expect(mockPreview).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("alert")).toHaveTextContent("หมวดที่ 1");
});
it("shows source blockers rather than enabling a partial export", async () => {
  mockPreview.mockResolvedValue({
    plan: {
      ...detail().plan,
      state: "needs-review",
      diagnostics: [
        {
          code: "UNMAPPED",
          message: "ยังมีรุ่นที่ไม่ได้กำหนด",
          value: "รุ่นเดิม",
          registrationIds: ["r1", "r2"],
        },
      ],
    },
  });
  render(<ExportLayoutEditor detail={detail()} download={mockDownload} />);
  fireEvent.click(screen.getByRole("button", { name: "ดูตัวอย่างลำดับชีต" }));
  await screen.findByText(/ยังมีรุ่นที่ไม่ได้กำหนด/);
  expect(
    screen.getByRole("button", { name: "บันทึกรูปแบบไฟล์" }),
  ).toBeDisabled();
});
it("retains draft through conflict, refreshes source revisions and safely retries", async () => {
  mockSave.mockRejectedValueOnce(new Error("ข้อมูลถูกแก้ไขแล้ว"));
  const fresh = detail();
  fresh.event._rev = "rev2";
  mockFetch.mockResolvedValue(fresh);
  render(<ExportLayoutEditor detail={detail()} download={mockDownload} />);
  fireEvent.change(screen.getByLabelText("ชื่อย่อภาษาไทยสำหรับชีต"), {
    target: { value: "ลูกน้อย" },
  });
  fireEvent.click(screen.getByRole("button", { name: "ดูตัวอย่างลำดับชีต" }));
  await screen.findByText("ตรวจครบแล้ว บันทึกรูปแบบนี้ก่อนดาวน์โหลด");
  fireEvent.click(screen.getByRole("button", { name: "บันทึกรูปแบบไฟล์" }));
  await screen.findByText("ข้อมูลถูกแก้ไขแล้ว");
  fireEvent.click(
    screen.getByRole("button", { name: "โหลดข้อมูลล่าสุดโดยเก็บร่าง" }),
  );
  await screen.findByText(/โหลดข้อมูลล่าสุดแล้ว ร่างของคุณยังอยู่/);
  expect(screen.getByLabelText("ชื่อย่อภาษาไทยสำหรับชีต")).toHaveValue(
    "ลูกน้อย",
  );
  fireEvent.click(screen.getByRole("button", { name: "ดูตัวอย่างลำดับชีต" }));
  await screen.findByText("ตรวจครบแล้ว บันทึกรูปแบบนี้ก่อนดาวน์โหลด");
  fireEvent.click(screen.getByRole("button", { name: "บันทึกรูปแบบไฟล์" }));
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(2));
  expect((mockSave.mock.calls as unknown[][])[1]![0]).toMatchObject({
    expectedRevision: "rev2",
  });
});
it("supports zero-registration catalog categories and explicit custom controlled-value translations", () => {
  render(<ExportLayoutEditor detail={detail()} download={mockDownload} />);
  fireEvent.change(screen.getByLabelText(/เพิ่มหมวดจากรุ่นต้นทาง/), {
    target: {
      value: JSON.stringify({ level: "national", raw: "รุ่นควายรุ่น" }),
    },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "เพิ่มหมวดจากรุ่นที่เลือก" }),
  );
  expect(screen.getAllByLabelText("ชื่อรุ่นเต็มภาษาไทย")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "เพิ่มคำแปลค่าต้นทาง" }));
  const alias = screen.getByRole("group", { name: "คำแปลที่ 1" });
  fireEvent.change(
    within(alias).getByLabelText("ค่าต้นทาง (เว้นว่างเฉพาะข้อมูลที่ขาด)"),
    { target: { value: "spotted" } },
  );
  fireEvent.change(within(alias).getByLabelText("ความหมาย"), {
    target: { value: "custom" },
  });
  fireEvent.change(within(alias).getByLabelText("คำแสดงภาษาไทย"), {
    target: { value: "ด่าง" },
  });
  expect(within(alias).getByLabelText("คำแสดงภาษาไทย")).toHaveValue("ด่าง");
});

it("distinguishes encoded classes with identical names and binds the exact chosen rule", async () => {
  const first = encodeCompetitionClass({
    name: "รุ่นชื่อซ้ำ",
    kind: "age",
    minMonths: 10,
    maxMonths: 18,
    minInclusive: true,
    group: "ดำ",
    criteria: "",
  });
  const second = encodeCompetitionClass({
    name: "รุ่นชื่อซ้ำ",
    kind: "age",
    minMonths: 19,
    maxMonths: 24,
    minInclusive: true,
    group: "เผือก",
    criteria: "ตรวจเพิ่มเติม",
  });
  const data = detail();
  data.event.catalogs.national = [first, second];
  data.layout!.categories[0]!.catalogValue = first;
  data.layout!.categories[0]!.registrationTypeValues = [first];
  data.bindings = [
    {
      rawType: first,
      level: "ประเทศ",
      color: "black",
      sex: "male",
      count: 1,
      catalogValue: first,
    },
    {
      rawType: second,
      level: "ประเทศ",
      color: "albino",
      sex: "female",
      count: 1,
      catalogValue: second,
    },
  ];
  render(<ExportLayoutEditor detail={data} download={mockDownload} />);
  const firstCheckbox = screen.getByRole("checkbox", {
    name: /ดำ • ตั้งแต่ 10 เดือน ถึง 18 เดือน/,
  });
  const secondCheckbox = screen.getByRole("checkbox", {
    name: /เผือก • ตั้งแต่ 19 เดือน ถึง 24 เดือน • ตรวจเพิ่มเติม/,
  });
  expect(firstCheckbox).toBeChecked();
  expect(secondCheckbox).not.toBeChecked();
  fireEvent.click(secondCheckbox);
  fireEvent.click(firstCheckbox);
  fireEvent.click(screen.getByRole("button", { name: "ดูตัวอย่างลำดับชีต" }));
  await waitFor(() => expect(mockPreview).toHaveBeenCalledTimes(1));
  const sent = (mockPreview.mock.calls as unknown[][])[0]![0] as {
    layout: ReturnType<typeof layoutFixture>;
  };
  expect(sent.layout.categories[0]!.registrationTypeValues).toEqual([second]);
});
it("shows actionable source diagnostics after save failure and retains the editable draft", async () => {
  mockSave.mockRejectedValue({
    message: "ยังไม่พร้อม",
    data: {
      exportDiagnostics: [
        {
          code: "UNKNOWN_COLOR",
          message: "กรุณาแปลสีเดิม",
          value: "spotted",
          registrationIds: ["reg1"],
        },
      ],
    },
  });
  render(<ExportLayoutEditor detail={detail()} download={mockDownload} />);
  fireEvent.change(screen.getByLabelText("ชื่อย่อภาษาไทยสำหรับชีต"), {
    target: { value: "ลูกน้อย" },
  });
  fireEvent.click(screen.getByRole("button", { name: "ดูตัวอย่างลำดับชีต" }));
  await screen.findByText("ตรวจครบแล้ว บันทึกรูปแบบนี้ก่อนดาวน์โหลด");
  fireEvent.click(screen.getByRole("button", { name: "บันทึกรูปแบบไฟล์" }));
  await screen.findByText(/กรุณาแปลสีเดิม/);
  expect(screen.getByLabelText("ชื่อย่อภาษาไทยสำหรับชีต")).toHaveValue(
    "ลูกน้อย",
  );
  expect(
    screen.getByRole("button", { name: "ดาวน์โหลด Excel" }),
  ).toBeDisabled();
});
it("refreshes a changed catalog after preview without losing the draft, then explicitly reviews and saves current guards", async () => {
  const fresh = detail();
  fresh.event._rev = "rev2";
  fresh.event.catalogs.national.push("รุ่นควายใหญ่");
  fresh.plan.catalogFingerprint = "c".repeat(64);
  fresh.plan.state = "needs-review";
  fresh.plan.diagnostics = [
    { code: "STALE_CATALOG", message: "กรุณาตรวจชุดรุ่นที่เปลี่ยนแล้ว" },
  ];
  mockPreview
    .mockResolvedValueOnce({ plan: fresh.plan })
    .mockResolvedValueOnce({
      plan: { ...fresh.plan, state: "ready", diagnostics: [] },
    });
  mockFetch.mockResolvedValue(fresh);
  mockSave.mockResolvedValue({
    ...fresh,
    plan: { ...fresh.plan, state: "ready", diagnostics: [] },
  });
  render(<ExportLayoutEditor detail={detail()} download={mockDownload} />);
  fireEvent.change(screen.getByLabelText("ชื่อย่อภาษาไทยสำหรับชีต"), {
    target: { value: "ลูกน้อย" },
  });
  fireEvent.click(screen.getByRole("button", { name: "ดูตัวอย่างลำดับชีต" }));
  await screen.findByText("กรุณาตรวจชุดรุ่นที่เปลี่ยนแล้ว");
  expect(
    screen.getByRole("button", { name: "บันทึกรูปแบบไฟล์" }),
  ).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "โหลดข้อมูลล่าสุดโดยเก็บร่าง" }),
  );
  await screen.findByText(/โหลดข้อมูลล่าสุดแล้ว ร่างของคุณยังอยู่/);
  expect(screen.getByLabelText("ชื่อย่อภาษาไทยสำหรับชีต")).toHaveValue(
    "ลูกน้อย",
  );
  expect(
    screen.getByRole("combobox", { name: /เพิ่มหมวดจากรุ่นต้นทาง/ }),
  ).toHaveTextContent("รุ่นควายใหญ่");
  fireEvent.click(
    screen.getByRole("button", { name: "ยืนยันตรวจชุดรุ่นล่าสุดแล้ว" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "ดูตัวอย่างลำดับชีต" }));
  await screen.findByText("ตรวจครบแล้ว บันทึกรูปแบบนี้ก่อนดาวน์โหลด");
  fireEvent.click(screen.getByRole("button", { name: "บันทึกรูปแบบไฟล์" }));
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
  const saved = (mockSave.mock.calls as unknown[][])[0]![0] as {
    expectedRevision: string;
    expectedCatalogFingerprint: string;
    layout: ReturnType<typeof layoutFixture>;
  };
  expect(saved.expectedRevision).toBe("rev2");
  expect(saved.expectedCatalogFingerprint).toBe("c".repeat(64));
  expect(saved.layout.reviewedCatalogFingerprint).toBe("c".repeat(64));
  expect(saved.layout.categories[0]!.shortLabelTh).toBe("ลูกน้อย");
});
