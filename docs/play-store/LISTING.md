# Google Play: what to paste where

Site: https://groundproof.site

---

## Main store listing  (Grow → Store presence → Main store listing)

**App name** (30 max)
```
Groundproof
```

**Short description** (80 max)
```
Check in at a property with photos verified against its NIPOST postcode.
```

**Full description** (4000 max)
```
Groundproof is the check-in app for people looking after a property on someone else's behalf in Nigeria: relatives, contractors, site managers and agents.

The property owner, often abroad, invites you with a code. When you visit, you take photos in the app. Groundproof checks they were taken at the right building, using its NIPOST digital postcode, and sends the owner a verified update.

HOW IT WORKS
• The owner adds the property by its NIPOST postcode and sends you an invite code.
• Your first visit is the anchor visit: four photos of the building from outside.
• After that, each check-in takes a few photos. The app records where and which way the camera was pointing.
• Groundproof checks the location against the national postcode registry and compares the photos with the anchor visit.
• The owner sees each check-in with a clear verdict: verified, needs a look, or flagged.

WHY IT HELPS YOU
Your updates carry proof. No more "send another picture" or "are you sure that's my house?" Every verified check-in shows the owner you were there and the work is moving.

BUILT FOR LOW DATA
Photos are resized before upload, so check-ins use little mobile data.

PRIVATE BY DESIGN
• Location is read only when you take a check-in photo, never in the background.
• Photos come only from the in-app camera.
• Only the owner and the people they invite can see a property's check-ins.
• You can delete your account in the app at any time.

Groundproof is run by The 36th Solutions Ltd. It is not affiliated with NIPOST. Verdicts are strong evidence, not a guarantee, and are not a title search or building inspection.
```

**App icon**: `icon-512.png` (in this folder)
**Feature graphic**: `feature-graphic-1024x500.png` (in this folder)
**Phone screenshots** (2–8, from the emulator): suggested set
1. Sign-in screen
2. Your properties list with the yellow postcode plate
3. Check-in screen with camera and "Photo 1: the front of the building"
4. A "Verified at the building" result with the progress note
5. (Optional) The website timeline showing a verified check-in

Take them on the emulator with the camera icon in its side toolbar.

**Category**: House & Home
**Tags**: Real estate, Productivity
**Contact email**: your support email
**Website**: https://groundproof.site
**Privacy policy**: https://groundproof.site/privacy

---

## App content  (Policy → App content)

**Privacy policy URL**
`https://groundproof.site/privacy`

**App access** → *All or some functionality is restricted*. Add instructions:
```
Groundproof works for people invited to a property.
1. Open the app and sign in with any email address you can read. A 6-digit code is emailed to you.
2. On "Your properties", enter invite code: XXXXXXXX
3. Tap the property to see the check-in screen.
Check-ins verify only when taken at the property in Nigeria; elsewhere they are flagged by design.
```
Before submitting, create a fresh invite code on a test property (codes are single-use and last 14 days) and put it in place of XXXXXXXX.

**Ads**: No, the app does not contain ads.

**Content rating questionnaire**
- Category: Utility, Productivity, Communication, or Other
- Violence, sexual content, language, drugs, gambling: No to all
- Users can interact or exchange content: **No** (photos go only to the property owner, not other users publicly)
- Shares user's location with other users: **Yes** (the property owner sees where check-in photos were taken)
- Digital purchases: **No** in the app (payments happen on the website)

**Target audience**: 18 and over only. Not designed for children.

**News app**: No
**Government app**: No (not affiliated with NIPOST)
**Financial features**: None
**Health**: None

**Account deletion**
- In-app: Yes, Your properties → Delete my account
- Web link: `https://groundproof.site/delete-account`

---

## Data safety form

**Does your app collect or share any of the required user data types?** Yes
**Is all data encrypted in transit?** Yes
**Do you provide a way for users to request deletion?** Yes (in-app and web link above)

Declare these. For each one, answer: **Collected: Yes. Shared: No.** (Service providers acting for you don't count as sharing.) **Processed ephemerally: No. Required: Yes**, except where noted.

| Data type | Purposes |
| --- | --- |
| Location → Precise location | App functionality, Fraud prevention, security and compliance |
| Personal info → Email address | App functionality, Account management |
| Personal info → User IDs | App functionality, Account management |
| Photos and videos → Photos | App functionality, Fraud prevention, security and compliance |
| App activity → Other user-generated content (check-in notes; optional) | App functionality |
| Device or other IDs → Device or other IDs | Fraud prevention, security and compliance |

Do **not** declare: financial info (payments are on the website through Paystack, not in the app), contacts, messages, audio, health, web browsing, app interactions or analytics.

---

## Permissions the app uses

- `CAMERA`: check-in photos
- `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION`: foreground only, at the moment a photo is taken
- `INTERNET`, `VIBRATE`

No background location, so no location permissions declaration form is needed.

---

## Releasing

1. Build the Play Store version:
   `eas build -p android --profile production`
2. First upload: in Play Console create the app, go to Testing → Internal testing, create a release, and upload the `.aab` from the Expo build page. (Google requires the first upload to be done by hand.)
3. Later uploads: `eas submit -p android --profile production` (needs a Google service account key; set up when you're ready).
4. Testing → Closed testing: add testers' emails, then promote to Production once NIPOST approves your live key.
