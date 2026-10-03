import { LoginForm } from "./LoginForm";

export default function Login({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  return (
    <main className="wrap page" style={{ maxWidth: 480 }}>
      <h1>Sign in</h1>
      <p className="muted">We&apos;ll email you a link. No password to remember.</p>
      {searchParams.error === "link" && (
        <p className="notice error" role="alert">
          That sign-in link didn&apos;t work. It may have expired, or been opened in a different browser from the one
          you requested it in. Send a new link and open it here.
        </p>
      )}
      <LoginForm next={searchParams.next ?? "/dashboard"} />
    </main>
  );
}
