import { Workspace } from "~/components/competitions/Workspace";
import { CompetitionEditor } from "~/components/competitions/CompetitionEditor";
export default function NewCompetition() {
  return (
    <Workspace title="สร้างงานแข่งขัน">
      <CompetitionEditor />
    </Workspace>
  );
}
