import { APP_LINKS } from "@/lib/apps";

function StoreButton({ platform, status, url }: { platform: string; status: string; url: string | null }) {
  const label =
    status === "live" ? `Get it for ${platform}` : status === "in-review" ? "In review" : "Coming later";
  const inner = (
    <>
      <span className="store-platform">{platform}</span>
      <span className="store-status">{label}</span>
    </>
  );
  return url && status === "live" ? (
    <a className="store-btn live" href={url} target="_blank" rel="noreferrer">{inner}</a>
  ) : (
    <span className="store-btn" aria-disabled="true">{inner}</span>
  );
}

export function GetTheApp() {
  const anyLive = APP_LINKS.android.status === "live" || APP_LINKS.ios.status === "live";
  return (
    <section className="section" id="app">
      <div className="wrap app-section">
        <div>
          <h2>Your person on the ground needs the app</h2>
          <p>
            You follow everything here on the website. The relative, contractor or agent visiting the property uses the
            Groundproof app: it takes the photos, reads the location at the house, and checks it with NIPOST. Photos
            can&apos;t come from anywhere else, which is what makes the verdicts trustworthy.
          </p>
          <div className="store-row">
            <StoreButton platform="Android" status={APP_LINKS.android.status} url={APP_LINKS.android.url} />
            <StoreButton platform="iPhone" status={APP_LINKS.ios.status} url={APP_LINKS.ios.url} />
          </div>
          {anyLive && APP_LINKS.ios.status !== "live" && (
            <p className="small muted">iPhone app coming later. For now, your person on the ground needs an Android phone.</p>
          )}
          {!anyLive && (
            <p className="small muted">
              The Android app is with Google for review. Join the pilot list and we&apos;ll send your person on the
              ground an early-access link.
            </p>
          )}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="app-shot"
          src="/brand/app-verified.png"
          alt="The Groundproof app showing a check-in verified at the building"
          width={390}
          height={680}
          loading="lazy"
        />
      </div>
    </section>
  );
}
