# Durable buffalo operations — Phase 2

Status: foundation and isolated proof only. Product operation runtime is deliberately hard-off.
Existing creation/edit screens and legacy write routes are unchanged; complete Phases3–5 before
one coordinated production activation. The new operation runtime never uses a default DATABASE_URL or production signer for writes;
it is hard-off. The router still uses the existing authenticated tRPC/context module. This document is an implementation handoff, not the
final staff/release runbook.

## API and ownership

`buffaloOperations` exposes protected `create`, `prepare`, `status`, `advance`, `cancel` procedures.
Input schemas are strict: no client owner, arbitrary calldata/ABI/plan, signed bytes or claimed
receipt can mark a step successful. The verified existing shared application account supplies
`shared:<configured username>` ownership; an arbitrary operation UUID cannot cross account scope.
The current shared login intentionally gives that same team account access to its operations;
it cannot establish per-person attribution. The owner + idempotency key represents one request.

- create(key,intent): persist validated immutable intent/domain hash and acquire chip/token
  reservations atomically; same key/hash returns original operation, changed payload conflicts.
- prepare(id,version): server-only planner checks identity/assets/permissions and supplies the
  approved domain/sender/gas/confirmation policy. Stale draft revision rejects before signing.
- advance(id,action): one new/recovery chain step per call; explicit mint and initial metadata
  actions remain separate. Draft/reverse actions cannot consume a nonce. Resume uses existing
  recorded transaction evidence and never guesses a new mint.
- status(id): a whitelist of operation ID/state/version/chip/actual token/reason and step
  kind/state/hash/receipt. Private intent, plan/calldata, sender nonce envelopes and signed bytes
  are never returned. API exceptions are reduced to stable domain codes, not provider errors.
- cancel(id): allowed only while unsigned and in a cancellable stage; cannot free claims on a
  zero-row stage change or after signing/submission. Journals/events are retained.

The default `productOperationRuntime` throws INTEGRITY_FEATURE_DISABLED. There is no environment
switch that can activate a production signer. Future integration must provide a reviewed
server runtime after all existing writers join the same coordinator.

## Durable model / migration ownership

`database/buffalo-integrity/001-private-operation-ledger.sql` is the exact additive release artifact
packaged into the frontend's existing shared-DB migration lineage. Do not create a second
Prisma baseline in dashboard or use db push. The private `buffalo_integrity` schema contains:

| Table | Purpose |
|---|---|
| operation | immutable owner/key/intent/hash/domain, immutable approved plan, state/version/fenced lease, actual token, result/reason |
| reservation | active unique domain/chip/token claims without touching dirty legacy uniqueness |
| step | ordered expected effect, sender/nonce, immutable signed bytes/hash/envelope, receipt/proof and status |
| wallet_lease | one active step per network/sender, monotonic fence, lease timestamp |
| event | append-only stage/receipt history, never signed bytes |

The SQL runs transactionally with lock/statement timeouts. PUBLIC/anon/authenticated have no
schema/table/sequence/function access; all tables enable RLS. Application server role ownership
must be reviewed in the later cutover. Operation/step deletes and event update/deletes reject;
intent/approved-plan/signed-step updates reject after binding. No public table is altered.
Parent rehearsal applies the exact four-migration owning lineage on disposable PostgreSQL15.1,
including dirty duplicate token427 fixtures; public schema/row hashes remain unchanged.

The raw parameterized Prisma SQL repository avoids generated-client schema churn. Short SQL
transactions contain only SQL, never RPC/sign/storage waits. Every repository query (including
claim/release) uses500ms lock timeout,2500ms statement timeout,3000ms transaction timeout and
1000ms pool wait. A real held-row-lock test verifies bounded failure instead of an indefinite wait. An operation lease is re-read after
claim; stale operation and wallet fences cannot journal or broadcast. Before broadcast, current
operation and active-wallet ownership are rechecked. An expired lease does not give a different
cow a nonce while the original active step is unknown. Reservations persist through ambiguity.

## Signing and recovery

