/** Paystack hosted checkout + verification. Docs: https://paystack.com/docs/api */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const API = "https://api.paystack.co";
const SECRET = () => Deno.env.get("PAYSTACK_SECRET_KEY")!;

export const PRODUCTS = {
  pack3: { amount: 6000, title: "3 check-ins" },
  watch_30: { amount: 5000, title: "Watch plan, 30 days" },
  build_30: { amount: 15000, title: "Build plan, 30 days" },
  build_365: { amount: 150000, title: "Build plan, 12 months" },
} as const;
export type Product = keyof typeof PRODUCTS;

export function isProduct(x: unknown): x is Product {
  return typeof x === "string" && x in PRODUCTS;
}

async function paystack<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${SECRET()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.status === false) {
    throw new Error(`Paystack ${res.status}: ${body?.message ?? "request failed"}`);
  }
  return body as T;
}

/** Returns the hosted checkout URL. Amount is in naira; Paystack expects kobo. */
export async function createCheckoutLink(args: {
  reference: string; amountNgn: number; email: string; callbackUrl: string;
  metadata: Record<string, string>;
}): Promise<string> {
  const body = await paystack<{ data: { authorization_url: string } }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      reference: args.reference,
      amount: args.amountNgn * 100,
      currency: "NGN",
      email: args.email,
      callback_url: args.callbackUrl,
      channels: ["card", "bank", "ussd", "bank_transfer"],
      metadata: args.metadata,
    }),
  });
  return body.data.authorization_url;
}

/** Paystack signs webhooks with HMAC-SHA512 of the raw body using your secret key. */
export async function isValidSignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(SECRET()), { name: "HMAC", hash: "SHA-512" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

interface VerifiedTx { id: number; reference: string; status: string; amount: number; currency: string }

export type SettleResult =
  | { status: "successful"; applied: boolean; product: Product; propertyId: string }
  | { status: "pending" | "failed" | "unknown"; propertyId?: string };

/**
 * Re-verify a transaction with Paystack and apply it once.
 * Never trust a redirect or webhook body on its own: this is the only path that grants anything.
 */
export async function settle(db: SupabaseClient, reference: string): Promise<SettleResult> {
  const { data: pay } = await db.from("payments").select("*").eq("tx_ref", reference).maybeSingle();
  if (!pay) return { status: "unknown" };

  const { data: tx } = await paystack<{ data: VerifiedTx }>(`/transaction/verify/${encodeURIComponent(reference)}`);

  if (tx.status !== "success") {
    if (["failed", "abandoned", "reversed"].includes(tx.status) && pay.status === "pending" && tx.status !== "abandoned") {
      await db.from("payments").update({ status: "failed", provider_txn_id: tx.id }).eq("id", pay.id);
    }
    return { status: tx.status === "failed" || tx.status === "reversed" ? "failed" : "pending", propertyId: pay.property_id };
  }

  if (tx.currency !== "NGN" || tx.amount < pay.amount_ngn * 100) {
    await db.from("payments").update({ status: "failed", provider_txn_id: tx.id }).eq("id", pay.id);
    return { status: "failed", propertyId: pay.property_id };
  }

  const { data: applied, error } = await db.rpc("apply_payment", { p_tx_ref: reference, p_provider_id: tx.id });
  if (error) throw new Error(error.message);
  return { status: "successful", applied: Boolean(applied), product: pay.product, propertyId: pay.property_id };
}
