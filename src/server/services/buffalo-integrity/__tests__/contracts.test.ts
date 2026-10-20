import { type Pedigree } from "@prisma/client";
import { type RawMetadata } from "~/interfaces/i-metadata";
import {
  assertChipAvailable,
  buffaloIntentSchema,
  standardMicrochip,
  type BuffaloIntent,
} from "../intent";
import {
  intentToJson,
  jsonToIntent,
  inspectLegacyTraits,
} from "../json-adapter";
import {
  calendarDay,
  calendarToSeconds,
  secondsToCalendar,
  legacyCalendar,
} from "../calendar";
import {
  businessDifferences,
  chainSnapshot,
  databaseSnapshot,
  intentToDatabase,
  intentToManagerInput,
  patchChainBaseline,
} from "../field-policy";
import {
  preflightMutationIdentity,
  type ChainIdentity,
  type IdentityPorts,
} from "../identity";
import { readBuffaloMetadata } from "../read";

const intent: BuffaloIntent = {
  version: 1,
  name: "ควายทดสอบ #ชื่อ",
  microchip: "933004422018295",
  certNo: "CERT-123",
  origin: "thai",
  color: "Black",
  image: "https://example.test/version.jpg",
  detail: "คงรายละเอียด",
  sex: "Male",
  rarity: "Super Special Rare",
  birthday: "2024-06-30",
  issuedOn: "2026-10-17",
  height: 145,
  fatherId: "IDB1277",
  motherId: "764040226600409",
  dna: "https://example.test/dna.pdf",
};
const cow = intentToDatabase(intent, 1360n, "1700000000000");
const chain: RawMetadata = {
  name: intent.name,
  origin: intent.origin,
  color: intent.color,
  imageUri: intent.image,
  detail: intent.detail,
  sex: intent.sex,
  height: 145n,
  birthdate: calendarToSeconds(intent.birthday),
  certify: {
    microchip: intent.microchip,
    certNo: intent.certNo,
    dna: intent.dna,
    rarity: intent.rarity,
    issuedAt: calendarToSeconds(intent.issuedOn),
  },
  relation: { fatherTokenId: intent.fatherId, motherTokenId: intent.motherId },
  createdAt: 1700000000n,
  updatedAt: 1700000001n,
};
const domain = { chainId: 96, nft: "0x1234", manager: "0x5678" };
const identity: ChainIdentity = {
  domain,
  tokenId: 1360n,
  mappedTokenId: 1360n,
  initialized: true,
  nftExists: true,
  metadata: chain,
};
function ports(
  record: Pedigree = cow,
  observed: ChainIdentity = identity,
): IdentityPorts {
  return {
    findCow: async () => record,
    findTokenBindings: async () => [record],
    readChain: async () => observed,
    chipAvailability: {
      inDatabase: async () => false,
      chainToken: async () => 0n,
      inActiveOperation: async () => false,
    },
  };
}
const request = {
  microchip: cow.microchip,
  tokenId: 1360n,
  changedFields: ["name" as const],
};

describe("new chip and named JSON contracts", () => {
  test("allows imported prefixes and intentionally trims ASCII outer spaces only", () => {
    expect(standardMicrochip(" 933004422018295 ")).toBe(intent.microchip);
  });
  test.each([
    "76404022660122",
    "7640402266012290",
    "７64040226601229",
    "76404022\u200b6601229",
    "\u200b764040226601229",
    "\u00a0764040226601229",
    "76404022 6601229",
    "IDB1277",
  ])("rejects malformed/hidden chip %s", (value) => {
    expect(() => standardMicrochip(value)).toThrow(
      "INVALID_STANDARD_MICROCHIP",
    );
  });
  test.each(["database", "chain", "active"])(
    "rejects %s collision via read-only injected checks",
    async (source) => {
      const checks = {
        inDatabase: async () => source === "database",
        chainToken: async () => (source === "chain" ? 1200n : 0n),
        inActiveOperation: async () => source === "active",
      };
      await expect(
        assertChipAvailable(intent.microchip, checks),
      ).rejects.toThrow("MICROCHIP_ALREADY_BOUND");
    },
  );
  test("unavailable duplicate check rejects instead of assuming availability", async () => {
    await expect(
      assertChipAvailable(intent.microchip, {
        inDatabase: async () => {
          throw Error("DB down");
        },
        chainToken: async () => 0n,
        inActiveOperation: async () => false,
      }),
    ).rejects.toThrow("DB down");
  });
  test("roundtrip independent of trait order preserves height/certNo/detail/parents/DNA", () => {
    const json = intentToJson(intent, 1360);
    json.attributes.reverse();
    expect(jsonToIntent(json, 1360)).toEqual(intent);
    expect(intentToManagerInput(intent)).toMatchObject({
      height: 145n,
      certNo: intent.certNo,
      detail: intent.detail,
    });
    expect(cow).toMatchObject({
      height: 145,
      certNo: intent.certNo,
      detail: intent.detail,
      fatherId: intent.fatherId,
      motherId: intent.motherId,
    });
  });
  test("rejects edition/name-chip disagreement and duplicate or missing named traits", () => {
    const json = intentToJson(intent, 1360);
    expect(() => jsonToIntent(json, 1361)).toThrow("TOKEN_EDITION_MISMATCH");
    expect(() => jsonToIntent({ ...json, name: "cow #wrong" }, 1360)).toThrow(
      "NAME_CHIP_BINDING_MISMATCH",
    );
    expect(() =>
      jsonToIntent(
        { ...json, attributes: [...json.attributes, json.attributes[0]!] },
        1360,
      ),
    ).toThrow("DUPLICATE_TRAIT");
    const legacy = {
      ...json,
      attributes: json.attributes.filter(
        (trait) => trait.trait_type !== "CertNo",
      ),
    };
    expect(inspectLegacyTraits(legacy).missing).toEqual(["CertNo"]);
    expect(() => jsonToIntent(legacy, 1360)).toThrow("MISSING_TRAIT:CertNo");
  });
  test("does not accept invalid numeric/enum inputs into a new intent", () => {
    expect(
      buffaloIntentSchema.safeParse({ ...intent, height: NaN }).success,
    ).toBe(false);
    expect(
      buffaloIntentSchema.safeParse({ ...intent, sex: "unknown" }).success,
    ).toBe(false);
    expect(
      buffaloIntentSchema.safeParse({ ...intent, birthday: "2024-02-30" })
        .success,
    ).toBe(false);
  });
});

