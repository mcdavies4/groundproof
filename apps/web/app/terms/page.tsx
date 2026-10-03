import type { Metadata } from "next";
import { COMPANY as C } from "@/lib/company";

export const metadata: Metadata = { title: "Terms of service — Groundproof" };

export default function Terms() {
  return (
    <main className="wrap page legal">
      <h1>Terms of service</h1>
      <p className="muted">Last updated {C.updated}</p>

      <p>
        These terms are an agreement between you and {C.name} ({C.registeredIn}) for using {C.product}. By creating an
        account or using the app, you accept them.
      </p>

      <h2>What Groundproof does</h2>
      <p>
        Groundproof records check-ins at a property and checks whether each one was made at the building registered
        to the property&apos;s NIPOST postcode. It gives each check-in a verdict: verified, needs a look, or flagged.
      </p>

      <h2>What it doesn&apos;t do</h2>
      <ul>
        <li>It is not a title search or proof of ownership.</li>
        <li>It is not a building, structural or quality inspection.</li>
        <li>Verdicts rely on phone location, NIPOST data and AI photo comparison, all of which can be wrong. A determined person can fake a phone&apos;s location. Treat a verdict as strong evidence, not a guarantee.</li>
        <li>Don&apos;t make payment or legal decisions on a verdict alone.</li>
      </ul>

      <h2>Your account</h2>
      <ul>
        <li>You must be 18 or over.</li>
        <li>Only add properties you own or have the owner&apos;s permission to monitor.</li>
        <li>Only invite people who have agreed to take check-in photos, and tell them their location and photos are recorded.</li>
        <li>Don&apos;t try to fake locations, tamper with the app, or use Groundproof to harass or track anyone.</li>
      </ul>

      <h2>Payments</h2>
      <ul>
        <li>Prices are in naira and shown before you pay. Payments are processed by Paystack.</li>
        <li>Plans are prepaid for a fixed period and never renew automatically.</li>
        <li>Check-in packs don&apos;t expire.</li>
        <li>Refunds: unused check-in packs and plans with no check-ins used can be refunded within 14 days of purchase. Email us with your payment reference.</li>
        <li>A check-in is used when it&apos;s submitted, whatever the verdict.</li>
      </ul>

      <h2>Our liability</h2>
      <p>
        We provide Groundproof as it is. To the extent the law allows, we are not liable for losses from decisions
        based on verdicts, from errors in NIPOST data, or from someone deliberately deceiving the service. Our total
        liability to you is limited to what you paid us in the 12 months before the claim. Nothing in these terms
        limits rights you have under consumer protection law.
      </p>

      <h2>Ending the service</h2>
      <p>
        You can delete your account at any time. We may suspend accounts that break these terms. If we close
        Groundproof, we&apos;ll give 30 days&apos; notice and refund unused prepaid time.
      </p>

      <h2>Law</h2>
      <p>These terms are governed by the laws of the Federal Republic of Nigeria.</p>

      <p>Contact: <a href={`mailto:${C.contactEmail}`}>{C.contactEmail}</a></p>
    </main>
  );
}
