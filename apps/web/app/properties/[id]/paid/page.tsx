import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { PRODUCTS, type Product } from "@/lib/types";

type Settle = { status: "successful" | "pending" | "failed" | "unknown"; product?: Product };

// Paystack redirects here with ?reference=...&trxref=...
export default async function Paid({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { reference?: string; trxref?: string };
}) {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");

  const reference = searchParams.reference ?? searchParams.trxref;
  let result: Settle = { status: "unknown" };

  if (reference) {
    const { data } = await supabase.functions.invoke("confirm-payment", { body: { reference } });
    result = data?.status ? (data as Settle) : { status: "pending" };
  }

  const copy = {
    successful: {
      title: "Payment received",
      body: result.product ? `${PRODUCTS[result.product].name} is now on this property.` : "Your plan is active.",
    },
    pending: {
      title: "Payment is processing",
      body: "Bank transfers and USSD can take a few minutes. Your plan switches on as soon as Paystack confirms it; you don't need to pay again.",
    },
    failed: {
      title: "Payment didn't go through",
      body: "Nothing was added. Try again, or use a different payment method.",
    },
    unknown: {
      title: "We couldn't find that payment",
      body: "If money left your account, it will show here once Paystack confirms it. Check back in a few minutes.",
    },
  }[result.status];

  return (
    <main className="wrap page" style={{ maxWidth: 560 }}>
      <h1>{copy.title}</h1>
      <p>{copy.body}</p>
      <Link className="btn" href={`/properties/${params.id}`}>Back to the property</Link>
    </main>
  );
}
