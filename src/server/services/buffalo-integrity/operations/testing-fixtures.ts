import { privateKeyToAccount } from "viem/accounts";
import { keccak256 } from "viem";
import { randomUUID } from "crypto";
import { payloadHash, IntegrityError } from "./hash";
import {
  type Repository,
  type Operation,
  type Step,
  type Plan,
  type ChainPorts,
  type Domain,
} from "./types";

export const testKey = `0x${"42".repeat(32)}` as const;
export const account = privateKeyToAccount(testKey);
export const domain: Domain = {
  chainId: 96,
  nft: `0x${"11".repeat(20)}`,
  manager: `0x${"22".repeat(20)}`,
};
export const intent = {
  kind: "create" as const,
  buffalo: {
    version: 1 as const,
    name: "Synthetic",
    microchip: "999000000000001",
    certNo: "C1",
    origin: "thai",
    color: "Black",
    image: "https://example.test/operation.jpg",
    detail: "detail",
    sex: "Male" as const,
    rarity: "Normal" as const,
    birthday: "2024-06-30",
    issuedOn: "2026-10-17",
    height: 145,
    fatherId: "",
    motherId: "",
    dna: "",
  },
};
export const plan: Plan = {
  domain,
  sender: account.address.toLowerCase(),
  confirmations: 3,
  maxFeeWei: "50000000000000000",
  context: {},
};

