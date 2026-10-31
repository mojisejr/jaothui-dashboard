import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import CompetitionExportPage from "~/pages/dashboard/competitions/[id]/export";
import { detailFixture } from "~/test-fixtures/export-layout";
const mockLayout = jest.fn();
const mockFetch = jest.fn();
const mockRouter = {
  query: { id: "event.one" },
  beforePopState: jest.fn(),
  replace: jest.fn(),
  asPath: "/dashboard/competitions/event.one/export",
};
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));
jest.mock("~/context/auth.context", () => ({
  useAuth: () => ({ isAuth: true, token: "staff-session" }),
}));
jest.mock("~/components/competitions/Workspace", () => ({
  Workspace: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  EventNav: () => null,
  Alert: ({ children, error }: { children: ReactNode; error?: boolean }) => (
    <p role={error ? "alert" : "status"}>{children}</p>
  ),
  button: "button",
  primary: "primary",
  control: "control",
}));
jest.mock("~/utils/api", () => ({
  api: {
    useUtils: () => ({ competitions: { exportLayout: { fetch: jest.fn() } } }),
    competitions: {
      exportLayout: { useQuery: () => mockLayout() as unknown },
      previewExportLayout: {
        useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }),
      },
      saveExportLayout: {
        useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }),
      },
    },
  },
}));
const originalFetch = global.fetch;
beforeEach(() => {
  jest.clearAllMocks();
  mockLayout.mockReturnValue({ data: detailFixture(), isPending: false });
  global.fetch = mockFetch as unknown as typeof fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
});
it("keeps unconfigured events repairable without requiring a successful strict export packet", () => {
  const data = detailFixture();
  const missing = {
    ...data,
    layout: null,
    plan: {
      ...data.plan,
      state: "missing-layout",
      diagnostics: [
        { code: "LAYOUT_MISSING", message: "ยังไม่ได้บันทึกรูปแบบไฟล์" },
      ],
    },
  };
  mockLayout.mockReturnValue({ data: missing, isPending: false });
  render(<CompetitionExportPage />);
  expect(
    screen.getByRole("region", { name: "รูปแบบไฟล์ของงานนี้" }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "ดูตัวอย่างลำดับชีต" }),
  ).toBeEnabled();
  expect(
    screen.getByRole("button", { name: "ดาวน์โหลด Excel" }),
  ).toBeDisabled();
  expect(mockFetch).not.toHaveBeenCalled();
});
it("shows fresh source blockers from the download instead of treating a previous ready plan as success", async () => {
  mockFetch.mockResolvedValue({
    ok: false,
    json: async () => ({
      message: "ข้อมูลล่าสุดยังไม่พร้อม",
      diagnostics: [
        {
          code: "UNKNOWN_COLOR",
          message: "กรุณาแปลสีที่เพิ่มใหม่",
          value: "spotted",
          registrationIds: ["r-new"],
        },
      ],
    }),
  });
  render(<CompetitionExportPage />);
  fireEvent.click(screen.getByRole("button", { name: "ดาวน์โหลด Excel" }));
  await screen.findByText("ข้อมูลล่าสุดยังไม่พร้อม");
  expect(screen.getByText(/กรุณาแปลสีที่เพิ่มใหม่/)).toBeVisible();
  expect(mockFetch).toHaveBeenCalledWith(
    "/api/competitions/export?id=event.one&format=xlsx",
    { headers: { Authorization: "Bearer staff-session" } },
  );
  expect(screen.queryByText(/สร้างไฟล์ Excel แล้ว/)).not.toBeInTheDocument();
});
it("downloads the matching binary and confirms its source row count", async () => {
  mockFetch.mockResolvedValue({
    ok: true,
    headers: {
      get: (key: string) =>
        key === "X-Competition-Id"
          ? "event.one"
          : key === "X-Record-Count"
            ? "1"
            : key === "Content-Disposition"
              ? "attachment; filename*=UTF-8''event.one.xlsx"
              : null,
    },
    blob: async () =>
      new Blob(["PK bytes"], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
  });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: jest.fn(() => "blob:download"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: jest.fn(),
  });
  const click = jest
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => undefined);
  try {
    render(<CompetitionExportPage />);
    fireEvent.click(screen.getByRole("button", { name: "ดาวน์โหลด Excel" }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/สร้างไฟล์ Excel แล้ว 1 รายการ/)).toBeVisible();
  } finally {
    click.mockRestore();
  }
});
