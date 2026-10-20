/** @jest-environment node */
import { randomUUID } from "crypto";
import sharp from "sharp";
import { type PrismaClient } from "@prisma/client";
import { decodeFunctionData } from "viem";
import { BuffaloCreateWorkflow, type CreateChain } from "../workflow";
import { type DraftStore } from "../drafts";
import { type AssetStorage, contentHash, operationPrefix } from "../storage";
import { draftInputSchema, RAW_IMAGE_LIMIT } from "../contract";
import {
  memoryRepository,
  intent,
  domain,
  account,
} from "../../operations/testing-fixtures";
import { asJson, IntegrityError } from "../../operations/hash";
import { type Operation, type Step } from "../../operations/types";
import { intentToManagerInput } from "../../field-policy";
import { abi as managerAbi } from "~/server/blockchain/metadata-maneger/abi";

const input = draftInputSchema.parse(
  (({ version: _v, image: _im, issuedOn: _i, dna: _d, ...value }) => value)(
    intent.buffalo,
  ),
);
function setup() {
  const memory = memoryRepository(),
    files = new Map<string, Buffer>(),
    keys = new Map<string, string>();
  const storage: AssetStorage = {
    publicUrl: (key) => `https://assets.example.test/${key}`,
    get: async (key) => files.get(key) ?? null,
    putImmutable: async (key, bytes) => {
      if (files.has(key) && contentHash(files.get(key)!) !== contentHash(bytes))
        throw new IntegrityError("ASSET_ALREADY_BOUND");
      files.set(key, bytes);
    },
  };
  const observed = jest.fn();
  const drafts = {
    operations: memory.repo,
    byKey: async (owner: string, key: string) => {
      const id = keys.get(`${owner}:${key}`);
      return id ? memory.repo.get(id, owner) : null;
    },
    key: async (id: string) => ({
      idempotency_key: [...keys]
        .find(([, value]) => value === id)![0]
        .split(":")
        .pop()!,
      created_at: new Date("2026-10-17T16:59:59Z"),
    }),
    withDraft: async (
      id: string,
      owner: string,
      version: number,
      callback: (claim: unknown, op: Operation) => Promise<unknown>,
    ) => {
      const op = await memory.repo.get(id, owner);
      if (op.version !== version || !["DRAFT", "READY"].includes(op.state))
        throw new IntegrityError("STALE_DRAFT_REVISION");
      return callback({ id, owner }, op);
    },
    image: async (
      claim: { id: string },
      _version: number,
      evidence: unknown,
    ) => {
      const row = memory.rows.get(claim.id)!;
      row.result = asJson(evidence);
      row.version++;
    },
    observed,
  } as unknown as DraftStore;
  const create = memory.repo.create.bind(memory.repo);
  jest
    .spyOn(memory.repo, "create")
    .mockImplementation(async (owner, key, ...rest) => {
      const op = await create(owner, key, ...rest);
      keys.set(`${owner}:${key}`, op.id);
      return op;
    });
  const db = {
    pedigree: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(1),
      create: jest.fn(),
    },
  };
  const read = jest.fn(
    async (_contract: string, _abi: unknown, name: string): Promise<unknown> =>
      name === "microchipToTokenId"
        ? 0n
        : name === "owner"
          ? account.address
          : name === "ADMIN"
            ? `0x${"00".repeat(32)}`
            : name === "hasRole"
              ? true
              : false,
  );
  const chain: CreateChain = {
    domain,
    sender: account.address,
    receiver: account.address,
    read,
    block: async (number = 100n) => ({ number, hash: `0x${"ab".repeat(32)}` }),
  };
  const workflow = new BuffaloCreateWorkflow(
    db as unknown as PrismaClient,
    drafts,
    storage,
    chain,
  );
  const createDraft = async () =>
    workflow.create("unit-owner", randomUUID(), input);
  const prepared = async () => {
    const op = await createDraft();
    await workflow.upload(
      op.id,
      op.owner,
      0,
      await sharp({
        create: { width: 20, height: 20, channels: 3, background: "orange" },
      })
        .jpeg()
        .toBuffer(),
      "image/jpeg",
    );
    const fresh = await memory.repo.get(op.id, op.owner);
    fresh.plan = await workflow.prepare(fresh);
    fresh.actualToken = "98765";
    return fresh;
  };
  return {
    workflow,
    memory,
    files,
    storage,
    drafts,
    db,
    read,
    chain,
    createDraft,
    prepared,
    observed,
  };
}
test("same idempotency key recovers original issued day across Bangkok midnight", async () => {
  const c = setup(),
    key = randomUUID();
  jest.useFakeTimers().setSystemTime(new Date("2026-10-17T16:59:59Z"));
  try {
    const first = await c.workflow.create("unit-owner", key, input);
    jest.setSystemTime(new Date("2026-10-17T17:01:00Z"));
    const again = await c.workflow.create("unit-owner", key, input);
    expect(again.id).toBe(first.id);
    expect(again.intent).toEqual(first.intent);
    expect(
      again.intent.kind === "create" && again.intent.buffalo.issuedOn,
    ).toBe("2026-10-17");
    await expect(
      c.workflow.create("unit-owner", key, { ...input, detail: "different" }),
    ).rejects.toThrow("IDEMPOTENCY_PAYLOAD_CONFLICT");
  } finally {
    jest.useRealTimers();
  }
});
test("raw image limits and malformed/MIME-spoofed uploads bind no asset; near-limit valid image works", async () => {
  const c = setup(),
    op = await c.createDraft();
  for (const [bytes, mime] of [
    [Buffer.alloc(RAW_IMAGE_LIMIT), "image/png"],
    [Buffer.from("bad"), "image/png"],
    [Buffer.from("bad"), "text/plain"],
  ] as const)
    await expect(
      c.workflow.upload(op.id, op.owner, 0, bytes, mime),
    ).rejects.toThrow();
  expect(c.files.size).toBe(0);
  const small = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  const near = Buffer.concat([
    small,
    Buffer.alloc(RAW_IMAGE_LIMIT - 1 - small.length),
  ]);
  await c.workflow.upload(op.id, op.owner, 0, near, "image/png");
  expect(c.files.size).toBe(1);
  await expect(
    c.workflow.upload(op.id, op.owner, 0, small, "image/png"),
  ).rejects.toThrow("STALE_DRAFT_REVISION");
});
test("receipt token, full fields and native timestamps bind final JSON/metadata; no guessed edition", async () => {
  const c = setup(),
    op = await c.prepared();
  const mint = { kind: "mint" } as Step,
    uri = { kind: "uri" } as Step;
  const next = (await c.workflow.nextStep(op, [mint, uri]))!;
  expect(next.kind).toBe("metadata");
  const decoded = decodeFunctionData({
    abi: managerAbi,
    data: next.call.data as `0x${string}`,
  });
  expect(decoded.functionName).toBe("addMetadata");
  expect(decoded.args?.[0]).toBe(98765n);
  expect(decoded.args?.[1]).toMatchObject({
    height: 145n,
    detail: "detail",
    certNo: "C1",
  });
  const final = [...c.files].find(([key]) => key.endsWith("/98765.json"))!;
  expect(JSON.parse(final[1].toString())).toMatchObject({ edition: 98765 });
  expect(c.db.pedigree.create).not.toHaveBeenCalled();
});
test("initialized metadata is compared at canonical block and recovered without batch or duplicate add", async () => {
  const c = setup(),
    op = await c.prepared();
  const value =
    op.intent.kind === "create" ? op.intent.buffalo : intent.buffalo;
  const inputValue = intentToManagerInput(value);
  const raw = {
    ...inputValue,
    certify: {
      microchip: value.microchip,
      certNo: value.certNo,
      rarity: value.rarity,
      dna: "",
      issuedAt: BigInt((op.plan!.context as { issuedAt: string }).issuedAt),
    },
    relation: { fatherTokenId: "", motherTokenId: "" },
    createdAt: 123n,
    updatedAt: 124n,
  };
  c.read.mockImplementation(async (_contract, _abi, name) =>
    name === "initialized" ? true : raw,
  );
  expect(
    await c.workflow.nextStep(op, [
      { kind: "mint" },
      { kind: "uri" },
    ] as Step[]),
  ).toBeNull();
  expect(c.read).toHaveBeenCalledWith(
    domain.manager,
    expect.anything(),
    "getMetadata",
    [98765n],
    100n,
  );
  expect(c.observed).toHaveBeenCalledWith(
    op,
    "INITIAL_METADATA_OBSERVED",
    expect.objectContaining({ nativeCreatedAt: "123", nativeUpdatedAt: "124" }),
  );
  raw.certify.certNo = "wrong";
  await expect(
    c.workflow.nextStep(op, [{ kind: "mint" }, { kind: "uri" }] as Step[]),
  ).rejects.toThrow("INITIALIZED_METADATA_CONFLICT");
});
test("selected parents require DB and canonical chain identity before any mint", async () => {
  const c = setup(),
    op = await c.createDraft();
  if (op.intent.kind !== "create") throw Error();
  op.intent.buffalo.fatherId = "999000000000002";
  const key = (await c.drafts.key(op.id, op.owner)).idempotency_key;
  c.files.set(
    `${operationPrefix(op.owner, key)}/source.jpg`,
    Buffer.from("fixture"),
  );
  op.result = { imageHash: contentHash(Buffer.from("fixture")) };
  await expect(c.workflow.prepare(op)).rejects.toThrow("PARENT_NOT_FOUND");
  c.db.pedigree.findUnique.mockImplementation(
    async (query: { where: { microchip: string } }) =>
      query.where.microchip === "999000000000002"
        ? { microchip: "999000000000002", tokenId: 2n }
        : null,
  );
  c.read.mockImplementation(async (_contract, _abi, name) =>
    name === "owner"
      ? account.address
      : name === "hasRole"
        ? true
        : name === "getMetadata"
          ? { certify: { microchip: "wrong" } }
          : 0n,
  );
  await expect(c.workflow.prepare(op)).rejects.toThrow(
    "PARENT_IDENTITY_CONFLICT",
  );
});
test("normal consumer stale bytes prevent public DB insertion even after immutable aliases exist", async () => {
  const c = setup(),
    op = await c.prepared();
  const bytes = Buffer.from("final-json");
  jest.spyOn(c.workflow, "verifyCurrent").mockResolvedValue({
    key: "final.json",
    bytes,
    uri: "https://assets.example.test/final.json",
  });
  const fetcher = jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response("stale consumer", { status: 200 }));
  try {
    await expect(c.workflow.project(op)).rejects.toThrow(
      "PUBLIC_ASSET_READBACK_PENDING",
    );
    expect(c.db.pedigree.create).not.toHaveBeenCalled();
    expect(c.files.has("buffalo/98765.jpg")).toBe(true);
  } finally {
    fetcher.mockRestore();
  }
});
