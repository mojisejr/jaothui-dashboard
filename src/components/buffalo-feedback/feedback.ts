import type {
  DiagnosticEnvelope,
  DiagnosticOutcome,
  DiagnosticStage,
} from "~/lib/buffalo-diagnostics";

/** A browser failure has no server reference until a response actually supplies one. */
export type Feedback = Omit<DiagnosticEnvelope, "requestId"> & {
  requestId?: string;
};
const local: Record<
  string,
  Pick<Feedback, "reason" | "stage" | "nextAction" | "outcome">
> = {
  PENDING_REWARD_INVALID: {
    reason:
      "ข้อมูลกู้คืนรางวัลในเครื่องไม่ครบหรือไม่ตรงกัน กรุณาแจ้งผู้ดูแลเพื่อตรวจรายการเดิมก่อนเริ่มใหม่",
    stage: "operation",
    nextAction: "contact_support",
    outcome: "unknown",
  },
  INPUT_INVALID: {
    reason: "กรุณาตรวจสอบข้อมูลให้ครบและวันที่ให้ถูกต้อง",
    stage: "validation",
    nextAction: "correct_input",
    outcome: "not_started",
  },
  INVALID_IMAGE_SIZE_OR_TYPE: {
    reason: "กรุณาเลือกภาพ JPEG หรือ PNG ขนาดต่ำกว่า 2,000,000 ไบต์ (2 MB)",
    stage: "validation",
    nextAction: "choose_file",
    outcome: "not_started",
  },
  STALE_EDIT_RECORD: {
    reason:
      "ข้อมูลเปลี่ยนหลังจากเปิดหน้าต่างนี้ กรุณาโหลดรายละเอียดล่าสุด ข้อมูลที่กรอกยังอยู่",
    stage: "operation",
    nextAction: "refresh_record",
    outcome: "not_started",
  },
  NO_CHANGED_FIELDS: {
    reason: "ยังไม่มีช่องที่เปลี่ยนแปลง กรุณาแก้ไขค่าที่ต้องการก่อนยืนยัน",
    stage: "validation",
    nextAction: "correct_input",
    outcome: "not_started",
  },
  UNAUTHORIZED: {
    reason:
      "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง แล้วกลับมาดำเนินการต่อรายการเดิม",
    stage: "authentication",
    nextAction: "reauthenticate",
    outcome: "unknown",
  },
  COMPLETED_REFRESH_FAILED: {
    reason:
      "บันทึกสำเร็จแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ กรุณาโหลดรายละเอียดอีกครั้ง",
    stage: "lookup",
    nextAction: "retry_read",
    outcome: "completed",
  },
  REWARD_UPLOAD_UNCONFIRMED: {
    reason:
      "ยังยืนยันการรับไฟล์ไม่ได้ ข้อมูลที่กรอกและเลขรายการเดิมยังอยู่ กรุณาตรวจสอบรายการเดิมอีกครั้ง",
    stage: "asset_upload",
    nextAction: "contact_support",
    outcome: "unknown",
  },
  REWARD_RESULT_UNCONFIRMED: {
    reason:
      "ยังยืนยันผลการบันทึกรางวัลไม่ได้ กรุณาตรวจสอบรายการเดิมก่อนเริ่มรางวัลใหม่",
    stage: "database_write",
    nextAction: "contact_support",
    outcome: "unknown",
  },
};
export function localFeedback(code: string, operationId?: string): Feedback {
  return {
    code,
    ...((Object.hasOwn(local, code) ? local[code] : undefined) ?? {
      reason:
        "ยังยืนยันผลการดำเนินการไม่ได้ กรุณาตรวจสอบรายการเดิมหรือแจ้งผู้ดูแล",
      stage: "request",
      nextAction: "contact_support",
      outcome: "unknown",
    }),
    ...(operationId ? { operationId } : {}),
  };
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}
export function isUnauthorized(error: unknown) {
  return (
    object(error) &&
    ((object(error.data) && error.data.code === "UNAUTHORIZED") ||
      error.code === "UNAUTHORIZED" ||
      error.message === "UNAUTHORIZED")
  );
}
export function feedbackFor(
  error: unknown,
  options: {
    stage?: DiagnosticStage;
    outcome?: DiagnosticOutcome;
    operationId?: string;
  } = {},
): Feedback {
  const candidate =
    object(error) && object(error.data)
      ? error.data.diagnostic
      : object(error)
        ? error.diagnostic
        : undefined;
  if (
    object(candidate) &&
    typeof candidate.code === "string" &&
    typeof candidate.requestId === "string" &&
    typeof candidate.reason === "string" &&
    typeof candidate.stage === "string" &&
    typeof candidate.nextAction === "string" &&
    typeof candidate.outcome === "string"
  )
    return candidate as unknown as DiagnosticEnvelope;
  if (
    object(error) &&
    typeof error.code === "string" &&
    object(error) &&
    typeof error.reason === "string"
  )
    return {
      ...(error as unknown as Feedback),
      ...(options.operationId && !error.operationId
        ? { operationId: options.operationId }
        : {}),
    };
  const code = isUnauthorized(error)
    ? "UNAUTHORIZED"
    : error instanceof Error && Object.hasOwn(local, error.message)
      ? error.message
      : "CLIENT_RESPONSE_UNAVAILABLE";
  const result = localFeedback(code, options.operationId);
  if (code === "CLIENT_RESPONSE_UNAVAILABLE") {
    result.stage = options.stage ?? "request";
    result.outcome = options.outcome ?? "unknown";
    result.reason =
      options.outcome === "not_started"
        ? "โหลดข้อมูลไม่สำเร็จ ยังสรุปไม่ได้ว่าไม่มีข้อมูล กรุณาลองโหลดอีกครั้ง"
        : "ไม่ได้รับผลยืนยันจากระบบ กรุณาตรวจสอบรายการเดิมก่อนส่งซ้ำ";
    result.nextAction =
      options.outcome === "not_started" ? "retry_read" : "contact_support";
  }
  return result;
}
export function completedRefreshFeedback(
  error: unknown,
  operationId: string,
): Feedback {
  const source = feedbackFor(error);
  return {
    ...source,
    ...localFeedback("COMPLETED_REFRESH_FAILED", operationId),
  };
}
export function validateImage(file: File): Feedback | null {
  return !["image/jpeg", "image/png"].includes(file.type) ||
    file.size <= 0 ||
    file.size >= 2_000_000
    ? localFeedback("INVALID_IMAGE_SIZE_OR_TYPE")
    : null;
}
export async function uploadResponse(response: Response) {
  if (response.ok) return;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    /* HTML/network failures do not supply a server diagnostic. */
  }
  if (object(body) && object(body.diagnostic))
    throw {
      data: {
        code: response.status === 401 ? "UNAUTHORIZED" : undefined,
        diagnostic: body.diagnostic,
      },
    };
  if (response.status === 401) throw localFeedback("UNAUTHORIZED");
  throw localFeedback("CLIENT_RESPONSE_UNAVAILABLE");
}
