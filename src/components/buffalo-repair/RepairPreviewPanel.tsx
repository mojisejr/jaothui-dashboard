import { type RepairPreview } from "./useRepairPreview";
const blockers: Record<string, string> = {
  EXPANDED_SCOPE_REQUIRED:
    "พบควายตัวที่สามหรือความเชื่อมโยงนอกขอบเขต ต้องหยุดและขยายการตรวจสอบก่อน",
  NEEDS_IDENTITY_DECISION:
    "หลักฐานตัวจริงยังไม่พอ ต้องยืนยันจากเครื่องอ่านไมโครชิปหรือเอกสาร",
  NOT_ONE_TO_ONE:
    "ตัวตนปลายทางยังไม่เป็นหนึ่งต่อหนึ่ง: ตรวจเลขชิปและ NFT ของทั้งคู่",
  SOURCE_NOT_FOUND: "ไม่พบทะเบียนต้นทางที่ระบุ",
  TOKEN_NOT_INITIALIZED: "NFT ที่เลือกยังไม่มีข้อมูลทะเบียนพร้อมใช้งาน",
  IDENTITY_EVIDENCE_REVIEW_REQUIRED:
    "ไมโครชิปเดิมบน blockchain อยู่นอกชุดที่ยืนยัน ต้องตรวจหลักฐานและระบุค่าเดิมให้ตรงทุกตัวอักษร",
  REFERENCE_OWNERSHIP_REVIEW_REQUIRED:
    "มีข้อมูลอ้างอิงที่ยังยืนยันเจ้าของไม่ได้ เช่น ใบรับรองหรือประวัติ ห้ามเปลี่ยนตามเลขชิปอัตโนมัติ",
  ACTIVE_OPERATION: "มีรายการอื่นกำลังใช้ตัวตนนี้ ต้องตรวจรายการเดิมก่อน",
  ALIAS_OUTSIDE_SCOPE: "พบชื่อไมโครชิปเดิมที่ชี้ไปยัง NFT นอกขอบเขต",
  CLOSURE_LIMIT_REVIEW_REQUIRED: "ความเชื่อมโยงเกินขอบเขตที่ตรวจอัตโนมัติได้",
  OUTSIDE_VERIFIED_MINT_RANGE:
    "พบ NFT นอกช่วงที่พิสูจน์ของสัญญานี้ ต้องตรวจเพิ่มเติม",
  NFT_OWNER_ZERO: "ยังยืนยันเจ้าของ NFT ไม่ได้",
  UNSUPPORTED_NFT_CODE: "โค้ดสัญญา NFT ไม่อยู่ในชุดที่ตรวจสอบแล้ว",
  UNSUPPORTED_CONTRACT_CODE: "โค้ดสัญญาทะเบียนไม่อยู่ในชุดที่ตรวจสอบแล้ว",
  NO_IDENTITY_CHANGE: "ข้อมูลที่เสนอไม่มีการเปลี่ยนตัวตน",
  ASSET_SIZE_LIMIT: "ไฟล์ประกอบมีขนาดเกินขอบเขตที่ตรวจได้",
  NFT_JSON_REVIEW_REQUIRED: "ข้อมูล JSON ของ NFT ยังตรวจยืนยันไม่ได้",
  NFT_JSON_IMMUTABLE_TARGET_REVIEW_REQUIRED:
    "พาธ JSON ที่เปลี่ยนไม่ได้ต้องตรวจแผนเผยแพร่เพิ่มเติม",
  NFT_JSON_IDENTITY_REVIEW_REQUIRED: "ตัวตนใน JSON ไม่ตรงหลักฐาน ต้องตรวจเพิ่ม",
  IMAGE_IDENTITY_REVIEW_REQUIRED: "ยังยืนยันภาพว่าเป็นของควายตัวนี้ไม่ได้",
  UNOWNED_ASSET_KEY: "พาธไฟล์อยู่นอกขอบเขตที่ระบบดูแล",
  ASSET_ORIGIN_REVIEW_REQUIRED: "ยังยืนยันแหล่งไฟล์ภาพหรือ JSON ไม่ได้",
  ASSET_READ_UNAVAILABLE: "อ่านไฟล์ประกอบไม่สำเร็จ จึงยังยืนยันแผนไม่ได้",
  ASSET_IDENTITY_REVIEW_REQUIRED: "ตัวตนในไฟล์ประกอบต้องตรวจเพิ่มเติม",
};
const join = (values: string[]) =>
  values.length ? values.join(", ") : "ไม่มี";
