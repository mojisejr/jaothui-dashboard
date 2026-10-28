# Buffalo identity repair: isolated feasibility evidence

Mission: `#jaothui-buffalo-error-visibility` · checked 2026-10-28 16:43 Asia/Bangkok.

This is Phase 3 primitive feasibility, **not** completed application repair, a production release, or authorization to repair a real animal. Production access was limited to read-only PostgreSQL catalog/schema extraction and public RPC reads. All transactions used isolated PostgreSQL and a loopback Anvil fork. No production rows, assets, NFT ownership, or blockchain state were changed.

## Result

| Primitive | Evidence | Decision |
| --- | --- | --- |
| Single canonical-chip correction | Actual deployed manager on a current pinned fork; DNA restored, unrequested business fields retained | Feasible subject to approved identity and dependency closure |
| Pair canonical-chip correction | Both manager/mapping changes in one batch; second invalid NFT reverts the whole batch | Feasible for an exact two-target manifest; not cross-system atomic |
| DNA preservation after pair batch | Batch clears both DNA values; first restored, second deliberately reverted, fresh client recovered only the missing restoration | Feasible as explicit recoverable steps; application journal integration still required |
| DB primary-key pair swap | Exact production PK/FK definitions on PostgreSQL 15.1; direct swap rejected, ordered temporary-key swap succeeds | Feasible within one DB transaction after reference-ownership approval |
| DB interrupted swap | Observer sees old committed rows; injected pre-commit failure rolls back rows and cascades | No half-committed DB pair under tested boundary |
| DB token-binding-only correction | Does not inherently need a chain call or primary-key swap | Must receive its own DB-only completion proof in the application; no dummy transaction |
| Clear every historical alias | Contract retains old mapping; mapping is not enumerable | Unsupported; do not claim global alias removal |

## Actual database catalog and clone

Source PostgreSQL is 15.1. Read-only catalog inspection found:

- `Pedigree.microchip` and `Certificate.microchip` are separate non-deferrable primary keys. There is no `Certificate → Pedigree` FK.
- `Reward.microchip → Pedigree.microchip` uses `ON UPDATE CASCADE`.
- The certificate-approver join table cascades certificate key updates.
- `MicrochipOrder.microchipId → Microchip.microchip` uses `ON UPDATE CASCADE`.
- Genealogy fields in Pedigree and Certificate are strings, requiring explicit projection.
- No user triggers were found on the scoped tables.

The schema-only clone contains User, Farm, Pedigree, Reward, Certificate, CertificateApprover, the approval join, Microchip and MicrochipOrder. It copies **no production rows**. Test fixtures are synthetic. Its scoped PK/FK definitions compare exactly with the production catalog after stable client-side ordering (database collations differ).

The initial raw schema restore reached provider-specific policies after restoring all tables/constraints, then stopped because the local clone has no Supabase `auth` schema. `schema-core.sql` makes that boundary explicit by excluding provider policies/RLS from a reproducible core restore. These tests use the isolated postgres role and **do not prove Supabase auth/RLS behavior**.

Eighteen checks passed, including direct-swap rejection, rollback after both keys changed, external-reader visibility, Reward cascade, manual Certificate/genealogy updates, approval join cascade, inventory-order cascade, no published temporary key, and readback after a simulated lost commit response without applying the swap twice.

The inventory/order cascade test proves mechanics only. It does **not** authorize moving chip inventory ownership. A repair manifest must decide each live reference's owner from physical evidence; historical snapshots must not be globally rewritten. A wrong DB token binding and a real microchip-key swap are distinct cases.

## Current deployed contract fork

- Chain: 96; pinned block: `36513981`.
- Block hash: `0x093bb7bf3cd2fee4f9ecd5ec44adeb53221b8d30c392fdb6fe5d015fce6f4a86`.
- Manager: `0x41f291b116459aE967bCd616F64e762f8468Ea0E`.
- Live code hash: `0x4ee029c5a49a9505ea8ddccf6a0f056922906f96300a36ec680ea07df4e699ee`, matching the archived verified contract source.
- Fork transport: `http://127.0.0.1:18577`; all signing uses locally impersonated accounts, not a private production key.

Twenty-four checks passed. The suite seeded **local-only nonempty DNA** on two forked tokens before testing. A batch with an invalid second token reverted the first token's tentative mutation. A negative test confirmed the contract permits duplicate canonical chips and uses last-write-wins mapping: application uniqueness checks are mandatory. Single correction retained the old alias. Pair correction updated both mappings, cleared both DNA values, reset both native createdAt/updatedAt values, and incremented totalMetadata by two.

After first DNA restoration, a real unauthorized second restoration reverted. A new client read a persisted local recovery record and the successful batch receipt, restored only the missing DNA, and did not repeat the batch. Both NFT owners/URIs, approvals, parent fields and unrequested business values remained unchanged; a third neighbor remained unchanged. The suite does not establish exhaustive third-cow closure across the whole production dataset.

