import {
  receiptEvidence,
  nativeReceiptEvidence,
} from "../operations/receipt-evidence";
import {
  executionEnvironment,
  transactionLink,
} from "../operations/environment";
import { randomUUID } from "crypto";
import { normalizeBuffaloImage } from "../image-preflight";
import { type PrismaClient } from "@prisma/client";
import { encodeFunctionData, type Abi } from "viem";
import { abi as nftAbi } from "~/server/blockchain/nft/abi";
import { abi as managerAbi } from "~/server/blockchain/metadata-maneger/abi";
import { type BuffaloIntent } from "../intent";
import { intentToJson } from "../json-adapter";
import {
  databaseSnapshot,
  chainSnapshot,
  intentToDatabase,
  intentToManagerInput,
} from "../field-policy";
import { type RawMetadata } from "~/interfaces/i-metadata";
import { type OperationEngine } from "../operations/engine";
import type {
  Operation,
  Step,
  Plan,
  StepSpec,
  Json,
  Domain,
  PublicationProof,
} from "../operations/types";
import { IntegrityError, asJson, payloadHash } from "../operations/hash";
import { type DraftStore } from "./drafts";
import { type AssetStorage, operationPrefix, contentHash } from "./storage";
import { draftInputSchema, draftFields, type DraftInput } from "./contract";

