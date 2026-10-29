/** @jest-environment node */
import { bindReceiptEvidence } from "../../operations/receipt-evidence";
import { randomUUID, createHash } from "crypto";
import { type Pedigree, type PrismaClient } from "@prisma/client";
import { decodeFunctionData, type Hex } from "viem";
import { abi as managerAbi } from "~/server/blockchain/metadata-maneger/abi";
import { abi as nftAbi } from "~/server/blockchain/nft/abi";
import { type RawMetadata } from "~/interfaces/i-metadata";
import { BuffaloEditWorkflow } from "../workflow";
import { revisionOf, type EditPatch } from "../contract";
import {
  memoryRepository,
  account,
  domain,
  intent,
} from "../../operations/testing-fixtures";
import {
  intentToDatabase,
  intentToManagerInput,
  chainSnapshot,
  databaseSnapshot,
  type BusinessField,
} from "../../field-policy";
import { type DraftStore } from "../../create/drafts";
import { contentHash, type AssetStorage } from "../../create/storage";
import {
  type Operation,
  type Step,
  type StepSpec,
} from "../../operations/types";
import { type CreateChain } from "../../create/workflow";
import { intentToJson } from "../../json-adapter";
import { IntegrityError, asJson } from "../../operations/hash";
const owner = "unit-editor",
  token = 901n;
