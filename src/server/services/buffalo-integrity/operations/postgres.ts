import { randomUUID } from "crypto";
import { type Prisma, type PrismaClient } from "@prisma/client";
import { standardMicrochip } from "../intent";
import { payloadHash, IntegrityError, asJson } from "./hash";
import {
  operationIntentSchema,
  type Operation,
  type Domain,
  type OperationIntent,
  type Step,
  type Claim,
  type WalletClaim,
  type Signed,
  type Plan,
  type StepSpec,
  type Repository,
  type Json,
  type OperationState,
  type ReceiptProof,
  type EffectProof,
  type PublicationProof,
} from "./types";

type Tx = Prisma.TransactionClient;
type OpRow = {
  id: string;
  owner: string;
  intent_hash: string;
  intent: OperationIntent;
  domain: Domain;
  plan: Plan | null;
  state: OperationState;
  version: number;
  fence: bigint;
  actual_token: string | null;
  result: Json;
  reason: string | null;
};
type StepRow = {
  id: string;
  operation_id: string;
  ordinal: number;
  kind: Step["kind"];
  expected: Step["expected"];
  state: Step["state"];
  chain_id: number;
  sender: string;
  nonce: bigint | null;
  calldata_hash: string | null;
  transaction_hash: string | null;
  signed_bytes: string | null;
  transaction_envelope: Step["envelope"];
  receipt: ReceiptProof | null;
  proof: Json;
};
const operation = (row: OpRow): Operation => ({
  id: row.id,
  owner: row.owner,
  intentHash: row.intent_hash,
  intent: row.intent,
  domain: row.domain,
  plan: row.plan,
  state: row.state,
  version: row.version,
  fence: row.fence.toString(),
  actualToken: row.actual_token,
  result: row.result,
  reason: row.reason,
});
const step = (row: StepRow): Step => ({
  id: row.id,
  operationId: row.operation_id,
  ordinal: row.ordinal,
  kind: row.kind,
  expected: row.expected,
  state: row.state,
  chainId: row.chain_id,
  sender: row.sender,
  nonce: row.nonce?.toString() ?? null,
  calldataHash: row.calldata_hash,
  hash: row.transaction_hash,
  signedBytes: row.signed_bytes,
  envelope: row.transaction_envelope,
  receipt: row.receipt,
  proof: row.proof,
});

