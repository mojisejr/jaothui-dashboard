/** @jest-environment node */
import { randomUUID } from "crypto";
import { spawnSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";
import { encodeFunctionData, type Hex } from "viem";
import { PostgresOperationRepository } from "../postgres";
import { OperationEngine } from "../engine";
import { loopbackChainPorts, type LoopbackConfig } from "../loopback";
import { asJson, payloadHash } from "../hash";
import { type Json, type Plan } from "../types";
import {
  intent as sample,
  domain as syntheticDomain,
  plan as samplePlan,
  fakeChain,
} from "../testing-fixtures";
import {
  intentToDatabase,
  databaseSnapshot,
  intentToManagerInput,
} from "../../field-policy";
import { intentToJson } from "../../json-adapter";
import { abi as nftAbi, address as nft } from "~/server/blockchain/nft/abi";
import {
  abi as managerAbi,
  address as manager,
} from "~/server/blockchain/metadata-maneger/abi";

const databaseUrl = process.env.BUFFALO_INTEGRITY_TEST_DATABASE_URL;
const infra = databaseUrl ? describe : describe.skip;
infra(
  "disposable PG15 + loopback Anvil only (explicit environment required)",
  () => {
    const url = databaseUrl!;
    let a: PrismaClient, b: PrismaClient;
    const owner = `phase2:${randomUUID()}`;
    const chip = () =>
      `999${String(Math.floor(Math.random() * 1e12)).padStart(12, "0")}`;
    beforeAll(async () => {
      const parsed = new URL(url);
      if (
        !["127.0.0.1", "[::1]"].includes(parsed.hostname) ||
        !parsed.pathname.includes("integrity")
      )
        throw Error("DISPOSABLE_DATABASE_REQUIRED");
      a = new PrismaClient({ datasources: { db: { url } } });
      b = new PrismaClient({ datasources: { db: { url } } });
      const version = await a.$queryRaw<
        { server_version: string }[]
      >`SHOW server_version`;
      expect(version[0]!.server_version).toMatch(/^15\./);
      const stale = await a.$queryRaw<
        { id: string; owner: string }[]
      >`SELECT id,owner FROM buffalo_integrity.operation o WHERE owner LIKE 'phase2:%' AND state IN ('DRAFT','READY','RETRYABLE') AND NOT EXISTS (SELECT 1 FROM buffalo_integrity.step s WHERE s.operation_id=o.id AND signed_bytes IS NOT NULL)`;
      const cleanup = new PostgresOperationRepository(a);
      for (const row of stale) {
        const claim = await cleanup.claim(
          row.id,
          row.owner,
          "dispose-unsigned-test-draft",
        );
        if (claim) {
          await cleanup.cancel(claim);
          await cleanup.release(claim);
        }
      }
    });
    afterAll(async () => {
      await Promise.all([a?.$disconnect(), b?.$disconnect()]);
    });
    test("independent clients, restart, unique intents, fence expiry and signed wallet ownership", async () => {
      const ra = new PostgresOperationRepository(a),
        rb = new PostgresOperationRepository(b);
      const requested = {
        ...sample,
        buffalo: { ...sample.buffalo, microchip: chip() },
      };
      const key = randomUUID();
      const created = await Promise.all([
        ra.create(owner, key, requested, syntheticDomain),
        rb.create(owner, key, requested, syntheticDomain),
      ]);
      expect(created[0].id).toBe(created[1].id);
      const operation = created[0];
      await expect(
        rb.create(
          owner,
          key,
          { ...requested, buffalo: { ...requested.buffalo, name: "conflict" } },
          syntheticDomain,
        ),
      ).rejects.toThrow("IDEMPOTENCY_PAYLOAD_CONFLICT");
      await expect(rb.get(operation.id, "another-account")).rejects.toThrow(
        "OPERATION_NOT_FOUND",
      );
      const claimA = (await ra.claim(operation.id, owner, "instance-a"))!;
      expect(await rb.claim(operation.id, owner, "instance-b")).toBeNull();
      await ra.ready(claimA, samplePlan);
      const fake = fakeChain();
      const spec = (await fake.nextStep(operation, []))!;
      const current = await ra.reserveStep(claimA, spec, 0, samplePlan);
      const walletA = (await ra.wallet(claimA, current))!;
      await a.$executeRaw`UPDATE buffalo_integrity.operation SET lease_until=clock_timestamp()-interval '1 second' WHERE id=${operation.id}::uuid`;
      const claimB = (await rb.claim(operation.id, owner, "instance-b"))!;
      const nonceRows = await a.$queryRaw<
        { nonce: bigint }[]
      >`SELECT COALESCE(max(nonce),-1)+1 AS nonce FROM buffalo_integrity.step WHERE chain_id=96 AND sender=${current.sender}`;
      const signed = await fake.sign(
        { ...operation, plan: samplePlan },
        current,
        Number(nonceRows[0]!.nonce),
      );
      await expect(
        ra.journal(claimA, walletA, current, signed),
      ).rejects.toThrow("STALE_OPERATION_LEASE");
      const walletB = (await rb.wallet(claimB, current))!;
      await rb.journal(claimB, walletB, current, signed);
      await rb.assertBroadcast(claimB, (await rb.steps(operation.id))[0]!);
      await rb.release(claimB);
      const clientC = new PrismaClient({ datasources: { db: { url } } });
      const restarted = new PostgresOperationRepository(clientC);
      expect((await restarted.steps(operation.id))[0]!.hash).toBe(signed.hash);
      // A different cow cannot take the wallet even after lease expiry while this signed nonce is unknown.
      const second = await rb.create(
        owner,
        randomUUID(),
        { ...sample, buffalo: { ...sample.buffalo, microchip: chip() } },
        syntheticDomain,
      );
      const secondClaim = (await rb.claim(second.id, owner, "instance-c"))!;
      await rb.ready(secondClaim, samplePlan);
      const secondStep = await rb.reserveStep(secondClaim, spec, 0, samplePlan);
      await a.$executeRaw`UPDATE buffalo_integrity.wallet_lease SET lease_until=clock_timestamp()-interval '1 hour' WHERE chain_id=96 AND sender=${current.sender}`;
      expect(await rb.wallet(secondClaim, secondStep)).toBeNull();
      await rb.cancel(secondClaim);
      await rb.release(secondClaim);
      // Test-only synthetic row reconciles a canonical failure; no real blockchain was used in this subcase.
      const cleanup = (await rb.claim(
        operation.id,
        owner,
        "reconcile-fixture",
      ))!;
      await rb.markStep(cleanup, current, "REVERTED", {
        transactionHash: signed.hash,
        blockHash: `0x${"ab".repeat(32)}`,
        blockNumber: "1",
        status: "reverted",
      });
      await rb.releaseWallet(cleanup, current);
      await rb.setState(cleanup, "NEEDS_REVIEW", "SYNTHETIC_REVERT_FIXTURE");
      await rb.release(cleanup);
      // The additional connection is explicitly disconnected, simulating a process restart rather than relying on memory.
      await clientC.$disconnect();
    }, 30000);

    test("held SQL row lock fails within DB timeout instead of hanging the request", async () => {
      const repo = new PostgresOperationRepository(a);
      const operation = await repo.create(
        owner,
        randomUUID(),
        { ...sample, buffalo: { ...sample.buffalo, microchip: chip() } },
        syntheticDomain,
      );
      let unlocked: () => void = () => undefined;
      let acquired: () => void = () => undefined;
      const ready = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      const release = new Promise<void>((resolve) => {
        unlocked = resolve;
      });
      const holding = b.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM buffalo_integrity.operation WHERE id=${operation.id}::uuid FOR UPDATE`;
          acquired();
          await release;
        },
        { timeout: 5000 },
      );
      await ready;
      const start = Date.now();
      try {
        await expect(
          repo.claim(operation.id, owner, "blocked-client"),
        ).rejects.toThrow();
        expect(Date.now() - start).toBeLessThan(2000);
      } finally {
        unlocked();
        await holding;
      }
      const claim = (await repo.claim(operation.id, owner, "cleanup"))!;
      await repo.cancel(claim);
      await repo.release(claim);
    });
    test("real fork mint + metadata receipts bind actual ID; DB/file projection crash resumes without remint", async () => {
      const signer = JSON.parse(
        readFileSync(resolve(".tmp/phase2/local-signer.json"), "utf8"),
      ) as {
        privateKey: Hex;
        address: string;
        rpcUrl: string;
        chainId: number;
      };
      const identity = JSON.parse(
        readFileSync(resolve(".tmp/phase2/fork-identity.json"), "utf8"),
      ) as { contracts: { address: string; codeHash: string }[] };
      const requested = {
        ...sample,
        buffalo: {
          ...sample.buffalo,
          microchip: chip(),
          name: `Synthetic ${randomUUID()}`,
        },
      };
      const rpc = async (method: string, params: Json[] = []) => {
        const response = await fetch(signer.rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          signal: AbortSignal.timeout(8000),
        });
        const result = (await response.json()) as {
          result: Json;
          error?: unknown;
        };
        if (result.error) throw Error(`LOCAL_FIXTURE_RPC_FAILED:${method}`);
        return result.result;
      };
      const domain = { chainId: 96, nft, manager };
      const origin = resolve(".tmp/phase2/origins");
      mkdirSync(origin, { recursive: true });
      const tokenUri = `https://example.test/phase2/${randomUUID()}.json`;
      const metadataResponse = await fetch(signer.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "anvil_metadata",
          params: [],
        }),
      });
      const instance = (await metadataResponse.json()) as {
        result: { instanceId: string };
      };
      const approved: Plan = {
        executionInstance: instance.result.instanceId,
        domain,
        sender: signer.address.toLowerCase(),
        confirmations: 3,
        maxFeeWei: "50000000000000000",
        context: { tokenUri },
      };
      let projections = 0,
        signatures = 0;
      const config: LoopbackConfig = {
        expectedInstanceId: instance.result.instanceId,
        rpcUrl: signer.rpcUrl,
        privateKey: signer.privateKey,
        domain,
        codeHashes: Object.fromEntries(
          identity.contracts.map((entry) => [
            entry.address.toLowerCase(),
            entry.codeHash,
          ]),
        ),
        maxFeeWei: approved.maxFeeWei,
        prepare: async () => approved,
        nextStep: async (operation, steps) => {
          if (steps.length === 0)
            return {
              kind: "mint",
              call: {
                to: nft,
                data: encodeFunctionData({
                  abi: nftAbi,
                  functionName: "mintWithMetadata",
                  args: [signer.address, requested.buffalo.image, tokenUri],
                }),
                value: "0",
                effects: [
                  {
                    kind: "mint",
                    nft,
                    receiver: signer.address,
                    imageUri: requested.buffalo.image,
                    tokenUri,
                  },
                ],
              },
            };
          if (steps.length === 1) {
            if (!operation.actualToken)
              throw Error("ACTUAL_RECEIPT_ID_REQUIRED");
            const input = intentToManagerInput(requested.buffalo);
            const expected = {
              ...databaseSnapshot(
                intentToDatabase(
                  requested.buffalo,
                  BigInt(operation.actualToken),
                  "0",
                ),
              ),
              issuedAt: input.issuedAt.toString(),
            };
            return {
              kind: "metadata",
              call: {
                to: manager,
                data: encodeFunctionData({
                  abi: managerAbi,
                  functionName: "addMetadata",
                  args: [BigInt(operation.actualToken), input],
                }),
                value: "0",
                effects: [
                  {
                    kind: "read",
                    contract: manager,
                    functionName: "getMetadata",
                    args: [operation.actualToken],
                    expected: asJson(expected),
                    abi: asJson(managerAbi) as Json[],
                    projection: "manager-business",
                  },
                ],
              },
            };
          }
          return null;
        },
        project: async (operation) => {
          if (++projections === 1)
            throw Error("INJECTED_AFTER_CHAIN_DB_OUTAGE");
          const token = BigInt(operation.actualToken!);
          const projection = intentToDatabase(
            requested.buffalo,
            token,
            "1700000000000",
          );
          await a.pedigree.upsert({
            where: { microchip: projection.microchip },
            create: projection,
            update: projection,
          });
          const json = intentToJson(requested.buffalo, Number(token));
          const path = resolve(origin, `${operation.id}.json`);
          writeFileSync(path, JSON.stringify(json));
          return {
            database: payloadHash(databaseSnapshot(projection)),
            storage: payloadHash(json),
            manifest: operation.intentHash,
          };
        },
        verifyPublication: async (operation, _steps, proof) => {
          const row = await a.pedigree.findUnique({
            where: { microchip: requested.buffalo.microchip },
          });
          const json: unknown = JSON.parse(
            readFileSync(resolve(origin, `${operation.id}.json`), "utf8"),
          );
          return (
            !!row &&
            payloadHash(databaseSnapshot(row)) === proof.database &&
            payloadHash(json) === proof.storage &&
            operation.intentHash === proof.manifest
          );
        },
      };
      const ports = loopbackChainPorts(config);
      for (const stage of ["nextStep", "nonce"] as const) {
        const original = ports[stage];
        Object.assign(ports, {
          [stage]: async (...args: unknown[]) => {
            try {
              return await (
                original as (...values: unknown[]) => Promise<unknown>
              )(...args);
            } catch (error) {
              const known = error as {
                name?: string;
                shortMessage?: string;
                message?: string;
                cause?: {
                  name?: string;
                  shortMessage?: string;
                  details?: string;
                };
              };
              writeFileSync(
                resolve(".tmp/phase2/adapter-failure.json"),
                JSON.stringify(
                  {
                    stage,
                    name: known.name,
                    message:
                      known.shortMessage ?? known.message?.split("\n")[0],
                    cause: known.cause?.name,
                    details: known.cause?.details,
                  },
                  null,
                  2,
                ),
              );
              throw error;
            }
          },
        });
      }
      const originalSign = ports.sign;
      ports.sign = async (...args) => {
        signatures++;
        try {
          return await originalSign(...args);
        } catch (error) {
          const known = error as {
            name?: string;
            shortMessage?: string;
            cause?: { name?: string; shortMessage?: string; details?: string };
          };
          writeFileSync(
            resolve(".tmp/phase2/sign-failure.json"),
            JSON.stringify(
              {
                name: known.name,
                shortMessage: known.shortMessage,
                cause: known.cause?.name,
                causeMessage: known.cause?.shortMessage,
                details: known.cause?.details,
              },
              null,
              2,
            ),
          );
          throw error;
        }
      };
      const engine = new OperationEngine(
        new PostgresOperationRepository(a),
        ports,
      );
      const operation = await engine.create(
        owner,
        randomUUID(),
        requested,
        domain,
      );
      await engine.prepare(operation.id, owner, 0);
      // Reserve the first step before the child process starts, using exactly the persisted approved plan.
      const repo = new PostgresOperationRepository(a);
      const reserveClaim = (await repo.claim(
        operation.id,
        owner,
        "parent-fixture",
      ))!;
      const spec = (await config.nextStep(
        await repo.get(operation.id, owner),
        [],
      ))!;
      await repo.reserveStep(reserveClaim, spec, 0, approved);
      await repo.release(reserveClaim);
      const processEnv = {
        ...process.env,
        BUFFALO_INTEGRITY_OPERATION_ID: operation.id,
        BUFFALO_INTEGRITY_OPERATION_OWNER: owner,
      };
      const snapshotBeforeMint = await rpc("evm_snapshot");
      const childA = spawnSync(
        process.execPath,
        ["scripts/buffalo-integrity-process-check.mjs", "submit-and-exit"],
        { env: processEnv, encoding: "utf8", timeout: 20000 },
      );
      if (childA.status !== 0)
        writeFileSync(
          resolve(".tmp/phase2/process-child-diagnostic.json"),
          JSON.stringify(
            { status: childA.status, stderr: childA.stderr },
            null,
            2,
          ),
        );
      expect(childA.status).toBe(0);
      const sent = JSON.parse(childA.stdout) as { stage: string; hash: string };
      expect(sent.stage).toBe("submitted-before-result-commit");
      expect((await repo.steps(operation.id))[0]!.hash).toBe(sent.hash);
      await a.$executeRaw`UPDATE buffalo_integrity.operation SET lease_until=clock_timestamp()-interval '1 second' WHERE id=${operation.id}::uuid`; // simulate elapsed dead-process lease, retain signed journal
      const mine = async () => {
        for (let i = 0; i < 2; i++) {
          const response = await fetch(signer.rpcUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "evm_mine",
              params: [],
            }),
          });
          const result = (await response.json()) as { error?: unknown };
          if (result.error) throw Error("LOCAL_MINE_FAILED");
        }
      };
      await mine();
      const childB = spawnSync(
        process.execPath,
        ["scripts/buffalo-integrity-process-check.mjs", "resume"],
        { env: processEnv, encoding: "utf8", timeout: 20000 },
      );
      expect(childB.status).toBe(0);
      const resumed = JSON.parse(childB.stdout) as {
        stage: string;
        result: { state: string };
      };
      expect(resumed.result.state).toBe("AWAITING_METADATA_ACTION");
      const afterMint = await engine.status(operation.id, owner);
      expect(afterMint.actualToken).toMatch(/^[1-9][0-9]*$/);
      // A real local reorg removes the receipt. Recovery may only replay identical signed bytes.
      expect(await rpc("evm_revert", [snapshotBeforeMint])).toBe(true);
      await rpc("evm_increaseTime", [10]);
      expect(
        (await engine.advance(operation.id, owner, "metadata")).state,
      ).toBe("RECOVERY_REQUIRED");
      expect((await engine.advance(operation.id, owner, "resume")).state).toBe(
        "CHAIN_PENDING",
      );
      await mine();
      expect((await engine.advance(operation.id, owner, "resume")).state).toBe(
        "RECOVERY_REQUIRED",
      );
      expect((await engine.advance(operation.id, owner, "resume")).state).toBe(
        "AWAITING_METADATA_ACTION",
      );
      expect((await repo.steps(operation.id))[0]!.hash).toBe(sent.hash);
      expect(signatures).toBe(0);
      expect(
        (await engine.advance(operation.id, owner, "metadata")).state,
      ).toBe("CHAIN_PENDING");
      await mine();
      expect((await engine.advance(operation.id, owner, "resume")).state).toBe(
        "CHAIN_STEPS",
      );
      expect((await engine.advance(operation.id, owner, "resume")).state).toBe(
        "RECOVERY_REQUIRED",
      );
      const restarted = new OperationEngine(
        new PostgresOperationRepository(b),
        ports,
      );
      expect(
        (await restarted.advance(operation.id, owner, "resume")).state,
      ).toBe("COMPLETED");
      expect(signatures).toBe(1);
      const status = await restarted.status(operation.id, owner);
      expect(JSON.stringify(status)).not.toContain("signedBytes");
      writeFileSync(
        resolve(".tmp/phase2/fork-adapter-proof.json"),
        JSON.stringify(
          {
            mode: "DISPOSABLE_PG15_LOOPBACK_FORK",
            productionWrites: 0,
            operation: status,
            signatures: signatures + 1,
            processCrashProof: {
              firstProcess: sent.stage,
              secondProcess: resumed.stage,
              sameHash: sent.hash === status.steps[0]!.hash,
            },
            reorgProof: {
              receiptRemoved: true,
              sameSignedHashReplayed: sent.hash === status.steps[0]!.hash,
              noNewSignature: true,
            },
            projections,
            storageProof: "local-file-origin-only",
            publicReadProof: "not_claimed",
          },
          null,
          2,
        ),
      );
      await a.pedigree.delete({
        where: { microchip: requested.buffalo.microchip },
      });
    }, 120000);
  },
);