Observed fork gas: single batch `301831`; pair batch `530911`; recovery DNA call `92335`. These are fixture measurements, not a mainnet fee quote. Full receipt gas/effective price/fee, timestamp deltas and transaction hashes are in the private local proof JSON. Fork hashes are not mainnet evidence.

## Handoff and reproducibility

Evidence directory, relative to the task worktree: `.tmp/repair-feasibility/`.

| File | Purpose |
| --- | --- |
| `catalog.json` | Timestamped read-only source catalog, candidate reference columns and triggers |
| `schema.sql` / `schema-core.sql` | Raw schema-only dump / explicit core constraint clone |
| `pg-proof.cjs` / `pg-proof.json` | Executed PG15.1 test and 18-check result |
| `fork-pin.json` | Current block/domain/code hash pin; no private credentials |
| `fork-proof.cjs` / `fork-proof.json` | Executed actual-contract fork test and 24-check result |
| `fork-recovery-journal.json` | Local-only primitive recovery evidence, not the application operation ledger |

Syntax checks: `node --check .tmp/repair-feasibility/pg-proof.cjs` and the equivalent `fork-proof.cjs`. Execution: `node .tmp/repair-feasibility/pg-proof.cjs` against a **fresh** schema clone, and `node .tmp/repair-feasibility/fork-proof.cjs` against a **fresh** fork at the recorded block. These are stateful fixtures, not idempotent rerun commands against the already-mutated test environments.

Local PostgreSQL container `jaothui-recovery-v2-feasibility-pg` listens only at `127.0.0.1:55437`, database `repair_feasibility`. Anvil listens only at port 18577. Both are retained for the owning implementer; current fixture state is post-test. Restore an isolated snapshot or start a fresh named test instance before another suite. Do not point these tests at production.

## Remaining application gates

1. Physical identity evidence, explicit before/after approval and complete affected closure; a third cow or ambiguity must stop the case.
2. Dedicated repair intent and reservations using the same key namespace as create/edit; leases, revision checks and external-writer coordination.
3. Actual application journal restart/lost-response recovery, shared writer concurrency, DB-only completion, storage publication, public pending state and rendered operator flow. The primitive scripts do not replace these gates.
4. Browser acceptance and an operator-approved exact production case after release approval. Existing ordinary editor identity guards remain intact.

No production deployment, repair or global historical-alias guarantee is claimed.

## Read-only diagnosis implementation — 2026-10-28 17:13 +07

The protected `buffaloRepair` router exposes `startScan`, `scanPage`, and `preview` only. `preview` uses POST for bounded receipt payloads but has no write ports. `BUFFALO_REPAIR_DIAGNOSIS_ENABLED` defaults off. Receipt authentication uses `BUFFALO_REPAIR_RECEIPT_SECRET` or the existing server dashboard auth secret; it does not load a blockchain private key or storage write token.

Each signed scan pins chain/domain, NFT and manager code hashes, block number/hash, and NFT `totalSupply`. Pages enumerate `tokenByIndex` (never assume contiguous token IDs), include initialized canonical chips and parent references, and use bounded concurrency. Preview rejects altered, duplicated, missing, cross-scan or expired receipts. It verifies current code and pinned block again before and after fresh database/target reads. Preview is not execution authority: Phase 4 must rederive the baseline, reserve the full scope, bind immutable publication paths to an operation key, and record explicit approval.

The manifest distinguishes desired mutation targets from observed closure. Closure includes old DB token bindings, all connected canonical/DB rows, and known chip mapping targets. A third cow or unrelated reference does not silently become a write target. A canonical typo can be explicitly confirmed against the exact prior value with either physical-scan or registration-document evidence. Reference ownership remains a separate decision; structural FK behavior is not authorization to transfer inventory or historical orders.

Asset evidence uses the existing owned storage-key policy, restricted to the configured HTTPS Supabase project and `slipstorage` public path. It rejects arbitrary origins, queries, redirects and oversized streams. It hashes NFT JSON, NFT/chain/DB images and known image/JSON aliases, and describes an identity-only JSON projection preserving unrelated traits. Different image content or an unsupported JSON identity yields `needs_review`. Immutable JSON is not overwritten: its preview describes publishing a new immutable JSON and setting the NFT URI, with the exact operation path still required at preparation. No read-only preview claims permission to execute.

Runtime proof applies the exact frontend-owned `20261017152523_buffalo_integrity_ledger/migration.sql` to the loopback PG clone only. The source is retained as `ledger-source.sql`. The first full inventory run against the old fork hit upstream historical `missing trie node`; an unpaced direct read-only RPC scan hit HTTP 429. These are real provider limitations. `read-only-rpc-proxy.cjs` permits only `eth_call`, chain ID/block reads and code reads; it rejects broadcast methods. The final paced test uses this proxy and must be reported as a **read-only mainnet scan with local PG**, separately from the earlier actual contract fork mutation proof. A provider failure never counts as complete inventory.

