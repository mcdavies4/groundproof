import { ShareLink } from "./ShareLink";

/** The owner's invite link. Both sides get 3 free check-ins after the friend's first verified visit. */
export function InviteFriend({ code, joined, rewarded }: { code: string; joined: number; rewarded: number }) {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://groundproof.site";
  return (
    <section className="panel invite-panel" aria-labelledby="invite-h">
      <div>
        <h2 id="invite-h">Invite a friend, get 3 free check-ins</h2>
        <p className="small muted">Know someone building or buying at home? Send them your link. When their first visit is verified, you both get 3 free check-ins.</p>
      </div>
      <div className="invite-stats">
        <strong>{rewarded * 3}</strong>check-ins earned
        {joined > rewarded && <div className="muted">{joined - rewarded} friend{joined - rewarded === 1 ? "" : "s"} still to verify</div>}
      </div>
      <ShareLink url={`${site}/pilot?ref=${code}`} title="Groundproof: see your property in Nigeria, proven" />
    </section>
  );
}
