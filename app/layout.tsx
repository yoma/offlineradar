import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { MobileNav, SiteHeader } from "@/components/layout/site-nav";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
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
    <html lang="nl" className={`${jakarta.variable} h-full`}>
      <body className="min-h-full bg-background font-sans text-foreground">
        <SiteHeader />
        <main className="pb-20 md:pb-8">{children}</main>
        <MobileNav />
      </body>
    </html>
  );
}
