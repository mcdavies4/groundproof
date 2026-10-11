import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { CreateEstateForm } from "@/components/EstateForms";

export const dynamic = "force-dynamic";

export default async function Estates() {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login?next=/estates");
  const { data: dev } = await supabase.from("developers").select("company, approved").eq("user_id", user.id).maybeSingle();
  if (!dev?.approved) redirect("/developers");

  const { data: estates } = await supabase.from("estates").select("id, name, location, created_at").eq("developer_id", user.id).order("created_at", { ascending: false });
  const ids = (estates ?? []).map((e) => e.id);
  const { data: units } = ids.length
    ? await supabase.from("properties").select("id, estate_id, anchored_at").in("estate_id", ids)
    : { data: [] as { id: string; estate_id: string; anchored_at: string | null }[] };

  return (
    <main className="wrap page">
      <div className="page-head"><h1 style={{ margin: 0 }}>{dev.company}: estates</h1></div>
      {(estates ?? []).length > 0 && (
        <ul className="list" style={{ marginBottom: "2.5rem" }}>
          {(estates ?? []).map((e) => {
            const mine = (units ?? []).filter((u) => u.estate_id === e.id);
            return (
              <li key={e.id}>
                <Link className="row-link" href={`/estates/${e.id}`}>
                  <div><strong>{e.name}</strong><div className="small muted">{e.location}</div></div>
                  <div className="small muted" style={{ textAlign: "right" }}>{mine.length} units<br />{mine.filter((u) => u.anchored_at).length} anchored</div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="panel" style={{ maxWidth: 560 }}>
        <h2 style={{ marginTop: 0 }}>{(estates ?? []).length ? "Add another estate" : "Create your first estate"}</h2>
        <CreateEstateForm />
      </div>
    </main>
  );
}
