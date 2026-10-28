import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TraceAtlas · Private appraisal",
  description: "Local market appraisal for RL environments and data traces.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
