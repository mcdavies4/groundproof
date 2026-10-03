import { LoginForm } from "./LoginForm";

export default function Login({ searchParams }: { searchParams: { next?: string } }) {
  return (
    <main className="wrap page" style={{ maxWidth: 480 }}>
      <h1>Sign in</h1>
      <p className="muted">We&apos;ll email you a link. No password to remember.</p>
      <LoginForm next={searchParams.next ?? "/dashboard"} />
    </main>
  );
}