export function setupEdit(chip = intent.buffalo.microchip) {
  const value = {
    ...intent.buffalo,
    microchip: chip,
    image:
      "https://storage.example.test/storage/v1/object/public/slipstorage/buffalo/901.jpg",
    dna: "https://dna.example.test/original",
    fatherId: "999000000000011",
    motherId: "999000000000012",
  };
  let row = intentToDatabase(value, token, "1234567890000");
  let raw: RawMetadata = {
    ...intentToManagerInput(value),
    certify: {
      microchip: chip,
      certNo: value.certNo,
      dna: value.dna,
      rarity: value.rarity,
      issuedAt: 1000n,
    },
    relation: { fatherTokenId: value.fatherId, motherTokenId: value.motherId },
    createdAt: 1100n,
    updatedAt: 0n,
  };
  let nft: unknown[] = [
    value.image,
    "https://storage.example.test/storage/v1/object/public/slipstorage/json/901.json",
    1200n,
    0n,
  ];
  const original = intentToJson(
    { ...value, microchip: intent.buffalo.microchip },
    Number(token),
  );
  original.name = `Synthetic #${chip}`;
  original.attributes.find((a) => a.trait_type === "Microchip")!.value = chip;
  const json = {
    ...original,
    description: "keep original description",
    custom: { license: "original" },
    attributes: [
      ...original.attributes,
      { trait_type: "CustomUnknown", value: "untouched" },
    ],
  };
  const files = new Map<string, Buffer>([
    ["buffalo/901.jpg", Buffer.from("image bytes")],
    ["json/901.json", Buffer.from(JSON.stringify(json))],
  ]);
  const storage: AssetStorage = {
    publicUrl: (k) =>
      `https://storage.example.test/storage/v1/object/public/slipstorage/${k}`,
    get: async (k) => files.get(k) ?? null,
    putImmutable: async (k, b) => {
      if (files.has(k) && contentHash(files.get(k)!) !== contentHash(b))
        throw new IntegrityError("ASSET_ALREADY_BOUND");
      files.set(k, b);
    },
    replaceAlias: async (k, b, _m, hash) => {
      const old = files.get(k);
      if (old && contentHash(old) === contentHash(b)) return;
      if ((old ? contentHash(old) : null) !== hash)
        throw new IntegrityError("ALIAS_BASELINE_CHANGED");
      files.set(k, b);
    },
  };
  const memory = memoryRepository(),
    keys = new Map<string, string>();
  const drafts = {
    operations: memory.repo,
    byKey: async (_o: string, key: string) =>
      keys.has(key) ? memory.repo.get(keys.get(key)!, owner) : null,
    key: async () => ({ idempotency_key: key }),
    observed: jest.fn(),
  } as unknown as DraftStore;
  let key = "";
  const parent = (chip: string) => ({
    ...row,
    microchip: chip,
    tokenId: chip.endsWith("11") ? 11n : 12n,
  });
  const findUnique = jest.fn(async (q: { where: { microchip: string } }) =>
    [row.microchip].includes(q.where.microchip)
      ? structuredClone(row)
      : q.where.microchip.endsWith("11") || q.where.microchip.endsWith("12")
        ? parent(q.where.microchip)
        : null,
  );
  let childReferences = 0;
  const db = {
    pedigree: {
      findUnique,
      count: jest.fn(async (q: { where: { OR?: unknown } }) =>
        q.where.OR ? childReferences : 1,
      ),
      update: jest.fn(
        async (q: { where: unknown; data: Partial<Pedigree> }) => {
          row = { ...row, ...q.data };
          return row;
        },
      ),
    },
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  );
  const aliases = new Map([[chip, token]]),
    history = new Map<string, { raw: RawMetadata; nft: unknown[] }>();
  let total = 10n,
    canAdmin = true,
    canNft = true;
  const read = jest.fn(
    async (
      _c: string,
      _abi: unknown,
      name: string,
      args: unknown[] = [],
      block?: bigint,
    ): Promise<unknown> => {
      const prior = block ? history.get(block.toString()) : null;
      if (name === "getMetadata")
        return args[0] === token
          ? structuredClone(prior?.raw ?? raw)
          : {
              ...raw,
              certify: {
                ...raw.certify,
                microchip: args[0] === 11n ? value.fatherId : value.motherId,
              },
            };
      if (name === "microchipToTokenId")
        return (
          aliases.get(String(args[0])) ??
          (String(args[0]).endsWith("11")
            ? 11n
            : String(args[0]).endsWith("12")
              ? 12n
              : 0n)
        );
      if (name === "owner")
        return canNft ? account.address : `0x${"33".repeat(20)}`;
      if (name === "ADMIN") return `0x${"01".repeat(32)}`;
      if (name === "hasRole") return canAdmin;
      if (["exists", "initialized"].includes(name)) return true;
      if (name === "ownerOf") return account.address;
      if (name === "getApproved") return `0x${"44".repeat(20)}`;
      if (name === "getApprovedByTokenId")
        return [{ approver: "existing", docUri: "original", approvedAt: 333n }];
      if (name === "totalMetadata") return total;
      if (name === "tokenIdToUri") return structuredClone(prior?.nft ?? nft);
      throw Error(name);
    },
  );
  const chain: CreateChain = {
    domain,
    sender: account.address,
    receiver: account.address,
    read,
    block: async (n = 100n) => ({ number: n, hash: `0x${"ab".repeat(32)}` }),
  };
  const workflow = new BuffaloEditWorkflow(
    db as unknown as PrismaClient,
    drafts,
    storage,
    chain,
  );
  const start = async (patch: EditPatch) => {
    key = randomUUID();
    const op = await workflow.create(owner, {
      key,
      microchip: row.microchip,
      tokenId: token.toString(),
      expectedRevision: revisionOf(row),
      patch,
      ...(patch.image ? { upload: "image" as const } : {}),
    });
    keys.set(key, op.id);
    if (patch.image) {
      const path = `operations/${createHash("sha256").update(owner).digest("hex")}/${key}/source.jpg`;
      const bytes = files.get("buffalo/902.jpg")!;
      files.set(path, bytes);
      op.result = { uploadHash: contentHash(bytes) };
    }
    op.plan = await workflow.prepare(op);
    return op;
  };
  let ordinal = 0;
  const apply = (spec: StepSpec): Step => {
    const call = decodeFunctionData({
        abi: spec.kind === "uri" ? nftAbi : managerAbi,
        data: spec.call.data as Hex,
      }),
      args = call.args as unknown[];
    switch (call.functionName) {
      case "addMetadataBatch": {
        const input = (args[1] as Record<string, unknown>[])[0]!;
        raw = {
          ...raw,
          ...input,
          createdAt: BigInt(2000 + ordinal),
          certify: {
            microchip: String(input.microchip),
            certNo: String(input.certNo),
            rarity: String(input.rarity),
            dna: "",
            issuedAt: input.issuedAt as bigint,
          },
        };
        aliases.set(raw.certify.microchip, token);
        total++;
        break;
      }
      case "setDNA":
        raw.certify.dna = String(args[1]);
        break;
      case "setName":
        raw.name = String(args[1]);
        break;
      case "setHeight":
        raw.height = args[1] as bigint;
        break;
      case "setCertId":
        raw.certify.certNo = String(args[1]);
        break;
      case "setDetail":
        raw.detail = String(args[1]);
        break;
      case "setRarity":
        raw.certify.rarity = String(args[1]);
        break;
      case "setParent":
        raw.relation = {
          fatherTokenId: String(args[1]),
          motherTokenId: String(args[2]),
        };
        break;
      case "setTokenURI":
        nft = [
          args[2],
          args[1],
          BigInt(2000 + ordinal),
          BigInt(2000 + ordinal),
        ];
        break;
      default:
        throw Error(call.functionName);
    }
    if (
      [
        "setName",
        "setHeight",
        "setCertId",
        "setDetail",
        "setRarity",
        "setParent",
        "addMetadataBatch",
      ].includes(call.functionName)
    )
      raw.updatedAt = BigInt(2000 + ordinal);
    ordinal++;
    history.set(String(100 + ordinal), {
      raw: structuredClone(raw),
      nft: structuredClone(nft),
    });
    return {
      kind: spec.kind,
      state: "CONFIRMED",
      expected: spec.call,
      receipt: { blockNumber: String(100 + ordinal) },
    } as Step;
  };
  const finish = async (op: Operation) => {
    const steps: Step[] = [];
    for (let i = 0; i < 6; i++) {
      const spec = await workflow.nextStep(op, steps);
      if (!spec) return steps;
      steps.push(apply(spec));
    }
    throw Error("too many");
  };
  const fetcher = async (url: string | URL | Request) => {
    const path = new URL(String(url)).pathname.split("/slipstorage/")[1]!;
    const bytes = files.get(path);
    return new Response(bytes ? new Uint8Array(bytes) : "", {
      status: bytes ? 200 : 404,
    });
  };
  return {
    workflow,
    db,
    drafts,
    files,
    storage,
    read,
    start,
    apply,
    finish,
    fetcher,
    aliases,
    json,
    get row() {
      return row;
    },
    get raw() {
      return raw;
    },
    setRow: (v: Partial<Pedigree>) => {
      row = { ...row, ...v };
    },
    setChildReferences: (n: number) => {
      childReferences = n;
    },
    setPermissions: (admin: boolean, nft: boolean) => {
      canAdmin = admin;
      canNft = nft;
    },
    nft,
  };
}
const cases: Array<[BusinessField, string, string]> = [
  ["name", "New name", "setName"],
  ["height", "166", "setHeight"],
  ["certNo", "C2", "setCertId"],
  ["detail", "new detail", "setDetail"],
  ["rarity", "Rare", "setRarity"],
  ["dna", "https://dna.example.test/new", "setDNA"],
  ["fatherId", "", "setParent"],
  ["motherId", "", "setParent"],
  ["birthday", "2023-07-03", "addMetadataBatch"],
  ["origin", "new origin", "addMetadataBatch"],
  ["color", "White", "addMetadataBatch"],
  ["sex", "Female", "addMetadataBatch"],
  ["microchip", "999000000004001", "addMetadataBatch"],
  [
    "image",
    "https://storage.example.test/storage/v1/object/public/slipstorage/buffalo/902.jpg",
    "addMetadataBatch",
  ],
];
test.each(cases)(
  "%s uses %s policy, preserves unrequested fields, DNA, relations and original DB creation date",
  async (field, value, fn) => {
    const c = setupEdit();
    c.files.set("buffalo/902.jpg", Buffer.from("new image"));
    const baseline = chainSnapshot(c.raw),
      op = await c.start({ [field]: value });
    if (field === "image" && op.intent.kind === "edit")
      value = op.intent.patch.image!;
    const first = (await c.workflow.nextStep(op, []))!;
    expect(
      decodeFunctionData({ abi: managerAbi, data: first.call.data as Hex })
        .functionName,
    ).toBe(fn);
    const fetch = jest.spyOn(globalThis, "fetch").mockImplementation(c.fetcher);
    try {
      const steps = await c.finish(op);
      const proof = await c.workflow.project(op, steps);
      expect(await c.workflow.verifyPublication(op, steps, proof)).toBe(true);
      expect(c.row.createdAt).toBe("1234567890000");
      expect(chainSnapshot(c.raw)).toEqual({ ...baseline, [field]: value });
      expect(databaseSnapshot(c.row)).toEqual({ ...baseline, [field]: value });
      expect(c.raw.certify.issuedAt).toBe(1000n);
      if (first.kind === "batch")
        expect(steps.map((s) => s.kind)).toEqual([
          "batch",
          "dna_restore",
          "uri",
        ]);
      else expect(steps.map((s) => s.kind)).toEqual([first.kind, "uri"]);
    } finally {
      fetch.mockRestore();
    }
  },
);
test("safe name setter retains nonstandard legacy ID and chain/DB/JSON unrelated discrepancies", async () => {
  const c = setupEdit("LEGACY-ID");
  c.setRow({ certNo: "DB cert", detail: "DB detail" });
  c.raw.certify.certNo = "chain cert";
  c.raw.detail = "chain detail";
  const json = JSON.parse(c.files.get("json/901.json")!.toString()) as {
    attributes: { trait_type: string; value: string }[];
  };
  json.attributes.find(
    (a: { trait_type: string }) => a.trait_type === "CertNo",
  )!.value = "JSON cert";
  c.files.set("json/901.json", Buffer.from(JSON.stringify(json)));
  const op = await c.start({ name: "new" }),
    steps = await c.finish(op);
  const fetch = jest.spyOn(globalThis, "fetch").mockImplementation(c.fetcher);
  try {
    await c.workflow.project(op, steps);
  } finally {
    fetch.mockRestore();
  }
  const final = JSON.parse(c.files.get("json/901.json")!.toString()) as {
    attributes: { trait_type: string; value: string }[];
  };
  expect(final).toMatchObject({
    description: "keep original description",
    custom: { license: "original" },
  });
  expect(final.attributes).toEqual(
    expect.arrayContaining([
      { trait_type: "CustomUnknown", value: "untouched" },
      { trait_type: "CertNo", value: "JSON cert" },
    ]),
  );
  expect(c.raw.certify.certNo).toBe("chain cert");
  expect(c.row.certNo).toBe("DB cert");
  expect(c.row.detail).toBe("DB detail");
  expect(c.raw.detail).toBe("chain detail");
});
test("batch crash restores exact nonempty DNA once; restored-before-publication crash resumes without another batch", async () => {
  const c = setupEdit(),
    op = await c.start({ color: "White" }),
    steps = [c.apply((await c.workflow.nextStep(op, []))!)];
  expect(c.raw.certify.dna).toBe("");
  expect(c.row.dna).toContain("original");
  expect((await c.workflow.nextStep(op, steps))?.kind).toBe("dna_restore");
  steps.push(c.apply((await c.workflow.nextStep(op, steps))!));
  expect(c.raw.certify.dna).toContain("original");
  steps.push(c.apply((await c.workflow.nextStep(op, steps))!));
  c.workflow.faults.projectionFailures = 1;
  const fetch = jest.spyOn(globalThis, "fetch").mockImplementation(c.fetcher);
  try {
    await expect(c.workflow.project(op, steps)).rejects.toThrow(
      "ISOLATED_PROJECTION_FAULT",
    );
    expect(c.row.color).toBe("Black");
    expect(await c.workflow.nextStep(op, steps)).toBeNull();
    await c.workflow.project(op, steps);
    expect(c.row.color).toBe("White");
    expect(steps.filter((s) => s.kind === "batch")).toHaveLength(1);
  } finally {
    fetch.mockRestore();
  }
});
test("external mutation between batch and DNA restoration blocks blind recovery", async () => {
  const c = setupEdit(),
    op = await c.start({ color: "White" }),
    steps = [c.apply((await c.workflow.nextStep(op, []))!)];
  c.raw.detail = "external";
  await expect(c.workflow.nextStep(op, steps)).rejects.toThrow(
    "EXTERNAL_CHAIN_BASELINE_CHANGED",
  );
  expect(c.row.color).toBe("Black");
});
test("same-fields external batch changes native timestamp and blocks restoration", async () => {
  const c = setupEdit(),
    op = await c.start({ color: "White" }),
    steps = [c.apply((await c.workflow.nextStep(op, []))!)];
  c.raw.createdAt++;
  await expect(c.workflow.nextStep(op, steps)).rejects.toThrow(
    "MANAGER_NATIVE_TIMESTAMP_CHANGED",
  );
});
test("permission and wrong identity are blocked before any step; stale record before prepare is rejected", async () => {
  const c = setupEdit();
  c.setPermissions(true, false);
  await expect(c.start({ name: "new" })).rejects.toThrow(
    "NFT_OWNER_PERMISSION_REQUIRED",
  );
  c.setPermissions(true, true);
  c.aliases.set(c.row.microchip, 999n);
  await expect(c.start({ name: "new" })).rejects.toThrow("IDENTITY_CONFLICT");
});
test("duplicate chip, contract old alias and child references are not silently reused", async () => {
  const c = setupEdit();
  c.aliases.set("999000000004002", token);
  await expect(c.start({ microchip: "999000000004002" })).rejects.toThrow(
    "MICROCHIP_ALREADY_BOUND",
  );
  c.setChildReferences(1);
  await expect(c.start({ microchip: "999000000004003" })).rejects.toThrow(
    "MICROCHIP_HAS_CHILD_REFERENCES_REVIEW_REQUIRED",
  );
  c.setChildReferences(0);
  const op = await c.start({ microchip: "999000000004003" });
  await c.finish(op);
  expect(c.aliases.get(intent.buffalo.microchip)).toBe(token);
  expect(c.aliases.get("999000000004003")).toBe(token);
});
test("full-row revision CAS detects DNA/detail edits interleaved during alias readback, without overwriting DB", async () => {
  const c = setupEdit(),
    op = await c.start({ name: "new" }),
    steps = await c.finish(op);
  let injected = false;
  const fetch = jest
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url) => {
      if (!injected) {
        injected = true;
        c.setRow({ detail: "external", dna: "external DNA" });
      }
      return c.fetcher(url);
    });
  try {
    await expect(c.workflow.project(op, steps)).rejects.toThrow(
      "STALE_EDIT_RECORD",
    );
    expect(c.row.name).toBe("Synthetic");
    expect(c.row.detail).toBe("external");
  } finally {
    fetch.mockRestore();
  }
});
test("ordinary stale consumer and externally overwritten alias leave DB unpublished", async () => {
  const c = setupEdit(),
    op = await c.start({ name: "new" }),
    steps = await c.finish(op);
  const fetch = jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response("stale", { status: 200 }));
  try {
    await expect(c.workflow.project(op, steps)).rejects.toThrow(
      "PUBLIC_ASSET_READBACK_PENDING",
    );
    expect(c.row.name).toBe("Synthetic");
  } finally {
    fetch.mockRestore();
  }
});
test("stale canonical cache recovers through content-version readback and publishes once", async () => {
  const c = setupEdit(),
    op = await c.start({ name: "new" }),
    steps = await c.finish(op);
  const fetch = jest
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url) => {
      const parsed = new URL(String(url));
      return parsed.searchParams.has("cacheNonce")
        ? c.fetcher(url)
        : new Response("stale", { status: 200 });
    });
  try {
    const proof = await c.workflow.project(op, steps);
    expect(await c.workflow.verifyPublication(op, steps, proof)).toBe(true);
    expect(c.row.name).toBe("new");
    const calls = fetch.mock.calls.map(([url]) => new URL(String(url)));
    expect(
      calls.some((url) =>
        /^[a-f0-9]{64}$/.test(url.searchParams.get("cacheNonce") ?? ""),
      ),
    ).toBe(true);
  } finally {
    fetch.mockRestore();
  }
});

