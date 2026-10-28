/** @jest-environment node */
import {
  RepairDiagnosis,
  VERIFIED_MANAGER_CODE_HASH,
  VERIFIED_NFT_CODE_HASH,
} from "../diagnosis";
import {
  type DiagnosisPorts,
  type RepairProposal,
  type DatabaseSnapshot,
} from "../contract";
const a = "991000000000001",
  b = "991000000000002",
  c = "991000000000003";
const secret = "isolated-test-receipt-key-32-characters";
const proposal: RepairProposal = {
  targets: [
    {
      sourceMicrochip: a,
      desiredMicrochip: a,
      desiredTokenId: "1",
      evidence: [{ kind: "physical_scan", reference: "fixture-scan-A" }],
    },
  ],
  knownAliases: [],
};
function fixture() {
  const database: DatabaseSnapshot = {
    readAt: "2026-10-28T00:00:00Z",
    rows: [{ microchip: a, tokenId: "9", baseline: { name: "A" } }],
    references: [],
    reservations: [],
    catalogDigest: "catalog",
  };
  const ports: DiagnosisPorts = {
    assets: jest.fn(async () => ({
      verification: "complete" as const,
      blockers: [],
      tokens: [],
    })),
    pin: jest.fn(async () => ({
      chainId: 96,
      nft: "0xnft",
      manager: "0xmanager",
      blockNumber: "100",
      blockHash: "hash",
      nftCodeHash: VERIFIED_NFT_CODE_HASH,
      managerCodeHash: VERIFIED_MANAGER_CODE_HASH,
      totalSupply: 9,
      scanCount: 9,
      nextTokenId: "10",
      nftStorageHash: "nft-root",
      managerStorageHash: "manager-root",
    })),
    assertCurrent: jest.fn(async () => undefined),
    enumerate: jest.fn(async () => [
      { tokenId: "1", initialized: true, microchip: a },
      { tokenId: "2", initialized: true, microchip: b },
      ...Array.from({ length: 7 }, (_, i) => ({
        tokenId: String(i + 3),
        initialized: false,
        microchip: null,
      })),
    ]),
    database: jest.fn(async () => database),
    tokens: jest.fn(async (_pin, ids) =>
      ids.map((id) => ({
        tokenId: id,
        microchip: id === "1" ? a : b,
        dna: "dna",
        metadata: { name: id },
        owner: "owner",
        tokenUri: "uri",
        approvals: [],
        native: { createdAt: "1", updatedAt: "2" },
      })),
    ),
    aliases: jest.fn(async (_pin, chips) =>
      chips.map((microchip) => ({
        microchip,
        tokenId: microchip === a ? "1" : "2",
      })),
    ),
  };
  let time = 0;
  const service = new RepairDiagnosis(ports, secret, () => time);
  async function scan() {
    const start = await service.start();
    const page = await service.page(start.scan, 0);
    return { scan: start.scan, pages: [page.receipt] };
  }
  return {
    service,
    ports,
    database,
    scan,
    setTime: (n: number) => {
      time = n;
    },
  };
}
describe("read-only repair diagnosis", () => {
  test("wrong DB token generates DB-only preview without chain transaction", async () => {
    const f = fixture(),
      s = await f.scan();
    const result = await f.service.preview(s.scan, s.pages, proposal);
    expect(result.status).toBe("ready_for_operator_review");
    expect(result.manifest.changes[0]).toMatchObject({
      databaseChange: true,
      chainChange: false,
    });
    expect(result.manifest.effects.metadataCounterIncrement).toBe(0);
    expect(result.manifest.authority).toBe("preview_only");
    expect(result.manifest.coverage.aliases).toBe("known_only_non_enumerable");
    expect(f.ports.assertCurrent).toHaveBeenCalledTimes(2);
  });
  test("missing pages cannot claim complete inventory", async () => {
    const f = fixture(),
      s = await f.scan();
    await expect(f.service.preview(s.scan, [], proposal)).rejects.toThrow(
      "REPAIR_SCAN_INCOMPLETE",
    );
    expect(f.ports.database).not.toHaveBeenCalled();
  });
  test("tampered page rejected", async () => {
    const f = fixture(),
      s = await f.scan();
    await expect(
      f.service.preview(s.scan, ["x" + s.pages[0]], proposal),
    ).rejects.toThrow("REPAIR_SCAN_INVALID");
  });
  test("page replay from another scan rejected", async () => {
    const f = fixture(),
      s = await f.scan(),
      other = await f.scan();
    await expect(
      f.service.preview(s.scan, other.pages, proposal),
    ).rejects.toThrow("REPAIR_SCAN_INCOMPLETE");
  });
  test("duplicate page rejected", async () => {
    const f = fixture(),
      s = await f.scan();
    await expect(
      f.service.preview(s.scan, [...s.pages, ...s.pages], proposal),
    ).rejects.toThrow("REPAIR_SCAN_INCOMPLETE");
  });
  test("expired scan rejected", async () => {
    const f = fixture(),
      s = await f.scan();
    f.setTime(1800001);
    await expect(f.service.preview(s.scan, s.pages, proposal)).rejects.toThrow(
      "REPAIR_SCAN_EXPIRED",
    );
  });
  test("stale block propagates safe error", async () => {
    const f = fixture(),
      s = await f.scan();
    f.ports.assertCurrent = jest.fn(async () => {
      throw new Error("REPAIR_BASELINE_CHANGED");
    });
    await expect(f.service.preview(s.scan, s.pages, proposal)).rejects.toThrow(
      "REPAIR_BASELINE_CHANGED",
    );
  });
  test("missing physical authority blocks eligibility", async () => {
    const f = fixture(),
      s = await f.scan();
    const p = structuredClone(proposal);
    p.targets[0]!.evidence = [];
    expect((await f.service.preview(s.scan, s.pages, p)).blockers).toContain(
      "NEEDS_IDENTITY_DECISION",
    );
  });
  test("third cow using desired token expands closure", async () => {
    const f = fixture(),
      s = await f.scan();
    f.database.rows.push({ microchip: c, tokenId: "1", baseline: {} });
    expect(
      (await f.service.preview(s.scan, s.pages, proposal)).blockers,
    ).toContain("EXPANDED_SCOPE_REQUIRED");
  });
  test("known alias mapping outside closure blocks eligibility", async () => {
    const f = fixture(),
      s = await f.scan();
    f.ports.aliases = async () => [{ microchip: a, tokenId: "999" }];
    expect(
      (await f.service.preview(s.scan, s.pages, proposal)).blockers,
    ).toContain("ALIAS_OUTSIDE_SCOPE");
  });
  test("shared reservation blocks eligibility", async () => {
    const f = fixture(),
      s = await f.scan();
    f.database.reservations.push({
      key: "96:0xnft:token:1",
      operationId: "operation",
    });
    expect(
      (await f.service.preview(s.scan, s.pages, proposal)).blockers,
    ).toContain("ACTIVE_OPERATION");
  });
  test("pair chip swap describes DNA clearing and counter increment", async () => {
    const f = fixture(),
      s = await f.scan();
    f.database.rows[0]!.tokenId = "1";
    f.database.rows.push({
      microchip: b,
      tokenId: "2",
      baseline: { name: "B" },
    });
    const p: RepairProposal = {
      targets: [
        { ...proposal.targets[0]!, desiredMicrochip: b },
        {
          ...proposal.targets[0]!,
          sourceMicrochip: b,
          desiredMicrochip: a,
          desiredTokenId: "2",
        },
      ],
      knownAliases: [],
    };
    const result = await f.service.preview(s.scan, s.pages, p);
    expect(result.status).toBe("ready_for_operator_review");
    expect(result.manifest.effects.dnaClearedThenRestored).toEqual(["1", "2"]);
    expect(result.manifest.effects.metadataCounterIncrement).toBe(2);
  });
  test("independent certificate ownership prevents automatic PK swap", async () => {
    const f = fixture(),
      s = await f.scan();
    f.database.references.push({
      kind: "Certificate",
      key: a,
      chips: [a],
      digest: "reference",
    });
    const p = structuredClone(proposal);
    p.targets[0]!.desiredMicrochip = c;
    expect((await f.service.preview(s.scan, s.pages, p)).blockers).toContain(
      "REFERENCE_OWNERSHIP_REVIEW_REQUIRED",
    );
  });
  test("duplicate canonical chip is found across enumeration", async () => {
    const f = fixture();
    const reader = f.ports.tokens;
    f.ports.tokens = async (pin, ids) =>
      (await reader(pin, ids)).map((token) => ({ ...token, microchip: a }));
    f.ports.enumerate = async () => [
      { tokenId: "1", initialized: true, microchip: a },
      { tokenId: "2", initialized: true, microchip: a },
      ...Array.from({ length: 7 }, (_, i) => ({
        tokenId: String(i + 3),
        initialized: false,
        microchip: null,
      })),
    ];
    const s = await f.scan();
    expect(
      (await f.service.preview(s.scan, s.pages, proposal)).blockers,
    ).toContain("EXPANDED_SCOPE_REQUIRED");
  });
  test("evidence and baseline changes alter immutable digest", async () => {
    const f = fixture(),
      s = await f.scan(),
      first = await f.service.preview(s.scan, s.pages, proposal);
    f.database.rows[0]!.baseline = { name: "changed" };
    const second = await f.service.preview(s.scan, s.pages, proposal);
    expect(second.digest).not.toBe(first.digest);
  });
  test("mapping-only repair requires batch and DNA restoration", async () => {
    const f = fixture(),
      s = await f.scan();
    f.database.rows[0]!.tokenId = "1";
    f.ports.aliases = async () => [{ microchip: a, tokenId: "0" }];
    const result = await f.service.preview(s.scan, s.pages, proposal);
    expect(result.status).toBe("ready_for_operator_review");
    expect(result.manifest.changes[0]).toMatchObject({
      databaseChange: false,
      chainChange: true,
    });
    expect(result.manifest.effects.dnaClearedThenRestored).toEqual(["1"]);
  });
  test("old DB binding canonical and reservation remain in observed closure", async () => {
    const f = fixture(),
      s = await f.scan();
    f.database.rows[0]!.tokenId = "2";
    const result = await f.service.preview(s.scan, s.pages, proposal);
    expect(result.blockers).toContain("EXPANDED_SCOPE_REQUIRED");
    expect(result.manifest.observedTokens).toContain("2");
    expect(result.manifest.reservationKeys).toContain("96:0xnft:token:2");
  });
  test("single canonical typo requires exact prior value and physical evidence", async () => {
    const f = fixture();
    f.database.rows[0]!.tokenId = "1";
    f.ports.enumerate = async () => [
      { tokenId: "1", initialized: true, microchip: c },
      { tokenId: "2", initialized: true, microchip: b },
      ...Array.from({ length: 7 }, (_, i) => ({
        tokenId: String(i + 3),
        initialized: false,
        microchip: null,
      })),
    ];
    f.ports.aliases = async (_pin, chips) =>
      chips.map((microchip) => ({ microchip, tokenId: "1" }));
    const s = await f.scan();
    const previousTokenRead = f.ports.tokens;
    f.ports.tokens = async (pin, ids) =>
      (await previousTokenRead(pin, ids)).map((token) => ({
        ...token,
        microchip: token.tokenId === "1" ? c : token.microchip,
      }));
    const pending = await f.service.preview(s.scan, s.pages, proposal);
    expect(pending.blockers).toContain("IDENTITY_EVIDENCE_REVIEW_REQUIRED");
    const resolved = structuredClone(proposal);
    resolved.targets[0]!.confirmedPreviousCanonicalMicrochip = c;

    const result = await f.service.preview(s.scan, s.pages, resolved);
    expect(result.blockers).not.toContain("IDENTITY_EVIDENCE_REVIEW_REQUIRED");
    expect(result.manifest.assets.verification).toBe("complete");
  });
  test("zero-owner burned target cannot be repaired as a live NFT", async () => {
    const f = fixture(),
      scan = await f.scan(),
      reader = f.ports.tokens;
    f.ports.tokens = async (pin, ids) =>
      (await reader(pin, ids)).map((token) => ({
        ...token,
        owner: "0x" + "0".repeat(40),
      }));
    expect(
      (await f.service.preview(scan.scan, scan.pages, proposal)).blockers,
    ).toContain("NFT_OWNER_ZERO");
  });
  test("observed historical token outside verified current-domain range blocks", async () => {
    const f = fixture(),
      scan = await f.scan();
    f.database.rows[0]!.tokenId = "999";
    expect(
      (await f.service.preview(scan.scan, scan.pages, proposal)).blockers,
    ).toContain("OUTSIDE_VERIFIED_MINT_RANGE");
  });
  test("database content digest is stable across observation time only", async () => {
    const f = fixture(),
      scan = await f.scan();
    const first = await f.service.preview(scan.scan, scan.pages, proposal);
    f.database.readAt = "later";
    const second = await f.service.preview(scan.scan, scan.pages, proposal);
    expect(second.manifest.databaseDigest).toBe(first.manifest.databaseDigest);
    expect(second.digest).not.toBe(first.digest);
  });
  test("immutable JSON replacement declares URI and native timestamp changes", async () => {
    const f = fixture(),
      scan = await f.scan();
    f.ports.assets = async () => ({
      verification: "complete",
      blockers: [],
      tokens: [
        {
          tokenId: "1",
          before: [],
          after: {
            imageHash: "image",
            jsonHash: "json",
            json: {},
            aliasImageKey: "buffalo/1.jpg",
            aliasJsonKey: "json/1.json",
            uriStrategy: "publish_immutable_then_set_token_uri",
            expectedUriSetterCount: 1,
            immutablePathBinding: "bind_operation_key_before_approval",
          },
        },
      ],
    });
    const result = await f.service.preview(scan.scan, scan.pages, proposal);
    expect(result.manifest.effects.preserves).not.toContain("token_URI");
    expect(result.manifest.effects.nftNativeTimestampsReset).toEqual(["1"]);
  });
  test("legacy malformed source and aliases stay exact while desired chip stays standard", async () => {
    const f = fixture(),
      scan = await f.scan();
    const source = " legacy-typo ";
    f.database.rows[0]!.microchip = source;
    f.ports.aliases = async (_pin, chips) =>
      chips.map((microchip) => ({
        microchip,
        tokenId: microchip === a ? "1" : "0",
      }));
    const p = {
      ...proposal,
      targets: [{ ...proposal.targets[0]!, sourceMicrochip: source }],
      knownAliases: ["legacy-alias"],
    };
    const result = await f.service.preview(scan.scan, scan.pages, p);
    expect(result.manifest.proposal.targets[0]!.sourceMicrochip).toBe(source);
    expect(result.manifest.closure.aliases).toContainEqual({
      microchip: "legacy-alias",
      tokenId: "0",
    });
    expect(result.status).toBe("ready_for_operator_review");
    await expect(
      f.service.preview(scan.scan, scan.pages, {
        ...p,
        targets: [{ ...p.targets[0]!, desiredMicrochip: "bad-new-chip" }],
      }),
    ).rejects.toThrow();
  });
});
