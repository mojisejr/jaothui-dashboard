# Buffalo integrity: local qualification

Status as of 20 October 2026: **LOCAL_QUALIFIED; HOSTED_QUALIFICATION_PENDING**. This is the Phase 5 local-first handoff requested by the owner. It does not authorize a production migration, policy change, deployment, merge, or mainnet transaction.

The application and release artifacts tested are checkpoint `d51915d16c3725e8caf2f8d02350a4155565560d`, with 164 candidate files unchanged and source fingerprint `d7b4536fb13d3c32fe0b376cc13700361c323e50a00f5b3cdf2769bb80597d61`. This document adds the qualification record; it changes no executable behavior.

## Completed locally

- Build, lint, TypeScript and strict DESIGN contract validation passed. The full suite passed 298 tests and 7 snapshots in both UTC and Asia/Bangkok. Of 34 ordinary-run skips, 29 are the opt-in infrastructure tests below; 5 are inherited skips.
- All 29 opt-in tests passed against actual PostgreSQL 15.1 and isolated Anvil forks of the deployed contracts: edit 18/18, create 4/4, operation durability 3/3, and release/recovery 4/4. They cover preservation, duplicate requests, fencing, restart, projection failure, canonical receipts, pruned historical state, drain and stale signed journals.
- All 112 scoped permission checks passed against official Supabase Storage API 1.81.0 and PostgREST 14.18. Protected source/destination moves, immutable operation files, private ledger denial, public reads, unrelated upload folders, authorized Prisma writes and compatible rollback were checked. Each final app database also passed 12 direct-role guard checks.
- Root browser testing used the production build and shared-account login. Create included parents, height and a JPEG near the 2,000,000-byte input limit. After confirmed Mint NFT, a real server process restart and logout/login recovered the same operation, token and hash; Mint NFT stayed disabled.
- A configured post-chain publication failure left no public database row. Resuming the same operation completed publication without another mint. Setter edits and a destructive color batch completed; logout/login during the batch recovered the same operation, restored the exact original DNA and retained old public data until verification and publication succeeded.
- Readbacks confirmed all unrequested business fields, original DB creation date, approvals, parents, unknown JSON attributes and deterministic aliases. A conflicting token identity remained readable but all edit controls were disabled.
- The existing reward page uploaded through its ordinary browser uploader and saved a reward through Prisma with its buffalo foreign key intact. Published image/JSON bytes were readable. Responsive create/edit screens were checked at 390, 768 and 1440 pixels; images loaded without horizontal page overflow. This is scoped visual verification, not a complete accessibility audit.
- The final 54 static browser files were scanned against 35 known private credential values: zero matches. No private key, writer JWT, database credential or signed transaction bytes are included in this handoff.

The fork rehearsal uses synthetic keys and rows only. Pinned public storage reads were cached verbatim for the local fork because the public RPC prunes historical state. No missing storage values were fabricated. Fixture-only local role/funding setup is distinct from application transactions. A loopback gateway CORS omission was repaired in the local harness; the ordinary reward browser flow then passed.

## Operational limits

Success applies to the requested field; pre-existing differences in other fields are preserved and shown to staff. The existing contract resets its native `createdAt` during a batch and changes history timestamps during setters. Those contract-managed timestamps were checked against actual receipt blocks; the original DB `createdAt` remains unchanged. This release does not redesign the contract or repair historical records in bulk.

DB, storage and chain cannot commit atomically. The durable operation journal and verified forward recovery handle intermediate failures; they do not guarantee that every service is continuously available. An external contract administrator can still race a managed transaction after its final guard and before mining. Staff must resume the recorded operation rather than remint.

All task-owned local app/fork/gateway/proxy processes and test containers were stopped after private database and Anvil backups. Named volumes, object history and journals remain preserved. The unmerged source checkout is retained for review. Unrelated projects and the Docker daemon were not stopped.

## Required next release gates

The owner currently has no isolated hosted Supabase test project. Hosted role/JWT issuance and renewal, gateway/CDN behavior, deployed request limits, environment injection, deployment restart and consumer smoke tests remain pending. No unconditional `RELEASE_CANDIDATE_READY` or production-ready claim is made.

1. Prepare an authorized isolated hosted destination and rehearse the complete operator sequence there, using the exact combined candidate.
2. Review the frontend-owned migration in [frontend PR207](https://github.com/mojisejr/jaothui-front/pull/207), then the application in [dashboard PR58](https://github.com/mojisejr/jaothui-dashboard/pull/58), whose target is `staging`. A staging merge is separate from production promotion.
3. After hosted gates and separate production release authorization, follow [OPERATOR.md](OPERATOR.md): inventory/drain pending writers, apply the owning additive migration, deploy compatible code off, enforce scoped policies and perform the specifically authorized mainnet canary. Keep anonymous write guards during rollback.
4. After successful production smoke checks, give the team [STAFF.md](STAFF.md). No message has been sent to staff by this work.

Event admin migration, vote behavior and LINE testing remain parked. The known public certificate was checked read-only; no live buffalo, reward, event registration or mainnet data was modified for this qualification.
