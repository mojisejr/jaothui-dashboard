import { useRouter } from "next/router";
import { useAuth } from "~/context/auth.context";
import { api } from "~/utils/api";
import {
  Workspace,
  EventNav,
  Alert,
  button,
} from "~/components/competitions/Workspace";
import { ApplicationsList } from "~/components/competitions/ApplicationsList";
export default function ApplicationsPage() {
  const { query } = useRouter();
  const id = typeof query.id === "string" ? query.id : "";
  const { isAuth } = useAuth();
  const event = api.competitions.get.useQuery(
    { id },
    { enabled: isAuth && !!id, refetchOnWindowFocus: false },
  );
  return (
    <Workspace title="ตรวจใบสมัครแข่งขัน">
      {event.isPending ? (
        <p role="status">กำลังโหลดงาน…</p>
      ) : event.error ? (
        <>
          <Alert error>{event.error.message}</Alert>
          <button className={button} onClick={() => void event.refetch()}>
            ลองโหลดงานใหม่
          </button>
        </>
      ) : event.data ? (
        <>
          <EventNav event={event.data} active="applications" />
          <ApplicationsList id={id} />
        </>
      ) : null}
    </Workspace>
  );
}
