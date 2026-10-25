import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ClassCatalogEditor } from "../ClassCatalogEditor";
import { ClassAgeTester } from "../ClassAgeTester";
import {
  encodeCompetitionClass,
  parseCompetitionClass,
  validateCompetitionCatalog,
} from "~/lib/competition-classes";
import { previewCompetitionAge } from "~/lib/competition-age-preview";

jest.mock("~/context/auth.context", () => ({
  useAuth: () => ({ token: "session", isAuth: true }),
}));

function Editor({ initial = [] as string[] }) {
  const [values, setValues] = useState(initial);
  return (
    <>
      <ClassCatalogEditor
        title="รุ่นแข่งขัน"
        values={values}
        onChange={setValues}
      />
      <output data-testid="stored">{JSON.stringify(values)}</output>
    </>
  );
}
function stored(): string[] {
  return JSON.parse(screen.getByTestId("stored").textContent!) as string[];
}

it("adds, copies, edits and removes rows with serialized rules and duplicate display protection", () => {
  const view = render(<Editor />);
  fireEvent.click(screen.getByRole("button", { name: "เพิ่มรุ่น" }));
  fireEvent.change(screen.getByLabelText("กลุ่มการแข่งขัน"), {
    target: { value: "ควายงาม" },
  });
  fireEvent.change(screen.getByLabelText("อายุขั้นต่ำ (เดือน)"), {
    target: { value: "12" },
  });
  fireEvent.change(screen.getByLabelText("ขอบเขตขั้นต่ำ"), {
    target: { value: "exclusive" },
  });
  fireEvent.change(
    screen.getByLabelText("อายุสูงสุด (เดือน รวมเดือนที่ระบุ)"),
    { target: { value: "15" } },
  );
  expect(screen.getByLabelText("ชื่อรุ่น")).toHaveValue(
    "ควายงาม — มากกว่า 12 เดือน ถึง ไม่เกิน 15 เดือน",
  );
  expect(parseCompetitionClass(stored()[0]!)).toMatchObject({
    minMonths: 12,
    maxMonths: 15,
    minInclusive: false,
  });
  fireEvent.click(screen.getByRole("button", { name: "คัดลอกรุ่นที่ 1" }));
  expect(screen.getAllByLabelText("ชื่อรุ่น")).toHaveLength(2);
  expect(
    screen.getByRole("list", { name: "ข้อผิดพลาดรุ่นแข่งขัน" }),
  ).toHaveTextContent("ชื่อรุ่นซ้ำ");
  const second = screen.getByRole("group", { name: "รุ่นแข่งขัน รุ่นที่ 2" });
  fireEvent.change(within(second).getByLabelText("วิธีตั้งชื่อรุ่น"), {
    target: { value: "custom" },
  });
  fireEvent.change(within(second).getByLabelText("ชื่อรุ่น"), {
    target: { value: "รุ่นชื่อเฉพาะ" },
  });
  expect(validateCompetitionCatalog(stored())).toEqual([]);
  const saved = stored();
  view.unmount();
  render(<Editor initial={saved} />);
  expect(screen.getAllByLabelText("ชื่อรุ่น")[1]).toHaveValue("รุ่นชื่อเฉพาะ");
  fireEvent.click(screen.getByRole("button", { name: "ลบรุ่นที่ 1" }));
  expect(stored()).toEqual([saved[1]]);
});

it("preserves raw legacy rows until edited and asks for review of ambiguous age text", () => {
  const values = [
    "มากกว่า 12 เดือน ถึง 15 เดือน",
    "อายุ 10 เดือน แบบไม่ชัดเจน",
  ];
  render(<Editor initial={values} />);
  expect(stored()).toEqual(values);
  expect(screen.getByText(/ข้อมูลเดิมอ่านเงื่อนไขไม่ชัดเจน/)).toBeVisible();
  fireEvent.change(
    screen.getAllByLabelText("อายุสูงสุด (เดือน รวมเดือนที่ระบุ)")[0]!,
    { target: { value: "18" } },
  );
  expect(stored()[1]).toBe(values[1]);
  expect(parseCompetitionClass(stored()[0]!)).toMatchObject({ maxMonths: 18 });
});