/** Deliberate deterministic fake; actual durable/concurrency proof is a separate PG15 harness. */
export function memoryRepository() {
  const rows = new Map<string, Operation>();
  const allSteps = new Map<string, Step[]>();
  const claims = new Map<string, string>();
  const keys = new Map<string, string>();
  let walletStep: string | null = null;
  let fence = 0;
  const repo: Repository = {
    async create(owner, key, requested, requestedDomain) {
      const hash = payloadHash({ intent: requested, domain: requestedDomain });
      const previous = keys.get(`${owner}:${key}`);
      if (previous) {
        const row = rows.get(previous)!;
        if (row.intentHash !== hash)
          throw new IntegrityError("IDEMPOTENCY_PAYLOAD_CONFLICT");
        return structuredClone(row);
      }
      const id = randomUUID();
      const row: Operation = {
        id,
        owner,
        intentHash: hash,
        intent: requested,
        domain: requestedDomain,
        plan: null,
        state: "DRAFT",
        version: 0,
        fence: "0",
        actualToken: null,
        result: null,
        reason: null,
      };
      rows.set(id, row);
      allSteps.set(id, []);
      keys.set(`${owner}:${key}`, id);
      return structuredClone(row);
    },
    async get(id, owner) {
      const row = rows.get(id);
      if (!row || row.owner !== owner)
        throw new IntegrityError("OPERATION_NOT_FOUND");
      return structuredClone(row);
    },
    async steps(id) {
      return structuredClone(allSteps.get(id) ?? []);
    },
    async claim(id, owner, holder) {
      if (claims.has(id)) return null;
      const current = ++fence;
      claims.set(id, holder);
      rows.get(id)!.fence = String(current);
      return { id, owner, holder, fence: String(current) };
    },
    async release(claim) {
      if (claims.get(claim.id) === claim.holder) claims.delete(claim.id);
    },
    async setState(claim, state, reason, result) {
      const row = rows.get(claim.id)!;
      row.state = state;
      row.reason = reason ?? null;
      if (result) row.result = result;
      row.version++;
    },
    async ready(claim, approved) {
      rows.get(claim.id)!.plan = approved;
      rows.get(claim.id)!.state = "READY";
      rows.get(claim.id)!.version++;
    },
    async reserveStep(claim, spec, ordinal, approved) {
      const value: Step = {
        id: randomUUID(),
        operationId: claim.id,
        ordinal,
        kind: spec.kind,
        expected: spec.call,
        state: "RESERVED",
        chainId: approved.domain.chainId,
        sender: approved.sender,
        nonce: null,
        calldataHash: null,
        hash: null,
        signedBytes: null,
        envelope: null,
        receipt: null,
        proof: null,
      };
      allSteps.get(claim.id)!.push(value);
      return structuredClone(value);
    },
    async wallet(_claim, current) {
      if (walletStep && walletStep !== current.id) return null;
      walletStep = current.id;
      return {
        chainId: current.chainId,
        sender: current.sender,
        stepId: current.id,
        fence: "1",
      };
    },
    async journal(claim, _wallet, current, signed) {
      const row = allSteps
        .get(claim.id)!
        .find((entry) => entry.id === current.id)!;
      Object.assign(row, {
        nonce: String(signed.envelope.nonce),
        calldataHash: payloadHash(signed.envelope.data),
        hash: signed.hash,
        signedBytes: signed.bytes,
        envelope: signed.envelope,
        state: "SIGNED",
      });
      rows.get(claim.id)!.state = "SIGNING";
    },
    async assertBroadcast() {
      return undefined;
    },
    async markStep(claim, current, state, receipt, proof) {
      const row = allSteps
        .get(claim.id)!
        .find((entry) => entry.id === current.id)!;
      row.state = state;
      if (receipt) row.receipt = receipt;
      if (proof) row.proof = proof.details;
      if (proof?.actualToken)
        rows.get(claim.id)!.actualToken = proof.actualToken;
    },
    async releaseWallet(_claim, current) {
      if (walletStep === current.id) walletStep = null;
    },
    async complete(claim, result) {
      rows.get(claim.id)!.state = "COMPLETED";
      rows.get(claim.id)!.result = { ...result };
    },
    async cancel(claim) {
      if (allSteps.get(claim.id)!.some((entry) => entry.hash))
        throw new IntegrityError("CANNOT_CANCEL_SIGNED_OPERATION");
      rows.get(claim.id)!.state = "CANCELLED";
    },
  };
  return { repo, rows, allSteps };
}
export function fakeChain(): jest.Mocked<ChainPorts> {
  const ports: ChainPorts = {
    prepare: jest.fn(async () => plan),
    nextStep: jest.fn(async (_operation, steps) =>
      steps.length >= 2
        ? null
        : {
            kind:
              steps.length === 0 ? ("mint" as const) : ("metadata" as const),
            call: {
              to: steps.length === 0 ? domain.nft : domain.manager,
              data: "0x1234",
              value: "0",
              effects: [
                {
                  kind: "read" as const,
                  contract: domain.manager,
                  functionName: "syntheticRead",
                  args: [],
                  expected: "expected",
                  abi: [],
                },
              ],
            },
          },
    ),
    nonce: jest.fn(async () => ({ latest: 0, pending: 0 })),
    sign: jest.fn(async (_operation, current, nonce) => {
      const envelope = {
        chainId: 96,
        from: account.address,
        to: current.expected.to,
        data: current.expected.data,
        value: "0",
        nonce,
        gas: "100000",
        gasPrice: "1",
      };
      const bytes = await account.signTransaction({
        chainId: 96,
        to: envelope.to as `0x${string}`,
        data: envelope.data as `0x${string}`,
        value: 0n,
        nonce,
        gas: 100000n,
        gasPrice: 1n,
        type: "legacy",
      });
      return { bytes, hash: keccak256(bytes), envelope };
    }),
    broadcast: jest.fn(async (bytes) => keccak256(bytes as `0x${string}`)),
    observe: jest.fn(async (current) => ({
      state: "receipt" as const,
      receipt: {
        transactionHash: current.hash!,
        blockHash: `0x${"aa".repeat(32)}`,
        blockNumber: "100",
        status: "success" as const,
      },
      canonical: true,
      confirmations: 3,
    })),
    verifyEffects: jest.fn(async (_operation, current) => ({
      ...(current.kind === "mint" ? { actualToken: "2000" } : {}),
      details: { verified: true },
    })),
    project: jest.fn(async () => ({
      database: "dbhash",
      storage: "storagehash",
      manifest: "manifesthash",
    })),
    verifyPublication: jest.fn(async () => true),
  };
  return {
    prepare: jest.fn(ports.prepare),
    nextStep: jest.fn(ports.nextStep),
    nonce: jest.fn(ports.nonce),
    sign: jest.fn(ports.sign),
    broadcast: jest.fn(ports.broadcast),
    observe: jest.fn(ports.observe),
    verifyEffects: jest.fn(ports.verifyEffects),
    project: jest.fn(ports.project),
    verifyPublication: jest.fn(ports.verifyPublication),
  };
}
