# Buffalo integrity contract — Phase 1

Status: local implementation foundation, NOT release ready. No migration, product mutation switch,
UI redesign, production storage policy, mainnet write or historical repair is included.
All five phases must pass as one combined candidate before production activation.

## Authority and representations

The dashboard lookup now displays the Pedigree row. A bounded chain check enriches the DTO with
`sync`; it never replaces displayed DB fields with another token's fields. No row means `null`.
RPC failures/timeouts return the DB DTO with `sync.status=unavailable`; DB failure is not a chain
fallback. Existing `getByMicrochip` currently normalizes DB errors to null (legacy limitation).
The server-only DTO extends the existing IMetadata shape; all existing properties remain available.
Times from DB stay in their existing representation; chain bookkeeping timestamps are NOT used to
rewrite DB creation time. Calendar birthday formatting uses UTC components, never locale parsing.

`sync.status=matched` has the exact scope `database-manager-business-fields` excluding image
content. `imageVerification` and `publicationVerification` remain `unchecked`; it is NOT a claim
that NFT tokenURI, storage origins/CDN, or the whole historical cow is synchronized. Existing UI
will not display these new fields until its integration phase. Identity conflict keeps DB data
readable and requires review for future mutations. Read enrichment uses one observed block for
all contract reads and a four-second upper bound; it is not finality/write verification.

| Business field | Pedigree | Legacy JSON named trait | Metadata manager / writer policy |
|---|---|---|---|
| name | name | envelope name, exact trailing ` #<chip>` | name / setName |
| microchip | microchip PK string | Microchip | certify.microchip / full batch |
| certificate | certNo nullable | CertNo (additive) | certify.certNo / setCertId |
| birthday | birthday DateTime (UTC day) | Birthday, MM/DD/YYYY | birthdate seconds / batch |
| sex | sex | Sex | sex / batch |
| origin | origin nullable | Origin | origin / batch |
| color | color | Color | color / batch |
| height | height nullable integer | Height decimal string | height uint / setHeight |
| detail | detail | Detail (additive) | detail / setDetail |
| rarity | rarity | Rarity | certify.rarity / setRarity |
| DNA | dna | DNA (additive) | certify.dna / setDNA |
| parents | fatherId, motherId | FatherId, MotherId (additive) | relation.fatherTokenId/motherTokenId strings / setParent |
| image | image nullable (legacy may omit .jpg) | envelope image | imageUri / batch; NFT image/URI is a separate owner operation |
| actual token | tokenId BigInt (NOT unique historically) | edition number | actual successful NFT receipt token, never supply+1 |
| issue date | not represented | IssuedAt, DD/MM/YYYY | certify.issuedAt seconds; preserve original exact timestamp on edits |
| created/updated | createdAt/updatedAt strings (ms convention) | no equivalent | native seconds; batch resets createdAt and updatedAt |
| rewards | Reward relation, microchip FK | no mapping | no metadata manager equivalent |

IssuedAt in legacy JSON is only a day and cannot reconstruct the exact chain timestamp. The
pure initial-input projection uses an explicit day at UTC midnight; the future engine must
persist its agreed initial timestamp policy. Existing chain-issuedAt is always preserved from
the observed chain baseline for edits. It must never be regenerated from public JSON.
Image display uses the existing deterministic published `buffalo/<DB token>.jpg` alias. Full
image agreement needs content hashes and declared alias/version mapping, not URL-string equality.
The public frontend's metadata service deterministically constructs `buffalo/<token>.jpg`, so
versioned storage cannot remove that alias. Public certificate/search remain DB-primary.

## Pure contracts and legacy policy

`buffaloIntentSchema` v1 validates new complete intents, calendar days, safe nonnegative height,
existing sex/rarity choices and new standard chips. Standard chips intentionally trim ASCII outer
spaces, then require exactly 15 ASCII digits; invisible characters, Unicode digits and non-digit
content are rejected. Imported prefixes are valid; there is no invented 764 prefix/checksum.
`assertChipAvailable` checks injected DB, chain mapping and active operation sources and fails
closed if any source is unavailable. These checks do not replace Phase 2 unique reservations.

`intentToJson` preserves the old envelope and first eight trait names/order and adds missing
business traits. `jsonToIntent` reads by names, rejects duplicate/missing traits and edition or
name-chip disagreement. It is a strict future new-intent parser, NOT a migration of old JSON.
`inspectLegacyTraits` reads old incomplete JSON and reports missing fields without filling in
N/A or permitting it to drive a full rewrite. Unrecognized dates fail explicitly; old Birthday
is MDY, old IssuedAt is DMY. Numeric edition must be safe/positive; BigInt DB token remains exact.

