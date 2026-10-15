import Head from "next/head";
import Link from "next/link";
import type { ReactNode } from "react";
import Header from "~/components/ui/Header";
import AmbientOrbs from "~/components/ui/AmbientOrbs";
import {
  lifecycleLabels,
  registrationLabels,
  type Competition,
} from "~/lib/competitions";
export const control =
  "min-h-12 w-full min-w-0 rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-base text-white outline-none focus:border-primary-orange focus:ring-2 focus:ring-primary-orange/50 disabled:opacity-50";
export const button =
  "inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-base text-white hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-orange disabled:cursor-not-allowed disabled:opacity-50";
export const primary = `${button} !border-primary-orange !bg-primary-orange !text-black hover:!bg-primary-orange-glow`;
export function Workspace({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="competition-workspace relative min-h-screen bg-dark">
      <Head>
        <title>{`${title} | Jaothui Dashboard`}</title>
      </Head>
      <AmbientOrbs />
      <Header />
      <main className="relative z-10 mx-auto max-w-7xl space-y-6 px-4 pb-12 pt-10 text-base md:px-6">
        <Link className={`${button} mb-2`} href="/dashboard">
          กลับหน้าหลัก
        </Link>
        <h1 className="break-words text-2xl font-semibold md:text-3xl">
          {title}
        </h1>
        {children}
      </main>
    </div>
  );
}
export function Status({ event }: { event: Competition }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      <div>
        <dt className="mb-1 text-sm text-text-muted">สถานะงาน</dt>
        <dd className="inline-block rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm">
          {lifecycleLabels[event.policy.lifecycle] ?? event.policy.lifecycle}
        </dd>
      </div>
      <div>
        <dt className="mb-1 text-sm text-text-muted">การรับสมัคร</dt>
        <dd
          className={`inline-block rounded-full border px-3 py-1 text-sm ${event.policy.publicRegistration === "open" ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-200" : "border-orange-300/30 bg-orange-400/10 text-orange-200"}`}
        >
          {registrationLabels[event.policy.publicRegistration] ??
            event.policy.publicRegistration}
        </dd>
      </div>
    </dl>
  );
}
export function Alert({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <p
      role={error ? "alert" : "status"}
      className={`break-words rounded-xl border p-4 ${error ? "border-red-300/30 bg-red-400/10 text-red-100" : "border-orange-300/30 bg-orange-400/10 text-orange-100"}`}
    >
      {children}
    </p>
  );
}