export interface CreateChain {
  domain: Domain;
  sender: string;
  receiver: string;
  executionInstance?: string;
  confirmations?: number;
  maxFeeWei?: string;
  read: (
    contract: string,
    abi: Abi,
    functionName: string,
    args?: unknown[],
    blockNumber?: bigint,
  ) => Promise<unknown>;
  block?: (number?: bigint) => Promise<{ number: bigint; hash: string }>;
}
function object(value: Json): Record<string, Json> {
  if (!value || Array.isArray(value) || typeof value !== "object")
    throw new IntegrityError("MISSING_SERVER_MANIFEST");
  return value;
}
function thaiDay(date: Date) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return `${parts.find((part) => part.type === "year")!.value}-${parts.find((part) => part.type === "month")!.value}-${parts.find((part) => part.type === "day")!.value}`;
}
function buffalo(operation: Operation): BuffaloIntent {
  if (operation.intent.kind !== "create")
    throw new IntegrityError("CREATE_OPERATION_REQUIRED");
  return operation.intent.buffalo;
}
export class BuffaloCreateWorkflow {
  constructor(
    readonly db: PrismaClient,
    readonly drafts: DraftStore,
    readonly storage: AssetStorage,
    readonly chain: CreateChain,
    readonly faults: { projectionFailures?: number } = {},
  ) {}
  private async prefix(operation: Operation) {
    const record = await this.drafts.key(operation.id, operation.owner);
    return operationPrefix(operation.owner, record.idempotency_key);
  }
  private async intended(
    owner: string,
    key: string,
    input: DraftInput,
  ): Promise<BuffaloIntent> {
    const parsed = draftInputSchema.parse(input);
    const day = thaiDay(new Date());
    return {
      ...parsed,
      version: 1,
      image: this.storage.publicUrl(
        `${operationPrefix(owner, key)}/source.jpg`,
      ),
      dna: "",
      issuedOn: day,
    };
  }
  async create(owner: string, key: string, input: DraftInput) {
    const existing = await this.drafts.byKey(owner, key);
    if (existing) {
      const original = draftFields(buffalo(existing));
      if (payloadHash(original) !== payloadHash(draftInputSchema.parse(input)))
        throw new IntegrityError("IDEMPOTENCY_PAYLOAD_CONFLICT");
      return existing;
    }
    const value = await this.intended(owner, key, input);
    return this.drafts.operations.create(
      owner,
      key,
      { kind: "create", buffalo: value },
      this.chain.domain,
      true,
    );
  }
  async revise(
    id: string,
    owner: string,
    version: number,
    input: DraftInput,
    keepImage = true,
  ) {
    return this.drafts.withDraft(
      id,
      owner,
      version,
      async (claim, previous) => {
        const key = randomUUID();
        const value = {
          ...(await this.intended(owner, key, input)),
          issuedOn: buffalo(previous).issuedOn,
        };
        const next = await this.drafts.revise(
          claim,
          version,
          key,
          { kind: "create", buffalo: value },
          this.chain.domain,
        );
        if (keepImage) {
          try {
            const oldImage = await this.storage.get(
              `${await this.prefix(previous)}/source.jpg`,
            );
            if (!oldImage) return this.drafts.operations.get(next, owner);
            await this.drafts.withDraft(
              next,
              owner,
              0,
              async (newClaim, nextOp) => {
                await this.storage.putImmutable(
                  `${await this.prefix(nextOp)}/source.jpg`,
                  oldImage,
                  "image/jpeg",
                );
                await this.drafts.image(newClaim, 0, {
                  imageHash: contentHash(oldImage),
                  bytes: oldImage.length,
                  mime: "image/jpeg",
                });
              },
            );
          } catch {
            /* New revision remains durable and can accept a fresh upload. */
          }
        }
        return this.drafts.operations.get(next, owner);
      },
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
    await this.drafts.withDraft(
      id,
      owner,
      version,
      async (claim, operation) => {
        if (operation.state !== "DRAFT" || operation.plan)
          throw new IntegrityError("INTENT_FROZEN");
        const key = `${await this.prefix(operation)}/source.jpg`;
        if (buffalo(operation).image !== this.storage.publicUrl(key))
          throw new IntegrityError("ASSET_BINDING_CONFLICT");
        await this.storage.putImmutable(key, bytes, "image/jpeg");
        await this.drafts.image(claim, version, {
          imageHash: contentHash(bytes),
          bytes: bytes.length,
          mime: "image/jpeg",
          originalHash: contentHash(raw),
          originalBytes: raw.length,
        });
      },
    );
  }
  async prepare(operation: Operation): Promise<Plan> {
    const intent = buffalo(operation);
    const prefix = await this.prefix(operation);
    const image = await this.storage.get(`${prefix}/source.jpg`);
    const evidence = object(operation.result);
    if (
      !image ||
      evidence.imageHash !== contentHash(image) ||
      intent.image !== this.storage.publicUrl(`${prefix}/source.jpg`)
    )
      throw new IntegrityError("IMAGE_NOT_READY");
    const duplicate = await this.db.pedigree.findUnique({
      where: { microchip: intent.microchip },
    });
    if (duplicate) throw new IntegrityError("MICROCHIP_ALREADY_BOUND");
    const mapped = await this.chain.read(
      this.chain.domain.manager,
      managerAbi as Abi,
      "microchipToTokenId",
      [intent.microchip],
    );
    if (mapped !== 0n) throw new IntegrityError("MICROCHIP_ALREADY_BOUND");
    const owner = await this.chain.read(
      this.chain.domain.nft,
      nftAbi as Abi,
      "owner",
    );
    if (String(owner).toLowerCase() !== this.chain.sender.toLowerCase())
      throw new IntegrityError("NFT_OWNER_PERMISSION_REQUIRED");
    const role = await this.chain.read(
      this.chain.domain.manager,
      managerAbi as Abi,
      "ADMIN",
    );
    if (
      !(await this.chain.read(
        this.chain.domain.manager,
        managerAbi as Abi,
        "hasRole",
        [role, this.chain.sender],
      ))
    )
      throw new IntegrityError("MANAGER_ADMIN_PERMISSION_REQUIRED");
    for (const parent of [intent.fatherId, intent.motherId].filter(
      (value) => value && value !== "N/A",
    )) {
      if (parent === intent.microchip)
        throw new IntegrityError("SELF_PARENT_FORBIDDEN");
      const row = await this.db.pedigree.findUnique({
        where: { microchip: parent },
      });
      if (!row) throw new IntegrityError("PARENT_NOT_FOUND");
      const bindings = await this.db.pedigree.count({
        where: { tokenId: row.tokenId },
      });
      const token = await this.chain.read(
        this.chain.domain.manager,
        managerAbi as Abi,
        "microchipToTokenId",
        [parent],
      );
      const metadata = (await this.chain.read(
        this.chain.domain.manager,
        managerAbi as Abi,
        "getMetadata",
        [row.tokenId],
      )) as RawMetadata;
      if (
        bindings !== 1 ||
        token !== row.tokenId ||
        metadata.certify.microchip !== parent
      )
        throw new IntegrityError("PARENT_IDENTITY_CONFLICT");
    }
    const record = await this.drafts.key(operation.id, operation.owner);
    const logicalCreatedAt =
      typeof evidence.originalCreatedAt === "string"
        ? new Date(evidence.originalCreatedAt)
        : record.created_at;
    const issuedAt = Math.floor(logicalCreatedAt.getTime() / 1000).toString();
    const provisional = {
      ...intentToJson(intent, 1),
      edition: 0,
      attributes: [
        ...intentToJson(intent, 1).attributes,
        { trait_type: "IssuedAtSeconds", value: issuedAt },
        { trait_type: "Provisional", value: "true" },
      ],
    };
    await this.storage.putImmutable(
      `${prefix}/provisional.json`,
      Buffer.from(JSON.stringify(provisional)),
      "application/json",
    );
    return {
      domain: this.chain.domain,
      sender: this.chain.sender.toLowerCase(),
      confirmations: this.chain.confirmations ?? 3,
      maxFeeWei: this.chain.maxFeeWei ?? "50000000000000000",
      ...(this.chain.executionInstance
        ? { executionInstance: this.chain.executionInstance }
        : {}),
      context: {
        logicalCreatedAt: logicalCreatedAt.toISOString(),
        prefix,
        imageHash: contentHash(image),
        issuedAt,
        receiver: this.chain.receiver,
        provisionalUri: this.storage.publicUrl(`${prefix}/provisional.json`),
      },
    };
  }
  private expected(operation: Operation, parents: boolean) {
    const input = buffalo(operation),
      context = object(operation.plan!.context);
    const result = databaseSnapshot(
      intentToDatabase(input, BigInt(operation.actualToken!), "0"),
    );
    return {
      ...result,
      fatherId: parents ? input.fatherId.replace(/^N\/A$/, "") : "",
      motherId: parents ? input.motherId.replace(/^N\/A$/, "") : "",
      issuedAt: String(context.issuedAt),
    };
  }
  private readEffect(operation: Operation, parents: boolean) {
    return {
      kind: "read" as const,
      contract: this.chain.domain.manager,
      functionName: "getMetadata",
      args: [operation.actualToken!] as Json[],
      expected: asJson(this.expected(operation, parents)),
      abi: asJson(managerAbi) as Json[],
      projection: "manager-business" as const,
    };
  }
  private async finalJson(operation: Operation) {
    const context = object(operation.plan!.context);
    const key = `${String(context.prefix)}/${operation.actualToken!}.json`;
    const json = intentToJson(
      buffalo(operation),
      Number(operation.actualToken),
    );
    json.attributes.push({
      trait_type: "IssuedAtSeconds",
      value: String(context.issuedAt),
    });
    const bytes = Buffer.from(JSON.stringify(json));
    await this.storage.putImmutable(key, bytes, "application/json");
    return { key, bytes, uri: this.storage.publicUrl(key) };
  }
  private async initializedProof(operation: Operation, token: bigint) {
    if (!this.chain.block)
      throw new IntegrityError("CANONICAL_READ_PORT_REQUIRED");
    const block = await this.chain.block();
    const value = (await this.chain.read(
      this.chain.domain.manager,
      managerAbi as Abi,
      "getMetadata",
      [token],
      block.number,
    )) as RawMetadata;
    const canonical = await this.chain.block(block.number);
    if (canonical.hash !== block.hash)
      throw new IntegrityError("INITIAL_METADATA_READ_REORG");
    await this.drafts.observed(operation, "INITIAL_METADATA_OBSERVED", {
      blockNumber: block.number.toString(),
      blockHash: block.hash,
      scope: "canonical-block-read",
      metadataHash: payloadHash({
        ...chainSnapshot(value),
        issuedAt: value.certify.issuedAt.toString(),
      }),
      nativeCreatedAt: value.createdAt.toString(),
      nativeUpdatedAt: value.updatedAt.toString(),
    });
    return value;
  }
  /** Current full authorized state must remain true before every signing/publication, including aged recovery. */
  async guard(operation: Operation, steps: Step[], blockNumber?: bigint) {
    const read: CreateChain["read"] = (
      contract,
      abi,
      name,
      args = [],
      number,
    ) => this.chain.read(contract, abi, name, args, blockNumber ?? number);
    const intent = buffalo(operation),
      context = object(operation.plan!.context);
    const mint = steps.find((s) => s.kind === "mint");
    if (!mint) {
      await this.prepare(operation);
      return;
    }
    if (!operation.actualToken)
      throw new IntegrityError("ACTUAL_RECEIPT_TOKEN_REQUIRED");
    const token = BigInt(operation.actualToken),
      uriStep = steps.find((s) => s.kind === "uri"),
      final = await this.finalJson(operation);
    const [owner, record, approved, contractOwner, role] = await Promise.all([
      read(this.chain.domain.nft, nftAbi as Abi, "ownerOf", [token]),
      read(this.chain.domain.nft, nftAbi as Abi, "tokenIdToUri", [token]),
      read(this.chain.domain.nft, nftAbi as Abi, "getApproved", [token]),
      read(this.chain.domain.nft, nftAbi as Abi, "owner"),
      read(this.chain.domain.manager, managerAbi as Abi, "ADMIN"),
    ]);
    if (
      String(owner).toLowerCase() !== this.chain.receiver.toLowerCase() ||
      String(approved) !== "0x0000000000000000000000000000000000000000" ||
      String(contractOwner).toLowerCase() !== this.chain.sender.toLowerCase() ||
      !(await read(this.chain.domain.manager, managerAbi as Abi, "hasRole", [
        role,
        this.chain.sender,
      ]))
    )
      throw new IntegrityError("CREATE_OWNERSHIP_OR_PERMISSION_CHANGED");
    if (
      !Array.isArray(record) ||
      record[0] !== intent.image ||
      record[1] !== String(uriStep ? final.uri : context.provisionalUri)
    )
      throw new IntegrityError("CREATE_NFT_BASELINE_CHANGED");
    const uriNative = nativeReceiptEvidence(operation, uriStep, "tokenIdToUri");
    const mintProof = mint.receipt
      ? receiptEvidence(operation, mint, mint.receipt)
      : null;
    const mintNative = mintProof?.effects.find((e) => e.kind === "mint");
    if (
      uriNative &&
      (String(record[2]) !== uriNative.timestamp ||
        String(record[3]) !== uriNative.timestamp)
    )
      throw new IntegrityError("CREATE_NFT_NATIVE_CHANGED");
    if (
      !uriStep &&
      mintNative &&
      (String(record[2]) !== mintNative.nativeCreatedAt ||
        String(record[3]) !== "0")
    )
      throw new IntegrityError("CREATE_NFT_NATIVE_CHANGED");
    const mapped = await read(
      this.chain.domain.manager,
      managerAbi as Abi,
      "microchipToTokenId",
      [intent.microchip],
    );
    const initialized = await read(
      this.chain.domain.manager,
      managerAbi as Abi,
      "initialized",
      [token],
    );
    if (initialized) {
      const raw = (await read(
        this.chain.domain.manager,
        managerAbi as Abi,
        "getMetadata",
        [token],
      )) as RawMetadata;
      const actual = {
        ...chainSnapshot(raw),
        issuedAt: raw.certify.issuedAt.toString(),
      };
      const withParents = steps.some((s) => s.kind === "parents");
      const expected = this.expected(operation, withParents);
      if (!withParents) {
        const acceptableParents =
          (actual.fatherId === "" && actual.motherId === "") ||
          (actual.fatherId === intent.fatherId.replace(/^N\/A$/, "") &&
            actual.motherId === intent.motherId.replace(/^N\/A$/, ""));
        if (!acceptableParents)
          throw new IntegrityError("CREATE_PARENT_BASELINE_CHANGED");
        actual.fatherId = "";
        actual.motherId = "";
      }
      if (mapped !== token || payloadHash(actual) !== payloadHash(expected))
        throw new IntegrityError("CREATE_MANIFEST_BASELINE_CHANGED");
      const metadata = steps.find((s) => s.kind === "metadata"),
        native = nativeReceiptEvidence(operation, metadata, "getMetadata");
      if (native && String(raw.createdAt) !== native.timestamp)
        throw new IntegrityError("CREATE_METADATA_NATIVE_CHANGED");
      const history = steps
          .filter((s) => s.kind === "metadata" || s.kind === "parents")
          .at(-1),
        last = nativeReceiptEvidence(operation, history, "getMetadata");
      if (last && String(raw.updatedAt) !== last.timestamp)
        throw new IntegrityError("CREATE_METADATA_NATIVE_CHANGED");
    } else if (mapped !== 0n || steps.some((s) => s.kind === "metadata"))
      throw new IntegrityError("CREATE_MANIFEST_BASELINE_CHANGED");
    const image = await this.storage.get(
      `${String(context.prefix)}/source.jpg`,
    );
    if (!image || contentHash(image) !== context.imageHash)
      throw new IntegrityError("IMAGE_ORIGIN_CONFLICT");
    const row = await this.db.pedigree.findUnique({
      where: { microchip: intent.microchip },
    });
    if (row && row.tokenId !== token)
      throw new IntegrityError("DATABASE_PUBLICATION_CONFLICT");
  }
  async nextStep(
    operation: Operation,
    steps: Step[],
  ): Promise<StepSpec | null> {
    const intent = buffalo(operation);
    const context = object(operation.plan!.context);
    if (!steps.some((step) => step.kind === "mint"))
      return {
        kind: "mint",
        call: {
          to: this.chain.domain.nft,
          data: encodeFunctionData({
            abi: nftAbi,
            functionName: "mintWithMetadata",
            args: [
              this.chain.receiver,
              intent.image,
              String(context.provisionalUri),
            ],
          }),
          value: "0",
          effects: [
            {
              kind: "mint",
              nft: this.chain.domain.nft,
              receiver: this.chain.receiver,
              imageUri: intent.image,
              tokenUri: String(context.provisionalUri),
            },
          ],
        },
      };
    if (!operation.actualToken)
      throw new IntegrityError("ACTUAL_RECEIPT_TOKEN_REQUIRED");
    const token = BigInt(operation.actualToken);
    const final = await this.finalJson(operation);
    if (!steps.some((step) => step.kind === "uri"))
      return {
        kind: "uri",
        call: {
          to: this.chain.domain.nft,
          data: encodeFunctionData({
            abi: nftAbi,
            functionName: "setTokenURI",
            args: [token, final.uri, intent.image],
          }),
          value: "0",
          effects: [
            {
              kind: "read",
              contract: this.chain.domain.nft,
              functionName: "tokenIdToUri",
              args: [operation.actualToken],
              expected: [intent.image, final.uri],
              abi: asJson(nftAbi) as Json[],
              projection: "nft-uri",
            },
          ],
        },
      };
    if (!steps.some((step) => step.kind === "metadata")) {
      const initialized = await this.chain.read(
        this.chain.domain.manager,
        managerAbi as Abi,
        "initialized",
        [token],
      );
      if (!initialized) {
        const input = {
          ...intentToManagerInput(intent),
          issuedAt: BigInt(String(context.issuedAt)),
        };
        return {
          kind: "metadata",
          call: {
            to: this.chain.domain.manager,
            data: encodeFunctionData({
              abi: managerAbi,
              functionName: "addMetadata",
              args: [token, input],
            }),
            value: "0",
            effects: [this.readEffect(operation, false)],
          },
        };
      }
      const current = await this.initializedProof(operation, token);
      const actual = {
        ...chainSnapshot(current),
        issuedAt: current.certify.issuedAt.toString(),
      };
      const noParents = { ...actual, fatherId: "", motherId: "" };
      if (
        payloadHash(noParents) !== payloadHash(this.expected(operation, false))
      )
        throw new IntegrityError("INITIALIZED_METADATA_CONFLICT");
      const parentsMatch =
        (actual.fatherId === "" && actual.motherId === "") ||
        (actual.fatherId === intent.fatherId.replace(/^N\/A$/, "") &&
          actual.motherId === intent.motherId.replace(/^N\/A$/, ""));
      if (!parentsMatch)
        throw new IntegrityError("INITIALIZED_PARENT_CONFLICT");
    }
    const selected = !![intent.fatherId, intent.motherId].find(
      (value) => value && value !== "N/A",
    );
    if (selected && !steps.some((step) => step.kind === "parents")) {
      const current = (await this.chain.read(
        this.chain.domain.manager,
        managerAbi as Abi,
        "getMetadata",
        [token],
      )) as RawMetadata;
      const actual = chainSnapshot(current);
      if (
        (actual.fatherId && actual.fatherId !== intent.fatherId) ||
        (actual.motherId && actual.motherId !== intent.motherId)
      )
        throw new IntegrityError("INITIALIZED_PARENT_CONFLICT");
      if (
        actual.fatherId !== intent.fatherId.replace(/^N\/A$/, "") ||
        actual.motherId !== intent.motherId.replace(/^N\/A$/, "")
      )
        return {
          kind: "parents",
          call: {
            to: this.chain.domain.manager,
            data: encodeFunctionData({
              abi: managerAbi,
              functionName: "setParent",
              args: [
                token,
                intent.fatherId.replace(/^N\/A$/, ""),
                intent.motherId.replace(/^N\/A$/, ""),
              ],
            }),
            value: "0",
            effects: [this.readEffect(operation, true)],
          },
        };
    }
    return null;
  }
  async verifyCurrent(operation: Operation) {
    const intent = buffalo(operation),
      token = BigInt(operation.actualToken!),
      final = await this.finalJson(operation);
    const metadata = (await this.chain.read(
      this.chain.domain.manager,
      managerAbi as Abi,
      "getMetadata",
      [token],
    )) as RawMetadata;
    const actual = {
      ...chainSnapshot(metadata),
      issuedAt: metadata.certify.issuedAt.toString(),
    };
    if (payloadHash(actual) !== payloadHash(this.expected(operation, true)))
      throw new IntegrityError("CURRENT_MANIFEST_CONFLICT");
    const [mapped, owner, uri, record] = await Promise.all([
      this.chain.read(
        this.chain.domain.manager,
        managerAbi as Abi,
        "microchipToTokenId",
        [intent.microchip],
      ),
      this.chain.read(this.chain.domain.nft, nftAbi as Abi, "ownerOf", [token]),
      this.chain.read(this.chain.domain.nft, nftAbi as Abi, "tokenURI", [
        token,
      ]),
      this.chain.read(this.chain.domain.nft, nftAbi as Abi, "tokenIdToUri", [
        token,
      ]),
    ]);
    if (
      mapped !== token ||
      String(owner).toLowerCase() !== this.chain.receiver.toLowerCase() ||
      uri !== final.uri ||
      !Array.isArray(record) ||
      record[0] !== intent.image ||
      record[1] !== final.uri ||
      typeof record[2] !== "bigint"
    )
      throw new IntegrityError("NFT_PUBLICATION_BINDING_CONFLICT");
    return final;
  }
  async project(operation: Operation): Promise<PublicationProof> {
    const final = await this.verifyCurrent(operation);
    const intent = buffalo(operation),
      context = object(operation.plan!.context);
    const image = await this.storage.get(
      `${String(context.prefix)}/source.jpg`,
    );
    if (!image || contentHash(image) !== context.imageHash)
      throw new IntegrityError("IMAGE_ORIGIN_CONFLICT");
    if ((this.faults.projectionFailures ?? 0) > 0) {
      this.faults.projectionFailures!--;
      throw Error("ISOLATED_PROJECTION_FAULT");
    }
    const token = operation.actualToken!;
    const conflict = await this.db.pedigree.findFirst({
      where: { tokenId: BigInt(token), microchip: { not: intent.microchip } },
    });
    if (conflict) throw new IntegrityError("DATABASE_TOKEN_ALREADY_BOUND");
    await this.storage.putImmutable(
      `buffalo/${token}.jpg`,
      image,
      "image/jpeg",
    );
    await this.storage.putImmutable(
      `json/${token}.json`,
      final.bytes,
      "application/json",
    );
    // Public consumers must see the owned assets before a new Pedigree becomes visible.
    for (const [key, bytes] of [
      [`buffalo/${token}.jpg`, image],
      [`json/${token}.json`, final.bytes],
    ] as const) {
      const response = await fetch(this.storage.publicUrl(key), {
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      });
      if (
        !response.ok ||
        contentHash(Buffer.from(await response.arrayBuffer())) !==
          contentHash(bytes)
      )
        throw new Error("PUBLIC_ASSET_READBACK_PENDING");
    }
    const projection = intentToDatabase(
      intent,
      BigInt(token),
      new Date(String(context.logicalCreatedAt)).getTime().toString(),
    );
    const existing = await this.db.pedigree.findUnique({
      where: { microchip: intent.microchip },
    });
    if (
      existing &&
      (existing.tokenId !== BigInt(token) ||
        existing.createdAt !== String(projection.createdAt) ||
        payloadHash(databaseSnapshot(existing)) !==
          payloadHash(databaseSnapshot(projection)))
    )
      throw new IntegrityError("DATABASE_PUBLICATION_CONFLICT");
    const other = await this.db.pedigree.findFirst({
      where: { tokenId: BigInt(token), microchip: { not: intent.microchip } },
    });
    if (other) throw new IntegrityError("DATABASE_TOKEN_ALREADY_BOUND");
    if (!existing) await this.db.pedigree.create({ data: projection });
    return {
      database: payloadHash(databaseSnapshot(projection)),
      storage: payloadHash({
        image: contentHash(image),
        json: contentHash(final.bytes),
      }),
      manifest: payloadHash(this.expected(operation, true)),
    };
  }
  async verifyPublication(
    operation: Operation,
    _steps: Step[],
    proof: PublicationProof,
  ) {
    const final = await this.verifyCurrent(operation);
    const intent = buffalo(operation);
    const row = await this.db.pedigree.findUnique({
      where: { microchip: intent.microchip },
    });
    const [image, json] = await Promise.all([
      this.storage.get(`buffalo/${operation.actualToken!}.jpg`),
      this.storage.get(`json/${operation.actualToken!}.json`),
    ]);
    if (
      !row ||
      !image ||
      !json ||
      contentHash(json) !== contentHash(final.bytes)
    )
      return false;
    for (const [key, expected] of [
      [`buffalo/${operation.actualToken!}.jpg`, contentHash(image)],
      [`json/${operation.actualToken!}.json`, contentHash(json)],
    ] as const) {
      const response = await fetch(this.storage.publicUrl(key), {
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      });
      if (
        !response.ok ||
        contentHash(Buffer.from(await response.arrayBuffer())) !== expected
      )
        return false;
    }
    return (
      row.createdAt ===
        new Date(String(object(operation.plan!.context).logicalCreatedAt))
          .getTime()
          .toString() &&
      payloadHash(databaseSnapshot(row)) === proof.database &&
      payloadHash({ image: contentHash(image), json: contentHash(json) }) ===
        proof.storage &&
      payloadHash(this.expected(operation, true)) === proof.manifest
    );
  }
  async view(id: string, owner: string, engine: OperationEngine) {
    const op = await this.drafts.operations.get(id, owner);
    const status = await engine.status(id, owner);
    const intent = buffalo(op);
    const evidence = op.state === "DRAFT" ? op.result : null;
    return {
      ...status,
      steps: status.steps.map((step) => ({
        ...step,
        explorerUrl: transactionLink(this.chain.executionInstance, step.hash),
      })),
      input: { ...intent },
      imageReady: !!(evidence && object(evidence).imageHash) || !!op.plan,
      prepared: !!op.plan,
      revision: op.version,
      canEdit:
        ["DRAFT", "READY"].includes(op.state) &&
        !(await this.drafts.operations.steps(id)).some((step) => step.hash),
      imageUrl: intent.image,
      publishedImageUrl: op.actualToken
        ? this.storage.publicUrl(`buffalo/${op.actualToken}.jpg`)
        : null,
      environment: executionEnvironment(this.chain.executionInstance),
    };
  }
}