describe("explicit calendar serialization (run under UTC and Asia/Bangkok)", () => {
  test.each(["2024-02-29", "2024-06-30", "2026-01-01", "2026-12-31"])(
    "roundtrips %s without local timezone parsing",
    (day) => {
      expect(secondsToCalendar(calendarToSeconds(day))).toBe(day);
      const json = intentToJson({ ...intent, birthday: day }, 1360);
      expect(jsonToIntent(json, 1360).birthday).toBe(day);
      expect(
        databaseSnapshot(
          intentToDatabase({ ...intent, birthday: day }, 1360n, "0"),
        ).birthday,
      ).toBe(day);
    },
  );
  test("old birthday and issuedAt formats are deliberately different", () => {
    expect(legacyCalendar("06/07/2024", "MDY")).toBe("2024-06-07");
    expect(legacyCalendar("06/07/2024", "DMY")).toBe("2024-07-06");
    expect(() => calendarDay("2023-02-29")).toThrow();
    expect(() => legacyCalendar("30/06/2024", "MDY")).toThrow();
  });
});

describe("identity preflight, never writes or silently repairs legacy mismatches", () => {
  test.each([
    [
      "wrong requested token",
      { ...request, tokenId: 227n },
      identity,
      "COW_BINDING_CONFLICT",
    ],
    [
      "edition mismatch",
      { ...request, edition: 1361n },
      identity,
      "TOKEN_EDITION_MISMATCH",
    ],
    [
      "wrong chain token",
      request,
      { ...identity, tokenId: 228n },
      "TOKEN_MAPPING_CONFLICT",
    ],
    [
      "known wrong mapping",
      request,
      { ...identity, mappedTokenId: 228n },
      "TOKEN_MAPPING_CONFLICT",
    ],
    [
      "old chip alias",
      request,
      {
        ...identity,
        metadata: {
          ...chain,
          certify: { ...chain.certify, microchip: "another" },
        },
      },
      "CANONICAL_CHIP_CONFLICT",
    ],
    [
      "wrong network",
      request,
      { ...identity, domain: { ...domain, chainId: 1 } },
      "CHAIN_DOMAIN_CONFLICT",
    ],
    [
      "wrong contract",
      request,
      { ...identity, domain: { ...domain, manager: "0x9999" } },
      "CHAIN_DOMAIN_CONFLICT",
    ],
    [
      "uninitialized",
      request,
      { ...identity, initialized: false },
      "TOKEN_NOT_INITIALIZED",
    ],
    [
      "missing NFT",
      request,
      { ...identity, nftExists: false },
      "TOKEN_NOT_INITIALIZED",
    ],
  ] as const)("rejects %s", async (_name, req, observation, reason) => {
    await expect(
      preflightMutationIdentity(
        { ...req, changedFields: [...req.changedFields] },
        domain,
        ports(cow, observation),
      ),
    ).rejects.toThrow(reason);
  });
  test("duplicate DB token binding requires review", async () => {
    await expect(
      preflightMutationIdentity(request, domain, {
        ...ports(),
        findTokenBindings: async () => [cow, { ...cow, microchip: "another" }],
      }),
    ).rejects.toThrow("AMBIGUOUS_DB_TOKEN");
  });
  test("legacy IDB cow stays readable and safely eligible for unrelated edit", async () => {
    const legacy = { ...cow, microchip: "IDB1277", dna: "N/A", fatherId: null };
    const observed = {
      ...identity,
      metadata: {
        ...chain,
        certify: { ...chain.certify, microchip: legacy.microchip, dna: "" },
        relation: { ...chain.relation, fatherTokenId: "" },
      },
    };
    const result = await preflightMutationIdentity(
      { ...request, microchip: legacy.microchip },
      domain,
      ports(legacy, observed),
    );
    expect(result.baselineDifferences).toEqual([]);
    expect(
      (
        await readBuffaloMetadata(
          legacy.microchip,
          domain,
          ports(legacy, observed),
        )
      )?.microchip,
    ).toBe("IDB1277");
  });
  test("changed chip validates collision and declared field before allowing preflight", async () => {
    await expect(
      preflightMutationIdentity(
        { ...request, changedFields: ["microchip"], newMicrochip: "IDB9999" },
        domain,
        ports(),
      ),
    ).rejects.toThrow("INVALID_STANDARD_MICROCHIP");
    await expect(
      preflightMutationIdentity(
        { ...request, newMicrochip: "764040226601229" },
        domain,
        ports(),
      ),
    ).rejects.toThrow("UNDECLARED_MICROCHIP_CHANGE");
    await expect(
      preflightMutationIdentity(
        {
          ...request,
          changedFields: ["microchip"],
          newMicrochip: "764040226601229",
        },
        domain,
        {
          ...ports(),
          chipAvailability: {
            ...ports().chipAvailability,
            inActiveOperation: async () => true,
          },
        },
      ),
    ).rejects.toThrow("MICROCHIP_ALREADY_BOUND");
  });
  test("unrelated conflicting fields are reported and remain unchanged in chain-based patch", async () => {
    const original = { ...chain, color: "Albino", detail: "chain detail" };
    const baseline = JSON.stringify(original, (_key, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value,
    );
    const result = await preflightMutationIdentity(
      request,
      domain,
      ports(cow, { ...identity, metadata: original }),
    );
    expect(result.baselineDifferences.map((diff) => diff.field)).toEqual([
      "detail",
      "color",
    ]);
    const patched = patchChainBaseline(original, { name: "new name" });
    expect(patched).toEqual({ ...original, name: "new name" });
    expect(
      JSON.stringify(original, (_key, value: unknown) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    ).toBe(baseline);
    expect(patched.certify.dna).toBe(intent.dna);
    expect(patched.certify.issuedAt).toBe(chain.certify.issuedAt);
    expect(
      businessDifferences(databaseSnapshot(cow), chainSnapshot(original)),
    ).toHaveLength(2);
  });
  test("RPC outage rejects write preflight and preserves read", async () => {
    const unavailable = {
      ...ports(),
      readChain: async (): Promise<ChainIdentity> => {
        throw new Error("RPC down");
      },
    };
    await expect(
      preflightMutationIdentity(request, domain, unavailable),
    ).rejects.toThrow("RPC down");
    expect(
      await readBuffaloMetadata(cow.microchip, domain, unavailable),
    ).toMatchObject({
      name: intent.name,
      tokenId: 1360,
      sync: { status: "unavailable" },
    });
  });
  test("not found avoids any chain query; lookup conflicts never display foreign fields", async () => {
    const readChain = jest.fn(async () => identity);
    expect(
      await readBuffaloMetadata("missing", domain, {
        ...ports(),
        findCow: async () => null,
        readChain,
      }),
    ).toBeNull();
    expect(readChain).not.toHaveBeenCalled();
    expect(
      await readBuffaloMetadata(
        cow.microchip,
        domain,
        ports(cow, {
          ...identity,
          mappedTokenId: 228n,
          metadata: { ...chain, name: "foreign" },
        }),
      ),
    ).toMatchObject({
      name: intent.name,
      sync: { status: "identity_conflict" },
    });
  });
  test("matched assessment is explicitly limited, never claims image/publication proof", async () => {
    expect(
      await readBuffaloMetadata(cow.microchip, domain, ports()),
    ).toMatchObject({
      sync: {
        status: "matched",
        imageVerification: "unchecked",
        publicationVerification: "unchecked",
      },
    });
  });
  test("bounded RPC wait returns DB data with unavailable assessment", async () => {
    jest.useFakeTimers();
    try {
      const pending = readBuffaloMetadata(cow.microchip, domain, {
        ...ports(),
        readChain: () => new Promise<ChainIdentity>(() => undefined),
      });
      await jest.advanceTimersByTimeAsync(4000);
      expect(await pending).toMatchObject({
        name: intent.name,
        sync: { status: "unavailable" },
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
