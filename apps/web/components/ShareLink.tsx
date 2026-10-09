"use client";

import { useState } from "react";

/** Native share sheet on phones (WhatsApp, email…), copy-to-clipboard elsewhere. */
export function ShareLink({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share({ title, url }); return; } catch { /* cancelled: fall through to copy */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy this link", url);
    }
  }
  return (
    <div className="share-row">
      <input className="share-url" readOnly value={url} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="btn secondary" onClick={share}>{copied ? "Copied" : "Share"}</button>
    </div>
  );
}
