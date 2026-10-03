/** Flutterwave v3 Standard checkout + verification. Docs: https://developer.flutterwave.com */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const FLW = "https://api.flutterwave.com/v3";
const SECRET = () => Deno.env.get("FLW_SECRET_KEY")!;

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

async function flw<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${FLW}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${SECRET()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.status === "error") {
    throw new Error(`Flutterwave ${res.status}: ${body?.message ?? "request failed"}`);
  }
  return body as T;
}

export async function createCheckoutLink(args: {
  txRef: string; amount: number; email: string; name?: string;
  redirectUrl: string; description: string; meta: Record<string, string>;
}): Promise<string> {
  const body = await flw<{ data: { link: string } }>("/payments", {
    method: "POST",
    body: JSON.stringify({
      tx_ref: args.txRef,
      amount: args.amount,
      currency: "NGN",
      redirect_url: args.redirectUrl,
      customer: { email: args.email, name: args.name ?? args.email },
      customizations: { title: "Groundproof", description: args.description },
      meta: args.meta,
    }),
  });
  return body.data.link;
}

interface VerifiedTx {
  id: number; tx_ref: string; status: string; amount: number; currency: string;
}

export type SettleResult =
  | { status: "successful"; applied: boolean; product: Product; propertyId: string }
  | { status: "pending" | "failed" | "unknown"; propertyId?: string };

/**
 * Re-verify a transaction with Flutterwave and apply it once.
 * Never trust a redirect or webhook body on its own: this is the only path that grants anything.
 */
export async function settle(db: SupabaseClient, transactionId: number | string): Promise<SettleResult> {
  const { data: tx } = await flw<{ data: VerifiedTx }>(`/transactions/${transactionId}/verify`);

  const { data: pay } = await db.from("payments").select("*").eq("tx_ref", tx.tx_ref).maybeSingle();
  if (!pay) return { status: "unknown" };

  if (tx.status !== "successful") {
    if (tx.status === "failed" && pay.status === "pending") {
      await db.from("payments").update({ status: "failed", flw_transaction_id: tx.id }).eq("id", pay.id);
    }
    return { status: tx.status === "failed" ? "failed" : "pending", propertyId: pay.property_id };
  }

  if (tx.currency !== "NGN" || Number(tx.amount) < pay.amount_ngn) {
    await db.from("payments").update({ status: "failed", flw_transaction_id: tx.id }).eq("id", pay.id);
    return { status: "failed", propertyId: pay.property_id };
  }

  const { data: applied, error } = await db.rpc("apply_payment", { p_tx_ref: tx.tx_ref, p_flw_id: tx.id });
  if (error) throw new Error(error.message);
  return { status: "successful", applied: Boolean(applied), product: pay.product, propertyId: pay.property_id };
}