test("legacy extensionless DB image displays the compatible owned alias without modifying DB", async () => {
  const c = setupEdit();
  c.setRow({ image: c.row.image!.replace(/\.jpg$/, "") });
  const before = c.row.image,
    detail = await c.workflow.details(c.row.microchip);
  const displayed = new URL(detail!.image!);
  expect(displayed.origin + displayed.pathname).toBe(
    c.storage.publicUrl("buffalo/901.jpg"),
  );
  expect(displayed.searchParams.get("cacheNonce")).toMatch(/^[a-f0-9]{64}$/);
  expect(c.row.image).toBe(before);
});
test("unowned image patches and oversized height never reach a prepared plan", async () => {
  const c = setupEdit();
  const op = await c.start({ name: "prepare" });
  if (op.intent.kind !== "edit") throw Error();
  op.intent.patch = { image: c.storage.publicUrl("buffalo/902.jpg") };
  await expect(c.workflow.prepare(op)).rejects.toThrow(
    "IMAGE_UPLOAD_BINDING_REQUIRED",
  );
});
test("new parent pair projects both DB references while preserving original date", async () => {
  const c = setupEdit(),
    op = await c.start({ fatherId: "", motherId: "999000000000012" }),
    steps = await c.finish(op);
  const fetch = jest.spyOn(globalThis, "fetch").mockImplementation(c.fetcher);
  try {
    await c.workflow.project(op, steps);
  } finally {
    fetch.mockRestore();
  }
  expect(c.row.fatherId).toBe("");
  expect(c.row.motherId).toBe("999000000000012");
  expect(c.row.createdAt).toBe("1234567890000");
});

