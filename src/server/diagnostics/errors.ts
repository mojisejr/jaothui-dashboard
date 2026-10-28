import {
  type DiagnosticAction,
  type DiagnosticOutcome,
  type DiagnosticStage,
} from "~/lib/buffalo-diagnostics";
export interface ErrorPolicy {
  stage: DiagnosticStage;
  reason: string;
  nextAction: DiagnosticAction;
  outcome?: DiagnosticOutcome;
}
export class DiagnosticError extends Error {
  constructor(
    readonly code: string,
    options?: { cause?: unknown },
  ) {
    super(code, options);
    this.name = "DiagnosticError";
  }
}
const registry: Record<string, ErrorPolicy> = {};
function register(codes: readonly string[], policy: ErrorPolicy) {
  for (const code of codes) registry[code] = policy;
}
register(["UNAUTHORIZED", "FORBIDDEN"], {
  stage: "authentication",
  reason: "เซสชันไม่พร้อมใช้งาน กรุณาเข้าสู่ระบบอีกครั้ง",
  nextAction: "reauthenticate",
  outcome: "not_started",
});
register(
  [
    "INPUT_TOO_LARGE",
    "INPUT_INVALID",
    "INVALID_IMAGE_LENGTH",
    "METHOD_NOT_ALLOWED",
  ],
  {
    stage: "validation",
    reason: "ข้อมูลที่ส่งไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่",
    nextAction: "correct_input",
    outcome: "not_started",
  },
);
register(["COW_NOT_FOUND", "OPERATION_NOT_FOUND", "PARENT_NOT_FOUND"], {
  stage: "lookup",
  reason: "ไม่พบรายการที่ระบุ กรุณาตรวจสอบเลขอ้างอิง",
  nextAction: "correct_input",
  outcome: "not_started",
});
register(["LEGACY_WRITE_REQUIRES_DURABLE_OPERATION"], {
  stage: "configuration",
  reason: "หน้าเว็บนี้ใช้ระบบบันทึกเดิม กรุณาโหลดหน้าใหม่ก่อนทำรายการ",
  nextAction: "refresh_client",
  outcome: "not_started",
});
register(["DATABASE_READ_FAILED"], {
  stage: "database_read",
  reason: "อ่านทะเบียนไม่สำเร็จ ยังสรุปไม่ได้ว่าไม่มีข้อมูล",
  nextAction: "retry_read",
  outcome: "not_started",
});
register(["DATABASE_WRITE_FAILED"], {
  stage: "database_write",
  reason: "ยังยืนยันผลการบันทึกไม่ได้ กรุณาตรวจสอบรายการเดิมก่อนส่งซ้ำ",
  nextAction: "contact_support",
  outcome: "unknown",
});
register(
  [
    "INVALID_IMAGE_SIZE",
    "INVALID_IMAGE_SIZE_OR_TYPE",
    "INVALID_IMAGE_CONTENT",
    "IMAGE_OUTPUT_TOO_LARGE",
    "UPLOAD_NOT_READY",
    "IMAGE_NOT_READY",
  ],
  {
    stage: "asset_upload",
    reason: "ยังรับไฟล์ไม่ได้ กรุณาเลือกภาพ JPEG หรือ PNG ขนาดต่ำกว่า 2 MB",
    nextAction: "choose_file",
    outcome: "not_started",
  },
);
register(
  [
    "IMAGE_UPLOAD_REJECTED",
    "STORAGE_UPLOAD_FAILED",
    "ASSET_ORIGIN_UNAVAILABLE",
    "IMAGE_ORIGIN_UNAVAILABLE",
    "STORAGE_ORIGIN_UNAVAILABLE",
    "NFT_JSON_ORIGIN_UNAVAILABLE",
  ],
  {
    stage: "asset_upload",
    reason: "รับหรือตรวจสอบไฟล์ไม่สำเร็จ กรุณาตรวจสอบรายการเดิม",
    nextAction: "contact_support",
  },
);
register(
  ["CHAIN_CHECK_UNAVAILABLE", "CHAIN_READ_FAILED", "CHAIN_READ_TIMEOUT"],
  {
    stage: "chain_read",
    reason: "อ่านข้อมูลทะเบียนได้ แต่ยังตรวจสอบ blockchain ไม่ได้",
    nextAction: "retry_read",
    outcome: "not_started",
  },
);
register(
  [
    "IDENTITY_CONFLICT",
    "TOKEN_EDITION_MISMATCH",
    "COW_BINDING_CONFLICT",
    "TOKEN_NOT_INITIALIZED",
    "CANONICAL_CHIP_CONFLICT",
    "TOKEN_MAPPING_CONFLICT",
    "AMBIGUOUS_DB_TOKEN",
    "CHAIN_DOMAIN_CONFLICT",
    "PARENT_IDENTITY_CONFLICT",
    "MICROCHIP_ALREADY_BOUND",
    "DATABASE_TOKEN_ALREADY_BOUND",
  ],
  {
    stage: "identity",
    reason: "ตัวตนหรือเลขทะเบียนไม่ตรงกัน จึงหยุดเพื่อป้องกันการแก้ผิดตัว",
    nextAction: "contact_support",
    outcome: "not_started",
  },
);
register(
  [
    "STALE_EDIT_RECORD",
    "STALE_DRAFT_REVISION",
    "STALE_OPERATION_REVISION",
    "IDEMPOTENCY_PAYLOAD_CONFLICT",
  ],
  {
    stage: "operation",
    reason:
      "ข้อมูลเปลี่ยนหลังจากเปิดหน้านี้ กรุณาโหลดรายการล่าสุดก่อนดำเนินการ",
    nextAction: "refresh_record",
    outcome: "not_started",
  },
);
register(
  [
    "BROADCAST_RESULT_UNKNOWN",
    "NONCE_CONSUMED_BY_UNKNOWN_TRANSACTION",
    "CONFIRMED_RECEIPT_DISAPPEARED",
    "REORG_UNCERTAINTY",
    "HISTORICAL_STATE_REQUIRED",
    "REQUEST_BUDGET_EXCEEDED",
    "ADAPTER_UNAVAILABLE",
  ],
  {
    stage: "chain_transaction",
    reason: "ยังยืนยันผลธุรกรรมไม่ได้ ต้องตรวจสอบรายการเดิมก่อนดำเนินการต่อ",
    nextAction: "contact_support",
    outcome: "unknown",
  },
);
register(["TRANSACTION_REVERTED"], {
  stage: "chain_transaction",
  reason: "ธุรกรรมถูกปฏิเสธบน blockchain กรุณาตรวจสอบรายการเดิม",
  nextAction: "contact_support",
  outcome: "unknown",
});
register(
  [
    "PUBLICATION_PROOF_MISMATCH",
    "DATABASE_PUBLICATION_CONFLICT",
    "DATABASE_PROJECTION_CONFLICT",
  ],
  {
    stage: "publication",
    reason: "ยังตรวจสอบการเผยแพร่ข้อมูลไม่ครบ กรุณาตรวจสอบรายการเดิม",
    nextAction: "contact_support",
    outcome: "pending",
  },
);
register(["COMPLETED_REFRESH_FAILED"], {
  stage: "lookup",
  reason: "บันทึกสำเร็จแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ",
  nextAction: "retry_read",
  outcome: "completed",
});
register(
  [
    "CREATE_SERVICE_UNAVAILABLE",
    "EDIT_SERVICE_UNAVAILABLE",
    "OPERATION_SERVICE_UNAVAILABLE",
    "INTERNAL_ERROR",
  ],
  {
    stage: "request",
    reason:
      "ระบบพบข้อผิดพลาดที่ยังระบุสาเหตุไม่ได้ กรุณาแจ้งรหัสอ้างอิงแก่ผู้ดูแล",
    nextAction: "contact_support",
  },
);
register(
  [
    "INTEGRITY_FEATURE_DISABLED",
    "INTEGRITY_WRITES_PAUSED",
    "INTEGRITY_SERVER_CONFIG_REQUIRED",
    "INVALID_INTEGRITY_MODE",
    "INVALID_INTEGRITY_SERVER_CONFIG",
    "ISOLATED_CONFIG_OUTSIDE_TASK",
    "ISOLATED_CONFIG_REQUIRED",
    "ISOLATED_PRODUCTION_REHEARSAL_REQUIRED",
    "LOOPBACK_DATABASE_ONLY",
    "LOOPBACK_STORAGE_ONLY",
    "PINNED_CODE_HASH_REQUIRED",
    "POSTGRES_REQUIRED",
    "PRODUCTION_ACTIVATION_FORBIDDEN",
    "PRODUCTION_HTTPS_REQUIRED",
    "RELEASE_ATTESTATION_REQUIRED",
    "SCOPED_STORAGE_TOKEN_REQUIRED",
    "STORAGE_PUBLIC_API_KEY_REQUIRED",
    "STORAGE_PUBLIC_HOST_MISMATCH",
    "UNAPPROVED_SIGNER",
    "INTEGRITY_PORT_CONFIGURATION_REQUIRED",
    "GAS_BUDGET_EXCEEDED",
  ],
  {
    stage: "configuration",
    reason: "ระบบบันทึกยังไม่พร้อมใช้งาน กรุณาแจ้งผู้ดูแลพร้อมรหัสอ้างอิง",
    nextAction: "contact_support",
    outcome: "not_started",
  },
);
// Exact reviewed integrity codes; unknown provider strings never enter the public contract.
register(
  [
    "ACCOUNT_OPERATION_BUSY",
    "ACTUAL_RECEIPT_TOKEN_REQUIRED",
    "ACTUAL_TOKEN_CHANGED",
    "ACTUAL_TOKEN_RESERVED_BY_OTHER",
    "ALIAS_BASELINE_CHANGED",
    "ALIAS_KEY_REQUIRED",
    "ASSET_ALREADY_BOUND",
    "ASSET_BINDING_CONFLICT",
    "ASSET_ORIGIN_CONFLICT",
    "ASSET_ORIGIN_REVIEW_REQUIRED",
    "BASELINE_READ_REORG",
    "BROADCAST_HASH_MISMATCH",
    "CANNOT_CANCEL_SIGNED_OPERATION",
    "CANONICAL_BLOCK_REQUIRED",
    "CANONICAL_READ_PORT_REQUIRED",
    "CONTINUE_EXISTING_OPERATION",
    "COW_ALREADY_RESERVED",
    "CREATE_DRAFT_REQUIRED",
    "CREATE_MANIFEST_BASELINE_CHANGED",
    "CREATE_METADATA_NATIVE_CHANGED",
    "CREATE_NFT_BASELINE_CHANGED",
    "CREATE_NFT_NATIVE_CHANGED",
    "CREATE_OPERATION_REQUIRED",
    "CREATE_OWNERSHIP_OR_PERMISSION_CHANGED",
    "CREATE_PARENT_BASELINE_CHANGED",
    "CURRENT_MANIFEST_CONFLICT",
    "CURRENT_MINT_NATIVE_CONFLICT",
    "CURRENT_RECEIPT_NATIVE_CONFLICT",
    "CURRENT_RECONCILIATION_REORG",
    "DEPLOYED_CODE_CHANGED",
    "DRAFT_BUSY",
    "EDIT_OPERATION_REQUIRED",
    "EXPLICIT_MINT_ACTION_REQUIRED",
    "EXTERNAL_CHAIN_BASELINE_CHANGED",
    "FIELD_READBACK_MISMATCH",
    "IMAGE_ALIAS_BINDING_REVIEW_REQUIRED",
    "IMAGE_ORIGIN_CONFLICT",
    "IMAGE_UPLOAD_BINDING_REQUIRED",
    "INITIALIZED_METADATA_CONFLICT",
    "INITIALIZED_PARENT_CONFLICT",
    "INITIAL_METADATA_READ_REORG",
    "INTENT_FROZEN",
    "INTENT_TOO_LARGE",
    "INVALID_CANCEL_STAGE",
    "INVALID_CHAIN_DOMAIN",
    "INVALID_DRAFT_KEY",
    "INVALID_NONCE",
    "INVALID_OPERATION_KEY",
    "INVALID_OPERATION_STAGE",
    "INVALID_RECEIPT_EVIDENCE",
    "INVALID_SERVER_PLAN",
    "ISOLATED_INSTANCE_MISMATCH",
    "LOOPBACK_ONLY",
    "MANAGER_ADMIN_PERMISSION_REQUIRED",
    "MANAGER_NATIVE_TIMESTAMP_CHANGED",
    "MICROCHIP_HAS_CHILD_REFERENCES_REVIEW_REQUIRED",
    "MINT_BINDING_READBACK_MISMATCH",
    "MINT_EVENT_BINDING_MISMATCH",
    "MINT_EVENT_NOT_UNIQUE",
    "MINT_RECEIVER_MISMATCH",
    "MISSING_DURABLE_NONCE",
    "MISSING_EFFECT_CONTRACT",
    "MISSING_NATIVE_RECEIPT_EVIDENCE",
    "MISSING_SERVER_MANIFEST",
    "MISSING_SIGNED_HASH",
    "NFT_BASELINE_CHANGED",
    "NFT_JSON_IDENTITY_CONFLICT",
    "NFT_JSON_IMAGE_BINDING_CONFLICT",
    "NFT_JSON_REVIEW_REQUIRED",
    "NFT_JSON_TRAIT_CONFLICT",
    "NFT_NATIVE_TIMESTAMP_CHANGED",
    "NFT_OWNER_PERMISSION_REQUIRED",
    "NFT_PUBLICATION_BINDING_CONFLICT",
    "NOT_ISOLATED_ANVIL",
    "NO_APPROVED_PLAN",
    "NO_CHAIN_PROOF",
    "OLD_MICROCHIP_ALIAS_CHANGED",
    "OPERATION_BOUND_EXCEEDED",
    "PLAN_SENDER_OR_GAS_BOUND",
    "PRESERVATION_INVARIANT_CHANGED",
    "PRODUCTION_NETWORK_MISMATCH",
    "PRODUCTION_RPC_HTTPS_REQUIRED",
    "RECEIPT_CANONICALITY_CHANGED",
    "RECEIPT_EVIDENCE_BINDING_CHANGED",
    "RECEIPT_EVIDENCE_EFFECTS_CHANGED",
    "RECEIPT_HASH_MISMATCH",
    "RECEIPT_TIMESTAMP_CHANGED",
    "RECEIPT_TRANSACTION_MISMATCH",
    "RECONCILIATION_HEAD_CHANGED",
    "REMINT_FORBIDDEN",
    "SELF_PARENT_FORBIDDEN",
    "SIGNED_ENVELOPE_MISMATCH",
    "STALE_BROADCAST_LEASE",
    "STALE_OPERATION_LEASE",
    "STALE_WALLET_LEASE",
    "STEP_ALREADY_SIGNED",
    "STEP_INTENT_CONFLICT",
    "UNAPPROVED_CONTRACT",
    "UNAPPROVED_CONTRACT_ACTION",
    "UNAPPROVED_EFFECT_CONTRACT",
    "UNOWNED_ASSET_KEY",
    "UNVERIFIED_STEPS",
    "UPLOAD_FIELD_MISMATCH",
  ],
  {
    stage: "operation",
    reason: "รายการนี้ต้องตรวจสอบก่อนดำเนินการต่อ เพื่อรักษาข้อมูลเดิม",
    nextAction: "contact_support",
  },
);
register(["TOKEN_MAPPING_CONFLICT"], {
  stage: "identity",
  reason: "เลขไมโครชิปนี้ชี้ไปยัง NFT คนละหมายเลขกับทะเบียน จึงยังแก้ไขไม่ได้",
  nextAction: "contact_support",
  outcome: "not_started",
});
register(["CANONICAL_CHIP_CONFLICT"], {
  stage: "identity",
  reason: "ไมโครชิปที่บันทึกใน NFT ไม่ตรงกับทะเบียน จึงยังแก้ไขไม่ได้",
  nextAction: "contact_support",
  outcome: "not_started",
});
register(["AMBIGUOUS_DB_TOKEN"], {
  stage: "identity",
  reason:
    "ทะเบียนควายมากกว่าหนึ่งตัวผูกกับ NFT เดียวกัน ต้องตรวจสอบตัวตนก่อนแก้ไข",
  nextAction: "contact_support",
  outcome: "not_started",
});
register(["TOKEN_NOT_INITIALIZED"], {
  stage: "identity",
  reason: "ยังไม่พบ NFT หรือข้อมูลทะเบียนบน blockchain ที่พร้อมใช้งาน",
  nextAction: "contact_support",
  outcome: "not_started",
});
register(["INTEGRITY_FEATURE_DISABLED"], {
  stage: "configuration",
  reason: "ระบบบันทึกยังไม่ได้เปิดใช้งานในสภาพแวดล้อมนี้",
  nextAction: "contact_support",
  outcome: "not_started",
});
register(["INTEGRITY_WRITES_PAUSED"], {
  stage: "configuration",
  reason:
    "ระบบพักการเริ่มรายการใหม่ชั่วคราว กรุณาตรวจสถานะรายการเดิมหรือติดต่อผู้ดูแล",
  nextAction: "contact_support",
  outcome: "not_started",
});
register(["SCOPED_STORAGE_TOKEN_REQUIRED"], {
  stage: "configuration",
  reason: "สิทธิ์บันทึกไฟล์ของระบบไม่พร้อมหรือหมดอายุ กรุณาแจ้งผู้ดูแล",
  nextAction: "contact_support",
  outcome: "not_started",
});
register(["REPAIR_DIAGNOSIS_DISABLED"], {
  stage: "configuration",
  reason: "ระบบตรวจสอบการซ่อมข้อมูลยังไม่ได้เปิดใช้งาน กรุณาแจ้งผู้ดูแล",
  nextAction: "contact_support",
  outcome: "not_started",
});
register(["REPAIR_SCAN_INCOMPLETE"], {
  stage: "identity",
  reason:
    "ยังตรวจสอบทะเบียนไม่ครบ จึงยังสรุปวิธีซ่อมไม่ได้ กรุณาตรวจสอบอีกครั้ง",
  nextAction: "retry_read",
  outcome: "not_started",
});
register(["REPAIR_SCAN_EXPIRED"], {
  stage: "identity",
  reason: "ผลตรวจสอบหมดอายุแล้ว กรุณาตรวจสอบข้อมูลล่าสุดอีกครั้ง",
  nextAction: "retry_read",
  outcome: "not_started",
});
register(["REPAIR_SCAN_INVALID"], {
  stage: "validation",
  reason: "ข้อมูลอ้างอิงผลตรวจสอบไม่ถูกต้อง กรุณาเริ่มตรวจสอบใหม่",
  nextAction: "correct_input",
  outcome: "not_started",
});
register(["REPAIR_BASELINE_CHANGED"], {
  stage: "identity",
  reason: "ผลตรวจเดิมเก่าเกินกำหนดหรือข้อมูลเปลี่ยน กรุณาตรวจสอบข้อมูลล่าสุดอีกครั้ง",
  nextAction: "refresh_record",
  outcome: "not_started",
});
register(["REPAIR_SOURCE_UNAVAILABLE"], {
  stage: "chain_read",
  reason:
    "อ่านข้อมูล blockchain เพื่อวิเคราะห์การซ่อมไม่สำเร็จ กรุณาตรวจสอบอีกครั้ง",
  nextAction: "retry_read",
  outcome: "not_started",
});
register(["REPAIR_DATABASE_UNAVAILABLE"], {
  stage: "database_read",
  reason:
    "อ่านทะเบียนเพื่อวิเคราะห์การซ่อมไม่สำเร็จ ยังสรุปไม่ได้ว่าไม่มีข้อมูล",
  nextAction: "retry_read",
  outcome: "not_started",
});
register(["STEP_REQUIRES_REVIEW"], {
  stage: "chain_transaction",
  reason: "ธุรกรรมเดิมต้องให้ผู้ดูแลตรวจสอบก่อนดำเนินการต่อ",
  nextAction: "contact_support",
  outcome: "unknown",
});
register(["WALLET_QUEUE_BUSY"], {
  stage: "operation",
  reason:
    "กระเป๋าระบบกำลังดำเนินรายการอื่น กรุณาตรวจสถานะแล้วดำเนินรายการเดิมต่อ",
  nextAction: "resume_existing",
  outcome: "pending",
});
register(["UNMANAGED_PENDING_NONCE"], {
  stage: "chain_transaction",
  reason: "พบธุรกรรมค้างของกระเป๋าระบบที่ต้องตรวจสอบก่อนส่งรายการนี้",
  nextAction: "contact_support",
  outcome: "unknown",
});
register(["WALLET_RESERVATION_CONFLICT"], {
  stage: "chain_transaction",
  reason:
    "สิทธิ์ดำเนินธุรกรรมของกระเป๋าระบบขัดแย้ง กรุณาตรวจสอบรายการเดิมกับผู้ดูแล",
  nextAction: "contact_support",
  outcome: "unknown",
});
register(["REWARD_IDEMPOTENCY_CONFLICT"], {
  stage: "operation",
  reason:
    "เลขอ้างอิงนี้บันทึกรางวัลด้วยข้อมูลอื่นแล้ว กรุณาตรวจสอบรายการที่บันทึกก่อนเริ่มรายการใหม่",
  nextAction: "refresh_record",
  outcome: "unknown",
});
register(["REWARD_ASSET_INVALID"], {
  stage: "validation",
  reason: "รูปภาพไม่ตรงกับเลขอ้างอิงรางวัล กรุณาตรวจสอบภาพของรายการนี้",
  nextAction: "correct_input",
  outcome: "not_started",
});
register(["LEGACY_REWARD_REQUIRES_REQUEST_ID"], {
  stage: "configuration",
  reason: "หน้าเพิ่มรางวัลนี้เป็นรุ่นเดิม กรุณาโหลดหน้าใหม่ก่อนบันทึก",
  nextAction: "refresh_client",
  outcome: "not_started",
});
register(["REWARD_RECONCILIATION_UNAVAILABLE"], {
  stage: "database_write",
  reason:
    "ยังตรวจสอบผลการบันทึกรางวัลเดิมไม่ได้ กรุณาตรวจสถานะด้วยเลขอ้างอิงเดิมก่อนส่งซ้ำ",
  nextAction: "retry_read",
  outcome: "unknown",
});
register(["CHECKPOINT_MISMATCH"], {
  stage: "configuration",
  reason: "จุดอ้างอิง blockchain ไม่ตรงกับระบบที่อนุมัติ จึงพักการแก้ไขไว้",
  nextAction: "contact_support",
  outcome: "not_started",
});
register(["CODE_HASH_MISMATCH"], {
  stage: "configuration",
  reason: "สัญญา blockchain ไม่ตรงกับเวอร์ชันที่อนุมัติ จึงพักการแก้ไขไว้",
  nextAction: "contact_support",
  outcome: "not_started",
});
export function errorPolicy(code: string): ErrorPolicy | undefined {
  return Object.hasOwn(registry, code) ? registry[code] : undefined;
}
export const diagnosticCodes = Object.freeze(Object.keys(registry));
