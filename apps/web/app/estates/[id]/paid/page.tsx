import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";

type Settle = { status: "successful" | "pending" | "failed" | "unknown" };

// Paystack sends the developer back here after paying for an estate plan.
export default async function EstatePaid({ params, searchParams }: { params: { id: string }; searchParams: { reference?: string; trxref?: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");
  const reference = searchParams.reference ?? searchParams.trxref;
  let result: Settle = { status: "unknown" };
  if (reference) {
    const { data } = await supabase.functions.invoke("confirm-payment", { body: { reference } });
    result = data?.status ? (data as Settle) : { status: "pending" };
  }
  const copy = {
    successful: ["Estate plan active", "Every unit's visits are now covered. Your site reporter can check in as often as you need."],
    pending: ["Payment is processing", "Bank transfers and USSD can take a few minutes. The plan switches on as soon as Paystack confirms it; you don't need to pay again."],
    failed: ["Payment didn't go through", "Nothing was charged for the plan. Try again, or use a different payment method."],
    unknown: ["We couldn't find that payment", "If money left your account, it will show here once Paystack confirms it. Check back in a few minutes."],
  }[result.status];
  return (
    <main className="wrap page" style={{ maxWidth: 560 }}>
      <h1>{copy[0]}</h1>
      <p>{copy[1]}</p>
      <Link className="btn" href={`/estates/${params.id}`}>Back to the estate</Link>
    </main>
  );
}
