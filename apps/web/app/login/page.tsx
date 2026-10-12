import Link from "next/link";
import { LoginForm } from "./LoginForm";

export default function Login({ searchParams }: { searchParams: { next?: string; error?: string; pilot?: string } }) {
  const pilot = searchParams.pilot === "1";
  return (
    <main className="wrap page" style={{ maxWidth: 480 }}>
      <h1>{pilot ? "Start your free pilot" : "Sign in"}</h1>
      <p className="muted">
        {pilot
          ? "Enter your email and we'll send you a link. New here? That creates your account. No password, no card."
          : "We'll email you a link. No password to remember."}
      </p>
      {searchParams.error === "link" && (
        <p className="notice error" role="alert">
          That sign-in link didn&apos;t work. It may have expired, or been opened in a different browser from the one
          you requested it in. Send a new link and open it here.
        </p>
      )}
      <LoginForm next={searchParams.next ?? "/dashboard"} />
      {pilot && <p className="small muted" style={{ marginTop: "1.5rem" }}>Up to 2 properties, 5 verified check-ins on each. <Link href="/pilot">What&apos;s in the pilot</Link></p>}
    </main>
  );
}
