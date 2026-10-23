import BaseLayout from "~/components/layout/BaseLayout";
import DurableEdit from "~/components/update-buffalo-info/DurableEdit";
export default function UpdateBuffalo() {
  return (
    <BaseLayout title="ระบบค้นหา และ แก้ไข ข้อมูลควาย">
      <DurableEdit dnaOnly />
    </BaseLayout>
  );
}
