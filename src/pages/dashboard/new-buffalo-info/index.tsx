import DurableCreate from "~/components/new-buffalo-info/DurableCreate";
import BaseLayout from "~/components/layout/BaseLayout";
/** Product execution remains hard-off in the server runtime until the combined release gate. */
export default function NewBuffaloInfoMainPage() {
  return (
    <BaseLayout title="New Buffalo Info">
      <DurableCreate />
    </BaseLayout>
  );
}
