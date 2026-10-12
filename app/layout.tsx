import type { Metadata, Viewport } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import { auth } from "@/auth";
import { AuthSessionProvider } from "@/components/auth/session-provider";
import { AnalyticsBeacon } from "@/components/analytics/analytics-beacon";
import { BetaWelcomeModal } from "@/components/beta/beta-welcome-modal";
import { FeedbackLauncher } from "@/components/feedback/feedback-launcher";
import { MobileNav, SiteHeader } from "@/components/layout/site-nav";
import { isAllowlistedAdminEmail } from "@/lib/tips/admin-auth";
import "./globals.css";

/** Run serverless near Neon (eu-central-1), not default iad1. */
export const preferredRegion = "fra1";

/** Keep layout stable on phones; do not lock pinch-zoom (a11y). */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-dm-serif",
});

const siteDescription =
  "Ontdek hier singlesevents en activiteiten waar je andere singles in het echt kunt ontmoeten.";

export const metadata: Metadata = {
  metadataBase: new URL("https://dateofflinehub.be"),
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

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  const showAdminEntry = isAllowlistedAdminEmail(session?.user?.email);

  return (
    <html
      lang="nl"
      className={`${dmSans.variable} ${dmSerif.variable} h-full overflow-x-clip`}
    >
      <body className="min-h-full min-w-0 overflow-x-clip bg-background font-sans text-foreground">
        <AuthSessionProvider>
          <AnalyticsBeacon />
          <SiteHeader showAdminEntry={showAdminEntry} />
          <main className="min-w-0 overflow-x-clip pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-8">
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
