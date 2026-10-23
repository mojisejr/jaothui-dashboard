import { type IMetadata } from "~/interfaces/i-metadata";
import { DurableFieldDialog } from "./DurableEdit";
export default function Dialog({ metadata }: { metadata: IMetadata }) {
  return <DurableFieldDialog metadata={metadata} field="image" />;
}
