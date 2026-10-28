import { nativeReceiptEvidence } from "../operations/receipt-evidence";
import {
  executionEnvironment,
  transactionLink,
} from "../operations/environment";
import { normalizeBuffaloImage } from "../image-preflight";
import { type PrismaClient, type Pedigree, type Prisma } from "@prisma/client";
import { encodeFunctionData, type Abi } from "viem";
import { abi as nftAbi } from "~/server/blockchain/nft/abi";
import { abi as managerAbi } from "~/server/blockchain/metadata-maneger/abi";
import { type RawMetadata } from "~/interfaces/i-metadata";
import { readBuffaloMetadata } from "../read";
import {
  chainSnapshot,
  managerManifest,
  patchChainBaseline,
  type ManagerManifest,
  databaseSnapshot,
  businessDifferences,
  fieldCapabilities,
  type BusinessSnapshot,
  type BusinessField,
  absent,
} from "../field-policy";
import { calendarToDate } from "../calendar";
import { asJson, IntegrityError, payloadHash } from "../operations/hash";
import { serializedValue } from "../operations/loopback";
import {
  type Operation,
  type Plan,
  type Step,
  type StepSpec,
  type Json,
  type PublicationProof,
} from "../operations/types";
import { type OperationEngine } from "../operations/engine";
import { type DraftStore } from "../create/drafts";
import { type CreateChain } from "../create/workflow";
import {
  type AssetStorage,
  operationPrefix,
  contentHash,
  ownedAssetKey,
} from "../create/storage";
import {
  editInputSchema,
  editPatchSchema,
  revisionOf,
  databaseManifest,
  type DatabaseManifest,
  type EditInput,
  type EditPatch,
} from "./contract";

