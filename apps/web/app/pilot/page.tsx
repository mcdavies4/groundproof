import type { Metadata } from "next";
import Link from "next/link";
import { PostcodePlate } from "@/components/PostcodePlate";
import { VerdictBadge } from "@/components/VerdictBadge";

export const metadata: Metadata = {
  title: "Free pilot: your property in Nigeria, proven from abroad — Groundproof",
  description: "Up to 2 properties and 5 verified check-ins on each, free. Every visit checked against the NIPOST postcode, GPS, compass and photos. No card needed.",
  openGraph: {
    title: "Groundproof free pilot",
    description: "Your property in Nigeria, proven from abroad. Up to 2 properties, 5 verified check-ins each, free.",
  },
};

const START = "/login?pilot=1&next=/properties/new";

export default function Pilot({ searchParams }: { searchParams: { ref?: string } }) {
  const invited = /^[a-z0-9]{4,12}$/i.test(searchParams.ref ?? "");
  return (
    <main>
      <section className="wrap hero">
        <div>
          <span className="pilot-badge">Free pilot · Now open</span>
          {invited && (
            <p className="friend-note">A friend invited you. After your first verified visit, you both get <strong>3 extra free check-ins</strong>.</p>
          )}
          <h1>Your property in Nigeria, proven from abroad.</h1>
          <p className="lede">
            Not &ldquo;I&apos;ve been there, all is fine.&rdquo; Every visit to your build, house or land is checked against
            its NIPOST postcode, live GPS, compass and photos, and marked verified or flagged.
          </p>
          <div className="pilot-ctas">
            <Link className="btn" href={START}>Start your free pilot</Link>
            <Link className="btn secondary" href="/find-someone">No one on the ground?</Link>
          </div>
          <p className="small muted">Takes 2 minutes. No card, no password.{invited && " Sign up on this device so the invite counts."}</p>
        </div>
        <aside className="proof" aria-label="Example check-in log">
          <PostcodePlate code="EN-05-V19-CD-22" size="lg" />
          <p className="small muted" style={{ marginTop: "0.75rem" }}>Mum&apos;s house, Enugu. Roofing stage.</p>
          <ol>
            <li><strong>Roof trusses up</strong><VerdictBadge verdict="verified" /><span className="when">Taken 9m from the building, accuracy ±6m</span></li>
            <li><strong>Blockwork to lintel</strong><VerdictBadge verdict="verified" /><span className="when">Taken 12m from the building, accuracy ±8m</span></li>
            <li><strong>Roofing sheets delivered</strong><VerdictBadge verdict="flagged" /><span className="when">Taken at EN-05-V22-AB-04, 1.4km away</span></li>
          </ol>
        </aside>
      </section>

      <section className="section">
        <div className="wrap">
          <h2>What&apos;s in the pilot</h2>
          <ul className="pilot-grid">
            <li><strong>Up to 2 properties</strong><span>A build, a finished house, a rental or a plot of land. Each one is anchored to its postcode and exact spot.</span></li>
            <li><strong>5 verified check-ins on each</strong><span>GPS, compass, photo comparison and device checks on every visit. Old photos or the wrong site get flagged.</span></li>
            <li><strong>Alerts and a progress view</strong><span>An email after every visit, and a side-by-side view of the building changing over time.</span></li>
            <li><strong>Family can follow too</strong><span>Invite a spouse, sibling or parent to see the visits. Free, and they can&apos;t change anything.</span></li>
          </ul>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2>How it works</h2>
          <ol className="steps">
            <li><h3>Add your property</h3><p>Its NIPOST postcode if you have it, or just the area. We&apos;ll lock it to the exact spot on the first visit.</p></li>
            <li><h3>Send an invite code</h3><p>To a relative, your builder&apos;s supervisor or an agent. They join on our free Android app. No one to send? <Link href="/find-someone">We&apos;ll find someone</Link>.</p></li>
            <li><h3>See proof, not promises</h3><p>Every visit comes back verified or flagged, with photos, place and time. Ask for a new visit in one click.</p></li>
          </ol>
        </div>
      </section>

      <section className="section">
        <div className="wrap narrow-copy">
          <h2>Good to know</h2>
          <dl className="pilot-faq">
            <dt>What happens when the pilot ends?</dt>
            <dd>Nothing automatic. You keep everything you&apos;ve recorded. If you want to carry on, you choose a plan or buy check-ins from ₦2,000 each. We never charge a card you haven&apos;t given us.</dd>
            <dt>I don&apos;t know the NIPOST postcode.</dt>
            <dd>That&apos;s fine. Add the property by area, and the first visit anchors it by location. You can add the postcode later.</dd>
            <dt>Does it work for land?</dt>
            <dd>Yes. For a plot, your person walks the beacons in the app, and we check the shape and size against your survey plan.</dd>
            <dt>What does my person on the ground need?</dt>
            <dd>An Android phone with the free Groundproof app. If there&apos;s no signal at the site, the visit is saved and uploads later, still verified.</dd>
            <dt>Is this a title search?</dt>
            <dd>No. Groundproof proves who visited, where and when. It doesn&apos;t confirm who owns the land; use a lawyer for that.</dd>
          </dl>
          <div className="free-line" style={{ marginTop: "2rem" }}>
            <strong>Ready?</strong>
            <span>2 properties, 5 verified check-ins each, free.</span>
            <Link className="btn" href={START} style={{ marginLeft: "auto" }}>Start your free pilot</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