test("raw N/A literals, parent sentinel and legacy intraday birthday seconds survive unrelated batch calldata, restore and exact effect proof", async () => {
  const c = setupEdit();
  c.raw.certify.certNo = "N/A";
  c.raw.origin = "N/A";
  c.raw.detail = "N/A";
  c.raw.certify.dna = "N/A";
  c.raw.relation.motherTokenId = "N/A";
  c.raw.birthdate += 3601n;
  const original = structuredClone(c.raw),
    op = await c.start({ color: "White" }),
    spec = (await c.workflow.nextStep(op, []))!;
  const decoded = decodeFunctionData({
    abi: managerAbi,
    data: spec.call.data as Hex,
  });
  const input = (
    decoded.args?.[1] as {
      certNo: string;
      origin: string;
      detail: string;
      birthdate: bigint;
    }[]
  )[0]!;
  expect(input).toMatchObject({
    certNo: "N/A",
    origin: "N/A",
    detail: "N/A",
    birthdate: original.birthdate,
  });
  expect(spec.call.effects[0]).toMatchObject({
    projection: "manager-manifest",
    expected: {
      detail: "N/A",
      birthdate: original.birthdate.toString(),
      certify: { certNo: "N/A", dna: "" },
      relation: { motherTokenId: "N/A" },
    },
  });
  const steps = await c.finish(op);
  expect(steps.map((s) => s.kind)).toEqual(["batch", "dna_restore", "uri"]);
  expect(c.raw.certify).toEqual(original.certify);
  expect(c.raw.relation).toEqual(original.relation);
  expect(c.raw.birthdate).toBe(original.birthdate);
  expect(c.raw.detail).toBe("N/A");
  expect(c.raw.origin).toBe("N/A");
});
test("raw-only N/A to empty external mutation is rejected although display snapshots normalize it", async () => {
  const c = setupEdit();
  c.raw.certify.certNo = "N/A";
  const op = await c.start({ name: "new" });
  c.raw.certify.certNo = "";
  await expect(c.workflow.nextStep(op, [])).rejects.toThrow(
    "EXTERNAL_CHAIN_BASELINE_CHANGED",
  );
});
test.each([
  [null, "N/A"],
  [null, ""],
  ["N/A", ""],
] as const)(
  "full DB revision detects raw certNo %s to %s without updatedAt change",
  async (before, after) => {
    const c = setupEdit();
    c.setRow({ certNo: before });
    const op = await c.start({ name: "new" });
    c.setRow({ certNo: after });
    await expect(c.workflow.nextStep(op, [])).rejects.toThrow(
      "STALE_EDIT_RECORD",
    );
  },
);
test("unrequested nullable DB columns retain exact nulls after verified projection", async () => {
  const c = setupEdit();
  c.setRow({ certNo: null, origin: null, height: null, motherId: null });
  const op = await c.start({ name: "new" }),
    steps = await c.finish(op),
    fetch = jest.spyOn(globalThis, "fetch").mockImplementation(c.fetcher);
  try {
    await c.workflow.project(op, steps);
  } finally {
    fetch.mockRestore();
  }
  expect(c.row).toMatchObject({
    name: "new",
    certNo: null,
    origin: null,
    height: null,
    motherId: null,
  });
});

