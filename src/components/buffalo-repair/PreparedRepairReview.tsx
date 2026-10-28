import type {
  RepairExecutionView,
  RepairJson,
} from "~/server/services/buffalo-integrity/repair/execution-contract";

const effectNames: Record<string, string> = {
  legacyDatabaseImages: "พาธภาพเก่าที่จะปรับให้ตรงกับไฟล์ของ NFT ที่ตรวจแล้ว",
  metadataCounterIncrement: "จำนวนครั้งที่ตัวนับการแก้ข้อมูล Manager จะเพิ่ม",
  dnaClearedThenRestored: "NFT ที่ข้อมูล DNA จะถูกล้างแล้วใส่กลับตามหลักฐาน",
  nativeCreatedAtResets: "NFT ที่เวลาเริ่มต้นข้อมูลใน Manager จะเปลี่ยน",
  nativeUpdatedAtResets: "NFT ที่เวลาแก้ไขข้อมูลใน Manager จะเปลี่ยน",
  nftUriChanges: "NFT ที่จะเปลี่ยนที่อยู่ไฟล์ข้อมูล",
  nftNativeTimestampsReset:
    "NFT ที่เวลาภายในสัญญา NFT จะเปลี่ยนจากการตั้งที่อยู่ไฟล์",
  oldAliasesRemain: "ชื่อไมโครชิปเดิมที่ยังคงอยู่",
};
/** String arithmetic preserves the exact integer budget even beyond Number.MAX_SAFE_INTEGER. */
export function weiToKub(value: string): string {
  if (!/^[0-9]+$/.test(value)) return "ไม่ทราบ";
  const padded = value.padStart(19, "0");
  const whole = padded.slice(0, -18).replace(/^0+(?=\d)/, "");
  const fraction = padded.slice(-18).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}
