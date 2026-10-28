# Groundproof

Proof-of-site for diaspora property owners. Every check-in photo from a property in Nigeria is
verified against the building's NIPOST postcode. Built by The 36th Solutions Ltd.

```
apps/web       Next.js 14 owner app (landing + waitlist, properties, stages, invite codes, photo log)
apps/mobile    Expo reporter app (email code sign-in, join by invite, in-app camera check-ins)
supabase/      Postgres schema + RLS + storage, edge functions add-property and verify-checkin
```

## How verification works

1. Owner adds a property by postcode. `add-property` checks it exists (Lookup L1), then pulls the
   best detail the key allows (L3, falling back to L2, then L1) and stores a snapshot.
2. Owner creates an invite code. The reporter joins in the app (`accept_invite` RPC).
3. First visit is the **anchor**: 4 photos taken in-app with GPS. `verify-checkin` reverse-geocodes
   the fix with NIPOST. Same postcode within 25m, accuracy ≤ 20m, confidence not low, clock drift
   ≤ 10 min → **verified**, and the property is anchored.
4. Every later check-in goes through the same check. Wrong building, nothing within 60m, or a mock
   location → **flagged**. Right building with weak signal → **review**. A verified check-in tied
   to a stage marks that stage done.

Reporters can only insert raw check-ins; verdicts are written by the edge function with the
service role (enforced by RLS). Photos sit in a private bucket and are served by signed URLs.

## Run it locally (mock NIPOST, no key needed)

Prereqs: Node 20+, Docker, Supabase CLI, Expo Go or a dev build on your phone.

```bash
# 1. Supabase
supabase init                 # creates supabase/config.toml; keep the existing folders
supabase start                # note the API URL and anon key it prints
supabase db reset             # applies supabase/migrations

# 2. NIPOST mock (separate terminal)
npx -p ng-postcode ng-postcode-mock      # http://127.0.0.1:8081

# 3. Edge functions (separate terminal)
cp supabase/functions/.env.example supabase/functions/.env
# for the local mock, set NIPOST_BASE_URL=http://host.docker.internal:8081
supabase functions serve --env-file supabase/functions/.env

# 4. Owner web app
cd apps/web && cp .env.example .env.local   # paste the anon key
npm install && npm run dev                  # http://localhost:3000

# 5. Reporter app
cd apps/mobile && cp .env.example .env      # use your laptop's LAN IP, not 127.0.0.1
npm install && npx expo install --fix && npx expo start
```

Windows: run the commands in PowerShell or WSL; `cp` works in PowerShell. Find your LAN IP with
`ipconfig` (IPv4 Address).

**Email codes for the mobile app.** The app signs in with a 6-digit code. In Supabase
(Authentication → Email Templates → Magic Link) include `{{ .Token }}` in the template alongside the
link, so one email works for both web (link) and mobile (code). Locally, read emails at the Inbucket
URL `supabase start` prints.

**Testing verdicts against the mock.** The mock returns random postcodes for reverse lookups, so
`MOCK_ECHO_POSTCODE=true` makes `verify-checkin` treat a mock answer as the property's building
(verified path). Set it to `false` to see the flagged path. It is ignored for real NIPOST responses.
Test postcodes that exist in the mock and in NIPOST's docs: `LA-11-W06-TC-10`, `EN-05-V19-CD-22`,
`FC-03-B06-AG-12`. Reserved mock keys like `mock_no_credits` exercise the L3→L2→L1 fallback.

## ValueCheck

Evidence-led indicative valuations for land and homes (Lagos first) at `/tools/value-check`. See `docs/valuecheck.md`.
Tests: `cd apps/web && npm test`.

## Play Store

See `docs/play-store/LISTING.md` for the store text, Data safety answers and release steps.
Icons are in `apps/mobile/assets`; Play graphics in `docs/play-store`.

## Deploy

- Supabase: `supabase link`, `supabase db push`, `supabase functions deploy add-property verify-checkin`,
  `supabase secrets set --env-file supabase/functions/.env`.
- Web: Vercel, root directory `apps/web`, set the three env vars. Add your domain to Supabase Auth
  redirect URLs (`https://yourdomain/auth/callback`).
- Mobile: `eas build` once you're ready for testers.

## Switching to the live NIPOST API

1. In `supabase/functions/.env`: delete `NIPOST_BASE_URL` and `MOCK_ECHO_POSTCODE`, set `NIPOST_API_KEY`.
2. `supabase secrets set --env-file supabase/functions/.env`. No code changes.
3. Re-check `add-property` on one real postcode, then do one real anchor visit before inviting pilots.

## NIPOST access checklist (The 36th Solutions Ltd)

Developer docs: https://docs.postcode.gov.ng. Access flow: organisation account → KYB → request
access level → staging token → UAT with NIPOST → production key. NIPOST hasn't published its exact
KYB document list; have these ready:

- [ ] CAC certificate of incorporation
- [ ] CAC status report (or Form CAC 1.1) showing directors and shareholders
- [ ] Memorandum and articles of association
- [ ] Tax Identification Number (TIN)
- [ ] Director ID (passport or NIN) and proof of address
- [ ] Proof of business address in Nigeria
- [ ] One-paragraph use case: address verification for property owners, reverse geocode on photo
      check-ins, estimated monthly volume
- [ ] Request Lookup **L3** and reverse geocode (admin names need L2+)
- [ ] Ask for the credit price per L2/L3 lookup and per reverse geocode

## Plot check (beta)

`/tools/plot-check` converts beacon coordinates from a Nigerian survey plan (Minna datum: West/Mid/East
belts or UTM 31–33N; or WGS 84 UTM) to latitude/longitude, and shows the plot's area, side lengths and
bearings. Conversion is in `apps/web/lib/survey.ts` (proj4). It uses EPSG "Minna to WGS 84 (3)" (~5 m)
inside its south-central area and "(2)" (~15 m) elsewhere, and matches PROJ/EPSG output to the millimetre
in tests at 10 locations. Belt choice can't be detected reliably (neighbouring belts land a few km apart),
so users pick the system on the plan or compare candidates.

## Integrity checks

`verify-checkin` runs four checks in order:

1. **Device:** check-ins from emulators (`expo-device`) or with a mock location are flagged.
   Set the secret `ALLOW_EMULATOR=true` only while testing on an emulator.
2. **Location:** NIPOST reverse geocode must return the anchored postcode within 25m, GPS ±20m,
   non-low confidence, clock drift ≤ 10 min. Wrong building → flagged.
3. **Compass:** each photo stores the phone's heading. The anchor's first (front) photo sets the
   reference; a check-in with no photo within 45° of it drops from verified to review.
4. **Photos:** Claude (`ANTHROPIC_API_KEY`, default model `claude-haiku-4-5-20251001`) compares the
   check-in photos with the anchor and previous verified photos, and writes a one-line progress note.
   A mismatch drops verified to review. If the key is missing or the call fails, the verdict stands
   on location alone.

**No postcode yet?** Owners can add a property without one. At the anchor visit the reporter taps
"Find this building" (`find-postcode` → NIPOST reverse geocode). If NIPOST lists a building within 25m,
the reporter confirms it and the property becomes postcode-anchored. If not (common for new builds), it is
anchored to the exact GPS spot (`anchor_mode = 'coordinates'`): later check-ins verify by distance from that
spot (≤25m verified, 25–60m review, >60m flagged) and show as "Location match". If NIPOST later lists a
building there, `nipost_suggested_postcode` is set and the owner is told.

Location decides verified vs flagged; compass and photos can only downgrade to review.

## Billing (Paystack, prepaid, no auto-renew)

Every property starts with 1 free check-in after the free anchor visit. Owners top up from the
property page: 3 check-ins (₦6,000), Watch 30 days (₦5,000, up to 5 check-ins), Build 30 days
(₦15,000, unlimited) or Build 12 months (₦150,000). Buying the same plan while it's active extends it.

- `create-payment` records a pending payment and returns a Paystack hosted checkout link
  (card, bank, USSD, bank transfer).
- Paystack redirects to `/properties/<id>/paid?reference=…`, which calls `confirm-payment`.
  `paystack-webhook` does the same from Paystack's side, so bank transfers that confirm late still land.
- Both re-verify with `GET /transaction/verify/:reference` (status, NGN, amount in kobo) and call
  `apply_payment`, which applies each payment once.
- A `before insert` trigger on `checkins` enforces the allowance and spends credits; the app calls
  `checkin_block_reason` first so reporters aren't sent to the camera with nothing left.

Setup:

1. Paystack dashboard → Settings → API Keys & Webhooks (test mode): copy the **Test Secret Key**
   (`sk_test_…`).
2. On the same page, set **Test Webhook URL** to
   `https://<project-ref>.supabase.co/functions/v1/paystack-webhook`. No secret hash needed:
   Paystack signs webhooks with your secret key.
3. Secrets and deploy:
   ```bash
   npx supabase secrets set PAYSTACK_SECRET_KEY=sk_test_xxx SITE_URL=https://yourdomain.com
   npx supabase db push
   npx supabase functions deploy create-payment confirm-payment
   npx supabase functions deploy paystack-webhook --no-verify-jwt
   ```
4. Test with Paystack's test card, then activate the business (The 36th Solutions Ltd), swap in the
   live secret key and set the live webhook URL.

## Not built yet

PDF report export, renewal reminder emails, owner alerts on flagged/review (hook is marked in
`verify-checkin`), database webhook backstop to retry `pending` check-ins, reporter push
reminders, the NIPOST postcode widget in onboarding.

`ng-postcode` is an unofficial MIT package by Peter Oliha; its mock data is labelled `MOCK` and
isn't real address data.
