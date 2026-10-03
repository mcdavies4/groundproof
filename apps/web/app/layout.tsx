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
            <Link href="/" className="brand">Groundproof</Link>
            <nav>
              <Link href="/dashboard">Your properties</Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
