import Link from "next/link";

type Step = { done: boolean; title: string; action?: { label: string; href: string }; alt?: { label: string; href: string } };

/** The next steps for an owner's newest property, until its first real check-in. */
export function GettingStarted({ property, hasReporter, anchored, hasCheckin }: {
  property: { id: string; label: string }; hasReporter: boolean; anchored: boolean; hasCheckin: boolean;
}) {
  const steps: Step[] = [
    { done: true, title: "Add your property" },
    {
      done: hasReporter, title: "Get someone on the ground",
      action: { label: "Create an invite code", href: `/properties/${property.id}#ground` },
      alt: { label: "No one to send? We'll find someone", href: "/find-someone" },
    },
    { done: anchored, title: "First visit: they lock the property to its building", action: hasReporter ? { label: "Ask for the visit", href: `/properties/${property.id}#ground` } : undefined },
    { done: hasCheckin, title: "Your first verified check-in", action: anchored ? { label: "Request a check-in", href: `/properties/${property.id}#ground` } : undefined },
  ];
  const next = steps.findIndex((x) => !x.done);
  if (next === -1) return null;
  return (
    <section className="panel getting-started" aria-labelledby="gs-h">
      <h2 id="gs-h">Getting started: {property.label}</h2>
      <ol className="steps-check">
        {steps.map((x, i) => (
          <li key={i} className={x.done ? "done" : ""}>
            {x.title}
            {i === next && (x.action || x.alt) && (
              <div className="row-links" style={{ marginTop: "0.5rem" }}>
                {x.action && <Link className="btn small-btn" href={x.action.href}>{x.action.label}</Link>}
                {x.alt && <Link className="btn secondary small-btn" href={x.alt.href}>{x.alt.label}</Link>}
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
