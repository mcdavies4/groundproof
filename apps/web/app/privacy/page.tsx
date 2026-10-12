import type { Metadata } from "next";
import { COMPANY as C } from "@/lib/company";

export const metadata: Metadata = { title: "Privacy policy — Groundproof" };

export default function Privacy() {
  return (
    <main className="wrap page legal">
      <h1>Privacy policy</h1>
      <p className="muted">Last updated {C.updated}</p>

      <p>
        {C.product} is run by {C.name}, a company registered in {C.registeredIn}. We are the data controller for the
        information described here.
      </p>
      <p>
        <strong>Contact:</strong> {C.name}, {C.address}. Email <a href={`mailto:${C.contactEmail}`}>{C.contactEmail}</a>.
      </p>

      <h2>What we collect</h2>
      <p>We collect only what the service needs to work:</p>
      <ul>
        <li><strong>Your email address</strong>, to sign you in with a one-time code or link, and to contact you about your account.</li>
        <li><strong>Property details you enter</strong>: a name for the property and its NIPOST postcode, plus the address details NIPOST returns for that postcode.</li>
        <li><strong>Check-in photos and videos</strong> taken inside the Groundproof app. The app can&apos;t upload photos or videos from your gallery.
          If there&apos;s no signal at the site, the visit is kept on the phone until it can upload.</li>
        <li><strong>Plot checks</strong>: the corner points (beacons) and measurements from a survey plan you enter, and the positions recorded when each beacon is walked.</li>
        <li><strong>Precise location</strong>, read only at the moment a check-in photo is taken in the app. We don&apos;t track location in the background or at any other time.</li>
        <li><strong>Compass direction and time</strong> recorded with each photo.</li>
        <li><strong>Device details</strong>: phone make, model and operating system, and whether the app is running on a real phone or an emulator. We use this to detect faked check-ins.</li>
        <li><strong>Payment records</strong>: what you bought, the amount and the Paystack transaction reference. Card and bank details are handled by Paystack; we never see or store them.</li>
        <li><strong>Waitlist emails</strong> if you join the waitlist on our website.</li>
        <li><strong>Contact details and area</strong> you give us in the &ldquo;find someone on the ground&rdquo;, &ldquo;become a reporter&rdquo; or &ldquo;independent check&rdquo; forms. We use them only to match owners and buyers with local reporters and to reply to you.</li>
        <li><strong>Reporter profiles</strong>: if you are a reporter, the name, area, prices and visit record you choose to show. See &ldquo;Who can see it&rdquo;.</li>
        <li><strong>Developer details</strong>: company name, website and phone, if you apply for a developer account.</li>
        <li><strong>People you invite</strong>: email addresses of family members, buyers or reporters you invite to a property.</li>
        <li><strong>Invite links</strong>: if you join through a friend&apos;s invite link, we record who invited you, so we can give you both free check-ins.</li>
        <li><strong>Feedback</strong> you choose to give us, such as a score or comments. We only quote you publicly if you tick the box to agree, and only under the name you give.</li>
        <li><strong>How you found us</strong>: when you first visit our website, we store small cookies with the site that sent you (for example LinkedIn or Instagram), the first page you landed on, and any friend&apos;s invite code. These last 30 days and are saved with your account if you sign up. We use them only to see which channels work; they are not used for advertising.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To check whether each check-in was made at the registered building, using the location, compass direction, device details and photos.</li>
        <li>To show property owners their check-ins, photos and verdicts.</li>
        <li>To take payments and apply what you bought.</li>
        <li>To send sign-in emails and service messages, such as a flagged check-in alert, a monthly progress summary, or a tip when a setup step is waiting. You can turn off tips and summaries on your account page.</li>
        <li>To introduce owners and buyers to local reporters, and to show reporters&apos; records and prices.</li>
        <li>To run invite rewards and improve the service from feedback.</li>
      </ul>
      <p>We don&apos;t sell your data, use it for advertising, or share it with data brokers.</p>

      <h2>Who can see it</h2>
      <p>
        Photos, videos, locations and verdicts for a property are visible only to that property&apos;s owner and the people
        invited to it (reporters, family members, and on an estate, the buyer of that unit). On an estate, the developer
        can see every visit to its units, including visits by a buyer&apos;s independent reporter.
      </p>
      <p>Some things are public only if someone chooses to share them:</p>
      <ul>
        <li><strong>Share links</strong>: an owner can create a link that shows a property&apos;s progress to anyone who has it, and turn it off at any time.</li>
        <li><strong>Public estate pages</strong>: a developer can publish a page showing each unit&apos;s progress and latest verified photo. It never shows names, email addresses or exact locations.</li>
        <li><strong>Reporter profiles</strong>: a reporter can make their profile public, showing their name, area, prices and visit record. It never shows their email, phone number or the properties they visit.</li>
      </ul>
      <p>We share data with these service providers, only as needed to run Groundproof:</p>
      <ul>
        <li><strong>Supabase</strong>: database, sign-in and photo storage.</li>
        <li><strong>Vercel</strong>: website hosting.</li>
        <li><strong>NIPOST</strong>: postcodes and photo locations are checked against the national postcode registry.</li>
        <li><strong>Anthropic</strong>: check-in photos are sent to Anthropic&apos;s Claude AI to compare them with the property&apos;s earlier photos and describe visible progress.</li>
        <li><strong>Paystack</strong>: payment processing.</li>
        <li><strong>Resend</strong>: sending emails.</li>
        <li><strong>Expo</strong>: building and delivering the mobile app, and its visit reminders.</li>
      </ul>
      <p>Some of these providers process data outside Nigeria and the UK, under their own data protection safeguards.</p>

      <h2>How long we keep it</h2>
      <p>
        We keep your data while your account is open. When you delete your account, we delete your email, your
        properties, and their photos, videos and check-ins straight away. Check-ins you made on someone else&apos;s property stay
        in their history, no longer linked to you. Paystack keeps payment records as financial law requires.
      </p>

      <h2>Your rights</h2>
      <p>
        Under the Nigeria Data Protection Act 2023 and, where it applies, UK GDPR, you can ask to see, correct, export
        or delete your data, and object to how we use it. Email <a href={`mailto:${C.contactEmail}`}>{C.contactEmail}</a>.
        You can delete your account yourself at any time; see <a href="/delete-account">Delete your account</a>.
        You can also complain to the Nigeria Data Protection Commission or, in the UK, the Information Commissioner&apos;s Office.
      </p>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit. Photos are stored privately and shown only through short-lived links to
        people with access to the property.
      </p>

      <h2>Children</h2>
      <p>Groundproof is not meant for anyone under 18.</p>

      <h2>Changes</h2>
      <p>If we change this policy, we&apos;ll update the date above and tell account holders about significant changes by email.</p>
    </main>
  );
}
