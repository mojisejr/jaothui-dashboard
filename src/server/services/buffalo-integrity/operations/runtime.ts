import { PrismaClient } from "@prisma/client";
import { OperationEngine } from "./engine";
import { PostgresOperationRepository } from "./postgres";
import {
  loopbackChainPorts,
  assertLoopbackUrl,
  type LoopbackConfig,
} from "./loopback";
import { IntegrityError } from "./hash";

/** Explicit local harness only. Neither default DATABASE_URL nor production minter is loaded. */
export function createIsolatedOperationRuntime(
  databaseUrl: string,
  config: LoopbackConfig,
) {
  const database = new URL(databaseUrl);
  if (
    !["postgresql:", "postgres:"].includes(database.protocol) ||
    !["127.0.0.1", "[::1]"].includes(database.hostname)
  )
    throw new IntegrityError("LOOPBACK_DATABASE_ONLY");
  assertLoopbackUrl(config.rpcUrl);
  const client = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  return {
    engine: new OperationEngine(
      new PostgresOperationRepository(client),
      loopbackChainPorts(config),
    ),
    close: () => client.$disconnect(),
  };
}
/** Intentional hard-off for product routes until all writers and release gates are integrated. */
export function productOperationRuntime(): OperationEngine {
  throw new IntegrityError("INTEGRITY_FEATURE_DISABLED");
}
