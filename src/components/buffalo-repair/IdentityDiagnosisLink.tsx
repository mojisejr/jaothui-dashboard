import Link from "next/link";
import { encodeSourceMicrochip } from "./source-microchip";

// These are identity findings that the read-only proposal flow can investigate.
// Uninitialized tokens, domain/configuration failures and unknown errors are not repair entry points.
const diagnosisCodes = new Set([
  "TOKEN_MAPPING_CONFLICT",
  "CANONICAL_CHIP_CONFLICT",
  "AMBIGUOUS_DB_TOKEN",
]);
export function identityDiagnosisHref(microchip: string, code?: string) {
  if (!code || !diagnosisCodes.has(code)) return null;
  const encoded = encodeSourceMicrochip(microchip);
  if (encoded === null) return null;
  return `/dashboard/repair-buffalo?microchip=${encoded}`;
}
export function IdentityDiagnosisLink({
  microchip,
  code,
}: {
  microchip: string;
  code?: string;
}) {
  const href = identityDiagnosisHref(microchip, code);
  if (!href) return null;
  return (
    <div className="my-3 space-y-2">
      <Link href={href} className="btn btn-outline min-h-12">
        ตรวจตัวตนก่อนเสนอซ่อม
      </Link>
      <p className="text-sm">
        เปิดการตรวจอ่านทะเบียนนี้เท่านั้น ยังต้องระบุเลขที่ถูกต้องจากหลักฐาน
        และยังไม่มีการแก้ข้อมูล
      </p>
    </div>
  );
}