test("one-parent setter preserves the unrequested raw N/A chain relation and nullable DB counterpart", async () => {
  const c = setupEdit();
  c.raw.relation.motherTokenId = "N/A";
  c.setRow({ motherId: null });
  const op = await c.start({ fatherId: "" }),
    spec = (await c.workflow.nextStep(op, []))!;
  expect(
    decodeFunctionData({ abi: managerAbi, data: spec.call.data as Hex }).args,
  ).toEqual([901n, "", "N/A"]);
  const steps = await c.finish(op),
    fetch = jest.spyOn(globalThis, "fetch").mockImplementation(c.fetcher);
  try {
    await c.workflow.project(op, steps);
  } finally {
    fetch.mockRestore();
  }
  expect(c.raw.relation).toEqual({ fatherTokenId: "", motherTokenId: "N/A" });
  expect(c.row.motherId).toBeNull();
});

test("history-writing name setter advances native updatedAt at its confirmed receipt and can proceed to URI", async () => {
  const c = setupEdit(),
    op = await c.start({ name: "history name" }),
    steps = [c.apply((await c.workflow.nextStep(op, []))!)];
  expect(c.raw.updatedAt).toBe(2000n);
  expect((await c.workflow.nextStep(op, steps))?.kind).toBe("uri");
});

