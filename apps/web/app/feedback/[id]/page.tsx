import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your feedback — Groundproof", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function save(id: string, form: FormData) {
  "use server";
  const score = Number(form.get("score"));
  await createClient().rpc("submit_feedback", {
    p_id: id,
    p_score: Number.isInteger(score) ? score : null,
    p_useful: String(form.get("useful") ?? ""),
    p_improve: String(form.get("improve") ?? ""),
    p_quote_ok: form.get("quote_ok") === "on",
    p_quote_name: String(form.get("quote_name") ?? ""),
  });
  redirect(`/feedback/${id}?done=1`);
}

export default async function Feedback({ params, searchParams }: { params: { id: string }; searchParams: { s?: string; done?: string } }) {
  const supabase = createClient();
  const id = UUID.test(params.id) ? params.id : null;
  const { data } = id ? await supabase.rpc("get_feedback", { p_id: id }) : { data: null };
  const row = (Array.isArray(data) ? data[0] : data) as { score: number | null; answered: boolean; quote_ok: boolean } | null;
  if (!id || !row || (row.score === null && row.answered === null)) {
    return (
      <main className="wrap page narrow">
        <h1>That link doesn&apos;t work</h1>
        <p>It may have been copied incompletely. You can always just reply to the email instead.</p>
      </main>
    );
  }

  // One click from the email counts, even if they go no further.
  let score = row.score;
  const clicked = Number(searchParams.s);
  if (searchParams.s !== undefined && Number.isInteger(clicked) && clicked >= 0 && clicked <= 10 && clicked !== score) {
    await supabase.rpc("submit_feedback", { p_id: id, p_score: clicked });
    score = clicked;
  }

  if (searchParams.done) {
    return (
      <main className="wrap page narrow">
        <h1>Thank you</h1>
        <p className="lede">That genuinely helps. I read every answer.</p>
        <p>Know someone building or buying at home? Your invite link is on <Link href="/dashboard">your dashboard</Link>: you both get 3 free check-ins.</p>
        <p className="muted">Emeka, founder of Groundproof</p>
      </main>
    );
  }

  return (
    <main className="wrap page narrow">
      <h1>{score === null ? "How's Groundproof doing?" : "Thanks. Anything to add?"}</h1>
      <p className="muted">{score === null ? "One question, then two optional ones." : "Your score is saved. The rest is optional, but it's what helps most."}</p>
      <form action={save.bind(null, id)} className="panel">
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 800 }}>How likely are you to recommend Groundproof to a friend building or buying in Nigeria?</legend>
          <div className="score-row">
            {Array.from({ length: 11 }, (_, n) => (
              <label key={n}><input type="radio" name="score" value={n} defaultChecked={score === n} required /><span>{n}</span></label>
            ))}
          </div>
          <div className="score-ends"><span>Not at all</span><span>Definitely</span></div>
        </fieldset>
        <div className="field" style={{ marginTop: "1.25rem" }}>
          <label htmlFor="useful">What&apos;s been most useful?</label>
          <textarea id="useful" name="useful" rows={3} maxLength={1000} />
        </div>
        <div className="field">
          <label htmlFor="improve">What should we change or add?</label>
          <textarea id="improve" name="improve" rows={3} maxLength={1000} />
        </div>
        <div className="field">
          <label className="check-line"><input type="checkbox" name="quote_ok" defaultChecked={row.quote_ok} />
            <span>Happy for Groundproof to quote what you wrote (for example on our website or social media)</span></label>
        </div>
        <div className="field">
          <label htmlFor="quote_name">If we quote you, sign it as</label>
          <input id="quote_name" name="quote_name" maxLength={80} placeholder="e.g. Chioma, London" style={{ width: "100%" }} />
          <p className="small muted" style={{ margin: "0.3rem 0 0" }}>First name and city is plenty. Leave blank to stay anonymous.</p>
        </div>
        <button className="btn" type="submit">Send</button>
      </form>
    </main>
  );
}
