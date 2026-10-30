import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { useAuth } from "~/context/auth.context";
import { api } from "~/utils/api";
import { checkInTokenSchema } from "~/lib/competition-check-in";
import { Workspace, Alert, button } from "~/components/competitions/Workspace";
import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  return { props: {} };
};

/** Resolving is read-only. The destination page still requires an explicit staff confirmation. */
export default function CheckInLandingPage() {
  const router = useRouter();
  const { isAuth } = useAuth();
  const token =
    typeof router.query.token === "string" ? router.query.token : "";
  const valid = checkInTokenSchema.safeParse(token).success;
  const started = useRef<string>();
  const mounted = useRef(false);
  const generation = useRef(0);
  const current = useRef({ token, isAuth });
  current.current = { token, isAuth };
  const resolve = api.competitions.resolveCheckIn.useMutation();
  const mutateAsync = resolve.mutateAsync;
  useEffect(() => {
    mounted.current = true;
    const invalidate = () => {
      generation.current += 1;
    };
    router.events?.on("routeChangeStart", invalidate);
    return () => {
      mounted.current = false;
      invalidate();
      router.events?.off("routeChangeStart", invalidate);
    };
  }, [router.events]);
  useEffect(() => {
    generation.current += 1;
    started.current = undefined;
    return () => {
      generation.current += 1;
    };
  }, [token, isAuth]);
  const open = useCallback(async () => {
    if (!mounted.current || !isAuth || !valid) return;
    const request = ++generation.current;
    try {
      const result = await mutateAsync({ token });
      if (
        !mounted.current ||
        request !== generation.current ||
        current.current.token !== token ||
        !current.current.isAuth
      )
        return;
      await router.replace(
        `/dashboard/competitions/${encodeURIComponent(result.eventId)}/applications/${encodeURIComponent(result.registrationId)}`,
      );
    } catch {
      /* The mutation error is rendered without including the token. */
    }
  }, [isAuth, valid, token, mutateAsync, router]);
  useEffect(() => {
    if (!isAuth || !valid || started.current === token) return;
    started.current = token;
    void open();
  }, [isAuth, valid, token, open]);
  return (
    <Workspace title="ตรวจข้อมูลรายงานตัว">
      <Head>
        <meta name="referrer" content="no-referrer" />
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      {!isAuth ? (
        <p role="status">
          กรุณาเข้าสู่ระบบบัญชีทีมงาน แล้วระบบจะกลับมายังใบสมัครนี้
        </p>
      ) : !valid && router.isReady !== false ? (
        <Alert error>
          QR ไม่ถูกต้อง กรุณาให้ผู้สมัครเปิด QR จากประวัติการสมัครอีกครั้ง
        </Alert>
      ) : resolve.error ? (
        <div className="space-y-3">
          <Alert error>{resolve.error.message}</Alert>
          <button
            className={button}
            disabled={resolve.isPending}
            onClick={() => void open()}
          >
            ลองเปิดใบสมัครอีกครั้ง
          </button>
        </div>
      ) : (
        <p role="status">กำลังเปิดใบสมัคร… ยังไม่มีการบันทึกรายงานตัว</p>
      )}
      <Link className={button} href="/dashboard/competitions">
        กลับรายการงานแข่งขัน
      </Link>
    </Workspace>
  );
}
