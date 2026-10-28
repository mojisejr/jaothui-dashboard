# Buffalo error recovery — R1 release review

Prepared 2026-10-28 17:44 +0700 for #jaothui-buffalo-error-visibility. R1 contains Phase1–2 only. Identity diagnosis/repair routes, pages and execution are excluded. This document is a release checklist, not approval to deploy or modify production data.

## Intended behavior

- Create, edit and DNA failures show a safe Thai reason, stage, known outcome, next action and genuine server request/operation references. Browser/network failures explicitly say when no server reference was received. References are copyable; provider messages, secrets, SQL and signed bytes are not exposed.
- Missing records differ from failed reads. Detail, operation inventory and operation status failures retry their own query. Cached details remain labeled stale; blocked editing has a visible reason. Read-only DB details do not require the signing/storage write credentials. Existing identity, permission and write-mode guards remain enforced.
- JPEG/PNG uploads must be nonempty and strictly smaller than 2,000,000 bytes. Client preflight and server decoding checks agree. Failed uploads retain form/operation context. Unknown transaction outcomes recover the existing operation; they never authorize another mint.
- Reward success requires the actual saved record. Each intentional reward uses a stable UUID and immutable content-hash asset path. Pending payload/path survives reload; uncertain retries first reconcile that UUID. An existing object is trusted only after matching its content hash. A verified save followed by refresh failure remains labeled saved, with a read-only retry. Date remains optional; nonempty invalid dates are rejected.
- The existing `Reward.id` is a String primary key. Supplying a UUID uses that existing uniqueness constraint; R1 requires no schema migration. Existing records/IDs remain valid. Repeating a UUID with a different normalized payload is rejected; concurrent equal requests read back the same saved record. Old clients without an ID must refresh rather than silently falling back to non-idempotent writes.

## Verification record and limits

Run from the isolated Site checkout, using approved local test configuration:

```sh
npm run build
npm run lint
npx tsc --noEmit
npm test -- --runInBand
git diff --check
```

Targeted suites include diagnostic transport/actual Next parser boundaries, read/write configuration separation, image preflight, reward idempotency/concurrency, and create/edit/reward component recovery. Infrastructure suites that skip without an isolated environment do not count as verified. Record exact commit, commands, counts and exit codes in the release evidence; do not promote an all-source run containing later phases to an R1-only claim.

Root-owned browser checks used actual Next pages behind the deny-by-default synthetic proxy at `http://127.0.0.1:3186`, with real UI and synthetic APIs only. Cases covered not-found versus DB failure; write-unavailable and identity-conflicting readable records; distinct list/view retry counters; create form preservation after raw upload failure; DNA exact 2 MB rejection and upload failure; reward lost response, reload/reconciliation, second intentional UUID, and saved-plus-refresh-failed recovery. List failure layout was captured at 390, 768 and 1440 CSS pixels; other named flow captures are at 390. Do not claim every flow was exercised at all three widths.

Browser evidence directory: `/Users/non/dev/opilot/.playwright-mcp/jaothui-dashboard/buffalo-recovery-v2/`. Examples: `phase2-list-error-{390,768,1440}.jpg`, `phase2-create-upload-error-390.jpg`, `phase2-dna-size-390.jpg`, `phase2-dna-upload-error-390.jpg`, `phase2-reward-unknown-390.jpg`, `phase2-reward-reconciled-390.jpg`, and `phase2-reward-reconcile-counters.json`. Reward counters prove one synthetic upload/one add/one row for the lost-response recovery. Completed refresh warning deduplication and confirmed-save caption received a subsequent component regression check; earlier screenshots may retain the pre-dedup presentation.

These establish local UI behavior, not actual storage/blockchain writes, mainnet correctness, hosted availability, per-user authorization or incident closure. The original reported cow/case has not been independently confirmed fixed. Keep `INCIDENT_ROOT_CAUSE_PENDING` until its genuine case evidence exists.

## Staged release and operator acceptance

1. Review the R1-only diff and exact gate evidence. Confirm the repair router/page/service is absent from this release and no migration or secret is included. Obtain release approval for this concrete revision/environment.
2. Deploy the approved revision with existing configuration and feature gates. Confirm read-only lookup still works when write credentials are unavailable; verify configured write mode/permissions separately. Do not enable a writer merely to make a smoke test pass.
3. Hosted read smoke: authenticate, load an existing cow and active operation inventory/status, check known missing microchip behavior, and confirm safe diagnostics correlate with production events. Do not create synthetic rewards or mint test NFTs in production.
4. A designated operator performs a genuine needed create/edit/DNA/reward case for each changed flow being accepted. Capture exact revision, cow/chip and operation/reward IDs, requested field, before/after read-back and actual receipt/storage evidence as applicable. Verify untouched data, truthful completion and recovery on the same operation. Shared login is not technical per-user access control.
5. Mark `PRODUCTION_EXISTING_FLOWS_VERIFIED` only for flows with actual hosted/operator evidence. Mark the incident resolved only when its specific case is reproduced, corrected and read back. Otherwise retain pending labels and release limitations.

## Compatible rollback

Preserve journals, operation IDs, reward UUIDs, assets and history. Prefer a compatible source revision plus existing new-write pause/drain controls, keeping read/recovery access for already-started operations. Inspect and reconcile pending chain/reward outcomes before restarting writes. Never restore legacy anonymous writers, remove integrity guards, delete ambiguous assets/records, invent a fresh request key to bypass uncertainty, or automatically send inverse blockchain transactions. R1 is additive and requires no destructive schema rollback.
