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

/** First touch only: where this visitor came from, kept for 30 days so sign-ups can be credited to it. */
function rememberSource(request: NextRequest, response: NextResponse) {
  if (request.cookies.get("gp_src")) return response;
  const q = request.nextUrl.searchParams;
  let src = (q.get("utm_source") ?? q.get("src") ?? q.get("ref") ?? "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 30);
  if (!src) {
    const ref = request.headers.get("referer");
    let host = "";
    try { host = ref ? new URL(ref).hostname.replace(/^www\./, "") : ""; } catch { host = ""; }
    if (!host || host === request.nextUrl.hostname.replace(/^www\./, "") || host.endsWith("groundproof.site")) return response;
    src = SOURCES.find(([re]) => re.test(host))?.[1] ?? host.slice(0, 30);
  }
  const opts = { maxAge: 30 * 86_400, path: "/", sameSite: "lax" as const };
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
