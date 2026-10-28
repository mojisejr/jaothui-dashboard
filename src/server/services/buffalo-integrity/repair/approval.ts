import { createHmac, timingSafeEqual } from "crypto";
import { encodeFunctionData, decodeFunctionData, type Abi } from "viem";
import { abi as managerAbi } from "~/server/blockchain/metadata-maneger/abi";
import { abi as nftAbi } from "~/server/blockchain/nft/abi";
import { type ManagerManifest } from "../field-policy";
import { type CreateChain } from "../create/workflow";
import { operationPrefix, contentHash } from "../create/storage";
import { IntegrityError, payloadHash, stableJson } from "../operations/hash";
import { repairJson } from "./db-projection";
import { type RepairDiagnosis } from "./diagnosis";
import {
  repairExecutionManifestSchema,
  type RepairPrepareInput,
  type RepairIntent,
  type RepairJson,
} from "./execution-contract";

export function fingerprint(
  owner: string,
  manifestHash: string,
  secret: string,
) {
  if (secret.length < 16) throw new IntegrityError("REPAIR_MANIFEST_INVALID");
  return createHmac("sha256", secret)
    .update(stableJson({ owner, manifestHash }))
    .digest("hex");
}
export function verifyApproval(
  owner: string,
  intent: RepairIntent,
  secret: string,
) {
  const expected = fingerprint(owner, payloadHash(intent.manifest), secret);
  if (
    payloadHash(intent.manifest) !== intent.manifestHash ||
    !/^[a-f0-9]{64}$/.test(intent.approvalFingerprint) ||
    !timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(intent.approvalFingerprint),
    )
  )
    throw new IntegrityError("REPAIR_MANIFEST_INVALID");
}
export async function buildRepairIntent(
  owner: string,
  input: RepairPrepareInput,
  diagnosis: RepairDiagnosis,
  chain: CreateChain,
  secret: string,
  now = Date.now(),
  allowPair = false,
): Promise<RepairIntent> {
  if (input.proposal.targets.length !== 1 && !allowPair)
    throw new IntegrityError("REPAIR_PAIR_EXECUTION_DISABLED");
  const preview = await diagnosis.preview(
    input.scan,
    input.pages,
    input.proposal,
  );
  if (preview.status !== "ready_for_operator_review")
    throw new IntegrityError("REPAIR_EXPANDED_SCOPE_REQUIRED");
  const p = preview.manifest,
    block = BigInt(p.pin.blockNumber);
  if (
    chain.domain.chainId !== p.pin.chainId ||
    chain.domain.nft.toLowerCase() !== p.pin.nft.toLowerCase() ||
    chain.domain.manager.toLowerCase() !== p.pin.manager.toLowerCase()
  )
    throw new IntegrityError("REPAIR_BASELINE_CHANGED");
  const tokens: ReturnType<
      typeof repairExecutionManifestSchema.parse
    >["chain"]["tokens"] = [],
    assets: ReturnType<typeof repairExecutionManifestSchema.parse>["assets"] =
      [],
    steps: ReturnType<
      typeof repairExecutionManifestSchema.parse
    >["chain"]["steps"] = [];
  const prefix = operationPrefix(owner, input.key);
  const counter = String(
    await chain.read(
      chain.domain.manager,
      managerAbi as Abi,
      "totalMetadata",
      [],
      block,
    ),
  );
  for (const change of p.changes) {
    if (!change.chain || !change.database)
      throw new IntegrityError("REPAIR_MANIFEST_INVALID");
    const before = change.chain.metadata as unknown as ManagerManifest;
    const desired = {
      ...before,
      certify: { ...before.certify, microchip: change.desiredMicrochip },
    };
    const tokenId = BigInt(change.desiredTokenId);
    const [approved, record] = await Promise.all([
      chain.read(
        chain.domain.nft,
        nftAbi as Abi,
        "getApproved",
        [tokenId],
        block,
      ),
      chain.read(
        chain.domain.nft,
        nftAbi as Abi,
        "tokenIdToUri",
        [tokenId],
        block,
      ),
    ]);
    tokens.push({
      tokenId: change.desiredTokenId,
      before,
      desired,
      native: change.chain.native,
      owner: change.chain.owner,
      nftApproved: String(approved),
      managerApprovals: change.chain.approvals,
      tokenUri: change.chain.tokenUri,
      nftRecord: repairJson(record),
    });
    const evidence = p.assets.tokens.find(
      (t) => t.tokenId === change.desiredTokenId,
    );
    const sourceJson = evidence?.before.find((a) => a.role === "nft_json");
    const sourceImage = evidence?.before.find((a) => a.role === "nft_image");
    if (!evidence?.after || !sourceJson?.hash || !sourceImage?.hash)
      throw new IntegrityError("REPAIR_MANIFEST_INVALID");
    const sourceUrl = new URL(sourceImage.url);
    const suffix = `/storage/v1/object/public/slipstorage/${sourceImage.key}`;
    if (
      decodeURI(sourceUrl.pathname) !== suffix ||
      sourceUrl.search ||
      sourceUrl.hash
    )
      throw new IntegrityError("ASSET_ORIGIN_REVIEW_REQUIRED");
    const root = `${sourceUrl.origin}/storage/v1/object/public/slipstorage/`;
    const publish =
      evidence.after.jsonHash !== sourceJson.hash ||
      evidence.before.find((a) => a.role === "json_alias")?.hash !==
        sourceJson.hash ||
      evidence.before.find((a) => a.role === "image_alias")?.hash !==
        sourceImage.hash;
    const imageKey = publish
      ? `${prefix}/${tokenId.toString()}.jpg`
      : sourceImage.key;
    const jsonKey = publish
      ? `${prefix}/${tokenId.toString()}.json`
      : sourceJson.key;
    const body = publish
      ? {
          ...(evidence.after.json as Record<string, RepairJson>),
          image: root + imageKey,
        }
      : evidence.after.json;
    const jsonHash = publish
      ? contentHash(Buffer.from(stableJson(body)))
      : sourceJson.hash;
    assets.push({
      tokenId: tokenId.toString(),
      sourceImage: {
        url: sourceImage.url,
        key: sourceImage.key,
        hash: sourceImage.hash,
      },
      sourceJson: {
        url: sourceJson.url,
        key: sourceJson.key,
        hash: sourceJson.hash,
      },
      image: {
        key: imageKey,
        url: publish ? root + imageKey : sourceImage.url,
        hash: sourceImage.hash,
      },
      json: {
        key: jsonKey,
        url: publish ? root + jsonKey : sourceJson.url,
        hash: jsonHash,
        body,
      },
      aliases: publish
        ? [
            {
              key: evidence.after.aliasImageKey,
              url: root + evidence.after.aliasImageKey,
              beforeHash:
                evidence.before.find((a) => a.role === "image_alias")?.hash ??
                null,
              afterHash: sourceImage.hash,
              mime: "image/jpeg" as const,
            },
            {
              key: evidence.after.aliasJsonKey,
              url: root + evidence.after.aliasJsonKey,
              beforeHash:
                evidence.before.find((a) => a.role === "json_alias")?.hash ??
                null,
              afterHash: jsonHash,
              mime: "application/json" as const,
            },
          ]
        : [],
      publish,
      uriChange: publish,
    });
    if (change.chainChange) {
      steps.push({
        id: "batch",
        kind: "batch",
        to: chain.domain.manager,
        value: "0",
        data: encodeFunctionData({
          abi: managerAbi as Abi,
          functionName: "addMetadataBatch",
          args: [
            [tokenId],
            [
              {
                name: desired.name,
                microchip: desired.certify.microchip,
                certNo: desired.certify.certNo,
                origin: desired.origin,
                color: desired.color,
                imageUri: desired.imageUri,
                detail: desired.detail,
                sex: desired.sex,
                rarity: desired.certify.rarity,
                birthdate: BigInt(desired.birthdate),
                height: BigInt(desired.height),
                issuedAt: BigInt(desired.certify.issuedAt),
              },
            ],
          ],
        }),
      });
      if (before.certify.dna)
        steps.push({
          id: `dna_restore:${tokenId.toString()}`,
          kind: "dna_restore",
          tokenId: tokenId.toString(),
          to: chain.domain.manager,
          value: "0",
          data: encodeFunctionData({
            abi: managerAbi as Abi,
            functionName: "setDNA",
            args: [tokenId, before.certify.dna],
          }),
        });
    }
    if (publish)
      steps.push({
        id: `uri:${tokenId.toString()}`,
        kind: "uri",
        tokenId: tokenId.toString(),
        to: chain.domain.nft,
        value: "0",
        data: encodeFunctionData({
          abi: nftAbi as Abi,
          functionName: "setTokenURI",
          args: [tokenId, root + jsonKey, root + imageKey],
        }),
      });
  }
  const batches = steps.filter((step) => step.kind === "batch");
  if (batches.length) {
    const decoded = batches.map(
      (step) =>
        decodeFunctionData({
          abi: managerAbi as Abi,
          data: step.data as `0x${string}`,
        }).args!,
    );
    const merged = {
      ...batches[0]!,
      data: encodeFunctionData({
        abi: managerAbi as Abi,
        functionName: "addMetadataBatch",
        args: [
          decoded.flatMap((args) => args[0] as unknown[]),
          decoded.flatMap((args) => args[1] as unknown[]),
        ],
      }),
    };
    const rest = steps
      .filter((step) => step.kind !== "batch")
      .sort((a, b) => Number(a.kind === "uri") - Number(b.kind === "uri"));
    steps.splice(0, steps.length, merged, ...rest);
  }
  const mode = steps.length ? "chain" : "database_only";
  const reservationChips = p.closure.aliases.map((a) => a.microchip);
  const perStep = steps.map((step) => ({
    stepId: step.id,
    maxFeeWei: chain.maxFeeWei ?? "50000000000000000",
  }));
  const manifest = repairExecutionManifestSchema.parse({
    version: 1,
    operationId: input.key,
    mode,
    createdAt: now,
    expiresAt: Math.min(now + 1800000, p.pin.expiresAt),
    domain: { chainId: 96, nft: p.pin.nft, manager: p.pin.manager },
    targets: input.proposal.targets,
    reservationChips,
    reservationTokens: p.observedTokens,
    database: {
      targets: p.changes.map((t) => ({
        sourceMicrochip: t.sourceMicrochip,
        desiredMicrochip: t.desiredMicrochip,
        desiredTokenId: t.desiredTokenId,
        baseline: t.database!.baseline,
        ...((t.database!.baseline as Record<string, RepairJson>).image !==
        assets.find((a) => a.tokenId === t.desiredTokenId)?.image.url
          ? {
              desiredImage: assets.find((a) => a.tokenId === t.desiredTokenId)!
                .image.url,
            }
          : {}),
      })),
      references: p.references.filter((r) => r.kind !== "ChainGenealogy"),
      catalogDigest: p.catalogDigest,
      closureChips: reservationChips,
      closureTokens: p.observedTokens,
    },
    chain: {
      pin: p.pin,
      metadataCounter: counter,
      tokens,
      aliases: p.closure.aliases,
      steps,
    },
    assets,
    fees: {
      perStep,
      totalMaxFeeWei: perStep
        .reduce((sum, f) => sum + BigInt(f.maxFeeWei), 0n)
        .toString(),
    },
    effects: {
      ...p.effects,
      nftUriChanges: assets
        .filter((a) => a.uriChange)
        .map((a) => ({
          tokenId: a.tokenId,
          uri: a.json.url,
          image: a.image.url,
        })),
      legacyAliases:
        "known_asset_aliases_CAS_only_historical_mapping_aliases_preserved",
      nftNativeTimestampsReset: assets
        .filter((a) => a.uriChange)
        .map((a) => a.tokenId),
    },
    coverage: {
      ...p.coverage,
      canonical: p.closure.canonical,
      requestHash: payloadHash(input),
      databaseDigest: p.databaseDigest,
      assetBefore: p.assets.tokens,
      batchTokens: p.changes
        .filter((t) => t.chainChange)
        .map((t) => t.desiredTokenId),
    },
  });
  const manifestHash = payloadHash(manifest);
  return {
    kind: "identity_repair",
    mode,
    operationId: input.key,
    manifestHash,
    approvalFingerprint: fingerprint(owner, manifestHash, secret),
    manifest,
  };
}
