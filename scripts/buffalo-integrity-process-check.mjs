import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
/* Disposable-only process crash/recovery harness. No production environment defaults. */
const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");
const root = process.cwd();
const fixtureRoot = path.resolve(
  root,
  process.env.BUFFALO_INTEGRITY_TEST_FIXTURE_DIR ?? ".tmp/phase2",
);
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  const resolved = request.startsWith("~/")
    ? path.join(root, "src", request.slice(2))
    : request;
  return originalResolve.call(this, resolved, parent, ...rest);
};
require.extensions[".ts"] = function (module, filename) {
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText;
  module._compile(compiled, filename);
};
const { PrismaClient } = require("@prisma/client");
const {
  PostgresOperationRepository,
} = require("../src/server/services/buffalo-integrity/operations/postgres.ts");
const {
  OperationEngine,
} = require("../src/server/services/buffalo-integrity/operations/engine.ts");
const {
  loopbackChainPorts,
} = require("../src/server/services/buffalo-integrity/operations/loopback.ts");
async function main() {
  const url = process.env.BUFFALO_INTEGRITY_TEST_DATABASE_URL;
  if (
    !url ||
    new URL(url).hostname !== "127.0.0.1" ||
    !new URL(url).pathname.includes("integrity")
  )
    throw Error("DISPOSABLE_DATABASE_REQUIRED");
  const id = process.env.BUFFALO_INTEGRITY_OPERATION_ID;
  const owner = process.env.BUFFALO_INTEGRITY_OPERATION_OWNER;
  if (!id || !owner?.startsWith("phase2:"))
    throw Error("EXPLICIT_TEST_OPERATION_REQUIRED");
  const signer = JSON.parse(
    fs.readFileSync(path.join(fixtureRoot, "local-signer.json"), "utf8"),
  );
  const identity = JSON.parse(
    fs.readFileSync(path.join(fixtureRoot, "fork-identity.json"), "utf8"),
  );
  const db = new PrismaClient({ datasources: { db: { url } } });
  const repo = new PostgresOperationRepository(db, 30);
  try {
    const operation = await repo.get(id, owner);
    if (!operation.plan || operation.intent.kind !== "create")
      throw Error("PREPARED_CREATE_REQUIRED");
    const ports = loopbackChainPorts({
      rpcUrl: signer.rpcUrl,
      expectedInstanceId: operation.plan.executionInstance,
      privateKey: signer.privateKey,
      domain: operation.domain,
      codeHashes:
        identity.codeHashes ??
        Object.fromEntries(
          identity.contracts.map((contract) => [
            contract.address.toLowerCase(),
            contract.codeHash,
          ]),
        ),
      maxFeeWei: operation.plan.maxFeeWei,
      prepare: async () => {
        throw Error("ALREADY_PREPARED");
      },
      nextStep: async () => {
        throw Error("STEP_MUST_ALREADY_BE_DURABLE");
      },
      project: async () => {
        throw Error("NO_PUBLICATION_FROM_CRASH_HARNESS");
      },
      verifyPublication: async () => false,
    });
    for (const stage of ["observe", "verifyEffects", "sign", "nonce"]) {
      const original = ports[stage];
      ports[stage] = async (...args) => {
        try {
          return await original(...args);
        } catch (error) {
          fs.writeFileSync(
            path.join(fixtureRoot, "process-adapter-failure.json"),
            JSON.stringify(
              {
                stage,
                name: error?.name,
                message: String(error?.shortMessage ?? error?.message ?? "")
                  .split("\n")
                  .find((line) => line.trim())
                  ?.replace(/0x[0-9a-fA-F]{130,}/g, "<redacted>"),
                details: String(error?.cause?.details ?? "").replace(
                  /0x[0-9a-fA-F]{130,}/g,
                  "<redacted>",
                ),
              },
              null,
              2,
            ),
          );
          throw error;
        }
      };
    }
    const mode = process.argv[2];
    if (mode === "submit-and-exit") {
      const original = ports.broadcast;
      ports.broadcast = async (bytes) => {
        const hash = await original(bytes);
        process.stdout.write(
          JSON.stringify({ stage: "submitted-before-result-commit", hash }),
        );
        process.exit(0); // intentional OS process exit; lease expires, exact signed hash remains durable
      };
    } else if (mode === "recover-metadata") {
      if (!operation.actualToken) throw Error("PRIOR_MINT_RECEIPT_REQUIRED");
      const sign = ports.sign;
      ports.sign = async (...args) => {
        if (args[1].kind === "mint") throw Error("REMINT_FORBIDDEN");
        return sign(...args);
      };
    } else if (mode === "resume") {
      ports.sign = async () => {
        throw Error("RECOVERY_MUST_NOT_SIGN_AGAIN");
      };
    } else throw Error("UNKNOWN_TEST_MODE");
    const result = await new OperationEngine(repo, ports).advance(
      id,
      owner,
      "resume",
    );
    process.stdout.write(
      JSON.stringify({ stage: "resumed-existing-journal", result }),
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch((error) => {
  process.stderr.write(
    JSON.stringify({
      error: error?.code ?? error?.name ?? "HARNESS_ERROR",
      message: String(error?.shortMessage ?? error?.message ?? "")
        .split("\n")
        .find((line) => line.trim())
        ?.replace(/0x[0-9a-fA-F]{130,}/g, "<redacted>"),
    }),
  );
  process.exitCode = 1;
});
