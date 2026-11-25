/** Usage: bun scripts/buffalo-legacy-preflight.ts /absolute/path/inventory-complete.json
 * Optional: --trusted-storage-base https://<reviewed-project>/storage/v1/object/public/slipstorage/
 * Never infer trust from snapshot URLs; omission keeps mixed-origin records unsupported.
 * Reads only a captured JSON snapshot and prints safe classifications; never contacts production.
 * Snapshot: {registryRows?,blockNumber?,blockHash?,blockHashReverified?,results:[
 * {tokenId:string,row:serialized Pedigree,native:serialized RawMetadata,nftRecord:[image,uri,...],identityMatches?}
 * ]}. Bigints use decimal strings, database birthday uses ISO text. Missing reads may use errorCode.
 * not_legacy means this reconstruction path does not apply, not that the record is editable.
 */
import { readFileSync } from "node:fs";
import { classifyLegacyInventory } from "../src/server/services/buffalo-integrity/edit/legacy-inventory";
try {
  const args = process.argv.slice(2);
  if (
    !args[0] ||
    (args.length !== 1 &&
      (args.length !== 3 || args[1] !== "--trusted-storage-base" || !args[2]))
  )
    throw new Error("usage");
  const report = classifyLegacyInventory(
    JSON.parse(readFileSync(args[0], "utf8")) as unknown,
    { trustedStorageBase: args[2] },
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch {
  // Do not print raw parser/provider input, filesystem contents or arbitrary error messages.
  process.stderr.write(
    "Legacy preflight failed: provide one valid captured inventory JSON with every declared row present.\n",
  );
  process.exitCode = 1;
}
