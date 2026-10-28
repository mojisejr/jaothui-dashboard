import { type DiagnosticEnvelope } from "~/lib/buffalo-diagnostics";
import { DiagnosticError } from "~/server/diagnostics/errors";
import { reportDiagnostic } from "~/server/diagnostics/reporter";
import { type Pedigree } from "@prisma/client";
import { type IMetadata } from "~/interfaces/i-metadata";
import { dateToCalendar } from "./calendar";
import {
  businessDifferences,
  chainSnapshot,
  databaseSnapshot,
  type FieldDifference,
} from "./field-policy";
import {
  identityConflict,
  sameDomain,
  type ChainDomain,
  type ChainIdentity,
} from "./identity";

export interface SyncAssessment {
  status: "unavailable" | "identity_conflict" | "differences" | "matched";
  reason?: string;
  diagnostic?: DiagnosticEnvelope;
  scope: "database-manager-business-fields";
  imageVerification: "unchecked";
  publicationVerification: "unchecked";
  differences: FieldDifference[];
}
export type BuffaloMetadataRead = IMetadata & { sync: SyncAssessment };

export function databaseMetadata(record: Pedigree): IMetadata {
  const tokenId = Number(record.tokenId);
  if (!Number.isSafeInteger(tokenId) || tokenId <= 0)
    throw new Error("UNREPRESENTABLE_TOKEN_ID");
  return {
    tokenId,
    name: record.name,
    origin: record.origin ?? "N/A",
    color: record.color,
    image: record.image ?? undefined,
    detail: record.detail,
    sex: record.sex,
    birthdate: record.birthday.getTime(),
    birthday: dateToCalendar(record.birthday).replaceAll("-", "/"),
    height: String(record.height ?? 0),
    microchip: record.microchip,
    certNo: record.certNo ?? "N/A",
    dna: record.dna,
    rarity: record.rarity,
    fatherId: record.fatherId ?? "N/A",
    motherId: record.motherId ?? "N/A",
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export interface MetadataReadPorts {
  findCow: (chip: string) => Promise<Pedigree | null>;
  readChain: (record: Pedigree) => Promise<ChainIdentity>;
  imageForCow?: (record: Pedigree) => string;
}

/** Chain enrichment never supplies displayed fields and never blocks a valid DB record on error. */
export async function readBuffaloMetadata(
  chip: string,
  domain: ChainDomain,
  ports: MetadataReadPorts,
): Promise<BuffaloMetadataRead | null> {
  let record: Pedigree | null;
  try {
    record = await ports.findCow(chip);
  } catch (cause) {
    throw new DiagnosticError("DATABASE_READ_FAILED", { cause });
  }
  if (!record) return null;
  const dto = databaseMetadata(record);
  if (ports.imageForCow) dto.image = ports.imageForCow(record);
  const scope = {
    scope: "database-manager-business-fields" as const,
    imageVerification: "unchecked" as const,
    publicationVerification: "unchecked" as const,
  };
  try {
    // A slow RPC must not turn database-first display into an indefinite spinner.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const chain = await Promise.race([
      ports.readChain(record),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("CHAIN_READ_TIMEOUT")), 4000);
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });
    const conflict = !sameDomain(domain, chain.domain)
      ? "CHAIN_DOMAIN_CONFLICT"
      : identityConflict(record, chain);
    if (conflict)
      return {
        ...dto,
        sync: {
          ...scope,
          status: "identity_conflict",
          reason: conflict,
          diagnostic: reportDiagnostic(new DiagnosticError(conflict)),
          differences: [],
        },
      };
    const differences = businessDifferences(
      databaseSnapshot(record),
      chainSnapshot(chain.metadata),
    );
    return {
      ...dto,
      sync: {
        ...scope,
        status: differences.length ? "differences" : "matched",
        differences,
      },
    };
  } catch (cause) {
    const diagnostic = reportDiagnostic(
      new DiagnosticError("CHAIN_CHECK_UNAVAILABLE", { cause }),
    );
    return {
      ...dto,
      sync: {
        ...scope,
        status: "unavailable",
        reason: "CHAIN_CHECK_UNAVAILABLE",
        diagnostic,
        differences: [],
      },
    };
  }
}
