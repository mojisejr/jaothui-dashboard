import BaseLayout from "~/components/layout/BaseLayout";
import RepairDiagnosisScreen from "~/components/buffalo-repair/RepairDiagnosisScreen";
export default function RepairBuffaloPage() {
  return (
    <BaseLayout title="ตรวจสอบตัวตนก่อนซ่อมทะเบียน">
      <RepairDiagnosisScreen />
    </BaseLayout>
  );
}