test("DNA setter does not change history timestamps; an external timestamp-only update after a history writer blocks further signing", async () => {
  const dna = setupEdit(),
    dnaOp = await dna.start({ dna: "https://dna.example.test/new" }),
    dnaSteps = [dna.apply((await dna.workflow.nextStep(dnaOp, []))!)];
  expect(dna.raw.updatedAt).toBe(0n);
  expect((await dna.workflow.nextStep(dnaOp, dnaSteps))?.kind).toBe("uri");
  const c = setupEdit(),
    op = await c.start({ name: "history name" }),
    steps = [c.apply((await c.workflow.nextStep(op, []))!)];
  c.raw.updatedAt++;
  await expect(c.workflow.nextStep(op, steps)).rejects.toThrow(
    "MANAGER_NATIVE_TIMESTAMP_CHANGED",
  );
});

test("setter receipt cannot authorize an unexpected createdAt reset", async () => {
  const c = setupEdit(),
    op = await c.start({ name: "history name" }),
    spec = (await c.workflow.nextStep(op, []))!;
  c.raw.createdAt++;
  const steps = [c.apply(spec)];
  await expect(c.workflow.nextStep(op, steps)).rejects.toThrow(
    "MANAGER_NATIVE_TIMESTAMP_CHANGED",
  );
});
test("DNA receipts cannot authorize unexpected native updatedAt changes; restoration retains batch history time", async () => {
  const c = setupEdit(),
    op = await c.start({ dna: "https://dna.example.test/new" }),
    spec = (await c.workflow.nextStep(op, []))!;
  c.raw.updatedAt++;
  await expect(c.workflow.nextStep(op, [c.apply(spec)])).rejects.toThrow(
    "MANAGER_NATIVE_TIMESTAMP_CHANGED",
  );
  const batch = setupEdit(),
    batchOp = await batch.start({ color: "White" }),
    steps = [batch.apply((await batch.workflow.nextStep(batchOp, []))!)];
  const restore = (await batch.workflow.nextStep(batchOp, steps))!;
  batch.raw.updatedAt++;
  steps.push(batch.apply(restore));
  await expect(batch.workflow.nextStep(batchOp, steps)).rejects.toThrow(
    "MANAGER_NATIVE_TIMESTAMP_CHANGED",
  );
});

