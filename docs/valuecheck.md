# ValueCheck

Evidence-led, indicative valuations for land and homes in Nigeria. Lagos first. Lives at `/tools/value-check`.
It is not a formal valuation and never claims to be.

## What is built (milestone 1)

| Area | Files |
|---|---|
| Engine (pure, tested) | `apps/web/lib/valuecheck/engine.ts`, `types.ts`, `coverage.ts`, `labels.ts` |
| Server-side validation | `apps/web/lib/valuecheck/validate.ts` |
| Tests (44) | `engine.test.ts`, `validate.test.ts` (run `npm test` in `apps/web`) |
| Form + server action | `apps/web/app/tools/value-check/{page,ValueCheckForm,actions}.ts(x)` |
| Report | `apps/web/app/tools/value-check/report/[id]/page.tsx`, `components/ValueReport.tsx` |
| Plot Check hand-off | link added in `tools/plot-check/PlotCheck.tsx` (passes area and centre point) |
| Database | `supabase/migrations/20261103000000_valuecheck.sql` (new tables only; nothing existing is altered) |

## How the estimate works

1. **Filter** reviewed observations to genuine comparables: same category, state and property type; same neighbourhood or
   LGA; seen within 24 months; size within a factor of 2. Everything else is listed with the reason it was left out.
   Nearby is never enough on its own.
2. **Metric.** Land: price per m² of land. House/flat: price per m² of floor area (this already includes the land under
   it), or total price for the same bedroom count when no floor area is given. A land rate is never applied to a building,
   and land valuations ignore completed houses.
3. **Weights** from price basis (completed sale 1.0, reported sale 0.7, asking 0.4), verification (1.0 / 0.85 / 0.6),
   location (neighbourhood 1.0, LGA 0.5), recency and size similarity. These are policy parameters, not market data.
4. **Output.** Fewer than 3 comparables: no figure. 3-4: lowest-to-highest range, low confidence, no central figure.
   5+: weighted 25th-75th percentile range; a central figure only when confidence is medium or high.
5. **Confidence (0-100)**: count 25, recency 15, evidence type and checking 25, location 15, similarity 10, completeness 10,
   minus up to 15 for widely spread prices. Caps: under 5 comparables stays low; under 8 cannot be high; asking prices only
   cannot be high. Every factor is shown to the user with its reason.

There are no built-in market rates and no asking-to-sale discounts. Condition changes a comparable's weight, never its price.

## Plot Check hand-off

Plot Check links to ValueCheck with the calculated area and centre point. If the user keeps that area, the report labels it
"Calculated" and states that it does not show ownership, title validity or boundaries. The URL values are untrusted and are
re-validated on the server; a successful conversion is never treated as verification.

## Database and security

- `market_observations`: RLS on, **no policies**. Only the service role can read or write. Private `source_ref`
  (listing URL, licence or consent note) never leaves the database.
- `valuecheck_candidates(category, state, lga)`: security-definer function for signed-in users. Returns approved,
  recent rows only, without `source_ref`, review notes or contributor ids.
- `market_observation_events`: audit trail written by trigger on every create, review change, verification change or
  edit of a price/area/date.
- `valuation_requests`, `valuation_results`: users read their own rows only. Results are insert-only (no update policy)
  and must belong to the user's own request. 30 valuations per user per day. Both cascade-delete with the account.
- Verified in a scratch Postgres: users can't read observations directly, can't edit saved results, can't attach a result
  to someone else's request; anon can't call the function; the daily limit fires.

**Known limitation.** The engine runs in the Next.js server action, and the web app has no service-role key (by design).
So a determined signed-in user could insert a hand-made result row for their own account through the API. Fine while
reports are private to the owner. **Before adding sharing or PDF export, move the save step into an edge function** (service
role, like `add-property`) and remove the user insert policy on `valuation_results`.

## Adding market evidence (until the admin screen exists)

Service role or the Supabase SQL editor. Rows start as `pending` and are ignored until `approved`.

```sql
insert into market_observations
  (category, state, lga, neighbourhood, property_type, price_ngn, price_basis, land_area_sqm, observed_on,
   source_type, source_label, source_ref, verification, review_status)
values
  ('land', 'Lagos', 'Eti-Osa', 'Lekki Phase 1', 'residential_plot', /* naira */ 0, 'asking', 648, '2026-10-01',
   'agent', 'Agent submission', 'private note: who, how obtained, permission', 'source_checked', 'approved');
```

`property_type` is `residential_plot | commercial_plot | mixed_use_plot | agricultural` for land, or
`detached | semi_detached | terraced | bungalow | duplex | flat` for homes. `price_basis` is `asking`, `reported_sale` or
`completed_sale`; never label an asking price as a sale.

## Day-one behaviour

With no approved observations every request returns "Not enough evidence for a value yet" with next steps. That is the
intended limited-coverage mode, not a bug. Estimates appear only in neighbourhoods where reviewed evidence exists.

## Deploy (safe order)

1. Merge on a branch; Vercel preview builds `apps/web` as before.
2. `supabase db push` applies one additive migration (new tables and one function). No existing table changes. Rollback:
   drop the four `valuation_*`/`market_observation*` tables and `valuecheck_candidates`, `log_observation_change`,
   `limit_valuation_requests`.
3. Merge to production. No new environment variables.

## Needs a human, data or professional input

- **Market data.** The main dependency. Decide sources: agents and developers who contribute (with written consent),
  registered valuers, user-submitted observations, permitted listing feeds, public land records. Scraping portals may breach
  their terms; get licences first. Record consent in `source_ref`.
- **Professional validation.** Have an ESVARBON-registered estate surveyor and valuer review the method, the weights and
  the wording, and back-test against verified sales before the confidence score is described as anything but a guide.
- **Legal/privacy.** Review the Privacy and Terms pages for valuation data and the NDPA (Nigeria Data Protection Act) basis
  for processing contributed observations.
- **Policy decisions.** The weights, the 24-month window and the 2x size band in `PARAMS`; whether to allow asking-only
  estimates at all; whether Abuja/FCT is next.
- **Next milestones.** Admin review screen and CSV import (edge function, `ADMIN_EMAILS`); contributor submission form;
  edge-function save step; sharing and PDF; document and photo upload; FCT coverage.
