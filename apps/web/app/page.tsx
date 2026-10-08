import { PostcodePlate } from "@/components/PostcodePlate";
import { VerdictBadge } from "@/components/VerdictBadge";
import { WaitlistForm } from "@/components/WaitlistForm";
import { GetTheApp } from "@/components/GetTheApp";

export default function Home() {
  return (
    <main>
      <section className="wrap hero">
        <div>
          <h1>Your contractor sent photos. Were they taken at your house?</h1>
          <p className="lede">
            Groundproof checks every progress photo from your build in Nigeria against the
            building&apos;s NIPOST postcode. If the phone wasn&apos;t standing at your house, you&apos;ll know
            before you send the next payment.
          </p>
          <WaitlistForm />
          <p className="small muted">Pilot: 5 free check-ins per property. No card needed.</p>
        </div>

        <aside className="proof" aria-label="Example check-in log">
          <PostcodePlate code="EN-05-V19-CD-22" size="lg" />
          <p className="small muted" style={{ marginTop: "0.75rem" }}>Mum&apos;s house, Enugu. Roofing stage.</p>
          <ol>
            <li>
              <strong>Roof trusses up</strong>
              <VerdictBadge verdict="verified" />
              <span className="when">Taken 9m from the building, accuracy ±6m</span>
            </li>
            <li>
              <strong>Blockwork to lintel</strong>
              <VerdictBadge verdict="verified" />
              <span className="when">Taken 12m from the building, accuracy ±8m</span>
            </li>
            <li>
              <strong>Roofing sheets delivered</strong>
              <VerdictBadge verdict="flagged" />
              <span className="when">Taken at EN-05-V22-AB-04, 1.4km away</span>
            </li>
          </ol>
        </aside>
      </section>

      <section className="section">
        <div className="wrap">
          <h2>How it works</h2>
          <ol className="steps">
            <li>
              <h3>Add your property</h3>
              <p>Enter its NIPOST postcode. We confirm the building exists and show what NIPOST has on record for it.</p>
            </li>
            <li>
              <h3>Your person on the ground checks in</h3>
              <p>A relative, contractor or agent uses <a href="#app">our app</a> on site. Photos come from the in-app camera only, with location and time attached.</p>
            </li>
            <li>
              <h3>Every check-in gets a verdict</h3>
              <p>We ask NIPOST which building the phone was at. Same postcode, close by: verified. Anywhere else: flagged, and you get an alert.</p>
            </li>
          </ol>
        </div>
      </section>

      <GetTheApp />

      <section className="section">
        <div className="wrap">
          <h2>Pricing</h2>
          <p className="muted">Per property. Your people on the ground never pay.</p>

          <div className="free-line">
            <strong>Pilot: your first 5 check-ins are free.</strong>
            <span>Add up to 2 properties, do the anchor visit, and see real verdicts for a month before you pay anything.</span>
          </div>

          <div className="plans">
            <div className="plan">
              <h3>Check pack</h3>
              <div className="price">₦6,000</div>
              <p className="small muted plan-sub">3 check-ins, ₦2,000 each. No subscription.</p>
              <ul>
                <li>Use them whenever you want an update</li>
                <li>Photo log with verdicts</li>
                <li>Top up any time</li>
              </ul>
            </div>
            <div className="plan">
              <h3>Watch</h3>
              <div className="price">₦5,000<span className="small muted"> a month</span></div>
              <p className="small muted plan-sub">About ₦1,250 per check-in.</p>
              <ul>
                <li>Weekly check-ins</li>
                <li>One person on the ground</li>
                <li>Photo log with verdicts</li>
              </ul>
            </div>
            <div className="plan plan-main">
              <h3>Build</h3>
              <div className="price">₦15,000<span className="small muted"> a month</span></div>
              <p className="small muted plan-sub">Or ₦150,000 for 12 months, two months free.</p>
              <ul>
                <li>Stages tied to your payments</li>
                <li>Unlimited check-ins, up to three people</li>
                <li>Instant alerts on flagged photos</li>
              </ul>
            </div>
          </div>
          <p className="small muted" style={{ marginTop: "1.25rem" }}>
            Paying from abroad? UK and other international cards work. Prices are in naira and your bank converts at checkout.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2>What Groundproof can&apos;t do</h2>
          <ul className="limits">
            <li>It isn&apos;t a title search. NIPOST confirms a building and its recorded use, not who owns it.</li>
            <li>Postcodes cover buildings. A bare plot may not have one until something is built on it.</li>
            <li>A determined person can fake a phone&apos;s location. We block the common methods and flag anything that looks off; we don&apos;t claim it&apos;s impossible.</li>
            <li>NIPOST&apos;s postcode system launched on 1 October 2026 and some records are still being corrected.</li>
          </ul>
        </div>
      </section>

    </main>
  );
}
