import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AuthSessionProvider } from "@/components/auth/session-provider";
import { BetaWelcomeModal } from "@/components/beta/beta-welcome-modal";
import { FeedbackLauncher } from "@/components/feedback/feedback-launcher";
import { MobileNav, SiteHeader } from "@/components/layout/site-nav";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
});

const siteDescription =
  "Ontdek hier singlesevents en activiteiten waar je andere singles in het echt kunt ontmoeten.";

export const metadata: Metadata = {
  metadataBase: new URL("https://dateofflinehub.vercel.app"),
  applicationName: "DateOfflineHub",
  title: {
    default: "DateOfflineHub",
    template: "%s · DateOfflineHub",
  },
  description: siteDescription,
  openGraph: {
    type: "website",
    locale: "nl_BE",
    url: "https://dateofflinehub.vercel.app",
    siteName: "DateOfflineHub",
    title: "DateOfflineHub",
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: "DateOfflineHub",
    description: siteDescription,
  },
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
          <FeedbackLauncher />
          <BetaWelcomeModal />
        </AuthSessionProvider>
      </body>
    </html>
  );
}
