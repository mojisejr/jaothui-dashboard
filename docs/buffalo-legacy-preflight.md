# Legacy image reconstruction preflight

An image-only edit can rebuild old NFT JSON when metadata is a recognized legacy
IPFS reference and either the NFT image is also recognized IPFS, or the NFT image
exactly matches both the native image and the configured same-token
`buffalo/<token>.jpg` storage alias. Arbitrary HTTP, wrong-token aliases and
malformed image URLs are not accepted. The reconstruction guard
compares registry business data with native metadata and validates the preserved
native values. A disagreement is not permission to choose either value silently.

## Operator diagnostics

`LEGACY_METADATA_RECONSTRUCTION_CONFLICT` retains its existing code. Optional
versioned evidence contains only allowlisted field names and one of:

- `business_mismatch`: registry and native values disagree.
- `invalid_legacy_field`: a preserved value cannot be represented by the schema.
- `normalization_change`: serialization would change an existing literal.

The prepare event persists this evidence. Status polling and reload rehydrate it,
and the visible feedback and copied support report include the Thai field/cause.
Old events without evidence keep generic feedback. Arbitrary provider messages,
raw values and URLs do not enter this evidence contract. A blocked reconstruction
does not create the prepared image or sign/broadcast transactions; the source
upload and diagnostic journal may already exist.

## Offline cohort audit

Capture registry rows and `getMetadata`/`tokenIdToUri` reads at a fixed confirmed
block, retaining the block hash and checking it again after capture. Keep raw
captures in access-controlled operational evidence, outside source control.
Run from the repository root:

```sh
bun scripts/buffalo-legacy-preflight.ts /absolute/path/inventory-complete.json
```

To classify the mixed-origin case, explicitly supply the storage base reviewed
against the target runtime configuration; never derive trust from snapshot URLs:

```sh
bun scripts/buffalo-legacy-preflight.ts /absolute/path/inventory-complete.json \
  --trusted-storage-base https://reviewed-project.supabase.co/storage/v1/object/public/slipstorage/
```

The CLI reads a JSON file only. It has no database, RPC, signer or storage writer.
The input contract is documented in the script. It refuses a declared row count
that differs from the captured entries. Missing reads, malformed records,
duplicate token bindings and microchip mismatches are counted separately.

`eligible_reconstruction` means only that this reconstruction classifier passed.
`not_legacy` means this path does not apply, including unsupported mixed URI types. Neither
proves complete edit readiness: permissions, `exists`, `initialized`, reverse
microchip mapping, revisions, uploads, signing and publication need separate
checks. Count rows and distinct tokens separately, and never sum per-field issue
counts as though they were distinct animals.

## Data correction and recovery

1. Confirm the authoritative business value; do not infer Royal status from a name.
2. Re-read the latest operation, registry revision and native metadata.
3. If correction changes the immutable draft revision, cancel only an unsigned
   draft through the normal engine. Preserve its audit trail and source image.
4. Apply the approved correction with revision/value guards; create a linked
   replacement edit. Never rewrite the original operation intent.
5. Complete the normal engine sequence, including DNA restoration when required.
6. Verify receipts, registry/native fields, immutable image/JSON and public aliases.
   Contract bookkeeping timestamps may change; business literals must be preserved.

## Verification

Run the focused classifier, workflow, diagnostic boundary and feedback tests, then
`npm test -- --runInBand`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`.
Jest excludes retained `.tmp` worktrees so source totals do not include archives.

The opt-in `legacy-reconstruction.infra.test.ts` uses a separately prepared
PostgreSQL 14 database `integrity_legacy102`, task-owned Anvil fork, synthetic
signer and local asset origin. All endpoints must be loopback. It must never run
against production. Set `BUFFALO_LEGACY_FIXTURE_DIR` to that fixture directory and
run the exact test path. Report its actual result separately from default-suite
skips. Browser inspection verifies rendered cause/copy/reload behavior and is a
separate gate from service tests.
