import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ApplicationReview } from "../ApplicationReview";
import { ApplicationsList } from "../ApplicationsList";
import { applicationSchema } from "~/lib/competition-applications";
const mockRouter = {
  asPath: "/dashboard/competitions/event1/applications/entry1",
  beforePopState: jest.fn(),
  replace: jest.fn(),
};
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));
const mockApproval = jest.fn();
const mockRetry = jest.fn();
const mockList = jest.fn();
const mockInvalidate = jest.fn();
jest.mock("~/context/auth.context", () => ({
  useAuth: () => ({ isAuth: true }),
}));
jest.mock("~/utils/api", () => ({
  api: {
    useUtils: () => ({
      competitions: { applications: { invalidate: mockInvalidate } },
    }),
    competitions: {
      approval: {
        useMutation: () => ({ mutateAsync: mockApproval, isPending: false }),
      },
      retryNotification: {
        useMutation: () => ({ mutateAsync: mockRetry, isPending: false }),
      },
      applications: {
        useQuery: (input: unknown) => mockList(input) as unknown,
      },
    },
  },
}));
const entry = () =>
  applicationSchema.parse({
    _id: "entry1",
    _rev: "registration-rev1",
    name: "เจ้าทุยทดสอบ",
    microchip: "chip1",
    type: "มากกว่า 12 ถึง 15 เดือน",
    buffaloAge: 13,
    approval: null,
    registrationPolicyVersion: 1,
    approvalRequirement: "required",
    registrationStatus: "pending",
  });