it("restores generated names after save/reload and regenerates the name when age changes", () => {
  const first = render(<Editor />);
  fireEvent.click(screen.getByRole("button", { name: "เพิ่มรุ่น" }));
  fireEvent.change(screen.getByLabelText("กลุ่มการแข่งขัน"), {
    target: { value: "ควายงาม" },
  });
  const saved = stored();
  first.unmount();
  const reloaded = render(<Editor initial={saved} />);
  expect(screen.getByLabelText("วิธีตั้งชื่อรุ่น")).toHaveValue("auto");
  fireEvent.change(
    screen.getByLabelText("อายุสูงสุด (เดือน รวมเดือนที่ระบุ)"),
    { target: { value: "15" } },
  );
  expect(screen.getByLabelText("ชื่อรุ่น")).toHaveValue(
    "ควายงาม — ไม่เกิน 15 เดือน",
  );
  fireEvent.change(screen.getByLabelText("วิธีตั้งชื่อรุ่น"), {
    target: { value: "custom" },
  });
  fireEvent.change(screen.getByLabelText("ชื่อรุ่น"), {
    target: { value: "รุ่นชื่อเฉพาะของงาน" },
  });
  const custom = stored();
  reloaded.unmount();
  render(<Editor initial={custom} />);
  expect(screen.getByLabelText("วิธีตั้งชื่อรุ่น")).toHaveValue("custom");
  fireEvent.change(
    screen.getByLabelText("อายุสูงสุด (เดือน รวมเดือนที่ระบุ)"),
    { target: { value: "18" } },
  );
  expect(screen.getByLabelText("ชื่อรุ่น")).toHaveValue("รุ่นชื่อเฉพาะของงาน");
});

it("keeps incomplete edits visible, rejects impossible intervals, and does not expose encoded metadata", () => {
  render(<Editor />);
  fireEvent.click(screen.getByRole("button", { name: "เพิ่มรุ่น" }));
  fireEvent.change(screen.getByLabelText("วิธีตั้งชื่อรุ่น"), {
    target: { value: "custom" },
  });
  fireEvent.change(screen.getByLabelText("ชื่อรุ่น"), {
    target: { value: "" },
  });
  fireEvent.change(screen.getByLabelText("อายุขั้นต่ำ (เดือน)"), {
    target: { value: "15" },
  });
  expect(screen.getByLabelText("ชื่อรุ่น")).toHaveValue("");
  expect(screen.getByLabelText("อายุขั้นต่ำ (เดือน)")).toHaveValue(15);
  expect(validateCompetitionCatalog(stored()).length).toBeGreaterThan(0);
});

it("special age bounds apply in the birthday tester and manual criteria are explicit", () => {
  render(<Editor />);
  fireEvent.click(screen.getByRole("button", { name: "เพิ่มรุ่น" }));
  fireEvent.change(screen.getByLabelText("วิธีตรวจคุณสมบัติ"), {
    target: { value: "special" },
  });
  fireEvent.change(screen.getByLabelText("อายุขั้นต่ำ (เดือน)"), {
    target: { value: "12" },
  });
  fireEvent.change(
    screen.getByLabelText("อายุสูงสุด (เดือน รวมเดือนที่ระบุ)"),
    { target: { value: "" } },
  );
  fireEvent.change(screen.getByLabelText("วิธีตั้งชื่อรุ่น"), {
    target: { value: "custom" },
  });
  fireEvent.change(screen.getByLabelText("ชื่อรุ่น"), {
    target: { value: "ฟันแท้ 1–2 คู่" },
  });
  fireEvent.change(
    screen.getByLabelText("เงื่อนไขให้เจ้าหน้าที่ตรวจเพิ่มเติม"),
    { target: { value: "ตรวจฟันหน้างาน" } },
  );
  const rule = stored()[0]!;
  expect(parseCompetitionClass(rule)).toMatchObject({
    kind: "special",
    minMonths: 12,
    maxMonths: null,
    criteria: "ตรวจฟันหน้างาน",
  });
  const tester = render(
    <ClassAgeTester cutoff="2026-10-16" royal={false} values={[rule]} />,
  );
  chooseDate("วันเกิดสำหรับทดลอง", "2025-12-16");
  expect(screen.getByText("ไม่พบรุ่นที่เข้าเกณฑ์")).toBeVisible();
  chooseDate("วันเกิดสำหรับทดลอง", "2025-10-16");
  expect(screen.getByText("[SP] ฟันแท้ 1–2 คู่")).toBeVisible();
  expect(tester.container).not.toHaveTextContent("@jaothui/class");
});

