import { randomUUID } from "crypto";
import { type Prisma } from "@prisma/client";
import { asJson, payloadHash, IntegrityError } from "../operations/hash";
import { type Json } from "../operations/types";
import { type DatabaseSnapshot } from "./contract";

export interface RepairDatabaseProjection {
  targets: Array<{
    sourceMicrochip: string;
    desiredMicrochip: string;
    desiredTokenId: string;
    baseline: Json;
    desiredImage?: string;
  }>;
  references: DatabaseSnapshot["references"];
  catalogDigest: string;
  closureChips: string[];
  closureTokens: string[];
}
export interface DatabaseRepairProof {
  kind: "database_repair";
  manifest: string;
  database: string;
  references: string;
  catalog: string;
  projection: string;
  targets: Array<{ microchip: string; tokenId: string }>;
}
type Tx = Prisma.TransactionClient;
export const repairJson = (value: unknown): Json =>
  asJson(
    JSON.parse(
      JSON.stringify(value, (_key, item: unknown) =>
        typeof item === "bigint" ? item.toString() : item,
      ),
    ) as unknown,
  );
const fail = (code: string): never => {
  throw new IntegrityError(code);
};
function object(value: Json): Record<string, Json> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail("REPAIR_MANIFEST_INVALID");
  return value;
}
export function validateRepairProjection(
  projection: RepairDatabaseProjection,
): void {
  if (projection.targets.length < 1 || projection.targets.length > 2)
    fail("REPAIR_EXPANDED_SCOPE_REQUIRED");
  for (const field of [
    "sourceMicrochip",
    "desiredMicrochip",
    "desiredTokenId",
  ] as const) {
    if (
      new Set(projection.targets.map((target) => target[field])).size !==
      projection.targets.length
    )
      fail("REPAIR_MANIFEST_INVALID");
  }
  if (
    projection.closureChips.length > 100 ||
    projection.closureTokens.length > 100 ||
    !/^[a-f0-9]{64}$/.test(projection.catalogDigest)
  )
    fail("REPAIR_MANIFEST_INVALID");
  for (const target of projection.targets) {
    const baseline = object(target.baseline);
    if (
      baseline.microchip !== target.sourceMicrochip ||
      typeof baseline.tokenId !== "string" ||
      !/^[1-9][0-9]*$/.test(baseline.tokenId) ||
      !/^[1-9][0-9]*$/.test(target.desiredTokenId) ||
      !/^[0-9]{15}$/.test(target.desiredMicrochip) ||
      !target.sourceMicrochip ||
      target.sourceMicrochip.length > 128 ||
      !projection.closureChips.includes(target.sourceMicrochip) ||
      !projection.closureChips.includes(target.desiredMicrochip) ||
      !projection.closureTokens.includes(baseline.tokenId) ||
      !projection.closureTokens.includes(target.desiredTokenId)
    )
      fail("REPAIR_MANIFEST_INVALID");
  }
}
export function projectedRepairRow(
  target: RepairDatabaseProjection["targets"][number],
): Record<string, Json> {
  return {
    ...object(target.baseline),
    microchip: target.desiredMicrochip,
    tokenId: target.desiredTokenId,
    ...(target.desiredImage === undefined
      ? {}
      : { image: target.desiredImage }),
  };
}
/** The same canonical snapshot representation used by read-only diagnosis. SQL only. */
export async function readRepairDatabaseSnapshot(
  tx: Tx,
): Promise<DatabaseSnapshot> {
  const rows = await tx.pedigree.findMany({ orderBy: { microchip: "asc" } });
  const rewards = await tx.reward.findMany({ orderBy: { id: "asc" } });
  const certificates = await tx.certificate.findMany({
    include: { approvers: { select: { wallet: true } } },
    orderBy: { microchip: "asc" },
  });
  const inventory = await tx.microchip.findMany({
    include: { MicrochipOrder: true },
    orderBy: { microchip: "asc" },
  });
  const reservations = await tx.$queryRaw<
    { key: string; operationId: string }[]
  >`SELECT key, operation_id::text AS "operationId" FROM buffalo_integrity.reservation ORDER BY key`;
  const catalog = await tx.$queryRaw<
    Record<string, unknown>[]
  >`SELECT c.conname, c.conrelid::regclass::text AS relation, c.confrelid::regclass::text AS target, c.condeferrable, pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.conrelid IN ('public."Pedigree"'::regclass,'public."Reward"'::regclass,'public."Certificate"'::regclass,'public."Microchip"'::regclass,'public."MicrochipOrder"'::regclass,'public."_CertificateToCertificateApprover"'::regclass) ORDER BY c.conname`;
  const references: DatabaseSnapshot["references"] = [
    ...rewards.map((row) => ({
      kind: "Reward",
      key: row.id,
      chips: [row.microchip],
      digest: payloadHash(repairJson(row)),
    })),
    ...certificates.map((row) => ({
      kind: "Certificate",
      key: row.microchip,
      chips: [
        row.microchip,
        row.dadId,
        row.momId,
        row.fGranDadId,
        row.fGrandMomId,
        row.mGrandDadId,
        row.mGrandMomId,
      ].filter((chip): chip is string => !!chip),
      digest: payloadHash(repairJson(row)),
    })),
    ...inventory.map((row) => ({
      kind: "Microchip",
      key: String(row.id),
      chips: [row.microchip],
      digest: payloadHash(repairJson(row)),
    })),
    ...rows
      .filter((row) => !!row.fatherId || !!row.motherId)
      .map((row) => ({
        kind: "PedigreeGenealogy",
        key: row.microchip,
        chips: [row.fatherId, row.motherId].filter(
          (chip): chip is string => !!chip,
        ),
        digest: payloadHash(repairJson(row)),
      })),
  ];
  return {
    readAt: new Date().toISOString(),
    rows: rows.map((row) => ({
      microchip: row.microchip,
      tokenId: row.tokenId.toString(),
      baseline: repairJson(row),
    })),
    references,
    reservations,
    catalogDigest: payloadHash(repairJson(catalog)),
  };
}
const orderedReferences = (references: DatabaseSnapshot["references"]) =>
  [...references].sort((a, b) =>
    `${a.kind}:${a.key}`.localeCompare(`${b.kind}:${b.key}`),
  );
