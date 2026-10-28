/** @jest-environment node */
import { randomUUID } from "crypto";
import { createServer } from "http";
import { mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { BuffaloEditWorkflow } from "../../edit/workflow";
import { DraftStore } from "../../create/drafts";
import { revisionOf } from "../../edit/contract";
import { PrismaClient } from "@prisma/client";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  abi as managerAbi,
  address as manager,
} from "~/server/blockchain/metadata-maneger/abi";
import { abi as nftAbi, address as nft } from "~/server/blockchain/nft/abi";
import { type RawMetadata } from "~/interfaces/i-metadata";
import { managerManifest } from "../../field-policy";
import { type CreateChain } from "../../create/workflow";
import {
  localAssetStorage,
  contentHash,
  type AssetStorage,
} from "../../create/storage";
import { PostgresOperationRepository } from "../../operations/postgres";
import { OperationEngine } from "../../operations/engine";
import { loopbackChainPorts } from "../../operations/loopback";
import { payloadHash, stableJson } from "../../operations/hash";
import { RepairWorkflow } from "../workflow";
import { repairRevisionGuard } from "../chainadapter";
import { buildRepairIntent, verifyApproval } from "../approval";
import { type RepairDiagnosis } from "../diagnosis";
import { readRepairDatabaseSnapshot, repairJson } from "../db-projection";
const rpc = process.env.REPAIR_WORKFLOW_FORK_URL;
const pair = process.env.REPAIR_WORKFLOW_PAIR === "1";
const secret = "isolated-repair-workflow-proof-secret";
const key =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
(rpc ? describe : describe.skip)(
  "actual deployed contracts fork + PostgreSQL + HTTP storage repair workflow",
  () => {
    test("single batch/DNA/URI, durable unknown recovery, asset/DB failure, restart and external-root guard", async () => {
      if (new URL(rpc!).hostname !== "127.0.0.1")
        throw Error("LOCAL_FORK_ONLY");
      const databaseName =
        process.env.REPAIR_WORKFLOW_DATABASE ?? "repair_integrity_phase4_1";
      if (!/^repair_integrity_[a-z0-9_]+$/.test(databaseName))
        throw Error("ISOLATED_DATABASE_REQUIRED");
      const url = `postgresql://postgres:local-fixture-only@127.0.0.1:55437/${databaseName}`;
      const db = new PrismaClient({ datasources: { db: { url } } }),
        repo = new PostgresOperationRepository(db);
      const client = createPublicClient({
        transport: http(rpc, { retryCount: 0, timeout: 20000 }),
      });
      const wallet = createWalletClient({
        transport: http(rpc, { retryCount: 0, timeout: 20000 }),
      });
      const request = client.request as (args: {
        method: string;
        params?: unknown[];
      }) => Promise<unknown>;
      const read = client.readContract as (args: {
        address: Address;
        abi: Abi;
        functionName: string;
        args?: unknown[];
        blockNumber?: bigint;
      }) => Promise<unknown>;
      const account = privateKeyToAccount(key),
        admin = "0x4C06524B1bd7AA002747252257bBE0C472735A6D" as Address;
      expect(await client.getChainId()).toBe(96);
      const snapshotId = await request({ method: "evm_snapshot" });
      const directory = await mkdtemp(join(tmpdir(), "repair-workflow-"));
      const server = createServer((req, res) => {
        void (async () => {
          const asset = await storage.get(
            (req.url ?? "").replace(
              /^\/storage\/v1\/object\/public\/slipstorage\//,
              "",
            ),
          );
          if (!asset) {
            res.statusCode = 404;
            res.end();
          } else res.end(asset);
        })().catch(() => {
          res.statusCode = 500;
          res.end();
        });
      });
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      const port = (server.address() as { port: number }).port;
      const origin = `http://127.0.0.1:${port}`;
      const local = localAssetStorage(directory, origin);
      const storage: AssetStorage = {
        ...local,
        publicUrl: (k) => `${origin}/storage/v1/object/public/slipstorage/${k}`,
      };
      const publicStorage: AssetStorage = {
        ...storage,
        get: async (k) => {
          const response = await fetch(storage.publicUrl(k));
          return response.ok ? Buffer.from(await response.arrayBuffer()) : null;
        },
      };
      async function send(
        address: Address,
        abi: Abi,
        functionName: string,
        args: unknown[],
        sender = admin,
      ) {
        await request({ method: "anvil_impersonateAccount", params: [sender] });
        await request({
          method: "anvil_setBalance",
          params: [sender, "0x56bc75e2d63100000"],
        });
        const hash = await wallet.writeContract({
          address,
          abi,
          functionName,
          args,
          account: sender,
          chain: null,
          gas: 5000000n,
        });
        const receipt = await client.waitForTransactionReceipt({
          hash,
          timeout: 30000,
        });
        expect(receipt.status).toBe("success");
      }
      const chip = `998${String(Date.now()).slice(-12)}`,
        token = BigInt(process.env.REPAIR_WORKFLOW_TOKEN ?? "1360"),
        owner = `fork-proof:${randomUUID()}`;
      try {
        const role = await read({
          address: manager,
          abi: managerAbi as Abi,
          functionName: "ADMIN",
        });
        await send(manager, managerAbi as Abi, "grantRole", [
          role,
          account.address,
        ]);
        const nftContractOwner = await read({
          address: nft,
          abi: nftAbi as Abi,
          functionName: "owner",
        });
        await send(
          nft,
          nftAbi as Abi,
          "transferOwnership",
          [account.address],
          nftContractOwner as Address,
        );
        await send(manager, managerAbi as Abi, "setDNA", [
          token,
          "isolated-DNA-preserve",
        ]);
        const raw = (await read({
          address: manager,
          abi: managerAbi as Abi,
          functionName: "getMetadata",
          args: [token],
        })) as RawMetadata;
        const image = Buffer.from([255, 216, 255, 224, 1, 2, 3, 4]);
        const json = {
          edition: Number(token),
          name: `Fixture #${raw.certify.microchip}`,
          image: storage.publicUrl(`buffalo/${token}.jpg`),
          attributes: [
            { trait_type: "Microchip", value: raw.certify.microchip },
          ],
        };
        const jsonBytes = Buffer.from(stableJson(json));
        await storage.putImmutable(`buffalo/${token}.jpg`, image, "image/jpeg");
        await storage.putImmutable(
          `json/${token}.json`,
          jsonBytes,
          "application/json",
        );
        await send(
          nft,
          nftAbi as Abi,
          "setTokenURI",
          [
            token,
            storage.publicUrl(`json/${token}.json`),
            storage.publicUrl(`buffalo/${token}.jpg`),
          ],
          account.address,
        );
        await db.pedigree.create({
          data: {
            microchip: chip,
            tokenId: token,
            name: "Fixture",
            detail: "synthetic proof",
            birthday: new Date("2024-01-01"),
            sex: "Male",
            color: "Black",
            createdAt: "fixture-created",
            updatedAt: "fixture-updated",
            dna: "isolated-DNA-preserve",
            image: storage.publicUrl(`buffalo/${token}.jpg`),
          },
        });
        const database = await db.$transaction((tx) =>
          readRepairDatabaseSnapshot(tx),
        );
        const block = await client.getBlock();
        const [nftProof, managerProof] = await Promise.all([
          client.getProof({ address: nft, storageKeys: [] }),
          client.getProof({ address: manager, storageKeys: [] }),
        ]);
        const pin = {
          version: 1,
          scanId: randomUUID(),
          chainId: 96,
          nft,
          manager,
          blockNumber: String(block.number),
          blockHash: block.hash,
          nftCodeHash: nftProof.codeHash,
          managerCodeHash: managerProof.codeHash,
          nftStorageHash: nftProof.storageHash,
          managerStorageHash: managerProof.storageHash,
          createdAt: Date.now(),
          expiresAt: Date.now() + 1800000,
          nextTokenId: "1369",
          scanCount: 1368,
          totalSupply: 1368,
          pageSize: 20,
        };
        const aliases = await Promise.all(
          [raw.certify.microchip, chip].map(async (microchip) => ({
            microchip,
            tokenId: String(
              await read({
                address: manager,
                abi: managerAbi as Abi,
                functionName: "microchipToTokenId",
                args: [microchip],
              }),
            ),
          })),
        );
        const target = {
          sourceMicrochip: chip,
          desiredMicrochip: chip,
          desiredTokenId: String(token),
          confirmedPreviousCanonicalMicrochip: raw.certify.microchip,
          evidence: [
            {
              kind: "physical_scan" as const,
              reference: "synthetic local identity fixture",
            },
          ],
        };
        const baseline = {
          tokenId: String(token),
          microchip: raw.certify.microchip,
          dna: raw.certify.dna,
          metadata: managerManifest(raw),
          owner: String(
            await read({
              address: nft,
              abi: nftAbi as Abi,
              functionName: "ownerOf",
              args: [token],
            }),
          ),
          tokenUri: storage.publicUrl(`json/${token}.json`),
          approvals: repairJson(
            await read({
              address: manager,
              abi: managerAbi as Abi,
              functionName: "getApprovedByTokenId",
              args: [token, false],
            }),
          ),
          native: {
            createdAt: String(raw.createdAt),
            updatedAt: String(raw.updatedAt),
          },
        };
        const afterJson = {
          ...json,
          name: `Fixture #${chip}`,
          attributes: [{ trait_type: "Microchip", value: chip }],
        };
        // Only identity evidence is synthetic; DB, RPC, contracts, signing, journal and HTTP asset I/O below are real.
        const preview = {
          status: "ready_for_operator_review",
          manifest: {
            pin,
            changes: [
              {
                ...target,
                database: database.rows.find((r) => r.microchip === chip),
                chain: baseline,
                databaseChange: false,
                chainChange: true,
              },
            ],
            assets: {
              tokens: [
                {
                  tokenId: String(token),
                  before: [
                    {
                      role: "nft_json",
                      url: baseline.tokenUri,
                      key: `json/${token}.json`,
                      hash: contentHash(jsonBytes),
                    },
                    {
                      role: "nft_image",
                      url: json.image,
                      key: `buffalo/${token}.jpg`,
                      hash: contentHash(image),
                    },
                    { role: "json_alias", hash: contentHash(jsonBytes) },
                    { role: "image_alias", hash: contentHash(image) },
                  ],
                  after: {
                    json: afterJson,
                    jsonHash: payloadHash(afterJson),
                    aliasImageKey: `buffalo/${token}.jpg`,
                    aliasJsonKey: `json/${token}.json`,
                  },
                },
              ],
            },
            closure: {
              aliases,
              canonical: [
                {
                  tokenId: String(token),
                  initialized: true,
                  microchip: raw.certify.microchip,
                },
              ],
            },
            observedTokens: [String(token)],
            references: [],
            catalogDigest: database.catalogDigest,
            databaseDigest: payloadHash(database.rows),
            effects: {},
            coverage: {},
          },
        };
        let secondRaw: RawMetadata | undefined;
        const secondToken = 1359n;
        if (pair) {
          await send(manager, managerAbi as Abi, "setDNA", [
            secondToken,
            "isolated-DNA-second",
          ]);
          secondRaw = (await read({
            address: manager,
            abi: managerAbi as Abi,
            functionName: "getMetadata",
            args: [secondToken],
          })) as RawMetadata;
          const secondJson = {
            edition: Number(secondToken),
            name: `Second #${secondRaw.certify.microchip}`,
            image: storage.publicUrl(`buffalo/${secondToken}.jpg`),
            attributes: [
              { trait_type: "Microchip", value: secondRaw.certify.microchip },
            ],
          };
          const secondBytes = Buffer.from(stableJson(secondJson));
          await storage.putImmutable(
            `buffalo/${secondToken}.jpg`,
            image,
            "image/jpeg",
          );
          await storage.putImmutable(
            `json/${secondToken}.json`,
            secondBytes,
            "application/json",
          );
          await send(
            nft,
            nftAbi as Abi,
            "setTokenURI",
            [
              secondToken,
              storage.publicUrl(`json/${secondToken}.json`),
              secondJson.image,
            ],
            account.address,
          );
          // Physical identity evidence deliberately establishes a two-cow canonical-chip swap.
          await db.pedigree.update({
            where: { microchip: chip },
            data: { microchip: secondRaw.certify.microchip },
          });
          await db.pedigree.create({
            data: {
              microchip: raw.certify.microchip,
              tokenId: secondToken,
              name: "Second",
              birthday: new Date("2024-01-01"),
              sex: "Male",
              color: "Black",
              detail: "synthetic second fixture",
              createdAt: "second-created",
              updatedAt: "second-updated",
              dna: secondRaw.certify.dna,
              image: secondJson.image,
            },
          });
          target.sourceMicrochip = secondRaw.certify.microchip;
          target.desiredMicrochip = secondRaw.certify.microchip;
          const secondTarget = {
            ...target,
            sourceMicrochip: raw.certify.microchip,
            desiredMicrochip: raw.certify.microchip,
            desiredTokenId: String(secondToken),
            confirmedPreviousCanonicalMicrochip: secondRaw.certify.microchip,
          };
          const refreshed = await db.$transaction((tx) =>
            readRepairDatabaseSnapshot(tx),
          );
          Object.assign(preview.manifest.changes[0]!, target, {
            database: refreshed.rows.find(
              (r) => r.microchip === target.sourceMicrochip,
            ),
          });
          preview.manifest.assets.tokens[0]!.after.json.name = `Fixture #${target.desiredMicrochip}`;
          preview.manifest.assets.tokens[0]!.after.json.attributes[0]!.value =
            target.desiredMicrochip;
          preview.manifest.assets.tokens[0]!.after.jsonHash = payloadHash(
            preview.manifest.assets.tokens[0]!.after.json,
          );
          preview.manifest.changes.push({
            ...secondTarget,
            database: refreshed.rows.find(
              (r) => r.microchip === secondTarget.sourceMicrochip,
            ),
            chain: {
              tokenId: String(secondToken),
              microchip: secondRaw.certify.microchip,
              dna: secondRaw.certify.dna,
              metadata: managerManifest(secondRaw),
              owner: String(
                await read({
                  address: nft,
                  abi: nftAbi as Abi,
                  functionName: "ownerOf",
                  args: [secondToken],
                }),
              ),
              approvals: repairJson(
                await read({
                  address: manager,
                  abi: managerAbi as Abi,
                  functionName: "getApprovedByTokenId",
                  args: [secondToken, false],
                }),
              ),
              native: {
                createdAt: String(secondRaw.createdAt),
                updatedAt: String(secondRaw.updatedAt),
              },
              tokenUri: storage.publicUrl(`json/${secondToken}.json`),
            },
            databaseChange: false,
            chainChange: true,
          });
          const desiredSecondJson = {
            ...secondJson,
            name: `Second #${secondTarget.desiredMicrochip}`,
            attributes: [
              { trait_type: "Microchip", value: secondTarget.desiredMicrochip },
            ],
          };
          preview.manifest.assets.tokens.push({
            tokenId: String(secondToken),
            before: [
              {
                role: "nft_json",
                url: storage.publicUrl(`json/${secondToken}.json`),
                key: `json/${secondToken}.json`,
                hash: contentHash(secondBytes),
              },
              {
                role: "nft_image",
                url: secondJson.image,
                key: `buffalo/${secondToken}.jpg`,
                hash: contentHash(image),
              },
              { role: "image_alias", hash: contentHash(image) },
              { role: "json_alias", hash: contentHash(secondBytes) },
            ],
            after: {
              json: desiredSecondJson,
              jsonHash: payloadHash(desiredSecondJson),
              aliasImageKey: `buffalo/${secondToken}.jpg`,
              aliasJsonKey: `json/${secondToken}.json`,
            },
          });
          preview.manifest.closure.aliases = [
            { microchip: raw.certify.microchip, tokenId: String(token) },
            {
              microchip: secondRaw.certify.microchip,
              tokenId: String(secondToken),
            },
          ];
          preview.manifest.observedTokens.push(String(secondToken));
          preview.manifest.closure.canonical.push({
            tokenId: String(secondToken),
            initialized: true,
            microchip: secondRaw.certify.microchip,
          });
          const latest = await client.getBlock();
          const proofs = await Promise.all([
            client.getProof({ address: nft, storageKeys: [] }),
            client.getProof({ address: manager, storageKeys: [] }),
          ]);
          Object.assign(pin, {
            blockNumber: String(latest.number),
            blockHash: latest.hash,
            nftStorageHash: proofs[0].storageHash,
            managerStorageHash: proofs[1].storageHash,
          });
        }
        const metadata = (await request({ method: "anvil_metadata" })) as {
          instanceId: string;
        };
        const chain: CreateChain = {
          domain: { chainId: 96, nft, manager },
          sender: account.address,
          receiver: account.address,
          confirmations: 3,
          executionInstance: metadata.instanceId,
          maxFeeWei: "50000000000000000",
          read: (address, abi, functionName, args = [], blockNumber) =>
            read({
              address: address as Address,
              abi,
              functionName,
              args,
              blockNumber,
            }),
          block: async (number) => {
            const b = await client.getBlock(
              number === undefined ? {} : { blockNumber: number },
            );
            return { number: b.number, hash: b.hash };
          },
        };
        const operationId = randomUUID();
        const intent = await buildRepairIntent(
          owner,
          {
            key: operationId,
            scan: "fixture",
            pages: [],
            proposal: {
              targets: preview.manifest.changes.map((c) => ({
                sourceMicrochip: c.sourceMicrochip,
                desiredMicrochip: c.desiredMicrochip,
                desiredTokenId: c.desiredTokenId,
                confirmedPreviousCanonicalMicrochip:
                  c.confirmedPreviousCanonicalMicrochip,
                evidence: c.evidence,
              })),
              knownAliases: [],
            },
          },
          { preview: async () => preview } as unknown as RepairDiagnosis,
          chain,
          secret,
          Date.now(),
          pair,
        );
        verifyApproval(owner, intent, secret);
        expect(intent.manifest.chain.steps.map((s) => s.kind)).toEqual(
          pair
            ? ["batch", "dna_restore", "dna_restore", "uri", "uri"]
            : ["batch", "dna_restore", "uri"],
        );
        expect(intent.manifest.effects.nftNativeTimestampsReset).toEqual(
          pair ? [String(token), String(secondToken)] : [String(token)],
        );
        let op = await repo.create(
          owner,
          operationId,
          intent,
          intent.manifest.domain,
        );
        let secondDnaFailure = pair,
          restartedAfterDna = false;
        let assetFailure = true,
          dbFailure = true,
          unknown = true;
        const faultyStorage: AssetStorage = {
          ...storage,
          putImmutable: async (...args) => {
            if (assetFailure) {
              assetFailure = false;
              throw Error("isolated asset outage");
            }
            return storage.putImmutable(...args);
          },
        };
        const originalProject = repo.projectRepairDatabase.bind(repo);
        repo.projectRepairDatabase = async (claim) => {
          if (dbFailure) {
            dbFailure = false;
            throw Error("isolated DB outage");
          }
          return originalProject(claim);
        };
        const makeEngine = () => {
          const workflow = new RepairWorkflow(
            db,
            repo,
            chain,
            faultyStorage,
            secret,
            repairRevisionGuard(rpc!),
            publicStorage,
          );
          const confirmed = async () =>
            (await repo.steps(op.id)).filter((s) => s.state === "CONFIRMED");
          const ports = loopbackChainPorts({
            expectedInstanceId: metadata.instanceId,
            rpcUrl: rpc!,
            privateKey: key,
            domain: chain.domain,
            codeHashes: {
              [nft.toLowerCase()]: pin.nftCodeHash,
              [manager.toLowerCase()]: pin.managerCodeHash,
            },
            maxFeeWei: chain.maxFeeWei!,
            prepare: (o) => workflow.prepare(o),
            nextStep: (o, s) => workflow.nextStep(o, s),
            beforeSign: async (o) => workflow.guard(o, await confirmed()),
            beforeBroadcast: async (o) => workflow.guard(o, await confirmed()),
            reconcileCurrent: async (o, s) =>
              workflow.guard(
                o,
                [...(await confirmed()).filter((p) => p.id !== s.id), s].sort(
                  (a, b) => a.ordinal - b.ordinal,
                ),
              ),
            project: (o, s, c) => workflow.project(o, s, c),
            verifyPublication: (o, s, p) => workflow.verifyPublication(o, s, p),
          });
          const sign = ports.sign;
          ports.sign = async (operation, step, nonce) => {
            if (
              secondDnaFailure &&
              step.ordinal === 2 &&
              step.kind === "dna_restore"
            ) {
              secondDnaFailure = false;
              throw Error("isolated second DNA signing outage");
            }
            return sign(operation, step, nonce);
          };
          const broadcast = ports.broadcast;
          ports.broadcast = async (bytes) => {
            const hash = await broadcast(bytes);
            if (unknown) {
              unknown = false;
              throw Error("isolated lost broadcast response");
            }
            return hash;
          };
          return new OperationEngine(repo, ports);
        };
        let engine = makeEngine();
        await engine.prepare(op.id, owner, op.version);
        await engine.advance(op.id, owner, "resume");
        expect((await repo.get(op.id, owner)).state).toBe("BROADCAST_UNKNOWN");
        const signed = (await repo.steps(op.id))[0]!;
        expect(signed.signedBytes).toBeTruthy();
        engine = makeEngine(); // process restart reuses SQL intent, plan, signed bytes and nonce.
        for (let i = 0; i < 30; i++) {
          await request({ method: "anvil_mine", params: ["0x3"] });
          await engine.advance(op.id, owner, "resume");
          op = await repo.get(op.id, owner);
          if (pair && !secondDnaFailure && !restartedAfterDna) {
            const journal = await repo.steps(op.id);
            expect(journal.filter((s) => s.kind === "batch")).toHaveLength(1);
            expect(journal[1]!.state).toBe("CONFIRMED");
            expect(journal[2]!.signedBytes).toBeNull();
            engine = makeEngine();
            restartedAfterDna = true;
          }
          if (["COMPLETED", "NEEDS_REVIEW"].includes(op.state)) break;
        }
        expect({ state: op.state, reason: op.reason }).toEqual({
          state: "COMPLETED",
          reason: null,
        });
        const steps = await repo.steps(op.id);
        expect(steps).toHaveLength(pair ? 5 : 3);
        expect(steps[0]!.hash).toBe(signed.hash);
        expect(steps[0]!.signedBytes).toBe(signed.signedBytes);
        expect(steps.every((s) => s.state === "CONFIRMED")).toBe(true);
        const final = (await read({
          address: manager,
          abi: managerAbi as Abi,
          functionName: "getMetadata",
          args: [token],
        })) as RawMetadata;
        expect(final.certify.dna).toBe(raw.certify.dna);
        expect(final.certify.microchip).toBe(target.desiredMicrochip);
        expect(managerManifest(final)).toEqual({
          ...managerManifest(raw),
          certify: {
            ...managerManifest(raw).certify,
            microchip: target.desiredMicrochip,
          },
        });
        expect(
          (await db.pedigree.findUnique({
            where: { microchip: target.desiredMicrochip },
          }))!.image,
        ).toBe(intent.manifest.assets[0]!.image.url);
        const externalSnapshot = await request({ method: "evm_snapshot" });
        await send(manager, managerAbi as Abi, "setParent", [
          1359n,
          "external-parent-fixture",
          "N/A",
        ]);
        await expect(repairRevisionGuard(rpc!)(op, steps)).rejects.toThrow(
          "REPAIR_BASELINE_CHANGED",
        );
        await request({ method: "evm_revert", params: [externalSnapshot] });
        if (pair) {
          const secondFinal = (await read({
            address: manager,
            abi: managerAbi as Abi,
            functionName: "getMetadata",
            args: [secondToken],
          })) as RawMetadata;
          expect(secondFinal.certify.dna).toBe(secondRaw!.certify.dna);
          expect(secondFinal.certify.microchip).toBe(raw.certify.microchip);
          expect(restartedAfterDna).toBe(true);
        }
        if (pair)
          for (const repaired of intent.manifest.targets) {
            const editor = new BuffaloEditWorkflow(
              db,
              new DraftStore(db, repo),
              storage,
              chain,
            );
            const row = (await db.pedigree.findUnique({
              where: { microchip: repaired.desiredMicrochip },
            }))!;
            const editOp = await editor.create(owner, {
              key: randomUUID(),
              microchip: repaired.desiredMicrochip,
              tokenId: repaired.desiredTokenId,
              expectedRevision: revisionOf(row),
              patch: {
                dna: storage.publicUrl(
                  `buffalo/${repaired.desiredTokenId}.jpg`,
                ),
              },
            });
            const confirmed = async (id: string) =>
              (await repo.steps(id)).filter((s) => s.state === "CONFIRMED");
            const ports = loopbackChainPorts({
              expectedInstanceId: metadata.instanceId,
              rpcUrl: rpc!,
              privateKey: key,
              domain: chain.domain,
              codeHashes: {
                [nft.toLowerCase()]: pin.nftCodeHash,
                [manager.toLowerCase()]: pin.managerCodeHash,
              },
              maxFeeWei: chain.maxFeeWei!,
              prepare: (o) => editor.prepare(o),
              nextStep: (o, s) => editor.nextStep(o, s),
              beforeSign: async (o) => editor.guard(o, await confirmed(o.id)),
              beforeBroadcast: async (o) =>
                editor.guard(o, await confirmed(o.id)),
              reconcileCurrent: async (o, step) =>
                editor.guard(
                  o,
                  [
                    ...(await confirmed(o.id)).filter((s) => s.id !== step.id),
                    step,
                  ].sort((a, b) => a.ordinal - b.ordinal),
                ),
              project: (o, s) => editor.project(o, s),
              verifyPublication: (o, s, p) => editor.verifyPublication(o, s, p),
            });
            const normal = new OperationEngine(repo, ports);
            await normal.prepare(editOp.id, owner, editOp.version);
            for (let index = 0; index < 12; index++) {
              await request({ method: "anvil_mine", params: ["0x3"] });
              await normal.advance(editOp.id, owner, "resume");
              const state = (await repo.get(editOp.id, owner)).state;
              if (["COMPLETED", "NEEDS_REVIEW"].includes(state)) break;
            }
            expect({
              state: (await repo.get(editOp.id, owner)).state,
              reason: (await repo.get(editOp.id, owner)).reason,
            }).toEqual({ state: "COMPLETED", reason: null });
            expect(
              (await db.pedigree.findUnique({
                where: { microchip: repaired.desiredMicrochip },
              }))!.dna,
            ).toBe(storage.publicUrl(`buffalo/${repaired.desiredTokenId}.jpg`));
          }
        console.info(
          JSON.stringify({
            proof: pair
              ? "ACTUAL_FORK_PG_HTTP_PAIR_REPAIR"
              : "ACTUAL_FORK_PG_HTTP_SINGLE_REPAIR",
            secondDnaRestart: pair && restartedAfterDna,
            ordinaryEditAfterRepair: pair ? 2 : 0,
            result: "PASS",
            steps: steps.map((s) => ({ kind: s.kind, hash: s.hash })),
            assetFailureRecovered: !assetFailure,
            databaseFailureRecovered: !dbFailure,
            sameSignedUnknownRecovery: true,
            productionWrites: 0,
          }),
        );
      } finally {
        await request({ method: "evm_revert", params: [snapshotId] });
        await db.$disconnect();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }, 600000);
  },
);
