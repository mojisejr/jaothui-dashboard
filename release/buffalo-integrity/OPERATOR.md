# Buffalo write integrity: operator release and recovery

Release amendment (20 October 2026): the owner approved a controlled production rollout with hosted risks accepted. Follow [CONTROLLED-PRODUCTION.md](CONTROLLED-PRODUCTION.md) for the authorized sequence and human canary boundary; it supersedes the separate hosted staging prerequisite below.

Historical local qualification status: local-first candidate only. Hosted Supabase staging, gateway/CDN behavior, Vercel deployment and production configuration remain unqualified until separately rehearsed. This document does not authorize production schema, policy, mainnet, deployment or merge changes. The default runtime is off.

## Required server configuration

Use `BUFFALO_INTEGRITY_MODE=off|drain|enabled`. Off rejects all integrity runtime requests. Drain rejects new create/edit intents and draft revisions, and pauses unsigned work; already signed operations can reconcile and finish the same authorized intent. Isolated fixtures default enabled only when their explicit configuration path exists; an explicit off/drain always wins.

Production requires `NODE_ENV=production`, `VERCEL_ENV` absent or `production`, a reviewed `BUFFALO_INTEGRITY_RELEASE_ID`, `BUFFALO_INTEGRITY_SERVER_CONFIG`, `BUFFALO_INTEGRITY_SIGNER_KEY`, `BUFFALO_INTEGRITY_STORAGE_JWT`, `DATABASE_URL`, and existing `NEXT_PUBLIC_supabase_url`/`NEXT_PUBLIC_supabase_key`. Preview/development cannot load the production signer. The legacy `minter` is never used by this runtime. Never expose signer/storage-writer credentials as `NEXT_PUBLIC_*`, client props, build logs or evidence.

`BUFFALO_INTEGRITY_SERVER_CONFIG` is JSON containing `kind: production`, `releaseId`, `rpcUrl` (HTTPS), `sender`, `receiver`, `domain` with chain96 and existing NFT/manager addresses, lowercase-address `codeHashes`, canonical `checkpoint: {number,hash}`, `storageUrl` (HTTPS), `storageBucket: slipstorage`, `confirmations` (3–64), and `maxFeeWei` (positive integer, maximum50000000000000000). Inject signer, writer JWT and database URL separately; do not place them in the JSON. Signer address must match sender; pin reviewed deployed bytecode and checkpoint. Storage URL must exactly match the public frontend's reviewed Supabase base URL. The public API key and private Bearer writer JWT have separate purposes; never send the writer token as an API key.

For a production-build local rehearsal only, `BUFFALO_INTEGRITY_ISOLATED_CONFIG` must resolve below the task `.tmp` directory, all DB/RPC/storage targets must be loopback, and `BUFFALO_INTEGRITY_REHEARSAL_ID` must match its releaseId. This lane rejects Vercel environments and pins the Anvil instance. It is not a mainnet activation shortcut. Private projection/pause faults are fixture-only; no public fault routes exist.

## Storage identity and policy

