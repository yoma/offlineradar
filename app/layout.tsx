import type { Metadata } from "next";
import { Fraunces, Outfit } from "next/font/google";
import { MobileNav, SiteHeader } from "@/components/layout/site-nav";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

export const metadata: Metadata = {
  title: {
    default: "OfflineRadar",
    template: "%s · OfflineRadar",
  },
  description: "Ontdek waar je offline nieuwe mensen ontmoet.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="nl"
      className={`${outfit.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background font-sans text-foreground">
        <SiteHeader />
        <main className="pb-20 md:pb-0">{children}</main>
        <MobileNav />
      </body>
    </html>
  );
}
