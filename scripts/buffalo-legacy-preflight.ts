/** Usage: bun scripts/buffalo-legacy-preflight.ts /absolute/path/inventory-complete.json
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
  if (args.length !== 1 || !args[0]) throw new Error("usage");
  const report = classifyLegacyInventory(
    JSON.parse(readFileSync(args[0], "utf8")) as unknown,
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch {
  // Do not print raw parser/provider input, filesystem contents or arbitrary error messages.
  process.stderr.write(
    "Legacy preflight failed: provide one valid captured inventory JSON with every declared row present.\n",
  );
  process.exitCode = 1;
}
