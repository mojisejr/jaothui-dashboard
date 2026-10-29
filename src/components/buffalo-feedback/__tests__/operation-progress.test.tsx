import { act, fireEvent, render, screen } from "@testing-library/react";
import { OperationProgress } from "../OperationProgress";

const job = {
  id: "test-operation",
  state: "CHAIN_PENDING",
  steps: [{ kind: "mint", state: "CONFIRMED", hash: "0xknown" }],
};
test("mint confirmation is not final completion and metadata remains explicit", () => {
  render(
    <OperationProgress
      job={{ ...job, state: "AWAITING_METADATA_ACTION" }}
      busy={false}
      kind="create"
    />,
  );
  expect(
    screen.getByText(/Mint NFT สำเร็จแล้ว แต่ยังไม่เสร็จ/),
  ).toBeInTheDocument();
  expect(screen.queryByText(/ออกจากหน้านี้ได้/)).not.toBeInTheDocument();
});
test.each(["create", "edit"] as const)(
  "%s waiting has an elapsed clock and escalation without declaring failure",
  async (kind) => {
    jest.useFakeTimers();
    try {
      const page = render(
        <OperationProgress job={job} busy={false} kind={kind} />,
      );
      await act(async () => {
        jest.advanceTimersByTime(180000);
      });
      expect(
        screen.getByText("รอในช่วงนี้ 3 นาที 0 วินาที"),
      ).toBeInTheDocument();
      expect(screen.getByText(/ยังสรุปไม่ได้ว่าล้มเหลว/)).toBeInTheDocument();
      page.rerender(
        <OperationProgress
          job={{ ...job, state: "COMPLETED" }}
          busy={false}
          kind={kind}
        />,
      );
      expect(screen.getByText(/ออกจากหน้านี้ได้/)).toBeInTheDocument();
      expect(screen.queryByText(/รอในช่วงนี้/)).not.toBeInTheDocument();
      page.unmount();
    } finally {
      jest.useRealTimers();
    }
  },
);
test("support copy includes operation, state and existing transaction evidence", async () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  render(<OperationProgress job={job} busy={false} kind="edit" />);
  fireEvent.click(
    screen.getByRole("button", { name: "คัดลอกข้อมูลรายการเพื่อแจ้งผู้ดูแล" }),
  );
  expect(writeText).toHaveBeenCalledWith(
    expect.stringContaining("operationId: test-operation"),
  );
  expect(writeText).toHaveBeenCalledWith(
    expect.stringContaining("mint: CONFIRMED 0xknown"),
  );
  await screen.findByText(/คัดลอกข้อมูลรายการแล้ว/);
});