test("durable receipt-bound native evidence permits aged recovery when receipt-state eth_call is pruned", async () => {
  const c = setupEdit();
  const op = await c.start({ name: "Aged recovery" });
  const step = c.apply((await c.workflow.nextStep(op, []))!);
  step.id = randomUUID();
  step.operationId = op.id;
  step.receipt = {
    transactionHash: `0x${"11".repeat(32)}`,
    blockHash: `0x${"ab".repeat(32)}`,
    blockNumber: "101",
    status: "success",
  };
  step.proof = asJson(
    bindReceiptEvidence(
      op,
      step,
      step.receipt,
      2000n,
      step.expected.effects.map((effect) => {
        if (effect.kind !== "read") throw Error("read effect required");
        return {
          kind: "read",
          field: effect.functionName,
          value: effect.expected,
          ...(effect.functionName === "getMetadata"
            ? {
                nativeCreatedAt: c.raw.createdAt.toString(),
                nativeUpdatedAt: c.raw.updatedAt.toString(),
              }
            : {}),
        };
      }),
    ).details,
  );
  const original = c.read.getMockImplementation()!;
  c.read.mockImplementation(async (...args) => {
    if (args[4] !== undefined)
      throw Error("missing trie node: historical state pruned");
    return original(...args);
  });
  await expect(c.workflow.guard(op, [step])).resolves.toBeUndefined();
  c.raw.detail = "external change after receipt";
  await expect(c.workflow.guard(op, [step])).rejects.toThrow(
    "EXTERNAL_CHAIN_BASELINE_CHANGED",
  );
});
