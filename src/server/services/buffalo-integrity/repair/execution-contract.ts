import { z } from "zod";
import { type DiagnosticEnvelope } from "~/lib/buffalo-diagnostics";
import { previewRequestSchema, repairProposalSchema } from "./contract";
import { type RepairDatabaseProjection } from "./db-projection";
export type RepairJson =
  | null
  | boolean
  | number
  | string
  | RepairJson[]
  | { [key: string]: RepairJson };
export const repairJsonSchema: z.ZodType<RepairJson> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(repairJsonSchema),
    z.record(repairJsonSchema),
  ]),
);
const hash = z.string().regex(/^[a-f0-9]{64}$/),
  address = z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  token = z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .max(78),
  decimal = z
    .string()
    .regex(/^[0-9]+$/)
    .max(78),
  legacy = z.string().min(1).max(128);
export const databaseRepairProjectionSchema = z
  .object({
    targets: z
      .array(
        z
          .object({
            sourceMicrochip: legacy,
            desiredMicrochip: z.string().regex(/^[0-9]{15}$/),
            desiredTokenId: token,
            baseline: z.record(repairJsonSchema),
            desiredImage: z.string().url().max(4000).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(2),
    references: z
      .array(
        z
          .object({
            kind: z.string().max(80),
            key: z.string().max(200),
            chips: z.array(legacy).max(20),
            digest: hash,
          })
          .strict(),
      )
      .max(1000),
    catalogDigest: hash,
    closureChips: z.array(legacy).max(100),
    closureTokens: z.array(token).max(100),
  })
  .strict();
// Structural compatibility is checked here without importing executable database code.
const projectionCompatibility: z.ZodType<RepairDatabaseProjection> =
  databaseRepairProjectionSchema;
export const repairFeeBudgetSchema = z
  .object({
    perStep: z
      .array(
        z
          .object({ stepId: z.string().min(1).max(80), maxFeeWei: decimal })
          .strict(),
      )
      .max(5),
    totalMaxFeeWei: decimal,
  })
  .strict();
export const repairExecutionManifestSchema = z
  .object({
    version: z.literal(1),
    operationId: z.string().uuid(),
    mode: z.enum(["database_only", "chain"]),
    createdAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
    domain: z
      .object({ chainId: z.literal(96), nft: address, manager: address })
      .strict(),
    targets: repairProposalSchema.shape.targets,
    reservationChips: z.array(legacy).max(100),
    reservationTokens: z.array(token).max(100),
    database: projectionCompatibility,
    chain: z
      .object({
        pin: z.record(repairJsonSchema),
        metadataCounter: decimal,
        tokens: z
          .array(
            z
              .object({
                tokenId: token,
                before: z.record(repairJsonSchema),
                desired: z.record(repairJsonSchema),
                native: z
                  .object({ createdAt: decimal, updatedAt: decimal })
                  .strict(),
                owner: address,
                nftApproved: address,
                managerApprovals: repairJsonSchema,
                tokenUri: z.string().max(4000),
                nftRecord: repairJsonSchema,
              })
              .strict(),
          )
          .max(2),
        aliases: z
          .array(z.object({ microchip: legacy, tokenId: decimal }).strict())
          .max(100),
        steps: z
          .array(
            z
              .object({
                id: z.string().min(1).max(80),
                kind: z.enum(["batch", "dna_restore", "uri"]),
                tokenId: token.optional(),
                to: address,
                data: z
                  .string()
                  .regex(/^0x[0-9a-fA-F]*$/)
                  .max(100000),
                value: z.literal("0"),
              })
              .strict(),
          )
          .max(5),
      })
      .strict(),
    assets: z
      .array(
        z
          .object({
            tokenId: token,
            sourceImage: z
              .object({
                url: z.string().url().max(4000),
                key: z.string().max(1000),
                hash,
              })
              .strict(),
            sourceJson: z
              .object({
                url: z.string().url().max(4000),
                key: z.string().max(1000),
                hash,
              })
              .strict(),
            image: z
              .object({
                key: z.string().max(1000),
                url: z.string().url().max(4000),
                hash,
              })
              .strict(),
            json: z
              .object({
                key: z.string().max(1000),
                url: z.string().url().max(4000),
                hash,
                body: repairJsonSchema,
              })
              .strict(),
            aliases: z
              .array(
                z
                  .object({
                    key: z.string().max(1000),
                    url: z.string().url().max(4000),
                    beforeHash: hash.nullable(),
                    afterHash: hash,
                    mime: z.enum(["image/jpeg", "application/json"]),
                  })
                  .strict(),
              )
              .max(2),
            publish: z.boolean(),
            uriChange: z.boolean(),
          })
          .strict(),
      )
      .max(2),
    fees: repairFeeBudgetSchema,
    effects: z.record(repairJsonSchema),
    coverage: z.record(repairJsonSchema),
  })
  .strict();
export const repairIntentSchema = z
  .object({
    kind: z.literal("identity_repair"),
    mode: z.enum(["database_only", "chain"]),
    operationId: z.string().uuid(),
    approvalFingerprint: hash,
    manifestHash: hash,
    manifest: repairExecutionManifestSchema,
  })
  .strict();
export type RepairIntent = z.infer<typeof repairIntentSchema>;
export type RepairExecutionManifest = z.infer<
  typeof repairExecutionManifestSchema
>;
export type RepairFeeBudget = z.infer<typeof repairFeeBudgetSchema>;
export const repairPrepareSchema = previewRequestSchema
  .extend({ key: z.string().uuid() })
  .strict();
export const repairApproveSchema = z
  .object({
    id: z.string().uuid(),
    manifestHash: hash,
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();
export const repairAdvanceSchema = z
  .object({
    id: z.string().uuid(),
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();
export const repairIdSchema = z.object({ id: z.string().uuid() }).strict();
export const repairKeySchema = z.object({ key: z.string().uuid() }).strict();
export type RepairPrepareInput = z.infer<typeof repairPrepareSchema>;
export type RepairApproveInput = z.infer<typeof repairApproveSchema>;
export type RepairAdvanceInput = z.infer<typeof repairAdvanceSchema>;
export interface RepairCapability {
  canPrepare: boolean;
  canApprove: boolean;
  canResume: boolean;
  singleOnly: boolean;
  diagnostic?: DiagnosticEnvelope;
}
export interface RepairExecutionView {
  id: string;
  key: string;
  state: string;
  version: number;
  mode: "database_only" | "chain";
  manifestHash: string;
  approvalFingerprint: string;
  review: {
    targets: RepairExecutionManifest["targets"];
    beforeAfter: {
      sourceMicrochip: string;
      desiredMicrochip: string;
      desiredTokenId: string;
      before: RepairJson;
      after: RepairJson;
    }[];
    effects: Record<string, RepairJson>;
    assets: {
      tokenId: string;
      imageUrl: string;
      jsonUrl: string;
      imageHash: string;
      jsonHash: string;
      publish: boolean;
      uriChange: boolean;
      aliases?: {
        key: string;
        url: string;
        beforeHash: string | null;
        afterHash: string;
      }[];
    }[];
    fees: RepairFeeBudget;
  };
  steps: {
    tokenId?: string;
    kind: string;
    state: string;
    hash: string | null;
    receipt: {
      transactionHash: string;
      blockHash: string;
      blockNumber: string;
      status: "success" | "reverted";
    } | null;
  }[];
  diagnostic?: DiagnosticEnvelope;
  canApprove: boolean;
  canResume: boolean;
  canCancel: boolean;
}
export interface RepairWriteRuntime {
  capability(): Promise<RepairCapability>;
  prepare(
    owner: string,
    input: RepairPrepareInput,
  ): Promise<RepairExecutionView>;
  getByKey(owner: string, key: string): Promise<RepairExecutionView | null>;
  view(owner: string, id: string): Promise<RepairExecutionView>;
  approve(
    owner: string,
    input: RepairApproveInput,
  ): Promise<RepairExecutionView>;
  advance(
    owner: string,
    input: RepairAdvanceInput,
  ): Promise<RepairExecutionView>;
  cancel(owner: string, id: string): Promise<RepairExecutionView>;
}
