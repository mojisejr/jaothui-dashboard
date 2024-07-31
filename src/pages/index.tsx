import Head from "next/head";
import LoginForm from "~/components/auth/LoginForm";
import Image from "next/image";

export default function Home() {
  return (
    <>
      <Head>
        <title>Jaothui Dashboard</title>
        <meta name="description" content="Jaothui Dashboard" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <figure className="w-52">
          <Image
            src="/images/thuiLogo.png"
            width={1000}
            height={1000}
            alt="logo"
          />
        </figure>
        <LoginForm />
      </main>
    </>
  );
}