function valueText(value: RepairJson | undefined): string {
  if (value === undefined || value === null) return "ไม่มี";
  if (typeof value === "boolean") return value ? "ใช่" : "ไม่ใช่";
  if (Array.isArray(value))
    return value.length ? value.map(valueText).join(", ") : "ไม่มี";
  return typeof value === "object"
    ? JSON.stringify(value, null, 2)
    : String(value);
}
function object(value: RepairJson | undefined): Record<string, RepairJson> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}
function RecordSide({ label, value }: { label: string; value: RepairJson }) {
  const record = object(value),
    database = object(record.database),
    chain = object(record.chain);
  return (
    <div className="min-w-0 space-y-2 rounded-lg border border-base-300 p-3">
      <h4 className="font-semibold">{label}</h4>
      <p className="break-all">
        ทะเบียน: {valueText(database.microchip)} ↔ NFT{" "}
        {valueText(database.tokenId)}
      </p>
      <p className="break-all">
        Blockchain: {valueText(chain.microchip)} ↔ NFT{" "}
        {valueText(chain.tokenId)}
      </p>
      <p className="break-all text-sm">
        ที่อยู่ไฟล์ NFT: {valueText(chain.tokenUri)}
      </p>
      <p className="break-all text-sm">DNA: {valueText(chain.dna)}</p>
      <details>
        <summary className="min-h-12 cursor-pointer py-3">
          ข้อมูลประกอบทั้งหมด ({label})
        </summary>
        <pre className="whitespace-pre-wrap break-all text-sm">
          {JSON.stringify(value, null, 2)}
        </pre>
      </details>
    </div>
  );
}
export function PreparedRepairReview({ view }: { view: RepairExecutionView }) {
  return (
    <section
      className="min-w-0 space-y-4"
      aria-label="แผนซ่อมที่ผูกกับรายการจริง"
    >
      <h3 className="text-xl font-semibold">แผนซ่อมที่ต้องตรวจทานก่อนยืนยัน</h3>
      <p>
        {view.mode === "database_only"
          ? "แก้ทะเบียนในฐานข้อมูลเท่านั้น ไม่ส่งธุรกรรม blockchain และไม่มีค่าธรรมเนียมธุรกรรม"
          : "แก้ข้อมูลบน blockchain แล้วตรวจหลักฐานก่อนบันทึกทะเบียนให้ตรงกัน"}
      </p>
      {view.review.beforeAfter.map((change, index) => (
        <section
          key={`${index}-${change.sourceMicrochip}`}
          className="space-y-3"
        >
          <h4 className="break-all font-medium">
            {change.sourceMicrochip} → {change.desiredMicrochip} · NFT{" "}
            {change.desiredTokenId}
          </h4>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <RecordSide label="ก่อนซ่อม" value={change.before} />
            <RecordSide label="หลังซ่อมที่คาดหมาย" value={change.after} />
          </div>
        </section>
      ))}
      <section className="space-y-2">
        <h4 className="font-semibold">ผลต่อข้อมูลและประวัติเวลา</h4>
        <p className="text-sm">
          การเปลี่ยนเวลาในสัญญา NFT แยกจากตัวนับและเวลาใน Manager;
          เวลาที่เกิดจริงจะทราบเมื่อธุรกรรมยืนยัน
        </p>
        {Object.entries(view.review.effects).map(([key, value]) => (
          <p key={key} className="whitespace-pre-wrap break-all text-sm">
            {Object.hasOwn(effectNames, key) ? effectNames[key] : key}:{" "}
            {valueText(value)}
          </p>
        ))}
      </section>
      <section className="space-y-3">
        <h4 className="font-semibold">ไฟล์ที่ผูกกับเลขรายการนี้</h4>
        {!view.review.assets.length && <p>ไม่มีไฟล์ใหม่ที่ต้องเผยแพร่</p>}
        {view.review.assets.map((asset) => (
          <div
            key={asset.tokenId}
            className="min-w-0 space-y-1 rounded-lg border border-base-300 p-3 text-sm"
          >
            <p>
              NFT {asset.tokenId} ·{" "}
              {asset.publish
                ? "เผยแพร่ไฟล์ใหม่ตามที่อยู่ด้านล่าง"
                : "คงไฟล์เดิม"}{" "}
              ·{" "}
              {asset.uriChange ? "เปลี่ยนที่อยู่ไฟล์ NFT" : "คงที่อยู่ไฟล์ NFT"}
            </p>
            <p className="break-all">ภาพ: {asset.imageUrl}</p>
            <p className="break-all">รหัสตรวจภาพ: {asset.imageHash}</p>
            <p className="break-all">ข้อมูล: {asset.jsonUrl}</p>
            <p className="break-all">รหัสตรวจข้อมูล: {asset.jsonHash}</p>
            {asset.aliases?.map((alias) => (
              <div
                key={alias.key}
                className="space-y-1 border-t border-base-300 pt-2"
              >
                <p className="break-all">
                  ไฟล์อ้างอิงที่ปรับให้ตรงกัน: {alias.url}
                </p>
                <p className="break-all">
                  รหัสเดิม: {alias.beforeHash ?? "ยังไม่มีไฟล์"}
                </p>
                <p className="break-all">รหัสหลังปรับ: {alias.afterHash}</p>
              </div>
            ))}
          </div>
        ))}
      </section>
      <section className="space-y-2 rounded-lg border border-primary p-3">
        <h4 className="font-semibold">เพดานค่าธรรมเนียมของแผนนี้</h4>
        {view.review.fees.perStep.map((step, index) => (
          <p key={step.stepId} className="break-all text-sm">
            ธุรกรรม {index + 1}: สูงสุด {weiToKub(step.maxFeeWei)} KUB
          </p>
        ))}
        <p className="break-all font-medium">
          รวมสูงสุด {weiToKub(view.review.fees.totalMaxFeeWei)} KUB
        </p>
        <p className="text-sm">เป็นเพดานที่อนุมัติ ไม่ใช่จำนวนที่ใช้จริง</p>
        <details>
          <summary className="min-h-12 cursor-pointer py-3">
            ค่าธรรมเนียมหน่วย wei สำหรับตรวจสอบ
          </summary>
          {view.review.fees.perStep.map((step) => (
            <p key={step.stepId} className="break-all text-sm">
              {step.stepId}: {step.maxFeeWei} wei
            </p>
          ))}
          <p className="break-all text-sm">
            รวม {view.review.fees.totalMaxFeeWei} wei
          </p>
        </details>
      </section>
      <details>
        <summary className="min-h-12 cursor-pointer py-3">
          หลักฐานตัวตนและรหัสแผนที่ยืนยัน
        </summary>
        {view.review.targets.map((target, i) => (
          <div key={i} className="space-y-1 text-sm">
            <p className="break-all">
              {target.sourceMicrochip} → {target.desiredMicrochip} ↔ NFT{" "}
              {target.desiredTokenId}
            </p>
            {target.evidence.map((evidence, j) => (
              <p key={j} className="break-all">
                {evidence.kind === "physical_scan"
                  ? "หลักฐานอ่านชิป"
                  : evidence.kind === "registration_document"
                    ? "เอกสารทะเบียน"
                    : "คำยืนยันผู้ดูแล"}
                : {evidence.reference}
              </p>
            ))}
          </div>
        ))}
        <p className="break-all text-sm">รหัสแผน: {view.manifestHash}</p>
        <p className="break-all text-sm">
          รหัสการตรวจทาน: {view.approvalFingerprint}
        </p>
      </details>
    </section>
  );
}