const approval = {
  _id: "approval1",
  _rev: "approval-rev1",
  approvementResult: true,
  comment: "ตรวจผ่าน",
  notificationState: "failed",
};
beforeEach(() => {
  jest.clearAllMocks();
  let sequence = 0;
  Object.defineProperty(global.crypto, "randomUUID", {
    configurable: true,
    value: () =>
      `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
  });
  mockList.mockReturnValue({
    data: {
      registrationPolicyVersion: 1,
      approvalRequirement: "required",
      registrationCounts: {
        total: 3,
        registered: 0,
        pending: 1,
        accepted: 1,
        rejected: 1,
        needs_type_review: 0,
      },
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      counts: { total: 3, pending: 1, accepted: 1, rejected: 1 },
      facets: {
        types: ["รุ่นหนึ่ง"],
        levels: ["national"],
        sexes: ["ผู้"],
        colors: ["ดำ"],
      },
    },
    isPending: false,
    isFetching: false,
  });
});
it("treats missing approval as pending and renders absent Royal supplements explicitly", () => {
  render(
    <ApplicationReview id="event1" initial={entry()} reload={jest.fn()} />,
  );
  expect(screen.getByText("ผลปัจจุบัน: รอตรวจสอบ")).toBeVisible();
  expect(screen.getByText("ไม่มีรูปแนบในใบสมัครนี้")).toBeVisible();
  expect(screen.getByText("ไม่มีเอกสารที่อยู่แนบในใบสมัครนี้")).toBeVisible();
  expect(screen.queryByText("ผลปัจจุบัน: ไม่อนุมัติ")).not.toBeInTheDocument();
});
it("requires rejection reason and retains exact operation/body after uncertain save", async () => {
  mockApproval.mockRejectedValue(new Error("การเชื่อมต่อขัดข้อง"));
  render(
    <ApplicationReview id="event1" initial={entry()} reload={jest.fn()} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "บันทึกไม่อนุมัติ" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("กรุณาระบุเหตุผล");
  expect(mockApproval).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "เอกสารไม่ครบ" },
  });
  fireEvent.click(screen.getByRole("button", { name: "บันทึกไม่อนุมัติ" }));
  await screen.findByText("การเชื่อมต่อขัดข้อง");
  fireEvent.click(screen.getByRole("button", { name: "บันทึกไม่อนุมัติ" }));
  await waitFor(() => expect(mockApproval).toHaveBeenCalledTimes(2));
  expect(mockApproval.mock.calls[0]).toEqual(mockApproval.mock.calls[1]);
  expect(screen.getByRole("textbox")).toHaveValue("เอกสารไม่ครบ");
});
it("separates approval save from notification and never automatically retries LINE", async () => {
  mockApproval.mockResolvedValue({
    ...entry(),
    _rev: "registration-rev2",
    registrationStatus: "accepted" as const,
    approval: { ...approval, notificationState: "pending" },
    deliveryEnabled: false,
    hasLineRecipient: true,
  });
  render(
    <ApplicationReview id="event1" initial={entry()} reload={jest.fn()} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "บันทึกอนุมัติ" }));
  expect(
    await screen.findByText(/บันทึกผลการตรวจแล้ว การส่ง LINE/),
  ).toBeVisible();
  expect(mockRetry).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "ส่ง / ลองส่ง LINE" }),
  ).toBeDisabled();
  expect(screen.getByText(/ระบบปิดการส่ง LINE อยู่/)).toBeVisible();
});
it("retries only delivery with approval revision and preserves unsaved note", async () => {
  const initial = {
    ...entry(),
    approval,
    registrationStatus: "accepted" as const,
    deliveryEnabled: true,
    hasLineRecipient: true,
  };
  mockRetry.mockResolvedValue({
    ...initial,
    approval: { ...approval, _rev: "approval-rev2", notificationState: "sent" },
  });
  render(
    <ApplicationReview id="event1" initial={initial} reload={jest.fn()} />,
  );
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "ข้อความที่ยังไม่บันทึก" },
  });
  fireEvent.click(screen.getByRole("button", { name: "ส่ง / ลองส่ง LINE" }));
  await screen.findByText("LINE รับคำขอส่งแล้ว");
  expect(mockRetry).toHaveBeenCalledWith(
    expect.objectContaining({
      expectedRevision: "approval-rev1",
      id: "event1",
      registrationId: "entry1",
    }),
  );
  expect(mockApproval).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox")).toHaveValue("ข้อความที่ยังไม่บันทึก");
  expect(
    screen.queryByRole("button", { name: "ส่ง / ลองส่ง LINE" }),
  ).not.toBeInTheDocument();
});
it("keeps inputs after conflict, requires explicit refresh, then uses latest revision", async () => {
  const failure = Object.assign(new Error("ใบสมัครเปลี่ยนแล้ว"), {
    data: { code: "CONFLICT" },
  });
  mockApproval
    .mockRejectedValueOnce(failure)
    .mockResolvedValue({ ...entry(), _rev: "registration-rev3", approval });
  const reload = jest
    .fn()
    .mockResolvedValue({ ...entry(), _rev: "registration-rev2" });
  render(<ApplicationReview id="event1" initial={entry()} reload={reload} />);
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "เก็บข้อความไว้" },
  });
  fireEvent.click(screen.getByRole("button", { name: "บันทึกอนุมัติ" }));
  await screen.findByText("ใบสมัครเปลี่ยนแล้ว");
  expect(screen.getByRole("button", { name: "บันทึกอนุมัติ" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "โหลดข้อมูลล่าสุด" }));
  await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("textbox")).toHaveValue("เก็บข้อความไว้");
  fireEvent.click(screen.getByRole("button", { name: "บันทึกอนุมัติ" }));
  await waitFor(() => expect(mockApproval).toHaveBeenCalledTimes(2));
  expect((mockApproval.mock.calls as unknown[][])[1]?.[0]).toMatchObject({
    expectedRevision: "registration-rev2",
    comment: "เก็บข้อความไว้",
  });
});
it("does not offer LINE send when no linked recipient exists", () => {
  render(
    <ApplicationReview
      id="event1"
      initial={{
        ...entry(),
        registrationStatus: "accepted" as const,
        approval: { ...approval, notificationState: "not-applicable" },
        deliveryEnabled: true,
      }}
      reload={jest.fn()}
    />,
  );
  expect(screen.getByText(/จะไม่ส่งไปยังบัญชีทีมงานแทน/)).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "ส่ง / ลองส่ง LINE" }),
  ).not.toBeInTheDocument();
});
it("composes search and filters, then resets all filters and page", () => {
  render(<ApplicationsList id="event1" />);
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "chip42" },
  });
  fireEvent.change(screen.getByLabelText("สถานะใบสมัคร"), {
    target: { value: "pending" },
  });
  fireEvent.change(screen.getByLabelText("รุ่นแข่งขัน"), {
    target: { value: "รุ่นหนึ่ง" },
  });
  fireEvent.change(screen.getByLabelText("สี"), { target: { value: "ดำ" } });
  expect(mockList).toHaveBeenLastCalledWith(
    expect.objectContaining({
      id: "event1",
      search: "chip42",
      registrationStatus: "pending",
      type: "รุ่นหนึ่ง",
      color: "ดำ",
      page: 1,
    }),
  );
  expect(screen.getByText(/ไม่พบใบสมัครตามตัวกรอง/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "ล้างตัวกรอง" }));
  expect(mockList).toHaveBeenLastCalledWith({
    id: "event1",
    search: "",
    page: 1,
    pageSize: 20,
  });
});

it("guards leaving an unsaved approval note without throwing away input", () => {
  render(
    <ApplicationReview id="event1" initial={entry()} reload={jest.fn()} />,
  );
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "ยังตรวจไม่เสร็จ" },
  });
  const link = screen.getByRole("link", { name: "กลับรายการใบสมัคร" });
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(false);
  try {
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox")).toHaveValue("ยังตรวจไม่เสร็จ");
  } finally {
    confirm.mockRestore();
  }
});
it("shows Royal address and both present and missing supplementary image files", () => {
  const royal = {
    ...entry(),
    address: {
      _id: "address1",
      address: "บ้านทดสอบ",
      district: "ตำบลทดสอบ",
      amphoe: "อำเภอทดสอบ",
      province: "จังหวัดทดสอบ",
      zipcode: "00000",
    },
    images: [
      {
        _id: "image1",
        images: [
          {
            imageTitle: "ด้านหน้า",
            url: "https://cdn.sanity.io/images/test/dev/front.jpg",
          },
          { imageTitle: "เอกสารเดิม", url: null },
        ],
      },
    ],
  };
  render(<ApplicationReview id="event1" initial={royal} reload={jest.fn()} />);
  expect(screen.getByRole("img", { name: "ด้านหน้า" })).toHaveAttribute(
    "src",
    "https://cdn.sanity.io/images/test/dev/front.jpg",
  );
  expect(screen.getByText("ไม่พบไฟล์ภาพสำหรับ เอกสารเดิม")).toBeVisible();
  expect(
    screen.getByText(/บ้านทดสอบ ตำบลทดสอบ อำเภอทดสอบ จังหวัดทดสอบ 00000/),
  ).toBeVisible();
});
it("describes uncertain LINE delivery without marking the approval as failed", () => {
  render(
    <ApplicationReview
      id="event1"
      initial={{
        ...entry(),
        registrationStatus: "accepted" as const,
        approval: { ...approval, notificationState: "uncertain" },
        deliveryEnabled: true,
        hasLineRecipient: true,
      }}
      reload={jest.fn()}
    />,
  );
  expect(screen.getByText("ยังยืนยันผลส่ง LINE ไม่ได้")).toBeVisible();
  expect(screen.getByText("ผลปัจจุบัน: อนุมัติแล้ว")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "ส่ง / ลองส่ง LINE" }),
  ).toBeEnabled();
});

it.each([
  ["not_required", "registered", "งานประเภทนี้ไม่ต้องรออนุมัติ"],
  ["unknown", "needs_type_review", "งานเก่าไม่ระบุประเภท"],
] as const)(
  "keeps %s read-only while preserving historical rejection and LINE evidence",
  (approvalRequirement, registrationStatus, helper) => {
    const historical = {
      ...entry(),
      approvalRequirement,
      registrationStatus,
      approval: {
        ...approval,
        approvementResult: false,
        comment: "ผลเดิมต้องเก็บ",
        notificationState: "sent",
      },
    };
    render(
      <ApplicationReview id="event1" initial={historical} reload={jest.fn()} />,
    );
    expect(screen.getByText(helper)).toBeVisible();
    expect(screen.getByText("ประวัติผลตรวจเดิม: ไม่อนุมัติ")).toBeVisible();
    expect(screen.getByText("หมายเหตุเดิม: ผลเดิมต้องเก็บ")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "บันทึกอนุมัติ" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "บันทึกไม่อนุมัติ" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "ส่ง / ลองส่ง LINE" }),
    ).not.toBeInTheDocument();
    expect(mockApproval).not.toHaveBeenCalled();
    expect(mockRetry).not.toHaveBeenCalled();
  },
);
it("uses Normal effective counts and filters even with an empty list", () => {
  mockList.mockReturnValue({
    data: {
      registrationPolicyVersion: 1,
      approvalRequirement: "not_required",
      registrationCounts: {
        total: 8,
        registered: 8,
        pending: 0,
        accepted: 0,
        rejected: 0,
        needs_type_review: 0,
      },
      counts: { total: 8, pending: 8, accepted: 0, rejected: 0 },
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      facets: { types: [], levels: [], sexes: [], colors: [] },
    },
  });
  render(<ApplicationsList id="normal" />);
  expect(screen.getByRole("option", { name: "สมัครสำเร็จ" })).toBeVisible();
  expect(
    screen.queryByRole("option", { name: "รอตรวจสอบ" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/สมัครสำเร็จ 8/)).toBeVisible();
  fireEvent.change(screen.getByLabelText("สถานะใบสมัคร"), {
    target: { value: "registered" },
  });
  expect(mockList).toHaveBeenLastCalledWith(
    expect.objectContaining({ registrationStatus: "registered" }),
  );
});
it("clears a Royal status filter when source requirement changes for the same event", async () => {
  const view = render(<ApplicationsList id="event1" />);
  fireEvent.change(screen.getByLabelText("สถานะใบสมัคร"), {
    target: { value: "pending" },
  });
  mockList.mockReturnValue({
    data: {
      registrationPolicyVersion: 1,
      approvalRequirement: "not_required",
      registrationCounts: {
        total: 0,
        registered: 0,
        pending: 0,
        accepted: 0,
        rejected: 0,
        needs_type_review: 0,
      },
      items: [],
      total: 0,
      facets: { types: [], sexes: [], colors: [] },
    },
    isPending: false,
  });
  view.rerender(<ApplicationsList id="event1" />);
  await waitFor(() =>
    expect(mockList).toHaveBeenLastCalledWith(
      expect.objectContaining({ registrationStatus: undefined, page: 1 }),
    ),
  );
});
it("shows a source-upgrade error rather than guessing a missing Normal policy", () => {
  const old = entry();
  delete old.registrationPolicyVersion;
  render(<ApplicationReview id="event1" initial={old} reload={jest.fn()} />);
  expect(screen.getByRole("alert")).toHaveTextContent("กรุณาอัปเดตระบบต้นทาง");
  expect(
    screen.queryByRole("button", { name: "บันทึกอนุมัติ" }),
  ).not.toBeInTheDocument();
});
it("preserves a selected status through the transient pending response of a new query key", () => {
  const view = render(<ApplicationsList id="event1" />);
  fireEvent.change(screen.getByLabelText("สถานะใบสมัคร"), {
    target: { value: "accepted" },
  });
  expect(mockList).toHaveBeenLastCalledWith(
    expect.objectContaining({ registrationStatus: "accepted" }),
  );
  mockList.mockReturnValue({
    data: undefined,
    isPending: true,
    isFetching: true,
  });
  view.rerender(<ApplicationsList id="event1" />);
  expect(mockList).toHaveBeenLastCalledWith(
    expect.objectContaining({ registrationStatus: "accepted" }),
  );
});