Old IDs such as IDB1277 remain readable and can pass preflight for an unrelated safe edit when
DB binding, canonical chain chip, token and domain agree. An actual changed chip must meet the
new standard rule. Known `null`/`N/A`/empty absence values compare equally ONLY on optional
certificate/detail/DNA/parent/origin representations. Actual nonempty text/URIs remain exact.
Unrelated DB-vs-chain discrepancies are returned as a baseline, not repaired automatically.
`patchChainBaseline` patches only declared fields onto a copied CURRENT CHAIN snapshot; certNo,
issuedAt, DNA, relations and other unpatched values remain unchanged. It performs no write.

## Identity/write capabilities

`preflightMutationIdentity` accepts injected read-only ports and verifies requested token/edition,
DB cow, exactly one DB token binding, actual network + NFT/manager addresses, NFT existence,
initialized state, chip mapping and the manager's canonical chip. An old chip mapping alias is
not canonical identity. A token-227 request mapping to 228, or two DB cows using token 427, is
blocked. RPC outage rejects preflight; the corresponding display remains available.

The guard is deliberately NOT wired to existing product WRITE routes in Phase 1. It is a
foundation; Phase 2 must run it again while holding a fenced per-cow reservation and wallet
coordination, with deployed-code/role/gas/receipt checks. No Phase 1 outcome authorizes signing.

Available safe field setters are setName, setHeight, setCertId, setDetail, setRarity, setDNA and
setParent. Birthday/origin/color/sex/image/microchip require addMetadataBatch. Verified contract
batch clears DNA, resets createdAt/updatedAt, increments totalMetadata, appends history and keeps
old chip aliases. Nonempty DNA therefore needs a journaled batch + restoration sequence with
external-state checks and recovery. It cannot be called atomic. If preservation/owner rights
cannot be proven, stop before submission. NFT setTokenURI separately resets its native createdAt.

## Existing writer inventory (must migrate/disable before activation)

All five dashboard wallet call sites are in `src/server/blockchain/metadata.service.ts`:

| Entry | Called from | Effect / legacy risk |
|---|---|---|
| mintNFT | metadata.mint | NFT mintWithMetadata; public JSON authority, hash-only success |
| addMetadata | metadata.addMetadata | initial manager addMetadata from public JSON |
| addMetadataBatch | metadata.updateBuffaloImage and all generic field updates | full rewrite, DNA/timestamp/counter effects |
| updateParentId | metadata.updateParentId | setParent; DB not mirrored |
| updateDNAOnChain | buffalo.service.updateDNA via pedigree.updateDNA | setDNA after DB update |

`viem.ts` constructs the shared server wallet; all of these callers must use the future durable
wallet lease, not just the new mint route. `getCurrentTokenId` currently uses totalSupply+1 and is
only a UI prediction. A receipt is the future actual-ID authority. No checked-in operational
script contains another wallet sender in this checkout. External/local privileged scripts are
outside this inventory: cutover must explicitly discover/disable them or detect their nonces.

| Storage/database surface | Current callers | Required later migration |
|---|---|---|
| buffalo/<predicted token>.jpg | new-buffalo-info/UploadImageForm; upload-imagefile via buffalo service (image RPC is commented out) | bounded server staging; actual-ID alias publication |
| json/<token>.json | MetadataGenerate -> metadata.upload -> buffalo.service.uploadBuffaloJson -> upload-jsonfile | replace early Pedigree.create + upsert with operation draft and verified projection |
| json/<token>.json | update-buffalo-info/UpdateMicrochip, UpdateBirthday, UpdateName, UpdateOrigin, UpdateColor, UpdateSex, UpdateHeight, UpdateCertNo, UpdateDetail, UpdateRarity, UpdateDNA | remove browser direct uploads; intent-owned version |
| buffalo/<token>.jpg and json/<token>.json | update-buffalo-info/UpdateImage | same server authority plus owner/alias checks |
| dna/<token>.<extension> | pages/dashboard/update-buffalo-dna | preserve uploader then coordinate setDNA + DB; DNA edit dialog currently not mounted |
| reward/<chip>_<index/id> | pages/dashboard/new-reward; upload-rewardfile helper | unaffected flow and regression/policy inventory |
| avatar/slips and other prefixes | URL helpers/shared external consumers | inventory across consuming repositories before scoped policy enforcement |
| Pedigree field updates | metadata.service generic updates, buffalo.service.updateDNA | verified future operation projection only |

