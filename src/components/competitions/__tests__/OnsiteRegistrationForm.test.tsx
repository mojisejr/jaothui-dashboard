import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Link from "next/link";
import { OnsiteRegistrationForm } from "../OnsiteRegistrationForm";
import { competitionSchema } from "~/lib/competitions";
const mockLookup = jest.fn();
const mockSubmit = jest.fn();
const mockRouter = {
  beforePopState: jest.fn(),
  replace: jest.fn(),
  asPath: "/dashboard/competitions/test/onsite",
};
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));
jest.mock("~/utils/api", () => ({
  api: {
    useUtils: () => ({
      competitions: {
        metadata: {
          fetch: (...args: unknown[]) =>
            mockLookup(...args) as Promise<unknown>,
        },
      },
    }),
    competitions: {
      onsite: {
        useMutation: () => ({
          isPending: false,
          mutateAsync: (...args: unknown[]) =>
            mockSubmit(...args) as Promise<unknown>,
        }),
      },
    },
  },
}));
jest.mock("../Workspace", () => ({
  Alert: ({
    children,
    error,
  }: {
    children: React.ReactNode;
    error?: boolean;
  }) => <p role={error ? "alert" : "status"}>{children}</p>,
  button: "button",
  primary: "primary",
  control: "control",
}));
const event = competitionSchema.parse({
  _id: "test",
  _rev: "revision1",
  title: "งานทดสอบ",
  buffaloAgeDeadline: "2026-10-16",
  registrationCount: 1,
  eventType: "normal",
  catalogs: {
    national: ["ไม่เกิน 12 เดือน", "มากกว่า 12 เดือน ถึง 15 เดือน"],
    province: [],
  },
  policy: {
    today: "2026-10-16",
    lifecycle: "ongoing",
    publicRegistration: "closed-manual",
    publicVisible: true,
    onsiteAllowed: true,
    warnings: [],
  },
});
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(global.crypto, "randomUUID", {
    configurable: true,
    value: () => "idempotent-operation",
  });
  mockLookup.mockResolvedValue({
    found: false,
    microchip: "123",
    metadata: null,
    duplicateCount: 0,
    duplicateRegistrations: [],
  });
  mockSubmit.mockResolvedValue({ _id: "saved-entry" });
});
async function fill() {
  fireEvent.change(screen.getByLabelText("เลขไมโครชิพ *"), {
    target: { value: "123" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "ค้นหาข้อมูลและตรวจซ้ำ" }),
  );
  await screen.findByText("ไม่พบข้อมูลทะเบียนต้นทาง กรอกข้อมูลด้วยตนเองได้");
  for (const [name, value] of [
    ["ชื่อควาย *", "ควายทดสอบ"],
    ["วันเกิด *", "2025-10-16"],
    ["ชื่อเจ้าของ *", "ผู้ทดสอบ"],
    ["เบอร์โทรศัพท์ *", "0800000000"],
  ])
    fireEvent.change(screen.getByLabelText(name!), { target: { value } });
  fireEvent.change(screen.getByLabelText("รุ่นแข่งขัน *"), {
    target: { value: "ไม่เกิน 12 เดือน" },
  });
}
it("requires metadata review before applying; preserves manual values until explicit apply and filters exact-age classes", async () => {
  mockLookup.mockResolvedValue({
    found: true,
    microchip: "123",
    metadata: {
      name: "ต้นทาง",
      birthday: "2025-10-16",
      sex: "female",
      color: "albino",
      fatherName: "พ่อ",
      motherName: "แม่",
    },
    duplicateCount: 0,
    duplicateRegistrations: [],
  });
  render(
    <OnsiteRegistrationForm event={event} refresh={async () => undefined} />,
  );
  fireEvent.change(screen.getByLabelText("ชื่อควาย *"), {
    target: { value: "กรอกเอง" },
  });
  fireEvent.change(screen.getByLabelText("เลขไมโครชิพ *"), {
    target: { value: "123" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "ค้นหาข้อมูลและตรวจซ้ำ" }),
  );
  await screen.findByText("ต้นทาง");
  expect(screen.getByLabelText("ชื่อควาย *")).toHaveValue("กรอกเอง");
  fireEvent.click(
    screen.getByRole("button", { name: "ตรวจแล้ว นำข้อมูลมาใส่ฟอร์ม" }),
  );
  expect(screen.getByLabelText("ชื่อควาย *")).toHaveValue("ต้นทาง");
  expect(
    screen.getByRole("option", { name: "ไม่เกิน 12 เดือน" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("option", { name: "มากกว่า 12 เดือน ถึง 15 เดือน" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText("ชุดรุ่นแข่งขัน")).not.toBeInTheDocument();
});
it("retains the same operation, revision and payload on uncertain retry and never invents LINE identity", async () => {
  mockSubmit.mockRejectedValueOnce(new Error("network timeout"));
  const refresh = jest.fn().mockResolvedValue(undefined);
  render(<OnsiteRegistrationForm event={event} refresh={refresh} />);
  await fill();
  fireEvent.click(
    screen.getByRole("button", { name: "บันทึกลงทะเบียนหน้างาน" }),
  );
  await screen.findByText(/ยังยืนยันผลไม่ได้/);
  expect(screen.getByLabelText("ชื่อควาย *")).toBeDisabled();
  const original: unknown = (mockSubmit.mock.calls as unknown[][])[0]![0];
  fireEvent.click(screen.getByRole("button", { name: "ลองคำขอเดิมอีกครั้ง" }));
  await screen.findByRole("link", { name: "ดูใบสมัครที่บันทึก" });
  expect((mockSubmit.mock.calls as unknown[][])[1]![0]).toEqual(original);
  expect(JSON.stringify(original)).not.toMatch(/lineId|userId|applicant/);
  expect(mockSubmit).toHaveBeenCalledTimes(2);
  expect(refresh).toHaveBeenCalledTimes(1);
});
it("blocks ended events and requires an explicit duplicate reason before submission", async () => {
  const view = render(
    <OnsiteRegistrationForm
      event={{ ...event, policy: { ...event.policy, onsiteAllowed: false } }}
      refresh={async () => undefined}
    />,
  );
  expect(
    screen.getByRole("button", { name: "บันทึกลงทะเบียนหน้างาน" }),
  ).toBeDisabled();
  view.unmount();
  mockLookup.mockResolvedValue({
    found: false,
    microchip: "123",
    metadata: null,
    duplicateCount: 1,
    duplicateRegistrations: [
      { _id: "old", name: "เก่า", type: "รุ่นเดิม", ownerName: "เดิม" },
    ],
  });
  render(
    <OnsiteRegistrationForm event={event} refresh={async () => undefined} />,
  );
  await fill();
  fireEvent.submit(
    screen
      .getByRole("button", { name: "บันทึกลงทะเบียนหน้างาน" })
      .closest("form")!,
  );
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(/เหตุผล/),
  );
  expect(mockSubmit).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText(/เหตุผลที่ยืนยันลงทะเบียนซ้ำ/), {
    target: { value: "ผู้ดูแลตรวจแล้ว ลงต่างรุ่น" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "บันทึกลงทะเบียนหน้างาน" }),
  );
  await screen.findByRole("link", { name: "ดูใบสมัครที่บันทึก" });
  expect(mockSubmit).toHaveBeenCalledTimes(1);
});
it("keeps manual registration available when registry lookup is unavailable but duplicate check succeeded", async () => {
  mockLookup.mockResolvedValue({
    found: false,
    metadata: null,
    microchip: "123",
    lookupUnavailable: true,
    lookupWarning: "ค้นทะเบียนไม่ได้ในขณะนี้ ตรวจรายการซ้ำแล้ว กรอกเองได้",
    duplicateCount: 0,
    duplicateRegistrations: [],
  });
  render(
    <OnsiteRegistrationForm event={event} refresh={async () => undefined} />,
  );
  fireEvent.change(screen.getByLabelText("เลขไมโครชิพ *"), {
    target: { value: "123" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "ค้นหาข้อมูลและตรวจซ้ำ" }),
  );
  await screen.findByText(
    "ค้นทะเบียนไม่ได้ในขณะนี้ ตรวจรายการซ้ำแล้ว กรอกเองได้",
  );
  expect(
    screen.queryByText("ไม่พบข้อมูลทะเบียนต้นทาง กรอกข้อมูลด้วยตนเองได้"),
  ).not.toBeInTheDocument();
  for (const [name, value] of [
    ["ชื่อควาย *", "ควายทดสอบ"],
    ["วันเกิด *", "2025-10-16"],
    ["ชื่อเจ้าของ *", "ผู้ทดสอบ"],
    ["เบอร์โทรศัพท์ *", "0800000000"],
  ])
    fireEvent.change(screen.getByLabelText(name!), { target: { value } });
  fireEvent.change(screen.getByLabelText("รุ่นแข่งขัน *"), {
    target: { value: "ไม่เกิน 12 เดือน" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "บันทึกลงทะเบียนหน้างาน" }),
  );
  await screen.findByRole("link", { name: "ดูใบสมัครที่บันทึก" });
  expect(mockSubmit).toHaveBeenCalledTimes(1);
});
it("keeps confirmed registration successful when refresh fails rather than retrying a saved operation", async () => {
  render(
    <OnsiteRegistrationForm
      event={event}
      refresh={async () => {
        throw new Error("reload failed");
      }}
    />,
  );
  await fill();
  fireEvent.click(
    screen.getByRole("button", { name: "บันทึกลงทะเบียนหน้างาน" }),
  );
  await screen.findByRole("link", { name: "ดูใบสมัครที่บันทึก" });
  expect(screen.getByRole("alert")).toHaveTextContent(
    "บันทึกใบสมัครสำเร็จแล้ว",
  );
  expect(
    screen.queryByRole("button", { name: "ลองคำขอเดิมอีกครั้ง" }),
  ).not.toBeInTheDocument();
  expect(mockSubmit).toHaveBeenCalledTimes(1);
});
it("warns before internal navigation with entered form and supports cancelling without losing fields", () => {
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(false);
  render(
    <>
      <Link href="/dashboard/competitions/test/applications">ใบสมัคร</Link>
      <OnsiteRegistrationForm event={event} refresh={async () => undefined} />
    </>,
  );
  fireEvent.change(screen.getByLabelText("ชื่อควาย *"), {
    target: { value: "ยังไม่ได้บันทึก" },
  });
  const navigation = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
  });
  screen.getByRole("link", { name: "ใบสมัคร" }).dispatchEvent(navigation);
  expect(navigation.defaultPrevented).toBe(true);
  expect(confirm).toHaveBeenCalled();
  expect(screen.getByLabelText("ชื่อควาย *")).toHaveValue("ยังไม่ได้บันทึก");
  confirm.mockRestore();
});
