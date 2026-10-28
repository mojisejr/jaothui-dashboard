import { type AssetEvidence } from "./assets";
import { z } from "zod";
import { type Json } from "~/server/services/buffalo-integrity/operations/types";
const chip = z.string().regex(/^[0-9]{15}$/);
const legacyKey = z.string().min(1).max(128); // Exact historical DB/chain key; never trim or normalize.
const token = z
  .string()
  .regex(/^[1-9][0-9]*$/)
  .max(78);
export const repairProposalSchema = z
  .object({
    targets: z
      .array(
        z
          .object({
            sourceMicrochip: legacyKey,
            desiredMicrochip: chip,
            desiredTokenId: token,
            confirmedPreviousCanonicalMicrochip: z.string().max(128).optional(),
            evidence: z
              .array(
                z
                  .object({
                    kind: z.enum([
                      "physical_scan",
                      "registration_document",
                      "operator_attestation",
                    ]),
                    reference: z.string().trim().min(1).max(300),
                  })
                  .strict(),
              )
              .max(8),
          })
          .strict(),
      )
      .min(1)
      .max(2),
    knownAliases: z.array(legacyKey).max(20).default([]),
  })
  .strict();
export type RepairProposal = z.infer<typeof repairProposalSchema>;
export interface Pin {
  version: 1;
  scanId: string;
  chainId: number;
  nft: string;
  manager: string;
  blockNumber: string;
  blockHash: string;
  nftCodeHash: string;
  managerCodeHash: string;
  totalSupply: number;
  scanCount: number;
  nextTokenId: string;
  nftStorageHash: string;
  managerStorageHash: string;
  pageSize: number;
  createdAt: number;
  expiresAt: number;
}
export interface CanonicalEntry {
  tokenId: string;
  initialized: boolean;
  microchip: string | null;
  parentReferences?: string[];
}
export interface ScanPage {
  scanId: string;
  offset: number;
  entries: CanonicalEntry[];
}
export interface DatabaseRow {
  microchip: string;
  tokenId: string;
  baseline: Json;
}
export interface DatabaseSnapshot {
  readAt: string;
  rows: DatabaseRow[];
  references: { kind: string; key: string; chips: string[]; digest: string }[];
  reservations: { key: string; operationId: string }[];
  catalogDigest: string;
}
export interface TokenBaseline {
  tokenId: string;
  microchip: string;
  dna: string;
  metadata: Json;
  owner: string;
  tokenUri: string;
  approvals: Json;
  native: { createdAt: string; updatedAt: string };
}
export interface DiagnosisPorts {
  assets(
    this: void,
    tokens: TokenBaseline[],
    rows: DatabaseRow[],
    proposal: RepairProposal,
  ): Promise<AssetEvidence>;
  pin(
    this: void,
  ): Promise<
    Omit<Pin, "version" | "scanId" | "pageSize" | "createdAt" | "expiresAt">
  >;
  assertCurrent(this: void, pin: Pin): Promise<void>;
  enumerate(pin: Pin, offset: number, count: number): Promise<CanonicalEntry[]>;
  database(this: void): Promise<DatabaseSnapshot>;
  tokens(this: void, pin: Pin, ids: string[]): Promise<TokenBaseline[]>;
  aliases(
    this: void,
    pin: Pin,
    chips: string[],
  ): Promise<{ microchip: string; tokenId: string }[]>;
}
export const scanRequestSchema = z
  .object({
    scan: z.string().max(6000),
    offset: z.number().int().nonnegative(),
  })
  .strict();
export const previewRequestSchema = z
  .object({
    scan: z.string().max(6000),
    pages: z.array(z.string().max(30000)).max(500),
    proposal: repairProposalSchema,
  })
  .strict();
