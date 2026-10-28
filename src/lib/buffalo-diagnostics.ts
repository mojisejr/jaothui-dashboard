/** Safe transport contract; never include provider errors, payloads or credentials. */
export type DiagnosticStage =
  | "authentication"
  | "validation"
  | "lookup"
  | "configuration"
  | "database_read"
  | "database_write"
  | "asset_upload"
  | "chain_read"
  | "chain_transaction"
  | "identity"
  | "operation"
  | "publication"
  | "request";
export type DiagnosticOutcome =
  | "not_started"
  | "pending"
  | "completed"
  | "failed"
  | "unknown";
export type DiagnosticAction =
  | "retry_read"
  | "reauthenticate"
  | "refresh_client"
  | "choose_file"
  | "correct_input"
  | "refresh_record"
  | "resume_existing"
  | "contact_support";
export interface DiagnosticEnvelope {
  code: string;
  stage: DiagnosticStage;
  reason: string;
  requestId: string;
  transportId?: string;
  operationId?: string;
  outcome: DiagnosticOutcome;
  nextAction: DiagnosticAction;
  fieldErrors?: Record<string, string[]>;
}