### Runtime gate result — 2026-10-28 17:15 +07

The paced direct read-only integration run completed its full signed page loop, then rejected preview at the first final freshness/domain check after 301.7 seconds (`REPAIR_BASELINE_CHANGED`). It is **not** a passing end-to-end diagnosis proof. The combined guard checks block distance, pinned block/domain fields and code hashes; this log does not isolate which predicate failed, so the 100-block distance limit is a timing-supported hypothesis, not an established cause. Evidence: `phase3-runtime-paced-proof.log`. Earlier evidence: `phase3-runtime-proof.log` (pruned historical storage), `phase3-runtime-readonly-proof.log` (HTTP 429). The fresh fork test was abandoned when switching to the read-only proxy, not counted as a pass.

The existing 18-check PostgreSQL and 24-check actual-contract fork primitive proofs still stand. Read-only diagnosis unit/API/asset checks pass (29 tests), but the complete runtime acceptance gate remains open. A subsequent reviewed step must either demonstrate bounded freshness with a configured archival reader or prove a stronger unchanged-inventory epoch check; it must not remove the guard merely to turn this test green.

### Bounded range and storage-root slice — 2026-10-28 17:42 +07

This slice supersedes the open read-only runtime gate above without weakening the 100-block age guard. The archived verified NFT source at `/Users/non/dev/opilot/.tmp/buffalo-create-research/nft.sol` matches live deployed bytecode (`0x54598f1fd58ccd3910c17795a5b805c5696ec98f233203e70612cecf68cf648e`). Its counter starts at zero, both public mint methods mint `getCurrentTokenId()` then increment, and the getter returns counter + 1 (lines 1252, 1286, 1333–1376). This proves the historical mint range **1 through nextTokenId − 1 for this code hash**, not an assumption about contiguous `totalSupply` indexes. This KAP721 burn keeps the enumerable token key and assigns owner zero; `exists` is not proof of a live owner. Zero-owner repair targets are blocked.

The reader now signs `scanCount` and `nextTokenId` separately from `totalSupply`. It scans that verified current-NFT mint range, includes initialized canonical metadata and parent references, and expands all DB/candidate/known-alias references. Any observed token outside the verified range is a blocker. The scope is the current configured NFT lineage plus observed references; arbitrary unknown historical manager NFT domains and all possible historical alias strings remain explicitly unenumerated, as allowed by the plan's observable-system boundary.

`eth_getProof` supplies pinned NFT and manager storage roots. Both roots must match at a fresh, explicitly numbered block; code hashes must also match actual bytecode, and block hashes are reread after proof batches to reject a mixed reorg snapshot. Unavailable proofs fail closed. Equal storage roots cover unchanged present contract storage, including initialized flags and genealogy that `totalMetadata` does not cover. This is a consistency check through the configured trusted RPC, **not** offline cryptographic validation of accountProof against an independently trusted consensus header. See the primary [EIP-1186 specification](https://eips.ethereum.org/EIPS/eip-1186). DB, external history contracts and storage assets still need their own execution preflight.

Actual new evidence:

- `nft-range-proof.json`: live bytecode match at block 36514911, nextTokenId 1369, totalSupply 1368.
- `storage-root-proof.json`: **PASS 8** on a fresh actual-contract local fork. `setUninitialize` and `setParent` each change the root while totalMetadata stays 1632; parent readback is exact, read-only repeat roots remain stable, and the snapshot is reverted afterward. No production mutation.
- `phase3-runtime-range-root-proof.log`: **PASS**, actual read-only mainnet scan via the method-allowlist proxy plus the local PG clone. All **1368 historical IDs / 69 signed pages**, block **36515155**, completed in **133.3 seconds** with all age/root/code/domain/reorg guards retained. PG before/after digests match. A deliberately nonexistent synthetic proposal returns explicit review blockers, not false readiness.
- `public-assets-proof.json` / `phase3-public-assets-proof.log`: **PASS**, public NFT 1360 JSON/image evidence at block **36515239**; six roles hashed (NFT JSON/image, chain/DB image fixtures, JSON/image aliases), no blockers, no URI setter needed for the unchanged-identity projection. This proves read/hash behavior, not physical identity or authorization for a real repair.

The performance change is bounded concurrency eight with HTTP batches capped at twenty, a 150 ms batch window and a bounded retry. `BUFFALO_REPAIR_RPC_URL` optionally configures a server-only HTTPS read provider; invalid explicit settings fail closed and never alter the writer RPC. Keys in a configured server query string are never returned by the diagnosis API or structured diagnostic logger. The feature remains off by default.