type Invariants = {
  owner: Json;
  approved: Json;
  approvals: Json;
  nativeManagerCreated: string;
  nativeManagerUpdated: string;
  totalMetadata: string;
  nftRecord: Json;
};
type Context = {
  baseline: BusinessSnapshot;
  desired: BusinessSnapshot;
  rawBaseline: ManagerManifest;
  rawDesired: ManagerManifest;
  rawDatabase: DatabaseManifest;
  database: BusinessSnapshot;
  dbRevision: string;
  createdAt: string;
  updatedAt: string;
  issuedAt: string;
  prefix: string;
  imageHash: string;
  jsonHash: string;
  finalUri: string;
  nftImage: string;
  aliasImageHash: string | null;
  aliasJsonHash: string | null;
  invariants: Invariants;
  batch: boolean;
  publicationTime: string;
  legacyDifferences: Json;
};
const edit = (op: Operation) => {
  if (op.intent.kind !== "edit")
    throw new IntegrityError("EDIT_OPERATION_REQUIRED");
  return op.intent;
};
const context = (op: Operation) => {
  if (!op.plan) throw new IntegrityError("NO_APPROVED_PLAN");
  return op.plan.context as unknown as Context;
};
export class BuffaloEditWorkflow {
  constructor(
    readonly db: PrismaClient,
    readonly drafts: DraftStore,
    readonly storage: AssetStorage,
    readonly chain: CreateChain,
    readonly faults: {
      projectionFailures?: number;
      pauseAfterBatch?: boolean;
    } = {},
  ) {}
  private read(
    name: string,
    args: unknown[] = [],
    nft = false,
    block?: bigint,
  ) {
    return this.chain.read(
      nft ? this.chain.domain.nft : this.chain.domain.manager,
      (nft ? nftAbi : managerAbi) as Abi,
      name,
      args,
      block,
    );
  }
  private async row(chip: string) {
    const row = await this.db.pedigree.findUnique({
      where: { microchip: chip },
    });
    if (!row) throw new IntegrityError("COW_NOT_FOUND");
    return row;
  }
  async details(chip: string) {
    let displayedRow: Pedigree | null = null;
    const result = await readBuffaloMetadata(chip, this.chain.domain, {
      imageForCow: (row) =>
        this.storage.publicUrl(`buffalo/${row.tokenId.toString()}.jpg`),
      findCow: async (c) => {
        displayedRow = await this.db.pedigree.findUnique({
          where: { microchip: c },
        });
        return displayedRow;
      },
      readChain: async (row) => ({
        domain: this.chain.domain,
        tokenId: row.tokenId,
        mappedTokenId: (await this.read("microchipToTokenId", [
          row.microchip,
        ])) as bigint,
        nftExists: (await this.read("exists", [row.tokenId], true)) as boolean,
        initialized: (await this.read("initialized", [row.tokenId])) as boolean,
        metadata: (await this.read("getMetadata", [
          row.tokenId,
        ])) as RawMetadata,
      }),
    });
    if (!result) return null;
    return { ...result, revision: revisionOf(displayedRow!) };
  }
  async create(owner: string, input: EditInput) {
    const parsed = editInputSchema.parse(input);
    const prefix = operationPrefix(owner, parsed.key);
    const patch = parsed.upload
      ? {
          ...parsed.patch,
          [parsed.upload]: this.storage.publicUrl(
            `${prefix}/${parsed.upload === "image" ? "source" : "dna"}.jpg`,
          ),
        }
      : parsed.patch;
    if (
      parsed.upload &&
      !Object.prototype.hasOwnProperty.call(parsed.patch, parsed.upload)
    )
      throw new IntegrityError("UPLOAD_FIELD_MISMATCH");
    const previous = await this.drafts.byKey(owner, parsed.key);
    if (!previous) {
      const row = await this.row(parsed.microchip);
      if (
        row.tokenId.toString() !== parsed.tokenId ||
        revisionOf(row) !== parsed.expectedRevision
      )
        throw new IntegrityError("STALE_EDIT_RECORD");
    }
    return this.drafts.operations.create(
      owner,
      parsed.key,
      {
        kind: "edit",
        microchip: parsed.microchip,
        tokenId: parsed.tokenId,
        expectedRevision: parsed.expectedRevision,
        patch,
      },
      this.chain.domain,
    );
  }
  async upload(
    id: string,
    owner: string,
    version: number,
    raw: Buffer,
    mime: string,
  ) {
    const bytes = await normalizeBuffaloImage(raw, mime);
    await this.drafts.withDraft(id, owner, version, async (claim, op) => {
      if (op.state !== "DRAFT" || op.plan)
        throw new IntegrityError("INTENT_FROZEN");
      const intent = edit(op),
        key = (await this.drafts.key(id, owner)).idempotency_key,
        prefix = operationPrefix(owner, key);
      const field = intent.patch.image ? "image" : "dna",
        path = `${prefix}/${field === "image" ? "source" : "dna"}.jpg`;
      if (intent.patch[field] !== this.storage.publicUrl(path))
        throw new IntegrityError("ASSET_BINDING_CONFLICT");
      await this.storage.putImmutable(path, bytes, "image/jpeg");
      await this.drafts.image(claim, version, {
        uploadHash: contentHash(bytes),
        bytes: bytes.length,
        field,
      });
    });
  }
  private async identity(row: Pedigree, block?: bigint) {
    const token = row.tokenId;
    if ((await this.db.pedigree.count({ where: { tokenId: token } })) !== 1)
      throw new IntegrityError("AMBIGUOUS_DB_TOKEN");
    const raw = (await this.read(
      "getMetadata",
      [token],
      false,
      block,
    )) as RawMetadata;
    if (
      (await this.read("microchipToTokenId", [row.microchip], false, block)) !==
        token ||
      raw.certify.microchip !== row.microchip ||
      !(await this.read("initialized", [token], false, block)) ||
      !(await this.read("exists", [token], true, block))
    )
      throw new IntegrityError("IDENTITY_CONFLICT");
    return raw;
  }
  private async invariants(
    token: bigint,
    raw: RawMetadata,
    block?: bigint,
  ): Promise<Invariants> {
    const owner = await this.read("ownerOf", [token], true, block),
      approved = await this.read("getApproved", [token], true, block),
      approvals = await this.read(
        "getApprovedByTokenId",
        [token, false],
        false,
        block,
      ),
      total = await this.read("totalMetadata", [], false, block),
      nftRecord = await this.read("tokenIdToUri", [token], true, block);
    return {
      owner: serializedValue(owner),
      approved: serializedValue(approved),
      approvals: serializedValue(approvals),
      totalMetadata: String(total),
      nativeManagerCreated: raw.createdAt.toString(),
      nativeManagerUpdated: raw.updatedAt.toString(),
      nftRecord: serializedValue(nftRecord),
    };
  }
  private async permission(block?: bigint) {
    if (
      String(await this.read("owner", [], true, block)).toLowerCase() !==
      this.chain.sender.toLowerCase()
    )
      throw new IntegrityError("NFT_OWNER_PERMISSION_REQUIRED");
    const role = await this.read("ADMIN", [], false, block);
    if (!(await this.read("hasRole", [role, this.chain.sender], false, block)))
      throw new IntegrityError("MANAGER_ADMIN_PERMISSION_REQUIRED");
  }
  private async available(chip: string, row: Pedigree) {
    if (chip === row.microchip) return;
    if (
      (await this.db.pedigree.findUnique({ where: { microchip: chip } })) !==
        null ||
      (await this.read("microchipToTokenId", [chip])) !== 0n
    )
      throw new IntegrityError("MICROCHIP_ALREADY_BOUND");
    if (
      await this.db.pedigree.count({
        where: {
          OR: [{ fatherId: row.microchip }, { motherId: row.microchip }],
        },
      })
    )
      throw new IntegrityError(
        "MICROCHIP_HAS_CHILD_REFERENCES_REVIEW_REQUIRED",
      );
  }
  private async parent(chip: string, row: Pedigree) {
    if (!absent(chip)) return;
    if (chip === row.microchip)
      throw new IntegrityError("SELF_PARENT_FORBIDDEN");
    await this.identity(await this.row(chip));
  }
  private async imageBytes(uri: string) {
    const bytes = await this.storage.get(ownedAssetKey(this.storage, uri));
    if (!bytes) throw new IntegrityError("IMAGE_ORIGIN_UNAVAILABLE");
    return bytes;
  }
  private json(
    original: Buffer,
    patch: EditPatch,
    token: string,
    chip: string,
  ) {
    let json: Record<string, Json>;
    try {
      json = JSON.parse(original.toString()) as Record<string, Json>;
    } catch {
      throw new IntegrityError("NFT_JSON_REVIEW_REQUIRED");
    }
    if (
      !json ||
      typeof json !== "object" ||
      Array.isArray(json) ||
      json.edition !== Number(token) ||
      typeof json.name !== "string" ||
      !json.name.endsWith(` #${chip}`) ||
      !Array.isArray(json.attributes)
    )
      throw new IntegrityError("NFT_JSON_IDENTITY_CONFLICT");
    const traits = new Map<string, { trait_type: string; value: Json }>();
    for (const attribute of json.attributes) {
      if (
        !attribute ||
        Array.isArray(attribute) ||
        typeof attribute !== "object" ||
        typeof attribute.trait_type !== "string" ||
        traits.has(attribute.trait_type)
      )
        throw new IntegrityError("NFT_JSON_TRAIT_CONFLICT");
      traits.set(
        attribute.trait_type,
        attribute as { trait_type: string; value: Json },
      );
    }
    if (traits.get("Microchip")?.value !== chip)
      throw new IntegrityError("NFT_JSON_IDENTITY_CONFLICT");
    const names: Partial<Record<BusinessField, string>> = {
      sex: "Sex",
      microchip: "Microchip",
      birthday: "Birthday",
      color: "Color",
      origin: "Origin",
      height: "Height",
      rarity: "Rarity",
      certNo: "CertNo",
      detail: "Detail",
      fatherId: "FatherId",
      motherId: "MotherId",
      dna: "DNA",
    };
    for (const [field, value] of Object.entries(patch) as [
      BusinessField,
      string,
    ][]) {
      const name = names[field];
      if (name) {
        const day = value.split("-");
        const rendered =
          field === "birthday" ? `${day[1]}/${day[2]}/${day[0]}` : value;
        const existing = traits.get(name);
        if (existing) existing.value = rendered;
        else json.attributes.push({ trait_type: name, value: rendered });
      }
    }
    if (patch.name !== undefined || patch.microchip !== undefined)
      json.name = `${patch.name ?? json.name.slice(0, -` #${chip}`.length)} #${patch.microchip ?? chip}`;
    if (patch.image !== undefined) json.image = patch.image;
    return Buffer.from(JSON.stringify(json));
  }
  async prepare(op: Operation): Promise<Plan> {
    const intent = edit(op),
      patch = editPatchSchema.parse(intent.patch),
      row = await this.row(intent.microchip);
    if (
      row.tokenId.toString() !== intent.tokenId ||
      !intent.expectedRevision ||
      revisionOf(row) !== intent.expectedRevision
    )
      throw new IntegrityError("STALE_EDIT_RECORD");
    await this.permission();
    if (!this.chain.block)
      throw new IntegrityError("CANONICAL_READ_PORT_REQUIRED");
    const block = await this.chain.block(),
      raw = await this.identity(row, block.number),
      baseline = chainSnapshot(raw),
      invariants = await this.invariants(row.tokenId, raw, block.number);
    if ((await this.chain.block(block.number)).hash !== block.hash)
      throw new IntegrityError("BASELINE_READ_REORG");
    if (patch.microchip) await this.available(patch.microchip, row);
    for (const field of ["fatherId", "motherId"] as const)
      if (patch[field] !== undefined) await this.parent(patch[field], row);
    const key = (await this.drafts.key(op.id, op.owner)).idempotency_key,
      prefix = operationPrefix(op.owner, key);
    if (
      patch.image !== undefined &&
      patch.image !== this.storage.publicUrl(`${prefix}/source.jpg`)
    )
      throw new IntegrityError("IMAGE_UPLOAD_BINDING_REQUIRED");
    for (const field of ["image", "dna"] as const)
      if (
        patch[field] ===
        this.storage.publicUrl(
          `${prefix}/${field === "image" ? "source" : "dna"}.jpg`,
        )
      ) {
        const path = `${prefix}/${field === "image" ? "source" : "dna"}.jpg`,
          bytes = await this.storage.get(path);
        if (
          !bytes ||
          !op.result ||
          typeof op.result !== "object" ||
          Array.isArray(op.result) ||
          op.result.uploadHash !== contentHash(bytes)
        )
          throw new IntegrityError("UPLOAD_NOT_READY");
      }
    const desired = { ...baseline, ...patch };
    const nft = invariants.nftRecord as Json[];
    const nftImage = patch.image ?? String(nft[0]);
    const image = await this.imageBytes(nftImage);
    await this.storage.putImmutable(
      `${prefix}/published-image.jpg`,
      image,
      "image/jpeg",
    );
    const originalJson = await this.storage.get(
      ownedAssetKey(this.storage, String(nft[1])),
    );
    if (!originalJson) throw new IntegrityError("NFT_JSON_ORIGIN_UNAVAILABLE");
    const parsedJson = JSON.parse(originalJson.toString()) as {
      image?: string;
    };
    if (
      !parsedJson.image ||
      contentHash(await this.imageBytes(parsedJson.image)) !==
        contentHash(await this.imageBytes(String(nft[0])))
    )
      throw new IntegrityError("NFT_JSON_IMAGE_BINDING_CONFLICT");
    await this.storage.putImmutable(
      `${prefix}/previous-nft.json`,
      originalJson,
      "application/json",
    );
    const bytes = this.json(
      originalJson,
      patch,
      intent.tokenId,
      intent.microchip,
    );
    await this.storage.putImmutable(
      `${prefix}/final.json`,
      bytes,
      "application/json",
    );
    const beforeImage = await this.storage.get(`buffalo/${intent.tokenId}.jpg`),
      beforeJson = await this.storage.get(`json/${intent.tokenId}.json`);
    if (
      !patch.image &&
      beforeImage &&
      contentHash(beforeImage) !== contentHash(image)
    )
      throw new IntegrityError("IMAGE_ALIAS_BINDING_REVIEW_REQUIRED");
    if (beforeImage)
      await this.storage.putImmutable(
        `${prefix}/previous-image.jpg`,
        beforeImage,
        "image/jpeg",
      );
    if (beforeJson)
      await this.storage.putImmutable(
        `${prefix}/previous.json`,
        beforeJson,
        "application/json",
      );
    const originalTraits = new Map(
      (
        JSON.parse(originalJson.toString()) as {
          attributes: { trait_type: string; value: string }[];
        }
      ).attributes.map((a) => [a.trait_type, a.value]),
    );
    const jsonDifferences = (
      [
        ["CertNo", "certNo"],
        ["Detail", "detail"],
        ["DNA", "dna"],
        ["Height", "height"],
        ["Origin", "origin"],
        ["Color", "color"],
        ["Sex", "sex"],
        ["Rarity", "rarity"],
      ] as const
    )
      .filter(
        ([trait, field]) =>
          originalTraits.has(trait) &&
          String(originalTraits.get(trait)) !== baseline[field],
      )
      .map(([trait, field]) => ({
        representation: "nft-json",
        field,
        json: originalTraits.get(trait)!,
        chain: baseline[field],
      }));
    const context: Context = {
      baseline,
      desired,
      rawBaseline: managerManifest(raw),
      rawDesired: managerManifest(patchChainBaseline(raw, patch)),
      rawDatabase: databaseManifest(row),
      database: databaseSnapshot(row),
      dbRevision: revisionOf(row),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      issuedAt: raw.certify.issuedAt.toString(),
      prefix,
      imageHash: contentHash(image),
      jsonHash: contentHash(bytes),
      finalUri: this.storage.publicUrl(`${prefix}/final.json`),
      nftImage,
      aliasImageHash: beforeImage ? contentHash(beforeImage) : null,
      aliasJsonHash: beforeJson ? contentHash(beforeJson) : null,
      invariants,
      batch: Object.keys(patch).some(
        (f) => fieldCapabilities[f as BusinessField] === "addMetadataBatch",
      ),
      publicationTime: Date.now().toString(),
      legacyDifferences: asJson([
        ...businessDifferences(databaseSnapshot(row), baseline),
        ...jsonDifferences,
      ]),
    };
    await this.drafts.observed(op, "EDIT_BASELINE", {
      blockNumber: block.number.toString(),
      blockHash: block.hash,
      baselineHash: payloadHash(context.rawBaseline),
      nativeBookkeeping: asJson(invariants),
      batchResetsDNA: context.batch && !!context.rawBaseline.certify.dna,
    });
    return {
      domain: this.chain.domain,
      sender: this.chain.sender.toLowerCase(),
      confirmations: this.chain.confirmations ?? 3,
      maxFeeWei: this.chain.maxFeeWei ?? "50000000000000000",
      ...(this.chain.executionInstance
        ? { executionInstance: this.chain.executionInstance }
        : {}),
      context: asJson(context),
    };
  }
  private expected(op: Operation, steps: Step[]): ManagerManifest {
    const c = context(op),
      applied = steps.some((s) =>
        ["batch", "setter", "parents"].includes(s.kind),
      );
    const target = applied ? c.rawDesired : c.rawBaseline;
    return {
      ...target,
      certify: {
        ...target.certify,
        ...(c.batch && applied && !steps.some((s) => s.kind === "dna_restore")
          ? { dna: "" }
          : {}),
      },
      relation: { ...target.relation },
    };
  }
  async guard(op: Operation, steps: Step[], block?: bigint) {
    const intent = edit(op),
      c = context(op),
      token = BigInt(intent.tokenId),
      raw = (await this.read(
        "getMetadata",
        [token],
        false,
        block,
      )) as RawMetadata;
    if (
      payloadHash(managerManifest(raw)) !==
      payloadHash(this.expected(op, steps))
    )
      throw new IntegrityError("EXTERNAL_CHAIN_BASELINE_CHANGED");
    const now = await this.invariants(token, raw, block);
    if (
      payloadHash({
        owner: now.owner,
        approved: now.approved,
        approvals: now.approvals,
      }) !==
      payloadHash({
        owner: c.invariants.owner,
        approved: c.invariants.approved,
        approvals: c.invariants.approvals,
      })
    )
      throw new IntegrityError("PRESERVATION_INVARIANT_CHANGED");
    const uriDone = steps.some((s) => s.kind === "uri"),
      nft = now.nftRecord as Json[],
      before = c.invariants.nftRecord as Json[];
    if (
      nft[0] !== (uriDone ? c.nftImage : before[0]) ||
      nft[1] !== (uriDone ? c.finalUri : before[1])
    )
      throw new IntegrityError("NFT_BASELINE_CHANGED");
    // Native createdAt resets only in our batch; updatedAt changes only in history writers. DNA must preserve the prior history timestamp.
    const batchStep = steps.find((s) => s.kind === "batch");
    const lastHistoryStep = steps
      .filter(
        (s) =>
          s.kind === "batch" ||
          s.kind === "parents" ||
          (s.kind === "setter" && intent.patch.dna === undefined),
      )
      .at(-1);
    const atReceipt = (step: Step | undefined) => {
      const saved = nativeReceiptEvidence(op, step, "getMetadata");
      if (saved)
        return Promise.resolve({
          createdAt: BigInt(saved.createdAt),
          updatedAt: BigInt(saved.updatedAt),
        });
      return step?.receipt
        ? (this.read(
            "getMetadata",
            [token],
            false,
            BigInt(step.receipt.blockNumber),
          ) as Promise<RawMetadata>)
        : null;
    };
    const batchNative = nativeReceiptEvidence(op, batchStep, "getMetadata");
    const historyNative = nativeReceiptEvidence(
      op,
      lastHistoryStep,
      "getMetadata",
    );
    if (
      (batchNative !== null &&
        batchNative.createdAt !== batchNative.timestamp) ||
      (historyNative !== null &&
        historyNative.updatedAt !== historyNative.timestamp)
    )
      throw new IntegrityError("MANAGER_NATIVE_TIMESTAMP_CHANGED");
    const batchRecord = await atReceipt(batchStep);
    const historyRecord =
      lastHistoryStep === batchStep
        ? batchRecord
        : await atReceipt(lastHistoryStep);
    const expectedNativeCreated = batchRecord
      ? batchRecord.createdAt.toString()
      : c.invariants.nativeManagerCreated;
    const expectedNativeUpdated = historyRecord
      ? historyRecord.updatedAt.toString()
      : c.invariants.nativeManagerUpdated;
    if (
      now.nativeManagerCreated !== expectedNativeCreated ||
      now.nativeManagerUpdated !== expectedNativeUpdated
    )
      throw new IntegrityError("MANAGER_NATIVE_TIMESTAMP_CHANGED");
    const uriStep = steps.find((s) => s.kind === "uri");
    const savedNft = nativeReceiptEvidence(op, uriStep, "tokenIdToUri");
    if (
      savedNft &&
      (savedNft.createdAt !== savedNft.timestamp ||
        savedNft.updatedAt !== savedNft.timestamp)
    )
      throw new IntegrityError("NFT_NATIVE_TIMESTAMP_CHANGED");
    const recordedNft = savedNft
      ? [nft[0], nft[1], savedNft.createdAt, savedNft.updatedAt]
      : uriStep?.receipt
        ? (serializedValue(
            await this.read(
              "tokenIdToUri",
              [token],
              true,
              BigInt(uriStep.receipt.blockNumber),
            ),
          ) as Json[])
        : before;
    if (nft[2] !== recordedNft[2] || nft[3] !== recordedNft[3])
      throw new IntegrityError("NFT_NATIVE_TIMESTAMP_CHANGED");
    const expectedChip = this.expected(op, steps).certify.microchip;
    if (
      (await this.read("microchipToTokenId", [expectedChip], false, block)) !==
        token ||
      !(await this.read("exists", [token], true, block)) ||
      !(await this.read("initialized", [token], false, block))
    )
      throw new IntegrityError("IDENTITY_CONFLICT");
    if (
      intent.patch.microchip &&
      steps.some((s) => s.kind === "batch") &&
      (await this.read(
        "microchipToTokenId",
        [intent.microchip],
        false,
        block,
      )) !== token
    )
      throw new IntegrityError("OLD_MICROCHIP_ALIAS_CHANGED");
    await this.permission(block);
    if ((await this.db.pedigree.count({ where: { tokenId: token } })) !== 1)
      throw new IntegrityError("AMBIGUOUS_DB_TOKEN");
    if (!steps.length) {
      const original = await this.row(intent.microchip);
      if (intent.patch.microchip)
        await this.available(intent.patch.microchip, original);
      for (const field of ["fatherId", "motherId"] as const)
        if (intent.patch[field] !== undefined)
          await this.parent(intent.patch[field], original);
    }
    const row = await this.db.pedigree.findUnique({
      where: { microchip: intent.microchip },
    });
    if (
      !row ||
      (revisionOf(row) !== c.dbRevision && !this.isProjection(row, op))
    ) {
      const published = await this.db.pedigree.findUnique({
        where: { microchip: c.desired.microchip },
      });
      if (!published || !this.isProjection(published, op))
        throw new IntegrityError("STALE_EDIT_RECORD");
    }
  }
  private effects(op: Operation, snapshot: ManagerManifest) {
    const c = context(op),
      token = edit(op).tokenId;
    return [
      {
        kind: "read" as const,
        contract: this.chain.domain.manager,
        functionName: "getMetadata",
        args: [token],
        expected: asJson(snapshot),
        abi: asJson(managerAbi) as Json[],
        projection: "manager-manifest" as const,
      },
      ...[
        ["ownerOf", c.invariants.owner, true],
        ["getApproved", c.invariants.approved, true],
        ["getApprovedByTokenId", c.invariants.approvals, false],
      ].map(([functionName, expected, nft]) => ({
        kind: "read" as const,
        contract: nft ? this.chain.domain.nft : this.chain.domain.manager,
        functionName: String(functionName),
        args: nft ? [token] : [token, false],
        expected: expected as Json,
        abi: asJson(nft ? nftAbi : managerAbi) as Json[],
      })),
    ];
  }
  async nextStep(op: Operation, steps: Step[]): Promise<StepSpec | null> {
    const intent = edit(op),
      c = context(op),
      patch = intent.patch,
      token = BigInt(intent.tokenId);
    await this.guard(op, steps);
    const manager = (
      kind: StepSpec["kind"],
      name: string,
      args: unknown[],
      snapshot: ManagerManifest,
    ): StepSpec => ({
      kind,
      call: {
        to: this.chain.domain.manager,
        data: encodeFunctionData({
          abi: managerAbi as Abi,
          functionName: name,
          args,
        }),
        value: "0",
        effects: this.effects(op, snapshot),
      },
    });
    if (!steps.some((s) => ["batch", "setter", "parents"].includes(s.kind))) {
      if (c.batch) {
        const d = c.rawDesired;
        return manager(
          "batch",
          "addMetadataBatch",
          [
            [token],
            [
              {
                name: d.name,
                microchip: d.certify.microchip,
                certNo: d.certify.certNo,
                origin: d.origin,
                color: d.color,
                imageUri: d.imageUri,
                detail: d.detail,
                sex: d.sex,
                rarity: d.certify.rarity,
                birthdate: BigInt(d.birthdate),
                height: BigInt(d.height),
                issuedAt: BigInt(d.certify.issuedAt),
              },
            ],
          ],
          { ...d, certify: { ...d.certify, dna: "" } },
        );
      }
      if (patch.fatherId !== undefined || patch.motherId !== undefined)
        return manager(
          "parents",
          "setParent",
          [
            token,
            c.rawDesired.relation.fatherTokenId,
            c.rawDesired.relation.motherTokenId,
          ],
          c.rawDesired,
        );
      const field = Object.keys(patch)[0] as BusinessField;
      return manager(
        "setter",
        fieldCapabilities[field],
        [token, field === "height" ? BigInt(patch[field]!) : patch[field]],
        c.rawDesired,
      );
    }
    if (
      c.batch &&
      c.rawBaseline.certify.dna &&
      !steps.some((s) => s.kind === "dna_restore")
    ) {
      if (this.faults.pauseAfterBatch) {
        this.faults.pauseAfterBatch = false;
        throw Error("ISOLATED_BATCH_PAUSE");
      }
      return manager(
        "dna_restore",
        "setDNA",
        [token, c.rawBaseline.certify.dna],
        c.rawDesired,
      );
    }
    if (!steps.some((s) => s.kind === "uri"))
      return {
        kind: "uri",
        call: {
          to: this.chain.domain.nft,
          data: encodeFunctionData({
            abi: nftAbi,
            functionName: "setTokenURI",
            args: [token, c.finalUri, c.nftImage],
          }),
          value: "0",
          effects: [
            {
              kind: "read",
              contract: this.chain.domain.nft,
              functionName: "tokenIdToUri",
              args: [intent.tokenId],
              expected: [c.nftImage, c.finalUri],
              abi: asJson(nftAbi) as Json[],
              projection: "nft-uri",
            },
            ...this.effects(op, c.rawDesired),
          ],
        },
      };
    return null;
  }
  private rawProjection(op: Operation): DatabaseManifest {
    const c = context(op),
      { birthday, height, ...strings } = edit(op).patch;
    return {
      ...c.rawDatabase,
      ...strings,
      ...(birthday !== undefined
        ? { birthday: calendarToDate(birthday).toISOString() }
        : {}),
      ...(height !== undefined ? { height: Number(height) } : {}),
      updatedAt: c.publicationTime,
    };
  }
  private isProjection(row: Pedigree, op: Operation) {
    return (
      payloadHash(databaseManifest(row)) === payloadHash(this.rawProjection(op))
    );
  }
  async project(op: Operation, steps: Step[]): Promise<PublicationProof> {
    await this.guard(op, steps);
    const c = context(op),
      token = edit(op).tokenId;
    const image = await this.storage.get(`${c.prefix}/published-image.jpg`),
      json = await this.storage.get(`${c.prefix}/final.json`);
    if (
      !image ||
      !json ||
      contentHash(image) !== c.imageHash ||
      contentHash(json) !== c.jsonHash ||
      !this.storage.replaceAlias
    )
      throw new IntegrityError("ASSET_ORIGIN_CONFLICT");
    if (c.batch && (this.faults.projectionFailures ?? 0) > 0) {
      this.faults.projectionFailures!--;
      throw Error("ISOLATED_PROJECTION_FAULT");
    }
    for (const [key, bytes, previous, mime] of [
      [`buffalo/${token}.jpg`, image, c.aliasImageHash, "image/jpeg"],
      [`json/${token}.json`, json, c.aliasJsonHash, "application/json"],
    ] as const) {
      await this.storage.replaceAlias(key, bytes, mime, previous);
      const origin = await this.storage.get(key),
        response = await fetch(this.storage.publicUrl(key), {
          signal: AbortSignal.timeout(5000),
          redirect: "error",
        });
      if (
        !origin ||
        contentHash(origin) !== contentHash(bytes) ||
        !response.ok ||
        contentHash(Buffer.from(await response.arrayBuffer())) !==
          contentHash(bytes)
      )
        throw Error("PUBLIC_ASSET_READBACK_PENDING");
    }
    const patch = edit(op).patch;
    const { birthday, height, ...strings } = patch;
    const data: Prisma.PedigreeUpdateManyMutationInput = {
      ...strings,
      ...(birthday !== undefined ? { birthday: calendarToDate(birthday) } : {}),
      ...(height !== undefined ? { height: Number(height) } : {}),
      updatedAt: c.publicationTime,
    };
    const existing = await this.db.pedigree.findUnique({
      where: { microchip: c.desired.microchip },
    });
    if (!existing || !this.isProjection(existing, op)) {
      await this.db.$transaction(
        async (tx) => {
          await tx.$executeRaw`SET LOCAL lock_timeout='500ms'`;
          await tx.$queryRaw`SELECT microchip FROM public."Pedigree" WHERE microchip=${edit(op).microchip} FOR UPDATE`;
          const current = await tx.pedigree.findUnique({
            where: { microchip: edit(op).microchip },
          });
          if (!current || revisionOf(current) !== c.dbRevision)
            throw new IntegrityError("STALE_EDIT_RECORD");
          await tx.pedigree.update({
            where: { microchip: edit(op).microchip },
            data,
          });
        },
        { timeout: 3000, maxWait: 1000 },
      );
    }
    const row = await this.row(c.desired.microchip);
    if (!this.isProjection(row, op))
      throw new IntegrityError("DATABASE_PROJECTION_CONFLICT");
    await this.drafts.observed(op, "EDIT_PUBLISHED", {
      scope: Object.keys(patch),
      legacyDifferences: c.legacyDifferences,
      originalCreatedAt: c.createdAt,
      nativeBookkeeping: asJson(
        await this.invariants(
          BigInt(token),
          (await this.read("getMetadata", [BigInt(token)])) as RawMetadata,
        ),
      ),
      transientDNAEmpty: c.batch && !!c.rawBaseline.certify.dna,
      expectedOwnMetadataCounterIncrement: c.batch ? 1 : 0,
      observedCounterBefore: c.invariants.totalMetadata,
      oldChipAlias: patch.microchip ? edit(op).microchip : null,
    });
    return {
      database: revisionOf(row),
      storage: payloadHash({ image: c.imageHash, json: c.jsonHash }),
      manifest: payloadHash(c.rawDesired),
    };
  }
  async verifyPublication(
    op: Operation,
    steps: Step[],
    proof: PublicationProof,
  ) {
    await this.guard(op, steps);
    const c = context(op),
      row = await this.row(c.desired.microchip);
    for (const [key, hash] of [
      [`buffalo/${edit(op).tokenId}.jpg`, c.imageHash],
      [`json/${edit(op).tokenId}.json`, c.jsonHash],
      [`${c.prefix}/final.json`, c.jsonHash],
    ] as const) {
      const response = await fetch(this.storage.publicUrl(key), {
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      });
      if (
        !response.ok ||
        contentHash(Buffer.from(await response.arrayBuffer())) !== hash
      )
        return false;
    }
    return (
      this.isProjection(row, op) &&
      proof.database === revisionOf(row) &&
      proof.storage === payloadHash({ image: c.imageHash, json: c.jsonHash }) &&
      proof.manifest === payloadHash(c.rawDesired)
    );
  }
  async list(owner: string, token: string) {
    const rows = await this.db.$queryRaw<
      { id: string }[]
    >`SELECT id FROM buffalo_integrity.operation WHERE owner=${owner} AND intent->>'kind'='edit' AND intent->>'tokenId'=${token} AND state<>'CANCELLED' ORDER BY created_at DESC LIMIT 10`;
    return Promise.all(
      rows.map((row) => this.drafts.operations.get(row.id, owner)),
    );
  }
  async view(id: string, owner: string, engine: OperationEngine) {
    const op = await this.drafts.operations.get(id, owner),
      intent = edit(op),
      status = await engine.status(id, owner);
    return {
      ...status,
      actualToken: intent.tokenId,
      patch: intent.patch,
      fields: Object.keys(intent.patch),
      publishedMicrochip: op.plan
        ? context(op).desired.microchip
        : intent.microchip,
      legacyDifferences: op.plan ? context(op).legacyDifferences : [],
      environment: executionEnvironment(this.chain.executionInstance),
      restorationPending:
        !!op.plan &&
        context(op).batch &&
        !!context(op).rawBaseline.certify.dna &&
        status.steps.some(
          (s) => s.kind === "batch" && s.state === "CONFIRMED",
        ) &&
        !status.steps.some(
          (s) => s.kind === "dna_restore" && s.state === "CONFIRMED",
        ),
      steps: status.steps.map((s) => ({
        ...s,
        explorerUrl: transactionLink(this.chain.executionInstance, s.hash),
      })),
    };
  }
}
