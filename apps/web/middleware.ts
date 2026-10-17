import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SOURCES: [RegExp, string][] = [
  [/(^|\.)(linkedin\.com|lnkd\.in)$/, "linkedin"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, "facebook"],
  [/(^|\.)(t\.co|x\.com|twitter\.com)$/, "x"],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, "whatsapp"],
  [/(^|\.)google\./, "google"],
  [/(^|\.)bing\.com$/, "bing"],
];

/** First touch only: where this visitor came from (and whose invite link), kept 30 days so sign-ups are credited. */
function rememberSource(request: NextRequest, response: NextResponse) {
  const q = request.nextUrl.searchParams;
  const opts = { maxAge: 30 * 86_400, path: "/", sameSite: "lax" as const };
  const ref = (q.get("ref") ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
  if (ref && !request.cookies.get("gp_ref")) response.cookies.set("gp_ref", ref, opts);
  if (request.cookies.get("gp_src")) return response;

  // Someone opening a link an owner shared (a property or estate report) is credited to that channel.
  const path0 = request.nextUrl.pathname;
  if (!q.get("utm_source") && !q.get("src") && !ref && (path0.startsWith("/r/") || path0.startsWith("/e/"))) {
    response.cookies.set("gp_src", "shared-report", opts);
    response.cookies.set("gp_land", "/r/…", opts);
    return response;
  }

  let src = (q.get("utm_source") ?? q.get("src") ?? "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 30);
  if (!src && ref) src = "referral";
  if (!src) {
    const referer = request.headers.get("referer");
    let host = "";
    try { host = referer ? new URL(referer).hostname.replace(/^www\./, "") : ""; } catch { host = ""; }
    if (!host || host === request.nextUrl.hostname.replace(/^www\./, "") || host.endsWith("groundproof.site")) return response;
    src = SOURCES.find(([re]) => re.test(host))?.[1] ?? host.slice(0, 30);
  }
  response.cookies.set("gp_src", src, opts);
  response.cookies.set("gp_land", request.nextUrl.pathname.slice(0, 60), opts);
  return response;
}

export async function middleware(request: NextRequest) {
  // If Supabase falls back to the Site URL, the sign-in code lands on "/". Send it to the callback.
  const code = request.nextUrl.searchParams.get("code");
  if (code && request.nextUrl.pathname !== "/auth/callback") {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    url.search = `?code=${encodeURIComponent(code)}&next=/dashboard`;
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet: { name: string; value: string; options: CookieOptions }[]) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isApp = path.startsWith("/dashboard") || path.startsWith("/properties") || path === "/account" || path === "/admin" || path.startsWith("/estates") || path.startsWith("/plots");

  if (isApp && !data.user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  return rememberSource(request, response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"],
};
