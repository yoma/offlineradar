import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AuthSessionProvider } from "@/components/auth/session-provider";
import { BetaWelcomeModal } from "@/components/beta/beta-welcome-modal";
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
      <body className="min-h-full min-w-0 bg-background font-sans text-foreground">
        <AuthSessionProvider>
          <SiteHeader />
          <main className="min-w-0 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-8">
            {children}
          </main>
          <MobileNav />
          <BetaWelcomeModal />
        </AuthSessionProvider>
      </body>
    </html>
  );
}
