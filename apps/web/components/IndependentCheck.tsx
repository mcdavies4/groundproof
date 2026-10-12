import { STATES } from "@/lib/nigeria";
import { naira } from "@/lib/rates";
import { requestIndependent, startCheckout } from "@/app/properties/[id]/actions";

const FREQ: Record<string, string> = { once: "one visit", monthly: "monthly", fortnightly: "every 2 weeks", weekly: "weekly" };

/** For a buyer watching an estate unit: someone who doesn't work for the developer, checking their unit. */
export function IndependentCheck({ propertyId, estateName, match, asked, credits, free, msg }: {
  propertyId: string; estateName: string;
  match: { price_ngn: number; frequency: string; created_at: string } | null;
  asked: boolean; credits: number; free: boolean; msg?: string;
}) {
  return (
    <div className="panel" id="independent">
      <h3>Independent check</h3>
      {match ? (
        <>
          <p className="small">You have your own Groundproof reporter on this unit, {FREQ[match.frequency] ?? match.frequency}, at {naira(match.price_ngn)} a visit (you pay them directly).
            They work for you, not the developer. Their visits show here alongside the developer&apos;s, and the developer can see them too.</p>
          {free
            ? <p className="small muted">During the pilot, Groundproof&apos;s checks on their visits are free.</p>
            : <>
                <p className="small"><strong>{credits}</strong> independent check{credits === 1 ? "" : "s"} left.{credits === 0 && <span style={{ color: "var(--flagged)" }}> Your reporter can&apos;t check in until you top up.</span>}</p>
                <form action={startCheckout.bind(null, propertyId, "independent3")}><button className="btn secondary" type="submit">Buy 3 independent checks · ₦6,000</button></form>
              </>}
        </>
      ) : asked || msg === "sent" ? (
        <p className="small" role="status">Request received. We&apos;ll email you within 3 working days with a reporter who covers {estateName}, what they charge, and next steps.</p>
      ) : (
        <>
          <p className="small">The developer&apos;s updates are verified: right place, right time. But they choose what to photograph.
            For a second pair of eyes, we&apos;ll send a Groundproof reporter who doesn&apos;t work for the developer.</p>
          <p className="small muted">You pay the reporter per visit, at our published rates. {free ? "Groundproof's checks are free during the pilot." : "Groundproof's checks are ₦2,000 a visit."} The developer is told, so the reporter can get onto the site.</p>
          {msg?.startsWith("error:") && <p className="small" role="alert" style={{ color: "var(--flagged)" }}>{msg.slice(6)}</p>}
          <form action={requestIndependent.bind(null, propertyId)}>
            <div className="field"><label htmlFor="ic-name">Your name</label><input id="ic-name" name="name" type="text" required maxLength={100} autoComplete="name" /></div>
            <div className="field"><label htmlFor="ic-state">State the estate is in</label>
              <select id="ic-state" name="state" required defaultValue=""><option value="" disabled>Choose</option>{STATES.map((s) => <option key={s}>{s}</option>)}</select></div>
            <div className="field"><label htmlFor="ic-freq">How often</label>
              <select id="ic-freq" name="frequency" defaultValue="monthly">{Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v[0].toUpperCase() + v.slice(1)}</option>)}</select></div>
            <div className="field"><label htmlFor="ic-notes">Anything to check? <span className="muted">(optional)</span></label><textarea id="ic-notes" name="notes" rows={2} maxLength={900} /></div>
            <button className="btn" type="submit">Ask for an independent reporter</button>
          </form>
        </>
      )}
    </div>
  );
}
