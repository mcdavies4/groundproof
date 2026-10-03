import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { DeleteForm } from "./DeleteForm";

export default async function Account() {
  const { user } = await requireUser();
  if (!user) redirect("/login?next=/account");

  return (
    <main className="wrap page" style={{ maxWidth: 560 }}>
      <h1>Your account</h1>
      <p>Signed in as <strong>{user.email}</strong>.</p>

      <div className="panel" style={{ marginTop: "2rem" }}>
        <h2>Delete your account</h2>
        <p>
          This permanently deletes your account, the properties you own, and all their photos and check-ins. It
          can&apos;t be undone. <Link href="/delete-account">What gets deleted</Link>
        </p>
        <DeleteForm />
      </div>
    </main>
  );
}
