import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { DiagnosticError } from "~/server/diagnostics/errors";
import {
  payloadHash,
  stableJson,
} from "~/server/services/buffalo-integrity/operations/hash";
import {
  type DiagnosisPorts,
  type Pin,
  type ScanPage,
  type RepairProposal,
  repairProposalSchema,
} from "./contract";
export const VERIFIED_MANAGER_CODE_HASH =
  "0x4ee029c5a49a9505ea8ddccf6a0f056922906f96300a36ec680ea07df4e699ee";
export const VERIFIED_NFT_CODE_HASH =
  "0x54598f1fd58ccd3910c17795a5b805c5696ec98f233203e70612cecf68cf648e";
const PAGE_SIZE = 20;
const TTL = 30 * 60 * 1000;
function fail(code: string): never {
  throw new DiagnosticError(code);
}
/** Receipts attest server reads, never client assertions about complete coverage. No signer or mutation port exists. */
export class RepairDiagnosis {
  constructor(
    private readonly ports: DiagnosisPorts,
    private readonly secret: string,
    private readonly now: () => number = Date.now,
  ) {
    if (secret.length < 16) fail("REPAIR_DIAGNOSIS_DISABLED");
  }
  private seal(kind: string, value: unknown) {
    const body = Buffer.from(stableJson({ kind, value })).toString("base64url");
    return `${body}.${createHmac("sha256", this.secret).update(body).digest("base64url")}`;
  }
  private open<T>(kind: string, receipt: string): T {
    try {
      const [body, sig, extra] = receipt.split(".");
      if (!body || !sig || extra) fail("REPAIR_SCAN_INVALID");
      const expected = createHmac("sha256", this.secret).update(body).digest();
      const actual = Buffer.from(sig, "base64url");
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      )
        fail("REPAIR_SCAN_INVALID");
      const parsed = JSON.parse(Buffer.from(body, "base64url").toString()) as {
        kind: string;
        value: T;
      };
      if (parsed.kind !== kind) fail("REPAIR_SCAN_INVALID");
      return parsed.value;
    } catch {
      return fail("REPAIR_SCAN_INVALID");
    }
  }
  private pin(receipt: string) {
    const pin = this.open<Pin>("scan-v1", receipt);
    if (pin.version !== 1 || pin.pageSize !== PAGE_SIZE)
      fail("REPAIR_SCAN_INVALID");
    if (this.now() > pin.expiresAt || this.now() < pin.createdAt)
      fail("REPAIR_SCAN_EXPIRED");
    return pin;
  }
  async start() {
    const observed = await this.ports.pin();
    if (
      !Number.isSafeInteger(observed.scanCount) ||
      observed.scanCount < 0 ||
      observed.scanCount > PAGE_SIZE * 500 ||
      !/^[1-9][0-9]*$/.test(observed.nextTokenId) ||
      BigInt(observed.nextTokenId) !== BigInt(observed.scanCount) + 1n ||
      observed.totalSupply > observed.scanCount
    )
      fail("REPAIR_SCAN_INCOMPLETE");
    const pin: Pin = {
      ...observed,
      version: 1,
      scanId: randomUUID(),
      pageSize: PAGE_SIZE,
      createdAt: this.now(),
      expiresAt: this.now() + TTL,
    };
    return { pin, scan: this.seal("scan-v1", pin) };
  }
  async page(scan: string, offset: number) {
    const pin = this.pin(scan);
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset % PAGE_SIZE !== 0 ||
      offset >= pin.scanCount
    )
      fail("REPAIR_SCAN_INVALID");
    const count = Math.min(PAGE_SIZE, pin.scanCount - offset);
    const entries = await this.ports.enumerate(pin, offset, count);
    if (entries.length !== count) fail("REPAIR_SCAN_INCOMPLETE");
    const page: ScanPage = { scanId: pin.scanId, offset, entries };
    return {
      offset,
      count,
      nextOffset: offset + count < pin.scanCount ? offset + count : null,
      receipt: this.seal("page-v1", page),
    };
  }
  async preview(scan: string, receipts: string[], input: RepairProposal) {
    const proposal = repairProposalSchema.parse(input);
    const pin = this.pin(scan);
    const pages = receipts
      .map((receipt) => this.open<ScanPage>("page-v1", receipt))
      .sort((a, b) => a.offset - b.offset);
    let offset = 0;
    for (const page of pages) {
      if (
        page.scanId !== pin.scanId ||
        page.offset !== offset ||
        page.entries.length !== Math.min(PAGE_SIZE, pin.scanCount - offset)
      )
        fail("REPAIR_SCAN_INCOMPLETE");
      offset += page.entries.length;
    }
    const inventory = pages.flatMap((page) => page.entries);
    if (
      offset !== pin.scanCount ||
      new Set(inventory.map((row) => row.tokenId)).size !== pin.scanCount ||
      inventory.some(
        (row) =>
          !/^[1-9][0-9]*$/.test(row.tokenId) ||
          BigInt(row.tokenId) > BigInt(pin.scanCount),
      )
    )
      fail("REPAIR_SCAN_INCOMPLETE");
    await this.ports.assertCurrent(pin);
    const database = await this.ports.database();
    const sourceChips = new Set(proposal.targets.map((t) => t.sourceMicrochip));
    const desiredChips = new Set(
      proposal.targets.map((t) => t.desiredMicrochip),
    );
    const desiredTokens = new Set(
      proposal.targets.map((t) => t.desiredTokenId),
    );
    const blockers = new Set<string>();
    if (pin.nftCodeHash !== VERIFIED_NFT_CODE_HASH)
      blockers.add("UNSUPPORTED_NFT_CODE");
    if (pin.managerCodeHash !== VERIFIED_MANAGER_CODE_HASH)
      blockers.add("UNSUPPORTED_CONTRACT_CODE");
    if (
      sourceChips.size !== proposal.targets.length ||
      desiredChips.size !== proposal.targets.length ||
      desiredTokens.size !== proposal.targets.length
    )
      blockers.add("NOT_ONE_TO_ONE");
    if (
      proposal.targets.some(
        (t) =>
          !t.evidence.some(
            (e) =>
              e.kind === "physical_scan" || e.kind === "registration_document",
          ),
      )
    )
      blockers.add("NEEDS_IDENTITY_DECISION");
    const selected = database.rows.filter((row) =>
      sourceChips.has(row.microchip),
    );
    if (selected.length !== proposal.targets.length)
      blockers.add("SOURCE_NOT_FOUND");
    const chips = new Set([
      ...sourceChips,
      ...desiredChips,
      ...proposal.knownAliases,
    ]);
    const tokens = new Set([
      ...desiredTokens,
      ...selected.map((row) => row.tokenId),
    ]);
    // Complete observed closure includes old DB bindings and known mapping targets.
    // It is distinct from the one/two desired tokens that may actually be changed.
    const aliasMap = new Map<string, { microchip: string; tokenId: string }>();
    let changed = true;
    while (changed) {
      const size = chips.size + tokens.size;
      for (const row of [
        ...database.rows,
        ...inventory.filter((row) => row.initialized && row.microchip !== null),
      ]) {
        if (
          (row.microchip !== null && chips.has(row.microchip)) ||
          tokens.has(row.tokenId)
        ) {
          if (row.microchip !== null) chips.add(row.microchip);
          tokens.add(row.tokenId);
        }
      }
      if (chips.size > 100 || tokens.size > 100) {
        blockers.add("CLOSURE_LIMIT_REVIEW_REQUIRED");
        break;
      }
      const unknown = [...chips].filter((chip) => !aliasMap.has(chip)).sort();
      for (const alias of await this.ports.aliases(pin, unknown)) {
        aliasMap.set(alias.microchip, alias);
        if (alias.tokenId !== "0") {
          tokens.add(alias.tokenId);
          if (!desiredTokens.has(alias.tokenId))
            blockers.add("ALIAS_OUTSIDE_SCOPE");
        }
      }
      changed = chips.size + tokens.size !== size || unknown.length > 0;
    }
    if (
      [...tokens].some(
        (token) =>
          BigInt(token) < 1n || BigInt(token) >= BigInt(pin.nextTokenId),
      )
    )
      blockers.add("OUTSIDE_VERIFIED_MINT_RANGE");
    const aliases = [...aliasMap.values()].sort((a, b) =>
      a.microchip.localeCompare(b.microchip),
    );
    const closureRows = database.rows.filter(
      (row) => chips.has(row.microchip) || tokens.has(row.tokenId),
    );
    const canonical = inventory.filter((row) => tokens.has(row.tokenId));
    if (
      closureRows.some((row) => !sourceChips.has(row.microchip)) ||
      canonical.filter((row) => row.initialized).length >
        proposal.targets.length
    )
      blockers.add("EXPANDED_SCOPE_REQUIRED");
    if (
      [...desiredTokens].some(
        (id) => !inventory.some((row) => row.tokenId === id && row.initialized),
      )
    )
      blockers.add("TOKEN_NOT_INITIALIZED");
    if (
      canonical.some(
        (row) =>
          row.microchip !== null &&
          !desiredChips.has(row.microchip) &&
          !sourceChips.has(row.microchip) &&
          !proposal.targets.some(
            (target) =>
              target.desiredTokenId === row.tokenId &&
              target.confirmedPreviousCanonicalMicrochip === row.microchip &&
              target.evidence.some(
                (e) =>
                  e.kind === "physical_scan" ||
                  e.kind === "registration_document",
              ),
          ),
      )
    )
      blockers.add("IDENTITY_EVIDENCE_REVIEW_REQUIRED");
    const chainReferences = inventory
      .filter((row) => row.parentReferences?.some((chip) => chips.has(chip)))
      .map((row) => ({
        kind: "ChainGenealogy",
        key: row.tokenId,
        chips: row.parentReferences ?? [],
        digest: payloadHash(row),
      }));
    const references = [
      ...database.references.filter((ref) =>
        ref.chips.some((chip) => chips.has(chip)),
      ),
      ...chainReferences,
    ];
    // A structural FK cascade is not evidence that inventory/certificate/history belongs to a cow.
    const keyChanges = proposal.targets.some(
      (t) => t.sourceMicrochip !== t.desiredMicrochip,
    );
    if (
      keyChanges &&
      chainReferences.some((ref) => !desiredTokens.has(ref.key))
    )
      blockers.add("EXPANDED_SCOPE_REQUIRED");
    if (keyChanges && references.some((ref) => ref.kind !== "Reward"))
      blockers.add("REFERENCE_OWNERSHIP_REVIEW_REQUIRED");
    const prefix = `${pin.chainId}:${pin.nft.toLowerCase()}:`;
    const reservationKeys = [
      ...[...chips].map((chip) => `${prefix}chip:${chip}`),
      ...[...tokens].map((token) => `${prefix}token:${token}`),
    ].sort();
    if (database.reservations.some((r) => reservationKeys.includes(r.key)))
      blockers.add("ACTIVE_OPERATION");
    const baselines = await this.ports.tokens(
      pin,
      [...tokens].filter((id) =>
        inventory.some((row) => row.tokenId === id && row.initialized),
      ),
    );
    if (
      baselines.some(
        (token) =>
          inventory.find((row) => row.tokenId === token.tokenId)?.microchip !==
          token.microchip,
      )
    )
      fail("REPAIR_BASELINE_CHANGED");
    if (
      baselines.some(
        (token) =>
          desiredTokens.has(token.tokenId) && /^0x0{40}$/i.test(token.owner),
      )
    )
      blockers.add("NFT_OWNER_ZERO");
    const assets = await this.ports.assets(
      baselines.filter((token) => desiredTokens.has(token.tokenId)),
      selected,
      proposal,
    );
    for (const blocker of assets.blockers) blockers.add(blocker);
    const changes = proposal.targets.map((target) => {
      const before = selected.find(
        (row) => row.microchip === target.sourceMicrochip,
      );
      const chain = baselines.find(
        (row) => row.tokenId === target.desiredTokenId,
      );
      return {
        ...target,
        database: before ?? null,
        chain: chain ?? null,
        databaseChange: before
          ? before.microchip !== target.desiredMicrochip ||
            before.tokenId !== target.desiredTokenId
          : false,
        chainChange: chain
          ? chain.microchip !== target.desiredMicrochip ||
            aliases.find((alias) => alias.microchip === target.desiredMicrochip)
              ?.tokenId !== target.desiredTokenId
          : false,
      };
    });
    if (changes.every((t) => !t.databaseChange && !t.chainChange))
      blockers.add("NO_IDENTITY_CHANGE");
    // Recheck after DB and target reads; expiry/code/reorg changes cannot produce a valid preview.
    this.pin(scan);
    await this.ports.assertCurrent(pin);
    const manifest = {
      version: 1,
      authority: "preview_only" as const,
      requiresExecutionRevalidation: true,
      executionReadiness: "blocked_pending_fresh_execution_approval" as const,
      assets,
      pin,
      databaseReadAt: database.readAt,
      databaseDigest: payloadHash({
        rows: database.rows,
        references: database.references,
        reservations: database.reservations,
        catalogDigest: database.catalogDigest,
      }),
      catalogDigest: database.catalogDigest,
      proposal,
      changes,
      closure: {
        database: closureRows.map((row) => ({
          microchip: row.microchip,
          tokenId: row.tokenId,
        })),
        canonical,
        aliases,
      },
      references,
      reservationKeys,
      observedChainBaselines: baselines,
      affectedTargets: [...desiredTokens].sort(),
      observedTokens: [...tokens].sort(),
      coverage: {
        canonical: "verified_current_NFT_historical_mint_range_at_pinned_block",
        historicalManagerDomains: "unknown_past_domains_not_enumerable",
        range: { first: "1", last: String(pin.scanCount) },
        count: inventory.length,
        inventoryDigest: payloadHash(inventory),
        aliases: "known_only_non_enumerable",
      },
      effects: {
        chainBatchAtomicOnly: true,
        databaseTransactionSeparate: true,
        nativeCreatedAtResets: changes
          .filter((t) => t.chainChange)
          .map((t) => t.desiredTokenId),
        nativeUpdatedAtResets: changes
          .filter((t) => t.chainChange)
          .map((t) => t.desiredTokenId),
        metadataCounterIncrement: changes.filter((t) => t.chainChange).length,
        dnaClearedThenRestored: changes
          .filter((t) => t.chainChange && t.chain?.dna)
          .map((t) => t.desiredTokenId),
        nftUriChanges: assets.tokens
          .filter((token) => token.after?.expectedUriSetterCount === 1)
          .map((token) => ({
            tokenId: token.tokenId,
            strategy: token.after!.uriStrategy,
            jsonHash: token.after!.jsonHash,
            pathBinding: token.after!.immutablePathBinding,
          })),
        nftNativeTimestampsReset: assets.tokens
          .filter((token) => token.after?.expectedUriSetterCount === 1)
          .map((token) => token.tokenId),
        oldAliasesRemain: true,
        noClaimAllHistoricalAliasesRemoved: true,
        preserves: [
          "business_fields",
          "parents",
          "NFT_owner",
          ...(assets.tokens.every(
            (token) => token.after?.expectedUriSetterCount === 0,
          )
            ? ["token_URI"]
            : []),
          "approvals",
        ],
      },
    };
    return {
      status: blockers.size
        ? ("needs_review" as const)
        : ("ready_for_operator_review" as const),
      blockers: [...blockers].sort(),
      digest: payloadHash(manifest),
      manifest,
    };
  }
}