The dedicated `buffalo_integrity_writer` is NOLOGIN, NOINHERIT, NOBYPASSRLS. It must not inherit anon/authenticated/service_role. Grant only the schema/table capabilities in cutover.sql and role switching to the required authenticator/storage server roles. Follow the official [custom roles guide](https://supabase.com/docs/guides/storage/schema/custom-roles), omitting its optional anon inheritance. A project owner must issue a JWT with this exact role and finite future numeric `exp`, signed by the project's authorized JWT authority; this repository never derives a project secret or issues a production token. Record issuance/expiry/renewal privately and alert before expiry. Use short finite expiry and renew before expiry. A stateless custom-role JWT may remain valid until expiry after replacement; individual revocation must be separately supported and qualified by the hosted issuer. Emergency rollback disables the scoped writer role/policy for all its tokens while preserving public reads. Do not rotate the project-wide JWT authority solely to renew this writer. Never put tokens in chat or PRs.

The restrictive policies protect `operations/`, `json/` and `buffalo/` in slipstorage and test, including updates/moves from and into protected names. The writer may create immutable operation assets and update only deterministic JSON/image aliases in slipstorage. It cannot write cards/test/avatar/reward/dna/slips. Public reads stay available; existing unrelated uploader privileges remain. Event images use a separate Supabase project and are outside this cutover. DataAPI writes on Pedigree/Reward/Microchip are denied to anon/authenticated; public SELECT remains; authenticated server Prisma paths (including reward creation) remain functional. Private ledger is never exposed through PostgREST.

## Ordered release rehearsal / future activation

1. Capture readonly live schema, all eight legacy Storage policies, effective table/column/PUBLIC grants, role memberships, bucket settings and current public consumers. Run preflight.sql; inventory pending jobs by ID/state/nonce/hash only, never signed bytes. Back up schema, policy definitions and private journals securely.
2. Apply the owning four Prisma migrations from frontend PR207 to an isolated destination first. Deploy compatible code with mode off and no inherited preview signer. Prove the production build, ordinary shared-account login, exact storage host/API-key/Bearer behavior and public alias consumers. A hosted staging target remains a required future release gate.
3. Drain the old application writers and disable/bypass no guards. Wait for already signed legacy jobs to reconcile; inventory unresolved jobs before cutover. Change the compatible new runtime to drain when testing existing journal continuation. Do not open new requests while writer ownership is ambiguous.
4. Review/apply cutover.sql; prove negative writes by verifying rows/object hashes unchanged, even when HTTP200 returns zero rows. Prove anon/auth SELECT, private-ledger denial, all unaffected folders, writer scope and actual Prisma reward FK behavior. `storage-before.sql` is an archival definition for rehearsal only; do not replay it after cutover.
5. After separate human release authorization and all hosted/provider gates, enable the matching releaseId and perform one controlled canary. Verify actual receipt token, raw preservation, scoped patch, storage hashes, URI, aliases and DB publication before broadening. This local phase does not perform this step.

## Recovery and evidence

Keep the same operation ID, signed bytes, nonce and hash. Never remint to repair metadata, replace a journal entry or force a terminal state. Resume reconciles the actual transaction, canonical receipt/block/hash, confirmation boundary, domain, calldata and current protected state. Before our first send or rebroadcast it checks the full authorized baseline again; a conflict retains the private signed journal for review.

Version1 evidence binds operation/step/domain/expected effects to canonical receipt hash, block, timestamp and effects hash. `receipt-state` means effects were read at the receipt block. `current-full-state` means an explicitly recognized pruned-state error required reconciliation at one pinned current head, with full authorized state/native timestamps and a final canonical-head check; it never claims that current state was observed at the old receipt. Saved evidence still rechecks transaction/receipt/canonical block and its reconciliation anchor; current guard runs before every new send and publication. A general RPC outage is not pruning. Missing, tampered, orphaned or mismatching evidence stops safely; retain the job and involve an operator. Legacy proof without a qualified version must be verified historically or by the same full-state reconciliation.

Read-only probes observed missing-trie errors for historical blocks on the public RPC; no retention duration is established. Test delayed restart both after signing-before-send and after broadcast-before-first-verification. If the complete current authorized prefix/native effects cannot be proved, require an archive-capable provider or manual reconciliation; do not bypass the check. The unchanged contract has no atomic on-chain compare-and-set argument: an external ADMIN racing after the guard and before mining cannot be prevented atomically. Coordinate all application writers; conflicts found by readback enter review. No unlimited offline recovery guarantee is made.

A full batch temporarily destroys DNA. The journal preserves its exact raw value and restores it before JSON/alias/DB publication; staff may see old DB data during recovery. Only the requested field is applied to each representation's own baseline; legacy differences remain visible and are not silently repaired. Native manager timestamps/history counters and NFT URI timestamps have documented contract side effects, while original DB createdAt remains preserved.

## Rollback and restart

Set mode drain to finish signed jobs, or off to stop all new runtime activity during an incident. Retain the compatible code, journal, objects and schema. `rollback.sql` disables scoped writer RLS and privileges as well as role grants; revocation alone is insufficient for an existing storage pool. It deliberately keeps anonymous protected writes denied and public reads available. Never restore old broad public writer policies or roll back to code that can bypass the coordinator. `restore-writer.sql` is a reviewed roll-forward of only the scoped writer and is used after resolving the incident. Rehearse cutover→rollback→restore without deleting rows, objects or signed journals.

Record source hashes, exact commands/exit codes, timezone, migration count, container images, fork instance/block/code hashes, canonical transaction hashes and sanitized proof origins. Keep credentials, raw signed bytes and private dumps mode600 and outside Git. Stop only task-owned processes/containers after preserving dumps; never reset another fixture or production state.

## Concrete invocation checklist

Commands below are templates for a separately authorized destination. Run from the dashboard checkout `/Users/non/dev/opilot/projects/jaothui-dashboard/.tmp/buffalo-write-integrity`; resolve the owning frontend checkout explicitly. Load credentials through a private environment provider; do not paste them into command text or logs. `REVIEWED_DIRECT_DATABASE_URL` must be the intended reviewed direct connection, not a pooled session-transaction endpoint. Capture output privately and sanitize before sharing.

```sh
pwd
git status --short
# Readonly capture works both before and after ledger installation.
psql "$REVIEWED_DIRECT_DATABASE_URL" -v ON_ERROR_STOP=1 -f release/buffalo-integrity/preflight.sql
# Owning schema order: frontend PR207 targets frontend main; dashboard PR58 targets dashboard staging.
# Merging PR58 is not production promotion. Staging-to-main promotion/deployment requires hosted qualification and separate authorization.
# Merge/deploy each only after separate release authorization.
DATABASE_URL="$REVIEWED_DIRECT_DATABASE_URL" npx prisma migrate deploy --schema /absolute/reviewed/frontend/prisma/schema.prisma
psql "$REVIEWED_DIRECT_DATABASE_URL" -v ON_ERROR_STOP=1 -f release/buffalo-integrity/preflight.sql
# Compatible dashboard deployed with BUFFALO_INTEGRITY_MODE=off, then drain old writers.
psql "$REVIEWED_DIRECT_DATABASE_URL" -v ON_ERROR_STOP=1 -f release/buffalo-integrity/cutover.sql
# Re-run preflight and destination policy/API/consumer checks before any enable/canary.
psql "$REVIEWED_DIRECT_DATABASE_URL" -v ON_ERROR_STOP=1 -f release/buffalo-integrity/preflight.sql
```

Emergency only; this is a separate incident action, not the normal cutover sequence:

```sh
# Guarded rollback preserves public reads and private journals.
psql "$REVIEWED_DIRECT_DATABASE_URL" -v ON_ERROR_STOP=1 -f release/buffalo-integrity/rollback.sql
```

After resolving and reviewing the incident, separately authorize scoped roll-forward:

```sh
psql "$REVIEWED_DIRECT_DATABASE_URL" -v ON_ERROR_STOP=1 -f release/buffalo-integrity/restore-writer.sql
```

For a recovery incident: set mode drain/off as appropriate, capture preflight inventory, find the staff-visible operation ID/hash, verify owner account and canonical chain receipt, inspect private proof origin and current guard reason, and resume through the authenticated application only when the same operation remains resumable. A NEEDS_REVIEW job is not force-resumed through SQL. Escalate uncertain evidence/provider history to the operator; never export signed_bytes or rewrite operation state. Re-run public alias HTTP+DB readback and reopen the staff details after completion. Record mode/releaseId/source hashes and unresolved job IDs in the incident handoff.
