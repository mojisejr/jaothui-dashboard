import { type Abi } from "viem";
import { type PrismaClient } from "@prisma/client";
import { abi as managerAbi } from "~/server/blockchain/metadata-maneger/abi";
import { abi as nftAbi } from "~/server/blockchain/nft/abi";
import { type RawMetadata } from "~/interfaces/i-metadata";
import { managerManifest, type ManagerManifest } from "../field-policy";
import { type CreateChain } from "../create/workflow";
import { type AssetStorage, contentHash } from "../create/storage";
import {
  IntegrityError,
  payloadHash,
  asJson,
  stableJson,
} from "../operations/hash";
import { serializedValue } from "../operations/loopback";
import { receiptEvidence } from "../operations/receipt-evidence";
import { type PostgresOperationRepository } from "../operations/postgres";
import {
  type Operation,
  type Step,
  type StepSpec,
  type Plan,
  type Claim,
  type PublicationProof,
  type Json,
} from "../operations/types";
import {
  readRepairDatabaseSnapshot,
  projectedRepairRow,
  repairJson,
} from "./db-projection";
import { verifyApproval } from "./approval";
import { type RepairIntent } from "./execution-contract";
export function repairIntent(op: Operation): RepairIntent {
  if (op.intent.kind !== "identity_repair")
    throw new IntegrityError("REPAIR_MANIFEST_INVALID");
  return op.intent;
}
export class RepairWorkflow {
  constructor(
    readonly db: PrismaClient,
    readonly repository: PostgresOperationRepository,
    readonly chain: CreateChain,
    readonly storage: AssetStorage | null,
    readonly secret: string,
    readonly revisionGuard?: (op: Operation, steps: Step[]) => Promise<void>,
    readonly publicStorage?: AssetStorage,
  ) {}
  private read(name: string, args: unknown[], nft = false, block?: bigint) {
    return this.chain.read(
      nft ? this.chain.domain.nft : this.chain.domain.manager,
      (nft ? nftAbi : managerAbi) as Abi,
      name,
      args,
      block,
    );
  }
  private batchTokens(op: Operation): string[] {
    const m = repairIntent(op).manifest;
    return Array.isArray(m.coverage.batchTokens)
      ? (m.coverage.batchTokens as string[])
      : m.chain.tokens.map((t) => t.tokenId);
  }
  private tokenStep(op: Operation, step: Step, kind: string, token: string) {
    return (
      step.kind === kind &&
      repairIntent(op).manifest.chain.steps[step.ordinal]?.tokenId === token
    );
  }
  private native(
    op: Operation,
    step: Step | undefined,
    field: string,
    token: string,
  ) {
    if (!step?.receipt) return null;
    const evidence = receiptEvidence(op, step, step.receipt);
    const index = step.expected.effects.findIndex(
      (e) =>
        e.kind === "read" && e.functionName === field && e.args[0] === token,
    );
    const detail = evidence?.effects[index];
    if (
      !evidence ||
      !detail ||
      typeof detail.nativeCreatedAt !== "string" ||
      typeof detail.nativeUpdatedAt !== "string"
    )
      throw new IntegrityError("MISSING_NATIVE_RECEIPT_EVIDENCE");
    return {
      createdAt: detail.nativeCreatedAt,
      updatedAt: detail.nativeUpdatedAt,
      timestamp: evidence.binding.blockTimestamp,
    };
  }
  private expected(op: Operation, steps: Step[], tokenId: string) {
    const t = repairIntent(op).manifest.chain.tokens.find(
      (t) => t.tokenId === tokenId,
    )!;
    const batch =
      steps.some((s) => s.kind === "batch") &&
      this.batchTokens(op).includes(tokenId);
    const base = (batch ? t.desired : t.before) as unknown as ManagerManifest;
    return {
      ...base,
      certify: {
        ...base.certify,
        ...(batch &&
        !steps.some((s) => this.tokenStep(op, s, "dna_restore", tokenId))
          ? { dna: "" }
          : {}),
      },
    };
  }
  async guard(op: Operation, steps: Step[], projected = false) {
    const intent = repairIntent(op),
      m = intent.manifest;
    verifyApproval(op.owner, intent, this.secret);
    if (!this.revisionGuard)
      throw new IntegrityError("REPAIR_BASELINE_CHANGED");
    await this.revisionGuard(op, steps);
    if (!this.chain.block) throw new IntegrityError("CANONICAL_BLOCK_REQUIRED");
    const block = await this.chain.block();
    const appliedBatch = steps.find((s) => s.kind === "batch");
    for (const t of m.chain.tokens) {
      const id = BigInt(t.tokenId),
        batch = this.batchTokens(op).includes(t.tokenId)
          ? appliedBatch
          : undefined,
        uri = steps.find((s) => this.tokenStep(op, s, "uri", t.tokenId));
      const [raw, owner, approved, approvals, nftRecord, count] =
        await Promise.all([
          this.read(
            "getMetadata",
            [id],
            false,
            block.number,
          ) as Promise<RawMetadata>,
          this.read("ownerOf", [id], true, block.number),
          this.read("getApproved", [id], true, block.number),
          this.read("getApprovedByTokenId", [id, false], false, block.number),
          this.read("tokenIdToUri", [id], true, block.number),
          this.read("totalMetadata", [], false, block.number),
        ]);
      if (
        payloadHash(managerManifest(raw)) !==
          payloadHash(this.expected(op, steps, t.tokenId)) ||
        String(owner).toLowerCase() !== t.owner.toLowerCase() ||
        String(approved).toLowerCase() !== t.nftApproved.toLowerCase() ||
        payloadHash(repairJson(approvals)) !==
          payloadHash(t.managerApprovals) ||
        BigInt(String(count)) !==
          BigInt(m.chain.metadataCounter) +
            (appliedBatch ? BigInt(this.batchTokens(op).length) : 0n)
      )
        throw new IntegrityError("REPAIR_BASELINE_CHANGED");
      const native = this.native(op, batch, "getMetadata", t.tokenId);
      if (batch && !native)
        throw new IntegrityError("MISSING_NATIVE_RECEIPT_EVIDENCE");
      if (
        raw.createdAt.toString() !==
          (native?.createdAt ?? t.native.createdAt) ||
        raw.updatedAt.toString() !==
          (native?.updatedAt ?? t.native.updatedAt) ||
        (native &&
          (native.createdAt !== native.timestamp ||
            native.updatedAt !== native.timestamp))
      )
        throw new IntegrityError("REPAIR_BASELINE_CHANGED");
      const record = repairJson(nftRecord) as Json[],
        prior = t.nftRecord as Json[],
        asset = m.assets.find((a) => a.tokenId === t.tokenId)!;
      const uriNative = this.native(op, uri, "tokenIdToUri", t.tokenId);
      if (uri && !uriNative)
        throw new IntegrityError("MISSING_NATIVE_RECEIPT_EVIDENCE");
      const expectedRecord = uri
        ? [
            asset.image.url,
            asset.json.url,
            uriNative!.createdAt,
            uriNative!.updatedAt,
          ]
        : prior;
      if (
        payloadHash(record) !== payloadHash(expectedRecord) ||
        (uriNative &&
          (uriNative.createdAt !== uriNative.timestamp ||
            uriNative.updatedAt !== uriNative.timestamp))
      )
        throw new IntegrityError("REPAIR_BASELINE_CHANGED");
    }
    for (const alias of m.chain.aliases) {
      const target = m.targets.find(
        (t) =>
          t.desiredMicrochip === alias.microchip &&
          this.batchTokens(op).includes(t.desiredTokenId),
      );
      const expected =
        appliedBatch && target ? target.desiredTokenId : alias.tokenId;
      if (
        String(
          await this.read(
            "microchipToTokenId",
            [alias.microchip],
            false,
            block.number,
          ),
        ) !== expected
      )
        throw new IntegrityError("REPAIR_BASELINE_CHANGED");
    }
    if (!this.storage) throw new IntegrityError("STORAGE_ORIGIN_UNAVAILABLE");
    for (const asset of m.assets) {
      for (const source of [asset.sourceImage, asset.sourceJson]) {
        const value = await this.storage.get(source.key),
          hash = value ? contentHash(value) : null;
        const alias = asset.aliases.find((a) => a.key === source.key);
        if (
          hash !== source.hash &&
          !(
            steps.length === m.chain.steps.length &&
            alias &&
            hash === alias.afterHash
          )
        )
          throw new IntegrityError("ASSET_BASELINE_CHANGED");
      }
      for (const alias of asset.aliases) {
        const value = await this.storage.get(alias.key),
          hash = value ? contentHash(value) : null;
        if (
          hash !== alias.beforeHash &&
          !(steps.length === m.chain.steps.length && hash === alias.afterHash)
        )
          throw new IntegrityError("ASSET_BASELINE_CHANGED");
      }
    }
    const snapshot = await this.db.$transaction((tx) =>
      readRepairDatabaseSnapshot(tx),
    );
    if (snapshot.catalogDigest !== m.database.catalogDigest)
      throw new IntegrityError("REPAIR_BASELINE_CHANGED");
    const rows = snapshot.rows.filter(
      (r) =>
        m.reservationChips.includes(r.microchip) ||
        m.reservationTokens.includes(r.tokenId),
    );
    const expectedRows = m.database.targets.map((target) =>
      projected ? projectedRepairRow(target) : target.baseline,
    );
    if (
      payloadHash(
        rows
          .map((r) => r.baseline)
          .sort((a, b) => stableJson(a).localeCompare(stableJson(b))),
      ) !==
      payloadHash(
        expectedRows.sort((a, b) => stableJson(a).localeCompare(stableJson(b))),
      )
    )
      throw new IntegrityError("REPAIR_BASELINE_CHANGED");
    if (
      !projected &&
      payloadHash(
        snapshot.references.filter((r) =>
          r.chips.some((c) => m.reservationChips.includes(c)),
        ),
      ) !== payloadHash(m.database.references)
    )
      throw new IntegrityError("REPAIR_BASELINE_CHANGED");
    const prefix = `${m.domain.chainId}:${m.domain.nft.toLowerCase()}:`;
    for (const key of [
      ...m.reservationChips.map((c) => `${prefix}chip:${c}`),
      ...m.reservationTokens.map((t) => `${prefix}token:${t}`),
    ])
      if (
        !snapshot.reservations.some(
          (r) => r.key === key && r.operationId === op.id,
        )
      )
        throw new IntegrityError("REPAIR_RESERVATION_LOST");
    if ((await this.chain.block(block.number)).hash !== block.hash)
      throw new IntegrityError("REPAIR_BASELINE_CHANGED");
  }
  async prepare(op: Operation): Promise<Plan> {
    const intent = repairIntent(op),
      m = intent.manifest;
    if (Date.now() > m.expiresAt)
      throw new IntegrityError("REPAIR_BASELINE_CHANGED");
    await this.guard(op, []);
    if (m.chain.steps.some((s) => s.kind !== "uri")) {
      const role = await this.read("ADMIN", []);
      if (!(await this.read("hasRole", [role, this.chain.sender])))
        throw new IntegrityError("MANAGER_ADMIN_PERMISSION_REQUIRED");
    }
    if (
      m.chain.steps.some((s) => s.kind === "uri") &&
      String(await this.read("owner", [], true)).toLowerCase() !==
        this.chain.sender.toLowerCase()
    )
      throw new IntegrityError("NFT_OWNER_PERMISSION_REQUIRED");
    return {
      domain: op.domain,
      sender: this.chain.sender.toLowerCase(),
      confirmations: this.chain.confirmations ?? 3,
      maxFeeWei: m.fees.perStep[0]!.maxFeeWei,
      ...(this.chain.executionInstance
        ? { executionInstance: this.chain.executionInstance }
        : {}),
      context: {
        manifestHash: intent.manifestHash,
        approvalFingerprint: intent.approvalFingerprint,
      },
    };
  }
  private async publish(op: Operation) {
    const m = repairIntent(op).manifest;
    for (const a of m.assets.filter((a) => a.publish)) {
      if (!this.storage) throw new IntegrityError("STORAGE_ORIGIN_UNAVAILABLE");
      const existingImage = await this.storage.get(a.image.key),
        existingJson = await this.storage.get(a.json.key);
      if (
        existingImage &&
        existingJson &&
        contentHash(existingImage) === a.image.hash &&
        contentHash(existingJson) === a.json.hash
      )
        continue;
      const source = await this.storage.get(a.sourceImage.key),
        sourceJson = await this.storage.get(a.sourceJson.key);
      if (
        !source ||
        contentHash(source) !== a.sourceImage.hash ||
        !sourceJson ||
        contentHash(sourceJson) !== a.sourceJson.hash
      )
        throw new IntegrityError("ASSET_BASELINE_CHANGED");
      const bytes = Buffer.from(stableJson(a.json.body));
      if (
        contentHash(bytes) !== a.json.hash ||
        this.storage.publicUrl(a.image.key) !== a.image.url ||
        this.storage.publicUrl(a.json.key) !== a.json.url
      )
        throw new IntegrityError("REPAIR_MANIFEST_INVALID");
      await this.storage.putImmutable(a.image.key, source, "image/jpeg");
      await this.storage.putImmutable(a.json.key, bytes, "application/json");
    }
  }
  async nextStep(op: Operation, steps: Step[]): Promise<StepSpec | null> {
    await this.guard(op, steps);
    const m = repairIntent(op).manifest,
      spec = m.chain.steps[steps.length];
    if (!spec) return null;
    if (spec.kind === "uri") await this.publish(op);
    const future = [
      ...steps,
      { kind: spec.kind, ordinal: steps.length } as Step,
    ];
    const read = (
      name: string,
      args: Json[],
      expected: Json,
      nft = false,
      projection?: "manager-manifest" | "nft-uri",
    ): StepSpec["call"]["effects"][number] => ({
      kind: "read",
      contract: nft ? m.domain.nft : m.domain.manager,
      functionName: name,
      args,
      expected: serializedValue(expected),
      abi: asJson(
        (nft ? nftAbi : managerAbi).filter(
          (item) => "name" in item && item.name === name,
        ),
      ) as Json[],
      ...(projection ? { projection } : {}),
    });
    const effects = m.chain.tokens.flatMap((token) => [
      read(
        "getMetadata",
        [token.tokenId],
        asJson(this.expected(op, future, token.tokenId)),
        false,
        "manager-manifest",
      ),
      read("ownerOf", [token.tokenId], token.owner, true),
      read("getApproved", [token.tokenId], token.nftApproved, true),
      read(
        "getApprovedByTokenId",
        [token.tokenId, false],
        token.managerApprovals,
      ),
    ]);
    if (spec.kind === "uri") {
      const asset = m.assets.find((a) => a.tokenId === spec.tokenId)!;
      effects.unshift(
        read(
          "tokenIdToUri",
          [spec.tokenId!],
          [asset.image.url, asset.json.url],
          true,
          "nft-uri",
        ),
      );
    }
    return {
      kind: spec.kind,
      call: { to: spec.to, data: spec.data, value: "0", effects },
    };
  }
  async project(
    op: Operation,
    steps: Step[],
    claim: Claim,
  ): Promise<PublicationProof> {
    // A resumed projection may already have committed; the repository verifies its durable projection event.
    try {
      await this.guard(op, steps);
    } catch (error) {
      if (
        !(error instanceof IntegrityError) ||
        error.code !== "REPAIR_BASELINE_CHANGED"
      )
        throw error;
      await this.guard(op, steps, true);
    }
    await this.publish(op);
    for (const a of repairIntent(op).manifest.assets.filter((a) => a.publish)) {
      if (!this.storage?.replaceAlias)
        throw new IntegrityError("STORAGE_ORIGIN_UNAVAILABLE");
      for (const alias of a.aliases) {
        const bytes = await this.storage.get(
          alias.mime === "image/jpeg" ? a.image.key : a.json.key,
        );
        if (!bytes || contentHash(bytes) !== alias.afterHash)
          throw new IntegrityError("ASSET_BASELINE_CHANGED");
        await this.storage.replaceAlias(
          alias.key,
          bytes,
          alias.mime,
          alias.beforeHash,
        );
      }
    }
    const proof = await this.repository.projectRepairDatabase(claim);
    return {
      database: proof.database,
      storage: payloadHash(repairIntent(op).manifest.assets),
      manifest: repairIntent(op).manifestHash,
    };
  }
  async verifyPublication(
    op: Operation,
    steps: Step[],
    proof: PublicationProof,
  ) {
    await this.guard(op, steps, true);
    for (const a of repairIntent(op).manifest.assets.filter((a) => a.publish)) {
      if (!this.storage) return false;
      const image = await this.storage.get(a.image.key),
        json = await this.storage.get(a.json.key);
      if (
        !image ||
        !json ||
        contentHash(image) !== a.image.hash ||
        contentHash(json) !== a.json.hash
      )
        return false;
    }
    if (!this.publicStorage)
      throw new IntegrityError("STORAGE_ORIGIN_UNAVAILABLE");
    for (const asset of repairIntent(op).manifest.assets)
      for (const entry of [
        { key: asset.image.key, hash: asset.image.hash },
        { key: asset.json.key, hash: asset.json.hash },
        ...asset.aliases.map((a) => ({ key: a.key, hash: a.afterHash })),
      ]) {
        let value: Buffer | null;
        try {
          value = await this.publicStorage.get(entry.key);
        } catch {
          throw Error("PUBLIC_ASSET_READBACK_PENDING");
        }
        if (!value || contentHash(value) !== entry.hash)
          throw Error("PUBLIC_ASSET_READBACK_PENDING");
      }
    return (
      proof.manifest === repairIntent(op).manifestHash &&
      proof.storage === payloadHash(repairIntent(op).manifest.assets)
    );
  }
}
