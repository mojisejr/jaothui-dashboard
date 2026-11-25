/** Bounded public evidence: field identifiers and classifications only, never values. */
export const legacyReconstructionFields = [
  "name",
  "microchip",
  "certNo",
  "birthday",
  "sex",
  "origin",
  "color",
  "height",
  "detail",
  "dna",
  "image",
  "rarity",
  "fatherId",
  "motherId",
  "issuedOn",
] as const;
export const legacyReconstructionKinds = [
  "business_mismatch",
  "invalid_legacy_field",
  "normalization_change",
] as const;
export type LegacyReconstructionIssue = {
  field: (typeof legacyReconstructionFields)[number];
  kind: (typeof legacyReconstructionKinds)[number];
};
export type LegacyReconstruction = {
  version: 1;
  issues: LegacyReconstructionIssue[];
};
export function parseLegacyReconstruction(
  value: unknown,
): LegacyReconstruction | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const input = value as Record<string, unknown>;
  if (
    input.version !== 1 ||
    !Array.isArray(input.issues) ||
    !input.issues.length ||
    input.issues.length > 45
  )
    return;
  const issues: LegacyReconstructionIssue[] = [];
  for (const item of input.issues as unknown[]) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return;
    const issue = item as Record<string, unknown>;
    if (
      !legacyReconstructionFields.some((field) => field === issue.field) ||
      !legacyReconstructionKinds.some((kind) => kind === issue.kind)
    )
      return;
    const safe = {
      field: issue.field,
      kind: issue.kind,
    } as LegacyReconstructionIssue;
    if (
      !issues.some(
        (prior) => prior.field === safe.field && prior.kind === safe.kind,
      )
    )
      issues.push(safe);
  }
  return { version: 1, issues };
}