The server-approved call binds chain/domain/sender/to/data/value and exact expected effects.
Signing is local; the engine independently parses/recover-verifies bytes, hash, sender, chain,
nonce (including viem's omitted zero), gas envelope and fee cap. Native value must be zero.
Signed bytes, deterministic transaction hash and nonce are durable BEFORE broadcast. A crash
before/after send resumes the same hash and can only rebroadcast identical bytes. A consumed
nonce with no known canonical receipt enters NEEDS_REVIEW, never automatic fresh-nonce remint.

Three canonical confirmations are the minimum. Receipt status alone is insufficient: the
concrete adapter checks transaction binding and actual readback/effects. It checks prior
confirmed prerequisites again before advancing/publication. A missing/changed canonical block
or lost confirmed receipt stays RECOVERY_REQUIRED; a revert or wrong identity/effect enters
review. Wallet release requires a recorded confirmed/reverted receipt. A verified mint binds
actual receipt token ID, not totalSupply+1 or guessed edition.

The concrete test adapter validates and pins anvil_metadata.instanceId in the immutable approved
plan, plus loopback host, configured network and
exact NFT/manager bytecode hashes. It whitelists supported contract action selectors. Mint proof
requires the exact NFT address, MintWithMetadata operator/URI/token, Transfer from zero to the
expected receiver for that token, ownerOf, tokenURI and stored NFT image. Metadata readback
compares business fields plus issuedAt, with native createdAt/updatedAt explicitly outside that
manifest. Historical receipt-block proof is not a substitute for Phase3/4 final current-state
preservation/publication checks.

The engine handles at most eight steps and sixteen effects per step, and new intent payloads
are bounded to256KiB. Each request checks a25s elapsed budget before/after awaited adapter I/O;
expiry checkpoints retry/recovery and prevents later journal, broadcast or completion. There
are no dangling Promise.race/background broadcasts. Loopback RPC calls have8s timeout/no automatic
transport retry, identity probe2s, operation lease30s. Adapters/planners must use bounded I/O;
a callback that ignores its transport timeouts cannot be forcibly cancelled safely by promises.
The next integration runtime must preserve this bounded adapter contract and serverless budget.

## Isolated test instructions and evidence limits

Unit/API tests use injected ports and real synthetic signing; actual infra tests require explicit
BUFFALO_INTEGRITY_TEST_DATABASE_URL and the task-owned loopback Anvil/key fixtures. They refuse a
non-loopback database/RPC and never read a production minter. Default CI skips the infra suite
unless provisioned; a release gate must run it with the explicit disposable environment.
The global Jest setup now guards its window-only matchMedia mock so backend tests can run in
Node while DOM tests retain existing behavior. No new runtime dependency was added.

The process harness `scripts/buffalo-integrity-process-check.mjs` uses existing TypeScript to
load server source in an isolated Node process. Child A exits after actual broadcast before
result commit; child B reconstructs state from PostgreSQL and cannot sign again. The fixture
explicitly advances only that dead process's lease timestamp to simulate expiry, retaining its
signed journal. This is an OS-process restart, not a shared closure or new connection claim.
The full infra test also proves independent SQL clients, uniqueness/fencing, retained unknown
wallet ownership, real fork mint+metadata readback, an actual evm_revert/replay/reconfirmation of the same
signed hash with no new signature, and forward recovery after a projection failure. DB publication is a synthetic row and storage proof is a local file origin; no Supabase,
public CDN, browser UI or mainnet proof is claimed.

Bitkub's public RPC pruning can make an old local fork unable to fetch untouched slots. This
is an explicit fixture failure, not permission to invent zeros, delete history or remint. The
Oct17 fixture's successful mint and metadata receipts were archived by parent; full readback
became unavailable overnight, so its operation remains NEEDS_REVIEW with the exact reason.
Fresh fork instances require a separate disposable journal database, a fresh signer and an
explicit expected Anvil instance ID. A new signer alone avoids nonce collisions but cannot
resolve token reservations when a reset fork reuses the same NFT token ID. Old databases,
signed journals and fork dumps are retained; never clear reservations to disguise this mismatch.
Repeated runs on the SAME instance/database can advance its actual counter normally.
The adapter refuses another node instance even if chain ID, address and bytecode match.

## Remaining integration responsibilities

Phases3/4 must construct complete validated intents/assets and meaningful approved plans,
provide actual DB/storage projectors with origin/current-manifest verification, integrate every
managed wallet writer and safe UI state/resume, and handle batch/DNA preservation. Phase5 must
rehearse private-role permissions plus scoped Data API/storage cutover and final runbooks. This
phase neither makes the legacy writes robust nor authorizes production rollout.
# Hosted database SQL budget

Ledger transactions allow 15 seconds for their complete set of SQL round trips, with a 2-second connection wait. Individual statements still have a 2.5-second limit and locks a 500ms limit. RPC, signing and storage remain outside these transactions. A 3-second overall limit expired during unsigned step reservation on production; an isolated PostgreSQL regression simulates 500ms per round trip and verifies durable reservation plus rejection of a stale fence. API and lease budgets remain unchanged.
