import { PRODUCTS, type Product, type Property } from "@/lib/types";
import { startCheckout } from "@/app/properties/[id]/actions";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function PlanPanel({ property, error }: { property: Property; error?: boolean }) {
  const active = property.plan !== "none" && property.plan_expires_at && new Date(property.plan_expires_at) > new Date();
  const order: Product[] = ["pack3", "watch_30", "build_30", "build_365"];

  return (
    <div className="panel">
      <h3>Check-ins and plan</h3>
      <dl className="facts" style={{ marginBottom: "1rem" }}>
        <dt>Plan</dt>
        <dd>
          {active
            ? `${property.plan === "build" ? "Build" : "Watch"} until ${day(property.plan_expires_at!)}`
            : "None"}
        </dd>
        <dt>Spare check-ins</dt>
        <dd>{property.check_credits}</dd>
      </dl>
      {!active && property.check_credits === 0 && (
        <p className="small" style={{ color: "var(--flagged)" }}>
          Your person on the ground can&apos;t check in until you top up.
        </p>
      )}
      {error && <p className="notice error">Checkout didn&apos;t start. Try again in a minute.</p>}

      <ul className="buy-list">
        {order.map((p) => (
          <li key={p}>
            <form action={startCheckout.bind(null, property.id, p)}>
              <button className="buy" type="submit">
                <span>
                  <strong>{PRODUCTS[p].name}</strong>
                  <span className="small muted">{PRODUCTS[p].note}</span>
                </span>
                <span className="buy-price">{PRODUCTS[p].price}</span>
              </button>
            </form>
          </li>
        ))}
      </ul>
      <p className="small muted" style={{ margin: "0.75rem 0 0" }}>
        Pay by card, bank transfer or USSD. Nothing renews automatically.
      </p>
    </div>
  );
}
