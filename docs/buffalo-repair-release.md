# Buffalo repair — R2 release review

Mission #jaothui-buffalo-error-visibility. R2 builds on R1 PR64 and adds protected diagnosis plus dedicated identity repair. This document does not authorize deployment or an actual repair.

## Operator flow

1. Read the complete signed inventory and enter the exact source registration, desired 15-digit chip/NFT and physical-scan or registration-document evidence. A historical typo must be confirmed explicitly. The system does not assume the database or blockchain is correct.
2. Review database and chain changes separately. A third cow, ambiguous references, stale evidence or an unsupported contract/catalog blocks the proposal.
3. Prepare one durable operation. Review its exact targets, immutable files, side effects and maximum fee before approving once. The operation UUID survives reload; uncertain responses must reconcile that same UUID.
4. Resume unfinished steps on that operation. A confirmed chain batch can precede DNA, assets and database publication. Completion requires verified final evidence; partial work is not success. Never start another operation to bypass an unknown result.

DB-only repair has no chain transaction. Pair repair, when enabled and verified, uses one operation/reservation scope and one chain metadata batch for the changed targets. Database pair changes commit in one SQL transaction. Reward references follow their source cow. Other reference domains require explicit supported ownership rules; ambiguous references remain blocked.

## Activation and recovery

Diagnosis defaults off (`BUFFALO_REPAIR_DIAGNOSIS_ENABLED`). New repair preparation/approval requires `BUFFALO_REPAIR_MODE=enabled`, existing integrity write activation, and `BUFFALO_REPAIR_EXTERNAL_ADMIN_COORDINATION=confirmed`. Pair preparation/approval additionally requires `BUFFALO_REPAIR_PAIR_ENABLED=true`; keep it off until the pair release is approved. Approved in-flight pair recovery retains its stored scope when this new-operation flag is closed. This is a process attestation that other administrators are coordinated, not a global blockchain lock. The shared dashboard login does not identify individual operators; designate the pilot operator separately.

The review receipt secret must remain stable while approved operations require recovery. Keep read/status access and journal/assets/history during a compatible rollback. Use drain controls for approved in-flight recovery; do not restore legacy writers or send inverse chain transactions automatically. A changed baseline requires review.

No new schema migration is required for the JSONB repair intent. The existing integrity ledger must already be installed from its owning jaothui-frontend migration lineage. Do not run schema push or create an independent baseline.

## Release evidence and final human gate

Local evidence is recorded separately for deterministic tests, actual isolated PostgreSQL/fork tests, and browser tests with synthetic APIs. Browser screenshots do not establish actual signing, storage publication or mainnet correctness. Conditional infrastructure tests count only when actually executed against their isolated environment.

Before release, attach the exact revision, passed build/lint/types/tests, relevant fault evidence and responsive browser artifacts. Obtain approval for that concrete release/environment. A designated operator must then approve the exact real-cow before/after mapping and evidence for each actual case. Production acceptance requires readback of all affected surfaces and ordinary edit access after repair. The original reported incident remains unverified until its genuine case is checked.

## Isolated application evidence — 2026-10-28

- Single workflow: actual deployed contracts on a local fork, isolated PostgreSQL and HTTP storage; three steps, lost broadcast/restart, asset/database failures and external-root drift; PASS (24.8 seconds across multiple bounded requests).
- Pair workflow: one batch, two DNA restorations and two URI steps; second-DNA outage/restart, same journal without repeated batch, lost broadcast and asset/database outages; ordinary edit subsequently completed on both cows; PASS (46.4 seconds across multiple requests using the default 25-second request budget).
- Database projection/ledger: 25 focused tests including 20 actual PostgreSQL checks, pair PK swap/binding, Reward ownership, full rollback, lost commit response and outside collision; PASS.
- Browser: prepared single/pair review, exact alias paths, unknown-result reload, one approval per operation, NFT-specific partial DNA state, completed state and read availability with writes off. Relevant layout captures at 390/768/1440 have no page overflow. Evidence manifests: phase4-browser-manifest.json and phase5-browser-manifest.json under the mission browser evidence directory. UI uses synthetic APIs; actual contract proof is separate.

Infrastructure logs are retained in the task checkout under `.tmp/repair-feasibility/p4-workflow-proof-3.log` and `p5-workflow-proof.log`; database logs `.tmp/phase5-db-tests.log`. The first single runs exposed a receipt address-normalization mismatch and reuse of a reverted fork with an old journal; the passing run uses a fresh isolated database, preserving earlier journals. These are local acceptance results, not production case acceptance.

## Preparing after a platform timeout

The tRPC API has an explicit 60-second duration for bounded preparation/recovery requests. Production preparation previously hit the platform's 15-second timeout before creating an operation. A missing response remains unknown until the saved key is read.

If the key still has no saved manifest, the operator can complete a fresh scan/preview and choose **ตรวจสถานะเดิมแล้วเตรียมจากหลักฐานชุดนี้**. This reads the same key again before preparation, preserves its UUID, and never approves automatically. Any operation found is restored for review instead. A racing original request cannot replace an existing manifest: the database's atomic idempotency fence rejects a different payload for that key. Ordinary retry still preserves the original request; no recovery data is cleared to start another operation.

## Legacy extensionless database image references

The historical database value `buffalo/<tokenId>` may omit `.jpg`. Diagnosis can resolve this exact same-project, same-token database reference to `buffalo/<tokenId>.jpg` only when the database token binding agrees with the repair target. A present original object must match the verified NFT image hash; an absent original must be confirmed by HTTP404 or Supabase's bounded `NoSuchKey` response. HTTP403/500 and different image bytes remain blockers. The canonical JPEG is independently read and hash-checked. Original reference/evidence is retained in the manifest, and the expected database image normalization is displayed before approval. Storage writers and arbitrary URL/path ownership rules are unchanged; no legacy object is overwritten.