export function RepairPreviewPanel({ preview }: { preview: RepairPreview }) {
  const manifest = preview.manifest;
  return (
    <div className="space-y-5" data-repair-preview>
      <section
        className="space-y-2 rounded-lg border border-primary p-4"
        role="status"
      >
        <h2 className="text-xl font-semibold">
          ผลตรวจและข้อเสนอการเปลี่ยนแปลง
        </h2>
        <p>
          {preview.status === "ready_for_operator_review"
            ? "ข้อมูลพร้อมให้ผู้ดูแลตรวจทานข้อเสนอ"
            : "ยังผ่านการตรวจไม่ได้ ต้องแก้ข้อขัดข้องก่อน"}
        </p>
        <p className="font-medium">
          ตรวจอ่านเท่านั้น · ยังไม่มีข้อมูลใดถูกแก้ไข
        </p>
        <p className="break-all text-sm">รหัสข้อเสนอ: {preview.digest}</p>
        {!!preview.blockers.length && (
          <ul className="space-y-3" aria-label="ข้อขัดข้อง">
            {preview.blockers.map((code) => (
              <li key={code} className="rounded-lg border border-warning p-3">
                <p>
                  {(Object.hasOwn(blockers, code)
                    ? blockers[code]
                    : undefined) ??
                    "ต้องให้ผู้ดูแลตรวจหลักฐานเพิ่มเติมก่อนดำเนินการ"}
                </p>
                <p className="break-all text-sm">{code}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      {manifest.changes.map((change, index) => (
        <section
          className="space-y-3 rounded-lg border border-base-300 p-4"
          key={change.sourceMicrochip}
        >
          <h3 className="text-lg font-semibold">
            ตัวที่ {index + 1} · ทะเบียน {change.sourceMicrochip}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h4 className="font-medium">ก่อนเปลี่ยน — ฐานข้อมูล</h4>
              <p className="break-all">
                microchip: {change.database?.microchip ?? "ไม่พบ"}
              </p>
              <p>NFT: {change.database?.tokenId ?? "ไม่พบ"}</p>
            </div>
            <div>
              <h4 className="font-medium">หลังเปลี่ยน — ฐานข้อมูล</h4>
              <p className="break-all">microchip: {change.desiredMicrochip}</p>
              <p>NFT: {change.desiredTokenId}</p>
              <p>
                {change.databaseChange
                  ? "เสนอแก้การผูกตัวตนในฐานข้อมูล"
                  : "คงการผูกตัวตนในฐานข้อมูล"}
              </p>
            </div>
            <div>
              <h4 className="font-medium">
                ก่อนเปลี่ยน — blockchain ของ NFT {change.desiredTokenId}
              </h4>
              <p className="break-all">
                microchip: {change.chain?.microchip ?? "ยังยืนยันไม่ได้"}
              </p>
            </div>
            <div>
              <h4 className="font-medium">หลังเปลี่ยน — blockchain</h4>
              <p className="break-all">microchip: {change.desiredMicrochip}</p>
              <p>
                {change.chainChange
                  ? "เสนอแก้ microchip หรือการชี้ NFT บน blockchain"
                  : "ไม่ต้องส่งธุรกรรมแก้ตัวตนบน blockchain"}
              </p>
            </div>
          </div>
          <p className="text-sm">
            การแก้ฐานข้อมูลกับการแก้ blockchain เป็นคนละขั้นตอน
            ไม่สมมติว่าต้องสลับทั้งสองตัว
          </p>
          <ul className="space-y-1 text-sm">
            {change.evidence.map((evidence, i) => (
              <li key={i} className="break-words">
                หลักฐาน{" "}
                {evidence.kind === "physical_scan"
                  ? "เครื่องอ่านไมโครชิป"
                  : evidence.kind === "registration_document"
                    ? "เอกสารทะเบียน"
                    : "คำรับรองผู้ดูแล"}
                : {evidence.reference}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section className="space-y-3 rounded-lg border border-base-300 p-4">
        <h3 className="text-lg font-semibold">ขอบเขตการตรวจซ้ำ</h3>
        <p>
          ตรวจข้อมูลฐานข้อมูลทั้งชุด พร้อมตัวตนปัจจุบันของช่วง NFT{" "}
          {manifest.coverage.range.first}–{manifest.coverage.range.last}{" "}
          ที่พิสูจน์ของสัญญานี้ ณ block {manifest.pin.blockNumber} (
          {manifest.coverage.count} รายการ)
        </p>
        <p>
          ตรวจชื่อไมโครชิปเดิมที่ทราบและความเชื่อมโยงที่พบ
          ยังตรวจครบทุกชื่อเดิมหรือสัญญาทะเบียนในอดีตที่ไม่ทราบไม่ได้
        </p>
        <p className="text-sm">
          ผลนี้ไม่รับรองว่าไม่มีชื่อไมโครชิปเก่าทั้งระบบ
          และสัญญาปัจจุบันไม่ลบชื่อเดิมทั้งหมด
        </p>
        <details>
          <summary className="min-h-12 cursor-pointer py-3">
            ตัวตนและชื่อเดิมที่อยู่ในขอบเขต
          </summary>
          <ul className="space-y-2 text-sm">
            {manifest.closure.database.map((row) => (
              <li key={row.microchip} className="break-all">
                DB {row.microchip} → NFT {row.tokenId}
              </li>
            ))}
            {manifest.closure.canonical.map((row) => (
              <li key={row.tokenId} className="break-all">
                NFT {row.tokenId} → {row.microchip ?? "ยังไม่พร้อม"}
              </li>
            ))}
            {manifest.closure.aliases.map((alias) => (
              <li key={alias.microchip} className="break-all">
                ชื่อเดิม {alias.microchip} → NFT {alias.tokenId}
              </li>
            ))}
          </ul>
        </details>
        <details>
          <summary className="min-h-12 cursor-pointer py-3">
            ข้อมูลอ้างอิงที่ได้รับผล ({manifest.references.length})
          </summary>
          {!manifest.references.length && (
            <p>ไม่พบข้อมูลอ้างอิงเพิ่มในขอบเขตที่ตรวจ</p>
          )}
          <ul className="space-y-2 text-sm">
            {manifest.references.map((reference, index) => (
              <li key={index} className="break-all">
                {reference.kind} · {reference.key}
                <br />
                microchip: {join(reference.chips)}
                <br />
                หลักฐาน: {reference.digest}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm">
            ความสัมพันธ์ในฐานข้อมูลไม่ใช่หลักฐานว่าเอกสารหรือประวัติเป็นของควายตัวนั้น
            ต้องยืนยันเจ้าของข้อมูลตามข้อขัดข้องที่แสดง
          </p>
        </details>
      </section>
      <section className="space-y-3 rounded-lg border border-base-300 p-4">
        <h3 className="text-lg font-semibold">ไฟล์ภาพ, JSON และ URI</h3>
        <p>
          {manifest.assets.verification === "complete"
            ? "ตรวจหลักฐานไฟล์ครบตามขอบเขต"
            : "หลักฐานไฟล์ยังต้องตรวจเพิ่ม"}
        </p>
        {manifest.assets.tokens.map((asset) => (
          <details key={asset.tokenId}>
            <summary className="min-h-12 cursor-pointer py-3">
              NFT {asset.tokenId} · แผนไฟล์ประกอบ
            </summary>
            <ul className="space-y-3 text-sm">
              {asset.before.map((before, index) => (
                <li key={index} className="break-all">
                  {before.role}: {before.url}
                  <br />
                  Hash: {before.hash ?? "ยังยืนยันไม่ได้"} · {before.bytes} ไบต์
                </li>
              ))}
            </ul>
            {asset.after ? (
              <div className="mt-3 space-y-2 text-sm">
                <p>
                  {asset.after.uriStrategy === "preserve"
                    ? "คง token URI เดิม"
                    : "เผยแพร่ไฟล์ใหม่แบบไม่ทับของเดิม แล้วจึงเปลี่ยน token URI"}
                </p>
                <p>
                  จำนวนการเปลี่ยน URI ที่คาด:{" "}
                  {asset.after.expectedUriSetterCount}
                </p>
                <p className="break-all">
                  Image hash: {asset.after.imageHash}
                  <br />
                  JSON hash: {asset.after.jsonHash}
                </p>
                <p className="break-all">
                  ชื่อไฟล์เผยแพร่: {asset.after.aliasImageKey} /{" "}
                  {asset.after.aliasJsonKey}
                </p>
                {asset.after.immutablePathBinding && (
                  <p>ต้องผูกพาธไฟล์กับเลขรายการจริงก่อนอนุมัติการซ่อม</p>
                )}
              </div>
            ) : (
              <p>ยังสร้างแผนไฟล์หลังเปลี่ยนที่ยืนยันได้ไม่ได้</p>
            )}
          </details>
        ))}
      </section>
      <section className="space-y-2 rounded-lg border border-base-300 p-4">
        <h3 className="text-lg font-semibold">
          ผลข้างเคียงและลำดับที่ต้องตรวจตอนซ่อมจริง
        </h3>
        <ol className="list-inside list-decimal space-y-2">
          <li>
            ตรวจขอบเขต หลักฐานปัจจุบัน ค่าธรรมเนียมสูงสุด
            และการอนุมัติอีกครั้งก่อนเริ่ม
          </li>
          <li>หากแก้บน blockchain: บันทึกชุดตัวตนและตรวจ receipt</li>
          <li>
            คืนค่า DNA เดิมของ NFT:{" "}
            {join(manifest.effects.dnaClearedThenRestored)}
          </li>
          <li>เผยแพร่ไฟล์และฐานข้อมูล แล้วตรวจทุกส่วนก่อนถือว่าสำเร็จ</li>
        </ol>
        <p>
          ตัวนับ metadata เพิ่มที่คาด:{" "}
          {manifest.effects.metadataCounterIncrement}
        </p>
        <p>
          เวลาสร้าง native ที่เปลี่ยน: NFT{" "}
          {join(manifest.effects.nativeCreatedAtResets)}
        </p>
        <p>
          เวลาอัปเดต native ที่เปลี่ยน: NFT{" "}
          {join(manifest.effects.nativeUpdatedAtResets)}
        </p>
        <p>
          ต้องรักษาข้อมูลธุรกิจ พ่อแม่ เจ้าของ NFT และสิทธิ์อนุมัติเดิม ส่วน URI
          เป็นไปตามแผนไฟล์ด้านบน
        </p>
        <p>
          ธุรกรรมชุดบน blockchain อาจสำเร็จก่อน DNA, ไฟล์ และฐานข้อมูล
          ทั้งระบบไม่ได้เปลี่ยนพร้อมกันในธุรกรรมเดียว
        </p>
        <p className="text-sm">
          ยังไม่มีการคำนวณหรือยืนยันค่าธรรมเนียมสำหรับส่งธุรกรรมในหน้าตรวจอ่านนี้
        </p>
      </section>
    </div>
  );
}
