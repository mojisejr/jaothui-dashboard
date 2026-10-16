import { useRouter } from "next/router";
import { useAuth } from "~/context/auth.context";
import { api } from "~/utils/api";
import { Workspace, Alert, button } from "~/components/competitions/Workspace";
import { CompetitionEditor } from "~/components/competitions/CompetitionEditor";
export default function CompetitionDetail() {
  const router = useRouter();
  const { isAuth } = useAuth();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  const query = api.competitions.get.useQuery(
    { id },
    { enabled: isAuth && !!id, refetchOnWindowFocus: false },
  );
  return (
    <Workspace title="จัดการงานแข่งขัน">
      {query.isPending ? (
        <p role="status">กำลังโหลดงาน…</p>
      ) : query.error ? (
        <>
          <Alert error>{query.error.message}</Alert>
          <button className={button} onClick={() => void query.refetch()}>
            ลองอีกครั้ง
          </button>
        </>
      ) : query.data ? (
        <CompetitionEditor key={query.data._id} existing={query.data} />
      ) : null}
    </Workspace>
  );
}
