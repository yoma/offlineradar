import { cn } from "@/lib/utils";

/**
 * Organic edge shapes from the DateOfflineHub Instagram look.
 * Full-bleed SVG so shapes hug the sides (not clipped off-screen).
 * Homepage: only use home-lower below the hero photo.
 */
export type BrandShapeVariant =
  | "home-lower"
  | "discover"
  | "detail"
  | "about"
  | "saved";

export function BrandShapes({
  variant,
  className,
}: {
  variant: BrandShapeVariant;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 z-0 overflow-hidden",
        className,
      )}
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1000 1400"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {variant === "home-lower" ? <HomeLowerPaths /> : null}
        {variant === "discover" ? <DiscoverPaths /> : null}
        {variant === "detail" ? <DetailPaths /> : null}
        {variant === "about" ? <AboutPaths /> : null}
        {variant === "saved" ? <SavedPaths /> : null}
      </svg>
    </div>
  );
}

/** Instagram-like: top-right stack + bottom-left layers + small right peek. */
function AboutPaths() {
  return (
    <>
      {/* Top-right: soft rose behind */}
      <path
        fill="var(--brand-shape-rose)"
        opacity="0.72"
        d="M680 -40C780 -20 920 40 1000 140V320C940 260 860 220 780 250C700 280 660 360 620 300C580 240 600 120 680 -40Z"
      />
      {/* Top-right: terracotta front */}
      <path
        fill="var(--brand-shape-terracotta)"
        opacity="0.78"
        d="M820 -20C900 10 980 80 1020 180V280C960 220 900 200 850 230C800 260 780 320 750 270C720 220 760 60 820 -20Z"
      />
      {/* Bottom-left: soft rose */}
      <path
        fill="var(--brand-shape-rose)"
        opacity="0.7"
        d="M-40 980C40 920 160 900 260 960C360 1020 400 1140 320 1220C240 1300 80 1340 -20 1280C-80 1240 -100 1080 -40 980Z"
      />
      {/* Bottom-left: deeper terracotta */}
      <path
        fill="var(--brand-shape-terracotta)"
        opacity="0.8"
        d="M-60 1100C20 1060 120 1080 180 1160C240 1240 220 1340 120 1380C20 1420 -80 1360 -100 1260C-110 1200 -100 1140 -60 1100Z"
      />
      {/* Bottom-left: bordeaux tip */}
      <path
        fill="var(--brand-shape-bordeaux)"
        opacity="0.7"
        d="M-40 1220C20 1200 80 1240 100 1300C120 1360 60 1420 -20 1400C-80 1380 -90 1280 -40 1220Z"
      />
      {/* Mid-right peek */}
      <path
        fill="var(--brand-shape-bordeaux)"
        opacity="0.68"
        d="M960 620C1020 660 1040 760 1000 820C960 880 880 860 860 780C840 700 900 600 960 620Z"
      />
    </>
  );
}

/** Under hero: left cluster + right accents. */
function HomeLowerPaths() {
  return (
    <>
      <path
        fill="var(--brand-shape-rose)"
        opacity="0.68"
        d="M-60 80C40 20 180 0 280 80C380 160 360 320 240 380C120 440 -40 400 -80 280C-100 200 -100 140 -60 80Z"
      />
      <path
        fill="var(--brand-shape-terracotta)"
        opacity="0.72"
        d="M-40 200C40 160 120 180 160 250C200 320 160 400 60 420C-40 440 -100 360 -80 280C-70 240 -70 220 -40 200Z"
      />
      <path
        fill="var(--brand-shape-terracotta)"
        opacity="0.7"
        d="M760 980C860 940 980 980 1040 1080V1280C960 1200 860 1180 780 1240C700 1300 680 1400 620 1320C560 1240 640 1040 760 980Z"
      />
      <path
        fill="var(--brand-shape-bordeaux)"
        opacity="0.62"
        d="M940 740C1000 780 1020 880 980 940C940 1000 860 980 840 900C820 820 880 720 940 740Z"
      />
    </>
  );
}

/** Discover: top-right rose + bottom-left bordeaux. */
function DiscoverPaths() {
  return (
    <>
      <path
        fill="var(--brand-shape-rose)"
        opacity="0.7"
        d="M720 -60C840 -40 960 40 1040 160V360C960 280 860 240 780 280C700 320 680 420 620 340C560 260 600 40 720 -60Z"
      />
      <path
        fill="var(--brand-shape-terracotta)"
        opacity="0.65"
        d="M880 -20C960 20 1020 100 1040 200V300C980 240 920 220 870 260C820 300 810 360 780 300C750 240 820 40 880 -20Z"
      />
      <path
        fill="var(--brand-shape-bordeaux)"
        opacity="0.58"
        d="M-50 900C40 860 160 900 220 1000C280 1100 220 1240 100 1280C-20 1320 -100 1200 -80 1080C-70 1000 -90 940 -50 900Z"
      />
    </>
  );
}

/** Detail: quieter left + right accents. */
function DetailPaths() {
  return (
    <>
      <path
        fill="var(--brand-shape-terracotta)"
        opacity="0.55"
        d="M-50 160C40 100 160 120 220 220C280 320 220 440 100 460C-20 480 -100 360 -80 260C-70 210 -90 190 -50 160Z"
      />
      <path
        fill="var(--brand-shape-rose)"
        opacity="0.62"
        d="M820 700C920 660 1020 720 1060 840V1040C980 960 880 940 820 1000C760 1060 760 1180 700 1100C640 1020 720 760 820 700Z"
      />
      <path
        fill="var(--brand-shape-bordeaux)"
        opacity="0.5"
        d="M960 500C1010 540 1020 620 980 670C940 720 870 700 860 630C850 560 910 480 960 500Z"
      />
    </>
  );
}

/** Saved: left rose + right bordeaux. */
function SavedPaths() {
  return (
    <>
      <path
        fill="var(--brand-shape-rose)"
        opacity="0.66"
        d="M-40 40C60 -20 200 0 260 100C320 200 260 340 140 360C20 380 -80 280 -60 160C-50 100 -80 80 -40 40Z"
      />
      <path
        fill="var(--brand-shape-bordeaux)"
        opacity="0.58"
        d="M780 900C880 860 1000 900 1060 1020V1220C980 1140 880 1120 800 1180C720 1240 700 1360 640 1280C580 1200 660 960 780 900Z"
      />
      <path
        fill="var(--brand-shape-terracotta)"
        opacity="0.55"
        d="M920 560C980 600 1000 700 960 760C920 820 840 800 820 720C800 640 860 540 920 560Z"
      />
    </>
  );
}
