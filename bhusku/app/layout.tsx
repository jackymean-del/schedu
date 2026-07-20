import type { Metadata } from "next";
import { Plus_Jakarta_Sans, DM_Mono } from "next/font/google";
import "./globals.css";
import { SITE_URL, BRAND } from "@/lib/site";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "bhusku — Heavy on craft. Full of energy.",
    template: "%s · bhusku",
  },
  description: BRAND.blurb,
  openGraph: {
    type: "website",
    siteName: "bhusku",
    title: "bhusku — Heavy on craft. Full of energy.",
    description: BRAND.blurb,
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${jakarta.variable} ${dmMono.variable}`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
