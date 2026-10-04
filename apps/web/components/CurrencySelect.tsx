"use client";

import { useRef } from "react";
import { CURRENCIES, type Currency } from "@/lib/types";

/** Saves the property's stage currency as soon as the owner picks one. */
export function CurrencySelect({ action, value }: { action: (form: FormData) => void; value: Currency }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form action={action} ref={form} className="field">
      <label htmlFor="currency">Currency for these payments</label>
      <select id="currency" name="currency" defaultValue={value} onChange={() => form.current?.requestSubmit()}>
        {(Object.keys(CURRENCIES) as Currency[]).map((c) => (
          <option key={c} value={c}>{CURRENCIES[c]}</option>
        ))}
      </select>
      <noscript><button className="btn secondary" type="submit">Save</button></noscript>
    </form>
  );
}