it.each([
  ["2026-01-15", "2026-10-16", false, 10],
  ["2025-10-16", "2026-10-16", false, 12],
  ["2025-10-15", "2026-10-16", false, 13],
  ["2025-07-15", "2026-10-16", false, 16],
  ["2025-10-16", "2026-10-16", true, 13],
  ["2024-01-31", "2024-02-29", false, 1],
  ["2024-02-29", "2025-02-28", false, 12],
] as const)(
  "ceiling calendar age %s to %s RoyalAlbino=%s is %s",
  (birth, cutoff, albino, expected) => {
    expect(previewCompetitionAge(birth, cutoff, albino)).toBe(expected);
  },
);
it("fails closed on future or invalid dates and minimum-exclusive empty intervals", () => {
  expect(previewCompetitionAge("2026-10-17", "2026-10-16")).toBeNull();
  expect(previewCompetitionAge("2026-02-30", "2026-10-16")).toBeNull();
  expect(() =>
    encodeCompetitionClass({
      name: "empty",
      kind: "age",
      minMonths: 12,
      maxMonths: 12,
      minInclusive: false,
      group: "",
      criteria: "",
    }),
  ).toThrow();
});

function chooseDate(label: string, iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  for (const [part, value] of [
    ["วัน", day],
    ["เดือน", month],
    ["ปี พ.ศ.", year! + 543],
  ] as const)
    fireEvent.change(screen.getByLabelText(`${label}—${part}`), {
      target: { value: String(value) },
    });
}

it("preserves a birthday after today when it is before the event age cutoff", () => {
  jest.useFakeTimers().setSystemTime(new Date("2026-10-25T00:00:00Z"));
  try {
    render(
      <ClassAgeTester
        cutoff="2028-10-16"
        royal={false}
        values={["ไม่เกิน 12 เดือน"]}
      />,
    );
    chooseDate("วันเกิดสำหรับทดลอง", "2027-10-16");
    expect(screen.getByText("อายุที่ใช้จัดรุ่น: 12 เดือน")).toBeVisible();
    expect(screen.getByText("ไม่เกิน 12 เดือน")).toBeVisible();
  } finally {
    jest.useRealTimers();
  }
});
it("recomputes Royal albino ceiling age from the selected Gregorian birthday", () => {
  render(
    <ClassAgeTester
      cutoff="2026-10-16"
      royal
      values={["มากกว่า 12 เดือน ถึง 15 เดือน"]}
    />,
  );
  chooseDate("วันเกิดสำหรับทดลอง", "2025-10-16");
  expect(screen.getByText("อายุที่ใช้จัดรุ่น: 12 เดือน")).toBeVisible();
  fireEvent.change(screen.getByLabelText("สีสำหรับทดลอง"), {
    target: { value: "albino" },
  });
  expect(screen.getByText("อายุที่ใช้จัดรุ่น: 13 เดือน")).toBeVisible();
  fireEvent.change(screen.getByLabelText("วันเกิดสำหรับทดลอง—เดือน"), {
    target: { value: "" },
  });
  expect(screen.queryByText(/อายุที่ใช้จัดรุ่น:/)).not.toBeInTheDocument();
});
