import { naira } from "@/lib/rates";
import { startEstateCheckout } from "@/app/estates/actions";

const MIN_UNITS = 10;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** One plan for the whole estate: every unit's visits covered, priced per unit per month. */
export function EstatePlanPanel({ estateId, units, unitPrice, expiresAt, paidUnits, error }: {
  estateId: string; units: number; unitPrice: number; expiresAt: string | null; paidUnits: number | null; error?: boolean;
}) {
  const active = Boolean(expiresAt && new Date(expiresAt) > new Date());
  const billable = Math.max(units, MIN_UNITS);
  const month = billable * unitPrice;
  return (
    <div className="panel" id="plan">
      <h3>Estate plan</h3>
      {active
        ? <p className="small"><strong>Active until {day(expiresAt!)}.</strong> Unlimited verified visits on every unit{paidUnits ? ` (paid for ${paidUnits} units)` : ""}. Buyers watch free.</p>
        : <p className="small">Every unit gets 5 free check-ins to start. After that, one plan covers unlimited visits on every unit. Buyers always watch free.</p>}
      <p className="small muted">{naira(unitPrice)} per unit a month · {units} unit{units === 1 ? "" : "s"}{units < MIN_UNITS ? ` (billed as ${MIN_UNITS}, the minimum)` : ""}</p>
      {error && <p className="notice error">Checkout didn&apos;t start. Try again in a minute.</p>}
      <ul className="buy-list">
        <li><form action={startEstateCheckout.bind(null, estateId, "estate_30")}>
          <button className="buy" type="submit"><span><strong>{active ? "Add 30 days" : "30 days"}</strong><span className="small muted">{billable} units</span></span><span className="buy-price">{naira(month)}</span></button>
        </form></li>
        <li><form action={startEstateCheckout.bind(null, estateId, "estate_365")}>
          <button className="buy" type="submit"><span><strong>{active ? "Add 12 months" : "12 months"}</strong><span className="small muted">Two months free</span></span><span className="buy-price">{naira(month * 10)}</span></button>
        </form></li>
      </ul>
      <p className="small muted" style={{ margin: "0.75rem 0 0" }}>Card, bank transfer or USSD. Nothing renews automatically. Buyers&apos; own independent checks never use your plan.</p>
    </div>
  );
}
