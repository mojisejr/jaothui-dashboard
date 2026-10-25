import { useRouter } from "next/router";
import { useAuth } from "~/context/auth.context";
import { api } from "~/utils/api";
import {
  Alert,
  button,
  EventNav,
  Workspace,
} from "~/components/competitions/Workspace";
import { OnsiteRegistrationForm } from "~/components/competitions/OnsiteRegistrationForm";
export default function OnsitePage() {
  const router = useRouter();
  const { isAuth } = useAuth();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  const query = api.competitions.get.useQuery(
    { id },
    { enabled: isAuth && !!id, refetchOnWindowFocus: false },
  );
  return (
    <Workspace title="ลงทะเบียนหน้างาน">
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
        <>
          <EventNav event={query.data} active="onsite" />
          <OnsiteRegistrationForm
            key={query.data._id}
            event={query.data}
            refresh={query.refetch}
          />
        </>
      ) : null}
    </Workspace>
  );
}
