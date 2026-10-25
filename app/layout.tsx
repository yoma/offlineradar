import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import { auth } from "@/auth";
import { AuthSessionProvider } from "@/components/auth/session-provider";
import { AnalyticsBeacon } from "@/components/analytics/analytics-beacon";
import { BetaWelcomeModal } from "@/components/beta/beta-welcome-modal";
import { FeedbackLauncher } from "@/components/feedback/feedback-launcher";
import { MobileNav, SiteHeader } from "@/components/layout/site-nav";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
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

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-bricolage",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    locale: "nl_BE",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  const showAdminEntry = isAllowlistedAdminEmail(session?.user?.email);

  return (
    <html
      lang="nl"
      className={`${dmSans.variable} ${bricolage.variable} h-full overflow-x-clip`}
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
