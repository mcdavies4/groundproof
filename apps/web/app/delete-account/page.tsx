import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY as C } from "@/lib/company";

export const metadata: Metadata = { title: "Delete your account — Groundproof" };

export default function DeleteAccountInfo() {
  return (
    <main className="wrap page legal">
      <h1>Delete your Groundproof account</h1>
      <p>You can delete your account yourself, from the app or this website. It takes effect immediately.</p>

      <h2>In the app</h2>
      <p>Open Groundproof, go to <strong>Your properties</strong>, scroll down and tap <strong>Delete my account</strong>.</p>

      <h2>On the website</h2>
      <p>
        <Link className="btn" href="/login?next=/account">Sign in to delete your account</Link>
      </p>

      <h2>What gets deleted</h2>
      <ul>
        <li>Your email address and sign-in.</li>
        <li>Properties you own, with all their photos, check-ins, stages and invite codes.</li>
        <li>Your access to properties other people invited you to.</li>
      </ul>
      <h2>What&apos;s kept</h2>
      <ul>
        <li>Check-ins you made on someone else&apos;s property stay in that owner&apos;s history, no longer linked to you.</li>
        <li>Paystack keeps payment records as financial law requires.</li>
      </ul>
      <p>Can&apos;t sign in? Email <a href={`mailto:${C.contactEmail}`}>{C.contactEmail}</a> from your account&apos;s address and we&apos;ll delete it within 30 days.</p>
    </main>
  );
}
