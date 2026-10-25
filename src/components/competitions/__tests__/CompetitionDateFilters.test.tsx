import { fireEvent, render, screen } from "@testing-library/react";
import Competitions from "~/pages/dashboard/competitions";
import type { CompetitionFilters } from "~/lib/competitions";
const mockQuery = jest.fn<void, [CompetitionFilters]>();
jest.mock("~/context/auth.context", () => ({
  useAuth: () => ({ isAuth: true }),
}));
jest.mock("~/utils/api", () => ({
  api: {
    competitions: {
      list: {
        useQuery: (input: CompetitionFilters) => {
          mockQuery(input);
          return {
            data: { items: [], total: 30 },
            isPending: false,
            isFetching: false,
          };
        },
      },
    },
  },
}));
jest.mock("../Workspace", () => ({
  Workspace: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
  Alert: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  Status: () => null,
  control: "control",
  button: "button",
  primary: "primary",
}));
const lastFilters = () => mockQuery.mock.calls.at(-1)![0];
beforeEach(() => mockQuery.mockClear());
it("applies only complete Gregorian date constraints, removes an unfinished constraint, and returns to page one", () => {
  render(<Competitions />);
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  expect(lastFilters().page).toBe(2);
  fireEvent.change(screen.getByLabelText("วันเริ่มงานตั้งแต่—วัน"), {
    target: { value: "25" },
  });
  expect(lastFilters()).toMatchObject({ page: 1 });
  expect(lastFilters().startFrom).toBeUndefined();
  fireEvent.change(screen.getByLabelText("วันเริ่มงานตั้งแต่—เดือน"), {
    target: { value: "10" },
  });
  fireEvent.change(screen.getByLabelText("วันเริ่มงานตั้งแต่—ปี พ.ศ."), {
    target: { value: "2569" },
  });
  expect(lastFilters().startFrom).toBe("2026-10-25");
  fireEvent.change(screen.getByLabelText("วันเริ่มงานตั้งแต่—เดือน"), {
    target: { value: "" },
  });
  expect(lastFilters().startFrom).toBeUndefined();
  expect(screen.getByText(/กรุณาเลือกวัน เดือน/)).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "ล้างวันเริ่มงานตั้งแต่" }),
  );
  expect(lastFilters().startFrom).toBeUndefined();
  expect(screen.getByLabelText("วันเริ่มงานตั้งแต่—วัน")).toHaveValue("");
});
it("never queries an impossible date and resets both date drafts along with all filters", () => {
  render(<Competitions />);
  for (const label of ["วันเริ่มงานตั้งแต่", "วันเริ่มงานถึง"]) {
    for (const [part, value] of [
      ["วัน", "31"],
      ["เดือน", "4"],
      ["ปี พ.ศ.", "2569"],
    ])
      fireEvent.change(screen.getByLabelText(`${label}—${part}`), {
        target: { value },
      });
  }
  expect(lastFilters().startFrom).toBeUndefined();
  expect(lastFilters().startTo).toBeUndefined();
  fireEvent.change(screen.getByLabelText("วันเริ่มงานถึง—วัน"), {
    target: { value: "30" },
  });
  expect(lastFilters().startTo).toBe("2026-04-30");
  fireEvent.click(screen.getByRole("button", { name: "ล้างตัวกรอง" }));
  expect(lastFilters()).toEqual({ search: "", page: 1, pageSize: 12 });
  for (const label of ["วันเริ่มงานตั้งแต่", "วันเริ่มงานถึง"])
    for (const part of ["วัน", "เดือน", "ปี พ.ศ."])
      expect(screen.getByLabelText(`${label}—${part}`)).toHaveValue("");
});
