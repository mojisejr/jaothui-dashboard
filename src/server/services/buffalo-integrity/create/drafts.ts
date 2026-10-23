import { randomUUID } from "crypto";
import { type PrismaClient, type Prisma } from "@prisma/client";
import {
  type Claim,
  type Operation,
  type OperationIntent,
  type Domain,
} from "../operations/types";
import { IntegrityError, payloadHash } from "../operations/hash";
import { type PostgresOperationRepository } from "../operations/postgres";
import { type Json } from "../operations/types";

export class DraftStore {
  constructor(
    readonly db: PrismaClient,
    readonly operations: PostgresOperationRepository,
  ) {}
  private async sql<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL lock_timeout='500ms'`;
        await tx.$executeRaw`SET LOCAL statement_timeout='2500ms'`;
        return callback(tx);
      },
      { timeout: 3000, maxWait: 1000 },
    );
  }
  async list(owner: string) {
    const rows = await this.sql(
      (tx) =>
        tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM buffalo_integrity.operation WHERE owner=${owner} AND intent->>'kind'='create' AND state<>'CANCELLED' ORDER BY (state NOT IN ('COMPLETED','CANCELLED')) DESC, created_at DESC LIMIT 30`,
    );
    return Promise.all(rows.map((row) => this.operations.get(row.id, owner)));
  }
  async byKey(owner: string, key: string) {
    const rows = await this.sql(
      (tx) =>
        tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM buffalo_integrity.operation WHERE owner=${owner} AND idempotency_key=${key}`,
    );
    return rows[0] ? this.operations.get(rows[0].id, owner) : null;
  }
  async key(id: string, owner: string) {
    const rows = await this.sql(
      (tx) =>
        tx.$queryRaw<
          { idempotency_key: string; created_at: Date }[]
        >`SELECT idempotency_key,created_at FROM buffalo_integrity.operation WHERE id=${id}::uuid AND owner=${owner}`,
    );
    if (!rows[0]) throw new IntegrityError("OPERATION_NOT_FOUND");
    return rows[0];
  }
  async observed(op: Operation, kind: string, detail: Json) {
    await this.sql(async (tx) => {
      const count =
        await tx.$executeRaw`INSERT INTO buffalo_integrity.event(operation_id,kind,detail) SELECT id,${kind},${JSON.stringify(detail)}::jsonb FROM buffalo_integrity.operation WHERE id=${op.id}::uuid AND owner=${op.owner} AND fence=${BigInt(op.fence)} AND lease_until>clock_timestamp()`;
      if (!count) throw new IntegrityError("STALE_OPERATION_LEASE");
    });
  }
  async image(claim: Claim, version: number, evidence: Json) {
    await this.sql(async (tx) => {
      const changed =
        await tx.$executeRaw`UPDATE buffalo_integrity.operation SET result=COALESCE(result,'{}'::jsonb)||${JSON.stringify(evidence)}::jsonb,version=version+1 WHERE id=${claim.id}::uuid AND owner=${claim.owner} AND fence=${BigInt(claim.fence)} AND lease_owner=${claim.holder} AND lease_until>clock_timestamp() AND version=${version} AND state='DRAFT' AND plan IS NULL`;
      if (!changed) throw new IntegrityError("STALE_DRAFT_REVISION");
      await tx.$executeRaw`INSERT INTO buffalo_integrity.event(operation_id,kind,detail) VALUES (${claim.id}::uuid,'IMAGE_BOUND',${JSON.stringify(evidence)}::jsonb)`;
    });
  }
  async revise(
    claim: Claim,
    version: number,
    key: string,
    intent: OperationIntent,
    domain: Domain,
  ): Promise<string> {
    const id = randomUUID();
    const canonical = {
      ...domain,
      nft: domain.nft.toLowerCase(),
      manager: domain.manager.toLowerCase(),
    };
    await this.sql(async (tx) => {
      const previous = await tx.$queryRaw<
        { id: string; created_at: Date; result: Json }[]
      >`SELECT id,created_at,result FROM buffalo_integrity.operation WHERE id=${claim.id}::uuid AND owner=${claim.owner} AND version=${version} AND fence=${BigInt(claim.fence)} AND lease_owner=${claim.holder} AND lease_until>clock_timestamp() AND state IN ('DRAFT','READY') FOR UPDATE`;
      if (!previous[0]) throw new IntegrityError("STALE_DRAFT_REVISION");
      const signed = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM buffalo_integrity.step WHERE operation_id=${claim.id}::uuid AND signed_bytes IS NOT NULL`;
      if (signed.length) throw new IntegrityError("INTENT_FROZEN");
      await tx.$executeRaw`UPDATE buffalo_integrity.operation SET state='CANCELLED',version=version+1 WHERE id=${claim.id}::uuid`;
      await tx.$executeRaw`DELETE FROM buffalo_integrity.reservation WHERE operation_id=${claim.id}::uuid`;
      await tx.$executeRaw`INSERT INTO buffalo_integrity.operation(id,owner,idempotency_key,intent_hash,intent,domain,result) VALUES (${id}::uuid,${claim.owner},${key},${payloadHash({ intent, domain: canonical })},${JSON.stringify(intent)}::jsonb,${JSON.stringify(canonical)}::jsonb,${JSON.stringify({ originalCreatedAt: previous[0].result && typeof previous[0].result === "object" && !Array.isArray(previous[0].result) && typeof previous[0].result.originalCreatedAt === "string" ? previous[0].result.originalCreatedAt : previous[0].created_at.toISOString() })}::jsonb)`;
      if (intent.kind !== "create")
        throw new IntegrityError("CREATE_DRAFT_REQUIRED");
      await tx.$executeRaw`INSERT INTO buffalo_integrity.reservation(key,operation_id) VALUES (${`${domain.chainId}:${canonical.nft}:chip:${intent.buffalo.microchip}`},${id}::uuid)`;
      await tx.$executeRaw`INSERT INTO buffalo_integrity.event(operation_id,kind,detail) VALUES (${claim.id}::uuid,'DRAFT_REVISED',${JSON.stringify({ nextOperation: id })}::jsonb),(${id}::uuid,'DRAFT_CREATED',${JSON.stringify({ previousOperation: claim.id })}::jsonb)`;
    });
    return id;
  }
  async withDraft<T>(
    id: string,
    owner: string,
    version: number,
    callback: (claim: Claim, operation: Operation) => Promise<T>,
  ) {
    const claim = await this.operations.claim(id, owner, randomUUID());
    if (!claim) throw new IntegrityError("DRAFT_BUSY");
    try {
      const op = await this.operations.get(id, owner);
      if (op.version !== version || !["DRAFT", "READY"].includes(op.state))
        throw new IntegrityError("STALE_DRAFT_REVISION");
      return await callback(claim, op);
    } finally {
      await this.operations.release(claim);
    }
  }
}
