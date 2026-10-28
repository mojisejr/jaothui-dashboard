import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FeedbackPanel } from "../FeedbackPanel";
import {
  feedbackFor,
  validateImage,
  uploadResponse,
  completedRefreshFeedback,
} from "../feedback";
const diagnostic = {
  code: "CANONICAL_CHIP_CONFLICT",
  reason: "ไมโครชิปใน NFT ไม่ตรงกับทะเบียน",
  stage: "identity" as const,
  outcome: "not_started" as const,
  nextAction: "contact_support" as const,
  requestId: "11111111-1111-4111-8111-111111111111",
  operationId: "22222222-2222-4222-8222-222222222222",
};
test("exact server reason and references survive transport and can be copied", async () => {
  const copy = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: copy },
    configurable: true,
  });
  render(<FeedbackPanel feedback={feedbackFor({ data: { diagnostic } })} />);
  expect(screen.getByText(diagnostic.reason)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "คัดลอกรหัสอ้างอิง" }));
  await waitFor(() =>
    expect(screen.getByText("คัดลอกรหัสอ้างอิงแล้ว")).toBeInTheDocument(),
  );
  expect(copy).toHaveBeenCalledWith(
    expect.stringContaining(diagnostic.requestId),
  );
  expect(copy).toHaveBeenCalledWith(
    expect.stringContaining(diagnostic.operationId),
  );
});
test("network fallback never repeats unsafe provider detail or invents a server reference", () => {
  const feedback = feedbackFor(new Error("https://private?password=sentinel"), {
    operationId: diagnostic.operationId,
  });
  expect(feedback.requestId).toBeUndefined();
  expect(feedback.outcome).toBe("unknown");
  expect(JSON.stringify(feedback)).not.toContain("sentinel");
  const completed = completedRefreshFeedback(
    { data: { diagnostic } },
    diagnostic.operationId,
  );
  expect(completed.outcome).toBe("completed");
  expect(completed.requestId).toBe(diagnostic.requestId);
});
test("image preflight rejects exact raw boundary, empty file and unsupported formats", () => {
  for (const file of [
    new File([], "empty.png", { type: "image/png" }),
    new File([new Uint8Array(2_000_000)], "big.png", { type: "image/png" }),
    new File(["pdf"], "dna.pdf", { type: "application/pdf" }),
  ])
    expect(validateImage(file)?.nextAction).toBe("choose_file");
  expect(
    validateImage(new File(["png"], "dna.png", { type: "image/png" })),
  ).toBeNull();
});
test("raw upload preserves server diagnostic; malformed response remains uncertain without fake ref", async () => {
  await expect(
    uploadResponse({
      ok: false,
      status: 503,
      json: async () => ({ diagnostic }),
    } as Response),
  ).rejects.toMatchObject({ data: { diagnostic } });
  try {
    await uploadResponse({
      ok: false,
      status: 502,
      json: async () => {
        throw Error("html");
      },
    } as unknown as Response);
  } catch (error) {
    expect(feedbackFor(error)).toMatchObject({
      code: "CLIENT_RESPONSE_UNAVAILABLE",
      outcome: "unknown",
    });
    expect(feedbackFor(error).requestId).toBeUndefined();
  }
});

test("prototype keys cannot supply a local diagnostic policy", () => {
  for (const key of ["constructor", "toString", "__proto__"])
    expect(feedbackFor(new Error(key)).outcome).toBe("unknown");
});
