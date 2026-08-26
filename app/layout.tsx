import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tenon — delivery harness",
  description:
    "SKU-as-config pipeline, expert review queue, corrections-to-learning loop.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <div className="topbar">
            <span className="brand">TENON</span>
            <nav>
              <Link href="/">Dashboard</Link>
              <Link href="/work">Work queue</Link>
              <Link href="/intake">New intake</Link>
            </nav>
          </div>
          {children}
        </div>
      </body>
    </html>
  );
}