/** Each transaction below is short SQL only. No callback performs RPC, signing or storage I/O. */
export class PostgresOperationRepository implements Repository {
  constructor(
    private readonly db: PrismaClient,
    private readonly leaseSeconds = 30,
  ) {}
  private async transaction<T>(callback: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL lock_timeout='500ms'`;
        await tx.$executeRaw`SET LOCAL statement_timeout='2500ms'`;
        return callback(tx);
      },
      { maxWait: 1000, timeout: 3000 },
    );
  }
  private async event(
    tx: Tx,
    id: string,
    kind: string,
    detail: Json = {},
    stepId: string | null = null,
  ) {
    await tx.$executeRaw`INSERT INTO buffalo_integrity.event(operation_id,step_id,kind,detail) VALUES (${id}::uuid,${stepId}::uuid,${kind},${JSON.stringify(detail)}::jsonb)`;
  }
  private async locked<T>(
    claim: Claim,
    callback: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    return this.transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM buffalo_integrity.operation WHERE id=${claim.id}::uuid AND owner=${claim.owner} AND fence=${BigInt(claim.fence)} AND lease_owner=${claim.holder} AND lease_until>clock_timestamp() FOR UPDATE`;
      if (!rows[0]) throw new IntegrityError("STALE_OPERATION_LEASE");
      return callback(tx);
    });
  }
  async create(
    owner: string,
    key: string,
    input: OperationIntent,
    domain: Domain,
    singleActive = false,
  ): Promise<Operation> {
    if (!owner || !key || key.length > 128)
      throw new IntegrityError("INVALID_OPERATION_KEY");
    const intent = operationIntentSchema.parse(input);
    if (
      !Number.isSafeInteger(domain.chainId) ||
      domain.chainId <= 0 ||
      !/^0x[0-9a-fA-F]{40}$/.test(domain.nft) ||
      !/^0x[0-9a-fA-F]{40}$/.test(domain.manager)
    )
      throw new IntegrityError("INVALID_CHAIN_DOMAIN");
    if (Buffer.byteLength(JSON.stringify(intent), "utf8") > 262144)
      throw new IntegrityError("INTENT_TOO_LARGE");
    const canonicalDomain = {
      ...domain,
      nft: domain.nft.toLowerCase(),
      manager: domain.manager.toLowerCase(),
    };
    const hash = payloadHash({ intent, domain: canonicalDomain });
    return this.transaction(async (tx) => {
      if (singleActive) {
        const lock = await tx.$queryRaw<
          { ok: boolean }[]
        >`SELECT pg_try_advisory_xact_lock(hashtextextended(${`buffalo-create:${owner}`},0)) AS ok`;
        if (!lock[0]?.ok) throw new IntegrityError("ACCOUNT_OPERATION_BUSY");
        const active = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM buffalo_integrity.operation WHERE owner=${owner} AND idempotency_key<>${key} AND intent->>'kind'='create' AND state NOT IN ('COMPLETED','CANCELLED') LIMIT 1`;
        if (active[0]) throw new IntegrityError("CONTINUE_EXISTING_OPERATION");
      }
      const id = randomUUID();
      const inserted =
        await tx.$executeRaw`INSERT INTO buffalo_integrity.operation(id,owner,idempotency_key,intent_hash,intent,domain) VALUES (${id}::uuid,${owner},${key},${hash},${JSON.stringify(intent)}::jsonb,${JSON.stringify(canonicalDomain)}::jsonb) ON CONFLICT(owner,idempotency_key) DO NOTHING`;
      const rows = await tx.$queryRaw<
        OpRow[]
      >`SELECT * FROM buffalo_integrity.operation WHERE owner=${owner} AND idempotency_key=${key}`;
      const row = rows[0];
      if (!row || row.intent_hash !== hash)
        throw new IntegrityError("IDEMPOTENCY_PAYLOAD_CONFLICT");
      if (inserted) {
        const prefix = `${domain.chainId}:${canonicalDomain.nft}:`;
        const keys =
          intent.kind === "create"
            ? [`${prefix}chip:${intent.buffalo.microchip}`]
            : [
                `${prefix}chip:${intent.microchip}`,
                `${prefix}token:${intent.tokenId}`,
                ...(intent.patch.microchip &&
                intent.patch.microchip !== intent.microchip
                  ? [
                      `${prefix}chip:${standardMicrochip(intent.patch.microchip)}`,
                    ]
                  : []),
              ];
        for (const reservation of keys.sort()) {
          const claimed =
            await tx.$executeRaw`INSERT INTO buffalo_integrity.reservation(key,operation_id) VALUES (${reservation},${id}::uuid) ON CONFLICT DO NOTHING`;
          if (!claimed) throw new IntegrityError("COW_ALREADY_RESERVED");
        }
        await this.event(tx, id, "DRAFT_CREATED", { intentHash: hash });
      }
      return operation(row);
    });
  }
  async get(id: string, owner: string): Promise<Operation> {
    return this.transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        OpRow[]
      >`SELECT * FROM buffalo_integrity.operation WHERE id=${id}::uuid AND owner=${owner}`;
      if (!rows[0]) throw new IntegrityError("OPERATION_NOT_FOUND");
      return operation(rows[0]);
    });
  }
  async steps(id: string): Promise<Step[]> {
    return this.transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        StepRow[]
      >`SELECT * FROM buffalo_integrity.step WHERE operation_id=${id}::uuid ORDER BY ordinal`;
      return rows.map(step);
    });
  }
  async claim(
    id: string,
    owner: string,
    holder: string,
  ): Promise<Claim | null> {
    return this.transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { fence: bigint }[]
      >`UPDATE buffalo_integrity.operation SET lease_owner=${holder},lease_until=clock_timestamp()+(${this.leaseSeconds}::double precision*interval '1 second'),fence=fence+1 WHERE id=${id}::uuid AND owner=${owner} AND (lease_until IS NULL OR lease_until<clock_timestamp()) RETURNING fence`;
      return rows[0]
        ? { id, owner, holder, fence: rows[0].fence.toString() }
        : null;
    });
  }
  async release(claim: Claim): Promise<void> {
    await this.transaction(async (tx) => {
      await tx.$executeRaw`UPDATE buffalo_integrity.operation SET lease_owner=NULL,lease_until=NULL WHERE id=${claim.id}::uuid AND owner=${claim.owner} AND fence=${BigInt(claim.fence)} AND lease_owner=${claim.holder}`;
    });
  }
  async setState(
    claim: Claim,
    state: OperationState,
    reason?: string,
    result?: Json,
  ): Promise<void> {
    await this.locked(claim, async (tx) => {
      await tx.$executeRaw`UPDATE buffalo_integrity.operation SET state=${state},reason=${reason ?? null},result=COALESCE(${result === undefined ? null : JSON.stringify(result)}::jsonb,result),version=version+1,updated_at=clock_timestamp() WHERE id=${claim.id}::uuid`;
      await this.event(tx, claim.id, state, reason ? { reason } : {});
    });
  }
  async ready(claim: Claim, plan: Plan): Promise<void> {
    await this.locked(claim, async (tx) => {
      const updated =
        await tx.$executeRaw`UPDATE buffalo_integrity.operation SET state='READY',plan=${JSON.stringify(plan)}::jsonb,version=version+1,updated_at=clock_timestamp() WHERE id=${claim.id}::uuid AND state='DRAFT' AND plan IS NULL`;
      if (!updated) throw new IntegrityError("INVALID_OPERATION_STAGE");
      await this.event(tx, claim.id, "READY");
    });
  }
  async reserveStep(
    claim: Claim,
    spec: StepSpec,
    ordinal: number,
    plan: Plan,
  ): Promise<Step> {
    return this.locked(claim, async (tx) => {
      const id = randomUUID();
      await tx.$executeRaw`INSERT INTO buffalo_integrity.step(id,operation_id,ordinal,kind,expected,chain_id,sender) VALUES (${id}::uuid,${claim.id}::uuid,${ordinal},${spec.kind},${JSON.stringify(spec.call)}::jsonb,${plan.domain.chainId},${plan.sender.toLowerCase()}) ON CONFLICT(operation_id,ordinal) DO NOTHING`;
      const rows = await tx.$queryRaw<
        StepRow[]
      >`SELECT * FROM buffalo_integrity.step WHERE operation_id=${claim.id}::uuid AND ordinal=${ordinal}`;
      if (!rows[0] || payloadHash(rows[0].expected) !== payloadHash(spec.call))
        throw new IntegrityError("STEP_INTENT_CONFLICT");
      await this.event(tx, claim.id, "STEP_RESERVED", {}, rows[0].id);
      return step(rows[0]);
    });
  }
  async wallet(claim: Claim, current: Step): Promise<WalletClaim | null> {
    return this.locked(claim, async (tx) => {
      const rows = await tx.$queryRaw<
        { fence: bigint }[]
      >`INSERT INTO buffalo_integrity.wallet_lease(chain_id,sender,active_step,fence,lease_until) VALUES (${current.chainId},${current.sender},${current.id}::uuid,1,clock_timestamp()+interval '30 seconds') ON CONFLICT(chain_id,sender) DO UPDATE SET active_step=EXCLUDED.active_step,fence=buffalo_integrity.wallet_lease.fence+1,lease_until=EXCLUDED.lease_until WHERE buffalo_integrity.wallet_lease.active_step IS NULL OR buffalo_integrity.wallet_lease.active_step=EXCLUDED.active_step RETURNING fence`;
      return rows[0]
        ? {
            chainId: current.chainId,
            sender: current.sender,
            stepId: current.id,
            fence: rows[0].fence.toString(),
          }
        : null;
    });
  }
  async journal(
    claim: Claim,
    wallet: WalletClaim,
    current: Step,
    signed: Signed,
  ): Promise<void> {
    await this.locked(claim, async (tx) => {
      const guard = await tx.$queryRaw<
        { fence: bigint }[]
      >`SELECT fence FROM buffalo_integrity.wallet_lease WHERE chain_id=${wallet.chainId} AND sender=${wallet.sender} AND active_step=${current.id}::uuid AND fence=${BigInt(wallet.fence)} FOR UPDATE`;
      if (!guard[0]) throw new IntegrityError("STALE_WALLET_LEASE");
      const updated =
        await tx.$executeRaw`UPDATE buffalo_integrity.step SET nonce=${BigInt(signed.envelope.nonce)},calldata_hash=${payloadHash(signed.envelope.data)},transaction_hash=${signed.hash},signed_bytes=${signed.bytes},transaction_envelope=${JSON.stringify(signed.envelope)}::jsonb,state='SIGNED',updated_at=clock_timestamp() WHERE id=${current.id}::uuid AND operation_id=${claim.id}::uuid AND signed_bytes IS NULL`;
      if (!updated) throw new IntegrityError("STEP_ALREADY_SIGNED");
      await tx.$executeRaw`UPDATE buffalo_integrity.operation SET state='SIGNING',version=version+1,updated_at=clock_timestamp() WHERE id=${claim.id}::uuid`;
      await this.event(
        tx,
        claim.id,
        "SIGNED_BEFORE_BROADCAST",
        { hash: signed.hash, nonce: signed.envelope.nonce },
        current.id,
      );
    });
  }
  async assertBroadcast(claim: Claim, current: Step): Promise<void> {
    await this.locked(claim, async (tx) => {
      const guard = await tx.$queryRaw<
        { id: string }[]
      >`SELECT s.id FROM buffalo_integrity.step s JOIN buffalo_integrity.wallet_lease w ON w.active_step=s.id AND w.chain_id=s.chain_id AND w.sender=s.sender WHERE s.id=${current.id}::uuid AND s.operation_id=${claim.id}::uuid AND s.signed_bytes IS NOT NULL AND s.state IN ('SIGNED','PENDING','UNKNOWN')`;
      if (!guard[0]) throw new IntegrityError("STALE_BROADCAST_LEASE");
    });
  }
  async markStep(
    claim: Claim,
    current: Step,
    state: Step["state"],
    receipt?: ReceiptProof,
    proof?: EffectProof,
  ): Promise<void> {
    await this.locked(claim, async (tx) => {
      await tx.$executeRaw`UPDATE buffalo_integrity.step SET state=${state},receipt=COALESCE(${receipt ? JSON.stringify(receipt) : null}::jsonb,receipt),proof=COALESCE(${proof ? JSON.stringify(proof.details) : null}::jsonb,proof),updated_at=clock_timestamp() WHERE id=${current.id}::uuid AND operation_id=${claim.id}::uuid`;
      if (proof?.actualToken) {
        const prefix = `${current.chainId}:`;
        const rows = await tx.$queryRaw<
          OpRow[]
        >`SELECT * FROM buffalo_integrity.operation WHERE id=${claim.id}::uuid`;
        const record = rows[0]!;
        const key = `${prefix}${record.domain.nft.toLowerCase()}:token:${proof.actualToken}`;
        const claimed =
          await tx.$executeRaw`INSERT INTO buffalo_integrity.reservation(key,operation_id) VALUES (${key},${claim.id}::uuid) ON CONFLICT DO NOTHING`;
        if (!claimed) {
          const existing = await tx.$queryRaw<
            { operation_id: string }[]
          >`SELECT operation_id FROM buffalo_integrity.reservation WHERE key=${key}`;
          if (existing[0]?.operation_id !== claim.id)
            throw new IntegrityError("ACTUAL_TOKEN_RESERVED_BY_OTHER");
        }
        if (record.actual_token && record.actual_token !== proof.actualToken)
          throw new IntegrityError("ACTUAL_TOKEN_CHANGED");
        await tx.$executeRaw`UPDATE buffalo_integrity.operation SET actual_token=${proof.actualToken} WHERE id=${claim.id}::uuid`;
      }
      await this.event(
        tx,
        claim.id,
        `STEP_${state}`,
        { hash: current.hash, blockHash: receipt?.blockHash ?? null },
        current.id,
      );
    });
  }
  async releaseWallet(claim: Claim, current: Step): Promise<void> {
    await this.locked(claim, async (tx) => {
      await tx.$executeRaw`UPDATE buffalo_integrity.wallet_lease SET active_step=NULL,lease_until=NULL WHERE chain_id=${current.chainId} AND sender=${current.sender} AND active_step=${current.id}::uuid AND EXISTS (SELECT 1 FROM buffalo_integrity.step WHERE id=${current.id}::uuid AND state IN ('CONFIRMED','REVERTED') AND receipt IS NOT NULL)`;
    });
  }
  async complete(claim: Claim, result: PublicationProof): Promise<void> {
    await this.locked(claim, async (tx) => {
      const unfinished = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM buffalo_integrity.step WHERE operation_id=${claim.id}::uuid AND state<>'CONFIRMED'`;
      if (unfinished.length) throw new IntegrityError("UNVERIFIED_STEPS");
      const count = await tx.$queryRaw<
        { count: bigint }[]
      >`SELECT count(*) FROM buffalo_integrity.step WHERE operation_id=${claim.id}::uuid`;
      if (!count[0]?.count) throw new IntegrityError("NO_CHAIN_PROOF");
      await tx.$executeRaw`UPDATE buffalo_integrity.operation SET state='COMPLETED',result=${JSON.stringify(asJson(result))}::jsonb,reason=NULL,version=version+1,updated_at=clock_timestamp() WHERE id=${claim.id}::uuid`;
      await tx.$executeRaw`DELETE FROM buffalo_integrity.reservation WHERE operation_id=${claim.id}::uuid`;
      await this.event(tx, claim.id, "COMPLETED", asJson(result));
    });
  }
  async cancel(claim: Claim): Promise<void> {
    await this.locked(claim, async (tx) => {
      const signed = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM buffalo_integrity.step WHERE operation_id=${claim.id}::uuid AND signed_bytes IS NOT NULL`;
      if (signed.length)
        throw new IntegrityError("CANNOT_CANCEL_SIGNED_OPERATION");
      const changed =
        await tx.$executeRaw`UPDATE buffalo_integrity.operation SET state='CANCELLED',version=version+1 WHERE id=${claim.id}::uuid AND state IN ('DRAFT','READY','RETRYABLE','NEEDS_REVIEW','RECOVERY_REQUIRED','SIGNING')`;
      if (!changed) throw new IntegrityError("INVALID_CANCEL_STAGE");
      await tx.$executeRaw`UPDATE buffalo_integrity.wallet_lease SET active_step=NULL,lease_until=NULL WHERE active_step IN (SELECT id FROM buffalo_integrity.step WHERE operation_id=${claim.id}::uuid)`;
      await tx.$executeRaw`DELETE FROM buffalo_integrity.reservation WHERE operation_id=${claim.id}::uuid`;
      await this.event(tx, claim.id, "CANCELLED");
    });
  }
}
