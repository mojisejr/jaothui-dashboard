import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { ThaiDateInput } from "../ThaiDateInput";
import {
  dateDraftFromIso,
  resolveDateDraft,
  type DateDraft,
} from "~/lib/competition-thai-date";
jest.mock("~/context/auth.context", () => ({
  useAuth: () => ({ token: "session", isAuth: true }),
}));
function Harness({ initial = "2026-10-25" }: { initial?: string }) {
  const [draft, setDraft] = useState(() => dateDraftFromIso(initial));
  const result = resolveDateDraft(draft);
  return (
    <>
      <ThaiDateInput label="วันทดสอบ" value={draft} onChange={setDraft} />
      <output data-testid="iso">
        {result.status === "valid" ? result.iso : result.status}
      </output>
      <button onClick={() => setDraft(dateDraftFromIso("2024-02-29"))}>
        โหลดข้อมูล
      </button>
    </>
  );
}
it("shows Thai month and Buddhist year, and emits only complete exact dates", () => {
  render(<Harness />);
  expect(screen.getByLabelText("วันทดสอบ—ปี พ.ศ.")).toHaveValue("2569");
  expect(screen.getByLabelText("วันทดสอบ—เดือน")).toHaveDisplayValue("ต.ค.");
  fireEvent.change(screen.getByLabelText("วันทดสอบ—วัน"), {
    target: { value: "" },
  });
  expect(screen.getByTestId("iso")).toHaveTextContent("incomplete");
  expect(screen.getByText(/กรุณาเลือกวัน เดือน/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "ล้างวันทดสอบ" }));
  expect(screen.getByTestId("iso")).toHaveTextContent("empty");
  expect(
    screen
      .getAllByRole("combobox")
      .every((select) => (select as HTMLSelectElement).value === ""),
  ).toBe(true);
});
it("rejects day/month/year transitions instead of clamping or retaining the old date", () => {
  render(<Harness initial="2024-02-29" />);
  fireEvent.change(screen.getByLabelText("วันทดสอบ—ปี พ.ศ."), {
    target: { value: "2569" },
  });
  expect(screen.getByTestId("iso")).toHaveTextContent("invalid");
  expect(screen.getByLabelText("วันทดสอบ—วัน")).toHaveValue("29");
  fireEvent.click(screen.getByText("โหลดข้อมูล"));
  expect(screen.getByTestId("iso")).toHaveTextContent("2024-02-29");
  fireEvent.change(screen.getByLabelText("วันทดสอบ—วัน"), {
    target: { value: "31" },
  });
  fireEvent.change(screen.getByLabelText("วันทดสอบ—เดือน"), {
    target: { value: "4" },
  });
  expect(screen.getByTestId("iso")).toHaveTextContent("invalid");
});
it("preserves an external out-of-window year, expands options, and follows explicit reloads", () => {
  render(<Harness initial="1900-01-01" />);
  expect(screen.getByLabelText("วันทดสอบ—ปี พ.ศ.")).toHaveValue("2443");
  fireEvent.change(screen.getByLabelText("วันทดสอบ—ปี พ.ศ."), {
    target: { value: "expand" },
  });
  expect(screen.getByLabelText("วันทดสอบ—ปี พ.ศ.")).toHaveValue("2443");
  fireEvent.click(screen.getByText("โหลดข้อมูล"));
  expect(screen.getByLabelText("วันทดสอบ—ปี พ.ศ.")).toHaveValue("2567");
});
it("keeps malformed legacy values visible as review errors until deliberately replaced", () => {
  render(<Harness initial="not-a-date" />);
  expect(screen.getByText(/วันที่เดิมไม่ถูกต้อง/)).toBeVisible();
  expect(screen.getByTestId("iso")).toHaveTextContent("invalid");
});
it("labels each required constituent and disables all controls", () => {
  const onChange = jest.fn<void, [DateDraft]>();
  render(
    <ThaiDateInput
      label="วันเริ่มงาน"
      value={dateDraftFromIso("2026-10-25")}
      required
      disabled
      onChange={onChange}
    />,
  );
  for (const select of screen.getAllByRole("combobox")) {
    expect(select).toBeRequired();
    expect(select).toBeDisabled();
  }
  expect(
    screen.getByRole("button", { name: "ล้างวันเริ่มงาน" }),
  ).toBeDisabled();
});
