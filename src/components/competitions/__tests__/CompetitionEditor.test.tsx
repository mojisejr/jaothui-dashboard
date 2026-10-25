import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CompetitionEditor } from "../CompetitionEditor";
import type { Competition, CompetitionInput } from "~/lib/competitions";
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockAction = jest.fn();
const mockImpact = jest.fn();
const mockReview = jest.fn();
const mockRouter = {
  route: "/dashboard/competitions/[id]",
  pathname: "/dashboard/competitions/[id]",
  query: { id: "event1" },
  asPath: "/dashboard/competitions/event1",
  push: jest.fn().mockResolvedValue(true),
  replace: jest.fn().mockResolvedValue(true),
  prefetch: jest.fn().mockResolvedValue(undefined),
  beforePopState: jest.fn(),
  events: { on: jest.fn(), off: jest.fn(), emit: jest.fn() },
  isFallback: false,
};
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));
jest.mock("~/context/auth.context", () => ({
  useAuth: () => ({ token: "session", isAuth: true }),
}));
jest.mock("~/utils/api", () => ({
  api: {
    useUtils: () => ({
      competitions: {
        list: { invalidate: jest.fn() },
        get: { invalidate: jest.fn(), fetch: jest.fn() },
      },
    }),
    competitions: {
      list: { useQuery: () => ({ data: { items: [] } }) },
      create: {
        useMutation: () => ({ mutateAsync: mockCreate, isPending: false }),
      },
      update: {
        useMutation: () => ({ mutateAsync: mockUpdate, isPending: false }),
      },
      action: {
        useMutation: () => ({ mutateAsync: mockAction, isPending: false }),
      },
      impact: {
        useMutation: () => ({ mutateAsync: mockImpact, isPending: false }),
      },
      review: {
        useMutation: () => ({ mutateAsync: mockReview, isPending: false }),
      },
    },
  },
}));
const event: Competition = {
  _id: "event1",
  _rev: "revision1",
  title: "งานเดิม",
  description: "",
  location: "",
  catalogs: { national: ["มากกว่า 12 เดือน ถึง 15 เดือน"], province: [] },
  registrationCount: 2,
  eventType: "normal",
  buffaloAgeDeadline: "2026-10-18",
  registrationActive: false,
  policy: {
    today: "2026-10-15",
    lifecycle: "upcoming",
    publicRegistration: "closed-manual",
    publicVisible: true,
    onsiteAllowed: true,
    warnings: [],
  },
};
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(global.crypto, "randomUUID", {
    configurable: true,
    value: () => "09e811fa-e610-43a1-bfca-43294bfd33d7",
  });
});
it("cancels internal link navigation without throwing and allows confirmed navigation", () => {
  render(<CompetitionEditor existing={event} />);
  fireEvent.change(screen.getByRole("textbox", { name: /ชื่องาน/ }), {
    target: { value: "ยังไม่บันทึก" },
  });
  const link = document.createElement("a");
  link.href = "/dashboard/competitions";
  const navigate = jest.fn((e: Event) => e.preventDefault());
  link.addEventListener("click", navigate);
  document.body.append(link);
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(false);
  try {
    expect(() =>
      link.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
      ),
    ).not.toThrow();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: /ชื่องาน/ })).toHaveValue(
      "ยังไม่บันทึก",
    );
    confirm.mockReturnValue(true);
    expect(() =>
      link.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
      ),
    ).not.toThrow();
    expect(navigate).toHaveBeenCalledTimes(1);
  } finally {
    link.remove();
    confirm.mockRestore();
  }
});
it("keeps dirty editor state when back is cancelled and allows confirmed back", () => {
  render(<CompetitionEditor existing={event} />);
  fireEvent.change(screen.getByRole("textbox", { name: /ชื่องาน/ }), {
    target: { value: "แก้แล้วอย่าเพิ่งออก" },
  });
  const guards = mockRouter.beforePopState.mock.calls as Array<[() => boolean]>;
  const guard = guards.at(-1)![0];
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(false);
  try {
    expect(guard()).toBe(false);
    expect(mockRouter.replace).toHaveBeenCalledWith(
      mockRouter.asPath,
      undefined,
      { shallow: true, scroll: false },
    );
    expect(screen.getByRole("textbox", { name: /ชื่องาน/ })).toHaveValue(
      "แก้แล้วอย่าเพิ่งออก",
    );
    confirm.mockReturnValue(true);
    expect(guard()).toBe(true);
    expect(mockRouter.events.emit).not.toHaveBeenCalled();
  } finally {
    confirm.mockRestore();
  }
});
it("locks rules after applications while leaving signup deadline editable", () => {
  render(<CompetitionEditor existing={event} />);
  expect(screen.getByLabelText("วันที่ใช้ตัดอายุควาย")).toBeDisabled();
  expect(screen.getByLabelText("ชื่อรุ่น")).toBeDisabled();
  expect(screen.getByLabelText("วันปิดรับสมัคร")).toBeEnabled();
  fireEvent.click(
    screen.getByRole("button", { name: "เตรียมเสนอแก้กติกาเป็นกรณีพิเศษ" }),
  );
  expect(screen.getByLabelText("วันที่ใช้ตัดอายุควาย")).toBeEnabled();
  expect(screen.getByRole("button", { name: "บันทึกการแก้ไข" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "สร้างรายงานผลกระทบ" }),
  ).toBeVisible();
});
it("preserves fields and operation ID after failed save and retry", async () => {
  mockCreate.mockRejectedValue(new Error("ลองใหม่"));
  render(<CompetitionEditor />);
  fireEvent.change(screen.getByRole("textbox", { name: /ชื่องาน/ }), {
    target: { value: "งานที่กรอกไว้" },
  });
  fireEvent.click(screen.getByRole("button", { name: "บันทึกงานร่าง" }));
  await screen.findByText("ลองใหม่");
  expect(screen.getByRole("textbox", { name: /ชื่องาน/ })).toHaveValue(
    "งานที่กรอกไว้",
  );
  fireEvent.click(screen.getByRole("button", { name: "บันทึกงานร่าง" }));
  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(2));
  expect(mockCreate.mock.calls[0]).toEqual(mockCreate.mock.calls[1]);
});
it("rejects reversed event dates without writing", async () => {
  render(<CompetitionEditor />);
  fireEvent.change(screen.getByRole("textbox", { name: /ชื่องาน/ }), {
    target: { value: "งานทดสอบ" },
  });
  fireEvent.change(screen.getByLabelText("วันเริ่มงาน"), {
    target: { value: "2026-10-20" },
  });
  fireEvent.change(screen.getByLabelText("วันจบงาน"), {
    target: { value: "2026-10-19" },
  });
  fireEvent.click(screen.getByRole("button", { name: "บันทึกงานร่าง" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "วันจบงานต้องไม่ก่อนวันเริ่มงาน",
  );
  expect(mockCreate).not.toHaveBeenCalled();
});

it("explains duplicate catalogs in Thai and preserves the entered classes", async () => {
  render(<CompetitionEditor />);
  fireEvent.change(screen.getByRole("textbox", { name: /ชื่องาน/ }), {
    target: { value: "งานทดสอบรุ่นซ้ำ" },
  });
  fireEvent.click(screen.getByRole("button", { name: "เพิ่มรุ่น" }));
  fireEvent.click(screen.getByRole("button", { name: "คัดลอกรุ่นที่ 1" }));
  fireEvent.click(screen.getByRole("button", { name: "บันทึกงานร่าง" }));
  const error = await screen.findByRole("alert");
  expect(error).toHaveTextContent("ชื่อรุ่นซ้ำ");
  expect(error).not.toHaveTextContent("catalogs.national");
  expect(screen.getAllByLabelText("ชื่อรุ่น")).toHaveLength(2);
  expect(mockCreate).not.toHaveBeenCalled();
});

it("translates schema length errors into field guidance without losing the title", async () => {
  render(<CompetitionEditor />);
  const title = screen.getByRole("textbox", { name: /ชื่องาน/ });
  const entered = "ก".repeat(301);
  fireEvent.change(title, { target: { value: entered } });
  fireEvent.click(screen.getByRole("button", { name: "บันทึกงานร่าง" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "ชื่องาน: ระบุได้ไม่เกิน 300 ตัวอักษร",
  );
  expect(title).toHaveValue(entered);
  expect(mockCreate).not.toHaveBeenCalled();
});

it("invalidates the review report when proposed rules change", async () => {
  mockImpact.mockResolvedValue({
    reportId: "report1",
    eventRevision: "revision1",
    total: 1,
    affected: 1,
    rows: [
      {
        registrationId: "application1",
        type: "รุ่นเดิม",
        level: "ประเทศ",
        oldAge: 12,
        newAge: 13,
        oldExactAge: { months: 12, days: 0 },
        newExactAge: { months: 12, days: 1 },
        newEligible: false,
        newPossibleClasses: ["รุ่นใหม่"],
        affected: true,
      },
    ],
  });
  render(<CompetitionEditor existing={event} />);
  fireEvent.click(
    screen.getByRole("button", { name: "เตรียมเสนอแก้กติกาเป็นกรณีพิเศษ" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "สร้างรายงานผลกระทบ" }));
  expect(await screen.findByText("application1")).toBeVisible();
  expect(screen.getByText("รุ่นที่สมัครไม่เข้าเกณฑ์ใหม่")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "บันทึกกติกาที่ผ่านการตรวจแล้ว" }),
  ).toBeDisabled();
  fireEvent.change(screen.getByLabelText("วันที่ใช้ตัดอายุควาย"), {
    target: { value: "2026-10-19" },
  });
  expect(screen.queryByText("application1")).not.toBeInTheDocument();
  expect(mockReview).not.toHaveBeenCalled();
});

it("cancels proposed rules while preserving general edits for an ordinary save", async () => {
  mockImpact.mockResolvedValue({
    reportId: "report-cancel",
    eventRevision: event._rev,
    total: 0,
    affected: 0,
    rows: [],
  });
  mockUpdate.mockResolvedValue({
    ...event,
    title: "ชื่อที่ยังแก้ต่อ",
    _rev: "revision2",
  });
  render(<CompetitionEditor existing={event} />);
  fireEvent.change(screen.getByRole("textbox", { name: /ชื่องาน/ }), {
    target: { value: "ชื่อที่ยังแก้ต่อ" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "เตรียมเสนอแก้กติกาเป็นกรณีพิเศษ" }),
  );
  fireEvent.change(screen.getByLabelText("วันที่ใช้ตัดอายุควาย"), {
    target: { value: "2026-10-19" },
  });
  fireEvent.change(screen.getByLabelText("ประเภทฟอร์มสมัคร"), {
    target: { value: "royal" },
  });
  fireEvent.change(screen.getByLabelText("ชื่อรุ่น"), {
    target: { value: "รุ่นที่เสนอใหม่" },
  });
  fireEvent.click(screen.getByRole("button", { name: "สร้างรายงานผลกระทบ" }));
  const reference = await screen.findByLabelText(
    "หลักฐานอ้างอิงที่คุณนนท์ตรวจภายนอกระบบแล้ว",
  );
  fireEvent.change(reference, {
    target: { value: "หลักฐานเดิมที่ต้องยกเลิก" },
  });
  fireEvent.change(screen.getByLabelText("เหตุผลการแก้กติกา"), {
    target: { value: "เหตุผลเดิมที่ต้องยกเลิก" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "กลับไปแก้ข้อมูลทั่วไป" }),
  );
  expect(screen.getByLabelText("วันที่ใช้ตัดอายุควาย")).toHaveValue(
    event.buffaloAgeDeadline,
  );
  expect(screen.getByLabelText("วันที่ใช้ตัดอายุควาย")).toBeDisabled();
  expect(screen.getByLabelText("ประเภทฟอร์มสมัคร")).toHaveValue(
    event.eventType,
  );
  expect(screen.getByLabelText("ชื่อรุ่น")).toHaveValue(
    event.catalogs.national.join("\n"),
  );
  expect(screen.getByRole("textbox", { name: /ชื่องาน/ })).toHaveValue(
    "ชื่อที่ยังแก้ต่อ",
  );
  expect(
    screen.queryByRole("button", { name: "บันทึกกติกาที่ผ่านการตรวจแล้ว" }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "เตรียมเสนอแก้กติกาเป็นกรณีพิเศษ" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "สร้างรายงานผลกระทบ" }));
  expect(
    await screen.findByLabelText("หลักฐานอ้างอิงที่คุณนนท์ตรวจภายนอกระบบแล้ว"),
  ).toHaveValue("");
  expect(screen.getByLabelText("เหตุผลการแก้กติกา")).toHaveValue("");
  fireEvent.click(
    screen.getByRole("button", { name: "กลับไปแก้ข้อมูลทั่วไป" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "บันทึกการแก้ไข" }));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
  const calls = mockUpdate.mock.calls as unknown[][];
  const submitted = calls[0]?.[0] as { input: CompetitionInput };
  expect(submitted.input).toMatchObject({
    title: "ชื่อที่ยังแก้ต่อ",
    buffaloAgeDeadline: event.buffaloAgeDeadline,
    eventType: event.eventType,
    catalogs: event.catalogs,
  });
  expect(mockReview).not.toHaveBeenCalled();
});

it("preserves untouched ambiguous legacy and provincial catalogs on a general save", async () => {
  const legacy = {
    ...event,
    catalogs: {
      national: ["อายุประมาณ 12 เดือน แบบเดิม"],
      province: ["[SP] รุ่นจังหวัดเดิม"],
    },
  };
  mockUpdate.mockResolvedValue({
    ...legacy,
    title: "แก้ชื่อเท่านั้น",
    _rev: "revision2",
  });
  render(<CompetitionEditor existing={legacy} />);
  expect(
    screen.getByRole("region", { name: "รุ่นจังหวัดจากข้อมูลเดิม" }),
  ).toBeVisible();
  expect(screen.getByText(/ข้อมูลเดิมอ่านเงื่อนไขไม่ชัดเจน/)).toBeVisible();
  fireEvent.change(screen.getByRole("textbox", { name: /ชื่องาน/ }), {
    target: { value: "แก้ชื่อเท่านั้น" },
  });
  fireEvent.click(screen.getByRole("button", { name: "บันทึกการแก้ไข" }));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
  const submitted = (mockUpdate.mock.calls as unknown[][])[0]?.[0] as {
    input: CompetitionInput;
  };
  expect(submitted.input.catalogs).toEqual(legacy.catalogs);
});

it("new events expose only the single national-backed class list", () => {
  render(<CompetitionEditor />);
  expect(screen.getByRole("region", { name: "รุ่นแข่งขัน" })).toBeVisible();
  expect(
    screen.queryByRole("region", { name: "รุ่นจังหวัดจากข้อมูลเดิม" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("textbox", { name: "รุ่นระดับประเทศ" }),
  ).not.toBeInTheDocument();
});
