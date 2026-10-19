import { z } from "zod";
import { buffaloIntentSchema } from "../intent";

export const operationIntentSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("create"), buffalo: buffaloIntentSchema })
    .strict(),
  z
    .object({
      kind: z.literal("edit"),
      microchip: z.string().min(1),
      tokenId: z.string().regex(/^[1-9][0-9]*$/),
      expectedRevision: z
        .string()
        .regex(/^[0-9a-f]{64}$/)
        .optional(),
      patch: z
        .object({
          name: z.string().optional(),
          height: z.string().regex(/^\d+$/).optional(),
          certNo: z.string().optional(),
          detail: z.string().optional(),
          dna: z.string().optional(),
          rarity: z.string().optional(),
          origin: z.string().optional(),
          color: z.string().optional(),
          sex: z.string().optional(),
          birthday: z.string().optional(),
          image: z.string().optional(),
          microchip: z.string().optional(),
          fatherId: z.string().optional(),
          motherId: z.string().optional(),
        })
        .strict()
        .refine((patch) => Object.keys(patch).length > 0),
    })
    .strict(),
]);
export type OperationIntent = z.infer<typeof operationIntentSchema>;
export interface Domain {
  chainId: number;
  nft: string;
  manager: string;
}
export type OperationState =
  | "DRAFT"
  | "READY"
  | "SIGNING"
  | "CHAIN_PENDING"
  | "BROADCAST_UNKNOWN"
  | "AWAITING_METADATA_ACTION"
  | "CHAIN_STEPS"
  | "PROJECTING"
  | "VERIFYING"
  | "COMPLETED"
  | "RETRYABLE"
  | "RECOVERY_REQUIRED"
  | "NEEDS_REVIEW"
  | "CANCELLED";
export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };
export interface Plan {
  executionInstance?: string;
  domain: Domain;
  sender: string;
  confirmations: number;
  maxFeeWei: string;
  context: Json;
}
export interface Operation {
  id: string;
  owner: string;
  intentHash: string;
  intent: OperationIntent;
  domain: Domain;
  plan: Plan | null;
  state: OperationState;
  version: number;
  fence: string;
  actualToken: string | null;
  result: Json;
  reason: string | null;
}
export type StepKind =
  | "mint"
  | "metadata"
  | "setter"
  | "batch"
  | "dna_restore"
  | "uri"
  | "parents";
export interface ExpectedCall {
  to: string;
  data: string;
  value: string;
  effects: Array<
    | {
        kind: "mint";
        nft: string;
        receiver: string;
        imageUri: string;
        tokenUri: string;
      }
    | {
        kind: "read";
        contract: string;
        functionName: string;
        args: Json[];
        expected: Json;
        abi: Json[];
        projection?: "manager-business" | "manager-manifest" | "nft-uri";
      }
  >;
}
export interface StepSpec {
  kind: StepKind;
  call: ExpectedCall;
}
export interface Step {
  id: string;
  operationId: string;
  ordinal: number;
  kind: StepKind;
  expected: ExpectedCall;
  state:
    | "RESERVED"
    | "SIGNED"
    | "PENDING"
    | "UNKNOWN"
    | "CONFIRMED"
    | "REVERTED"
    | "REVIEW";
  chainId: number;
  sender: string;
  nonce: string | null;
  calldataHash: string | null;
  hash: string | null;
  signedBytes: string | null;
  envelope: Envelope | null;
  receipt: ReceiptProof | null;
  proof: Json;
}
export interface Envelope {
  chainId: number;
  from: string;
  to: string;
  data: string;
  value: string;
  nonce: number;
  gas: string;
  gasPrice: string;
}
export interface Signed {
  bytes: string;
  hash: string;
  envelope: Envelope;
}
export interface ReceiptProof {
  transactionHash: string;
  blockHash: string;
  blockNumber: string;
  status: "success" | "reverted";
}
export type Observation =
  | { state: "missing"; latestNonce: number; pendingNonce: number }
  | { state: "pending" }
  | {
      state: "receipt";
      receipt: ReceiptProof;
      canonical: boolean;
      confirmations: number;
    };
export interface EffectProof {
  actualToken?: string;
  details: Json;
}
export interface PublicationProof {
  database: string;
  storage: string;
  manifest: string;
}
export interface ChainPorts {
  prepare: (operation: Operation) => Promise<Plan>;
  nextStep: (operation: Operation, steps: Step[]) => Promise<StepSpec | null>;
  nonce: (sender: string) => Promise<{ latest: number; pending: number }>;
  sign: (operation: Operation, step: Step, nonce: number) => Promise<Signed>;
  broadcast: (signedBytes: string) => Promise<string>;
  beforeBroadcast?: (operation: Operation, step: Step) => Promise<void>;
  observe: (step: Step) => Promise<Observation>;
  verifyEffects: (
    operation: Operation,
    step: Step,
    receipt: ReceiptProof,
  ) => Promise<EffectProof>;
  project: (operation: Operation, steps: Step[]) => Promise<PublicationProof>;
  verifyPublication: (
    operation: Operation,
    steps: Step[],
    proof: PublicationProof,
  ) => Promise<boolean>;
}
export interface Claim {
  id: string;
  owner: string;
  holder: string;
  fence: string;
}
export interface WalletClaim {
  chainId: number;
  sender: string;
  stepId: string;
  fence: string;
}
export interface Repository {
  create: (
    owner: string,
    key: string,
    intent: OperationIntent,
    domain: Domain,
  ) => Promise<Operation>;
  get: (id: string, owner: string) => Promise<Operation>;
  steps: (id: string) => Promise<Step[]>;
  claim: (id: string, owner: string, holder: string) => Promise<Claim | null>;
  release: (claim: Claim) => Promise<void>;
  setState: (
    claim: Claim,
    state: OperationState,
    reason?: string,
    result?: Json,
  ) => Promise<void>;
  ready: (claim: Claim, plan: Plan) => Promise<void>;
  reserveStep: (
    claim: Claim,
    spec: StepSpec,
    ordinal: number,
    plan: Plan,
  ) => Promise<Step>;
  wallet: (claim: Claim, step: Step) => Promise<WalletClaim | null>;
  journal: (
    claim: Claim,
    wallet: WalletClaim,
    step: Step,
    signed: Signed,
  ) => Promise<void>;
  assertBroadcast: (claim: Claim, step: Step) => Promise<void>;
  markStep: (
    claim: Claim,
    step: Step,
    state: Step["state"],
    receipt?: ReceiptProof,
    proof?: EffectProof,
  ) => Promise<void>;
  releaseWallet: (claim: Claim, step: Step) => Promise<void>;
  complete: (claim: Claim, result: PublicationProof) => Promise<void>;
  cancel: (claim: Claim) => Promise<void>;
}
