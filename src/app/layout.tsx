import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://rush.vlad-p.com";
const description =
  "Beat your friends at fake-money casino games. 1,000 points each, a few minutes, highest balance wins.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Rush", template: "%s · Rush" },
  description,
  applicationName: "Rush",
  openGraph: {
    type: "website",
    siteName: "Rush",
    title: "Rush",
    description,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Rush",
    description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
