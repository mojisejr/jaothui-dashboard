import { useRouter } from "next/router";
import { useAuth } from "~/context/auth.context";
import { api } from "~/utils/api";
import {
  Workspace,
  EventNav,
  Alert,
  button,
} from "~/components/competitions/Workspace";
import { ApplicationReview } from "~/components/competitions/ApplicationReview";
export default function ApplicationPage() {
  const { query } = useRouter();
  const id = typeof query.id === "string" ? query.id : "";
  const registrationId =
    typeof query.registrationId === "string" ? query.registrationId : "";
  const { isAuth } = useAuth();
  const event = api.competitions.get.useQuery(
    { id },
    { enabled: isAuth && !!id, refetchOnWindowFocus: false },
  );
  const application = api.competitions.application.useQuery(
    { id, registrationId },
    {
      enabled: isAuth && !!id && !!registrationId,
      refetchOnWindowFocus: false,
    },
  );
  return (
    <Workspace title="รายละเอียดใบสมัคร">
      {event.data ? (
        <EventNav event={event.data} active="applications" />
      ) : null}
      {(event.error ?? application.error) ? (
        <>
          <Alert error>
            {event.error?.message ?? application.error?.message}
          </Alert>
          <button
            className={button}
            onClick={() => {
              void event.refetch();
              void application.refetch();
            }}
          >
            ลองโหลดใหม่
          </button>
        </>
      ) : event.isPending || application.isPending ? (
        <p role="status">กำลังโหลดใบสมัคร…</p>
      ) : application.data ? (
        <ApplicationReview
          key={registrationId}
          id={id}
          initial={application.data}
          reload={async () => {
            const result = await application.refetch();
            if (result.error) throw result.error;
            return result.data;
          }}
        />
      ) : null}
    </Workspace>
  );
}