`r-metadata.ts`, `r-pedigree.ts` and `r-image.ts` are the API boundaries. Existing frontend JSON
producer is `server/utils/jsonGenerator.ts`; new pure adapters are not yet substituted into its
write path. Auth remains the existing shared application login; do not invent Supabase user
identity or per-person audit claims.

## Read-only live findings and additive ledger design (no migration in this phase)

Parent audit artifacts (sanitized, read-only): HQ `.playwright-mcp/jaothui-dashboard/buffalo-integrity/phase-1/live-schema-audit.json`
and `data-api-readonly.json`. Audit transaction confirmed READ ONLY on production PostgreSQL 15.1.
The shared DB's three applied migrations are owned by frontend history (legacy baseline, account
wallet identity and soft deletion); dashboard has NO migrations directory. Do NOT create a second
baseline, db push, destructive Pedigree changes or a unique tokenId constraint over existing data.
Reward references Pedigree.microchip with ON UPDATE CASCADE / ON DELETE RESTRICT. Token427 has a
known duplicate DB binding. More historical mismatches are separate review/repair work.

Additional bypass: Pedigree, Reward and Microchip have RLS disabled and anon/authenticated grants
include SELECT/INSERT/UPDATE. Anonymous read was verified; no mutation was attempted. Blocking
application routes alone cannot protect new invariants while Data API writes remain available.
Phase 5 must inventory actual frontend/event/external consumers and deny scoped unauthorized
Pedigree/Data API writes using reviewed grants/RLS, preserving required public reads and existing
flows. The existing whole-bucket PUBLIC storage INSERT/UPDATE/DELETE policies similarly bypass
JSON/buffalo validation. Replace broad permissive policies AFTER all protected writers migrate;
adding a narrow permissive policy does not cancel broad existing permissive grants. No live
policy change is part of this implementation.

Proposed migration DESIGN, under the existing shared-DB migration lineage:

- Private schema `buffalo_integrity` (unexposed to REST), server role only. If public schema is
  unavoidable, enable RLS and explicitly revoke anon/authenticated privileges before exposure.
- Operation: UUID operation ID, immutable validated intent/revision/hash, authenticated shared
  account/request reference, idempotency key + payload hash, status/version, predicted versus
  actual token, baseline/projection manifests, timestamps; no published cow FK before mint.
- Reservation: unique active `(chainId,nft,token)` and canonical chip claims owned by operation;
  new uniqueness is scoped to ledger rows, never dirty legacy Pedigree.tokenId.
- Chain step/attempt: step kind/order, network/contracts, expected effects, fenced signer lease,
  nonce, calldata hash, bounded gas/value, deterministic signed hash, restricted signed bytes,
  receipt block/hash/status/confirmations, recovery result. Keep append-only attempt history.
- Wallet lease: unique network+signer, monotonic fencing/version and durable nonce ownership.
  Expiry does not authorize signing when broadcast is unknown. No DB transaction spans RPC wait.
- Short SQL/CAS transactions; server-only secrets; no signed bytes in logs/client/REST. Bounded
  request-driven advance/reconcile survives process/browser restart. Same key + same hash
  resumes; same key + different hash rejects. Drafts precede publication; completed requires all
  mapped field and receipt/origin checks. New additive tables retain history during rollback.

Parent disposable rehearsal evidence: HQ `.playwright-mcp/jaothui-dashboard/buffalo-integrity/phase-1/disposable-schema-baseline.json`. PostgreSQL17.6 on loopback127.0.0.1:15438 matched all28 Pedigree/Reward/Microchip column shapes against production PostgreSQL15.1. A synthetic Reward ON UPDATE CASCADE check passed and was rolled back (zero rows remain); no ledger DDL was applied. That is
schema-design proof only, NOT production-PG15 migration compatibility or production rollout proof.
Phase 2 must build/rehearse the actual additive migration using the owning lineage; exact supported
production-version rehearsal and preview/end-to-end gates remain before final release.

## Verification / boundaries

Meaningful RED characterization reproduced RPC outage -> undefined and failure to safely return
DB identity. Focused tests cover imported/hidden/duplicate chips; shuffled/missing/duplicate
traits; edition/name binding; cert/detail/height/parents; UTC/Bangkok days; wrong token/mapping/
network/contract/duplicate DB binding; legacy IDB safe edit; baseline-only discrepancies;
chain-based patch preservation; readable DB during RPC outage/timeout. All I/O is injected/mocked.
No test uses real signer, network write, production credential or storage mutation.
Full build, lint, types, all tests and the two-timezone focused matrix are required phase gates.
This foundation does NOT resolve legacy write hazards until remaining phases integrate it.
