import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://groundproof-sigma.vercel.app"),
  openGraph: {
    title: "Groundproof",
    description: "Your contractor sent photos. Were they taken at your house? Check-ins verified against the NIPOST postcode.",
    siteName: "Groundproof",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
  title: "Groundproof — proof your property updates came from your property",
  description:
    "Every photo from your build in Nigeria, checked against the building's NIPOST postcode. For diaspora owners who can't be there.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={archivo.variable}>
      <body>
        <header className="site-head">
          <div className="wrap">
            <Link href="/" className="brand" aria-label="Groundproof home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/groundproof-logo.svg" alt="Groundproof" width={207} height={28} />
            </Link>
            <nav>
              <Link href="/dashboard">Your properties</Link>
              <Link href="/account">Account</Link>
            </nav>
          </div>
        </header>
        {children}
        <footer className="site-foot">
          <div className="wrap legal-links">
            <span>Groundproof is built by The 36th Solutions Ltd. Not affiliated with NIPOST.</span>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/delete-account">Delete your account</Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