function scopedReferences(
  snapshot: DatabaseSnapshot,
  projection: RepairDatabaseProjection,
) {
  return orderedReferences(
    snapshot.references.filter((ref) =>
      ref.chips.some((chip) => projection.closureChips.includes(chip)),
    ),
  );
}
/** Acquire in a fixed order. These short transaction locks also stop non-ledger SQL writers from introducing identity/reference phantoms. */
export async function lockRepairProjection(tx: Tx): Promise<void> {
  await tx.$executeRaw`LOCK TABLE public."Certificate", public."CertificateApprover", public."Microchip", public."MicrochipOrder", public."Pedigree", public."Reward", public."_CertificateToCertificateApprover" IN SHARE ROW EXCLUSIVE MODE`;
  // An unmodelled incoming FK must not be silently cascaded, even when the known catalog digest is unchanged.
  const foreign = await tx.$queryRaw<
    { conname: string }[]
  >`SELECT conname FROM pg_constraint WHERE contype='f' AND confrelid='public."Pedigree"'::regclass AND (conrelid<>'public."Reward"'::regclass OR pg_get_constraintdef(oid)<>'FOREIGN KEY (microchip) REFERENCES "Pedigree"(microchip) ON UPDATE CASCADE ON DELETE RESTRICT')`;
  if (foreign.length) fail("REPAIR_REFERENCE_OWNERSHIP_REQUIRED");
}
/** Called only inside the repository's fenced SQL transaction, never with RPC/storage callbacks. */
export async function applyRepairDatabaseProjection(
  tx: Tx,
  projection: RepairDatabaseProjection,
  manifest: string,
  previous?: DatabaseRepairProof,
): Promise<DatabaseRepairProof> {
  validateRepairProjection(projection);
  await lockRepairProjection(tx);
  const before = await readRepairDatabaseSnapshot(tx);
  if (before.catalogDigest !== projection.catalogDigest)
    fail("REPAIR_BASELINE_CHANGED");
  const sourceChips = projection.targets.map((t) => t.sourceMicrochip);
  const desiredChips = projection.targets.map((t) => t.desiredMicrochip);
  const desiredTokens = projection.targets.map((t) => t.desiredTokenId);
  const selected = before.rows.filter(
    (row) =>
      projection.closureChips.includes(row.microchip) ||
      projection.closureTokens.includes(row.tokenId),
  );
  if (
    selected.some(
      (row) => !(previous ? desiredChips : sourceChips).includes(row.microchip),
    )
  )
    fail("REPAIR_EXPANDED_SCOPE_REQUIRED");
  if (previous) {
    const rows = projection.targets.map(
      (target) =>
        before.rows.find((row) => row.microchip === target.desiredMicrochip)
          ?.baseline ?? null,
    );
    if (
      previous.kind !== "database_repair" ||
      previous.manifest !== manifest ||
      previous.projection !== payloadHash(projection) ||
      previous.catalog !== before.catalogDigest ||
      payloadHash(rows) !== previous.database ||
      payloadHash(scopedReferences(before, projection)) !==
        previous.references ||
      rows.some(
        (row, i) =>
          payloadHash(row) !==
          payloadHash(projectedRepairRow(projection.targets[i]!)),
      )
    )
      fail("REPAIR_BASELINE_CHANGED");
    return previous;
  }
  for (const target of projection.targets) {
    const current = before.rows.find(
      (row) => row.microchip === target.sourceMicrochip,
    );
    if (
      !current ||
      payloadHash(current.baseline) !== payloadHash(target.baseline)
    )
      fail("REPAIR_BASELINE_CHANGED");
    if (
      before.rows.some(
        (row) =>
          !sourceChips.includes(row.microchip) &&
          (row.microchip === target.desiredMicrochip ||
            row.tokenId === target.desiredTokenId),
      )
    )
      fail("REPAIR_IDENTITY_COLLISION");
  }
  const references = scopedReferences(before, projection);
  if (
    payloadHash(references) !==
    payloadHash(orderedReferences(projection.references))
  )
    fail("REPAIR_BASELINE_CHANGED");
  if (
    projection.targets.some((t) => t.sourceMicrochip !== t.desiredMicrochip) &&
    references.some((ref) => ref.kind !== "Reward")
  )
    fail("REPAIR_REFERENCE_OWNERSHIP_REQUIRED");
  const rewardsBefore = await tx.reward.findMany({ orderBy: { id: "asc" } });
  // Update exactly the reviewed fields; timestamps, business data and unrelated references remain byte-for-byte unchanged.
  // Immediate PK uniqueness prevents direct A<->B swaps. Internal temporary keys
  // exist only inside this locked transaction and never enter manifest, assets or events.
  const workingKeys = new Map<string, string>();
  const needsKeyStaging = projection.targets.some(
    (target) =>
      target.sourceMicrochip !== target.desiredMicrochip &&
      sourceChips.includes(target.desiredMicrochip),
  );
  for (const target of projection.targets.filter(
    (target) =>
      needsKeyStaging && target.sourceMicrochip !== target.desiredMicrochip,
  )) {
    const temporary = `__repair_${randomUUID()}`;
    if (
      before.rows.some((row) => row.microchip === temporary) ||
      projection.closureChips.includes(temporary)
    )
      fail("REPAIR_IDENTITY_COLLISION");
    await tx.pedigree.update({
      where: { microchip: target.sourceMicrochip },
      data: { microchip: temporary },
    });
    workingKeys.set(target.sourceMicrochip, temporary);
  }
  for (const target of projection.targets) {
    await tx.pedigree.update({
      where: {
        microchip:
          workingKeys.get(target.sourceMicrochip) ?? target.sourceMicrochip,
      },
      data: {
        microchip: target.desiredMicrochip,
        tokenId: BigInt(target.desiredTokenId),
        ...(target.desiredImage === undefined
          ? {}
          : { image: target.desiredImage }),
      },
    });
  }
  const after = await readRepairDatabaseSnapshot(tx);
  const rewardsAfter = await tx.reward.findMany({ orderBy: { id: "asc" } });
  const expectedRewards = rewardsBefore.map((reward) => ({
    ...reward,
    microchip:
      projection.targets.find(
        (target) => target.sourceMicrochip === reward.microchip,
      )?.desiredMicrochip ?? reward.microchip,
  }));
  if (
    payloadHash(repairJson(rewardsAfter)) !==
      payloadHash(repairJson(expectedRewards)) ||
    payloadHash(
      before.rows.filter((row) => !sourceChips.includes(row.microchip)),
    ) !==
      payloadHash(
        after.rows.filter((row) => !desiredChips.includes(row.microchip)),
      )
  )
    fail("REPAIR_DATABASE_PROOF_MISMATCH");
  const afterRows = projection.targets.map(
    (target) =>
      after.rows.find((row) => row.microchip === target.desiredMicrochip)
        ?.baseline ?? null,
  );
  if (
    afterRows.some(
      (row, i) =>
        payloadHash(row) !==
        payloadHash(projectedRepairRow(projection.targets[i]!)),
    ) ||
    after.rows.filter((row) => desiredTokens.includes(row.tokenId)).length !==
      projection.targets.length
  )
    fail("REPAIR_DATABASE_PROOF_MISMATCH");
  // FK cascade is accepted only for the exact reviewed Reward IDs; no other reference may appear/disappear.
  const afterRefs = scopedReferences(after, projection);
  if (
    payloadHash(references.map((ref) => [ref.kind, ref.key])) !==
    payloadHash(afterRefs.map((ref) => [ref.kind, ref.key]))
  )
    fail("REPAIR_DATABASE_PROOF_MISMATCH");
  return {
    kind: "database_repair",
    manifest,
    database: payloadHash(afterRows),
    references: payloadHash(afterRefs),
    catalog: after.catalogDigest,
    projection: payloadHash(projection),
    targets: projection.targets.map((target) => ({
      microchip: target.desiredMicrochip,
      tokenId: target.desiredTokenId,
    })),
  };
}
