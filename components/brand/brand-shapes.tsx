import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Organic edge shapes from the DateOfflineHub Instagram look.
 * Corner-pinned SVGs (not one stretched portrait viewBox) so shapes stay
 * visible on wide screens. Homepage: only home-lower below the hero photo.
 */
export type BrandShapeVariant =
  | "home-lower"
  | "discover"
  | "detail"
  | "about"
  | "saved";

const ROSE = "#E8B5A6";
const TERRACOTTA = "#C47A68";
const BORDEAUX = "#8B3A42";

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
      {variant === "home-lower" ? <HomeLowerShapes /> : null}
      {variant === "discover" ? <DiscoverShapes /> : null}
      {variant === "detail" ? <DetailShapes /> : null}
      {variant === "about" ? <AboutShapes /> : null}
      {variant === "saved" ? <SavedShapes /> : null}
    </div>
  );
}

function CornerSvg({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <svg
      className={cn("absolute", className)}
      viewBox="0 0 320 280"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** Closest to Instagram poster: TR stack, BL layers, mid-right peek. */
function AboutShapes() {
  return (
    <>
      <CornerSvg className="top-0 right-0 h-[min(40vw,17rem)] w-[min(48vw,20rem)] sm:h-[19rem] sm:w-[22rem]">
        <path
          fill={ROSE}
          d="M120 0H320V160C280 120 230 100 180 120C130 140 110 190 90 150C70 110 90 40 120 0Z"
        />
        <path
          fill={TERRACOTTA}
          d="M200 0H320V120C290 90 250 80 220 100C190 120 185 160 170 130C155 100 175 30 200 0Z"
        />
      </CornerSvg>
      <CornerSvg className="bottom-0 left-0 h-[min(38vw,16rem)] w-[min(46vw,19rem)] sm:h-[18rem] sm:w-[21rem]">
        <path
          fill={ROSE}
          d="M0 100C50 70 120 70 170 110C220 150 230 220 180 250C130 280 40 290 0 250V100Z"
        />
        <path
          fill={TERRACOTTA}
          d="M0 160C45 140 100 155 130 200C160 245 140 280 80 280C20 280 0 240 0 200V160Z"
        />
        <path
          fill={BORDEAUX}
          d="M0 210C30 200 60 220 70 250C80 280 40 290 0 280V210Z"
        />
      </CornerSvg>
      <CornerSvg className="top-[42%] right-0 h-[min(22vw,9rem)] w-[min(16vw,6.5rem)] sm:h-40 sm:w-28">
        <path
          fill={BORDEAUX}
          d="M140 40C200 20 280 50 300 110C320 170 260 220 190 200C120 180 90 100 140 40Z"
        />
      </CornerSvg>
    </>
  );
}

function HomeLowerShapes() {
  return (
    <>
      <CornerSvg className="top-8 left-0 h-[min(36vw,15rem)] w-[min(42vw,18rem)] sm:h-[17rem] sm:w-[20rem]">
        <path
          fill={ROSE}
          d="M0 20C60 0 140 10 180 70C220 130 190 200 120 220C50 240 0 190 0 120V20Z"
        />
        <path
          fill={TERRACOTTA}
          d="M0 90C50 70 100 90 120 140C140 190 100 230 50 230C0 230 0 160 0 130V90Z"
        />
      </CornerSvg>
      <CornerSvg className="right-0 bottom-4 h-[min(34vw,14rem)] w-[min(40vw,17rem)] sm:h-60 sm:w-[19rem]">
        <path
          fill={TERRACOTTA}
          d="M80 60C140 20 240 30 300 90C320 120 320 200 280 240C220 280 120 270 70 210C30 160 40 90 80 60Z"
        />
      </CornerSvg>
      <CornerSvg className="top-[38%] right-0 h-[min(20vw,8rem)] w-[min(14vw,5.5rem)] sm:h-36 sm:w-24">
        <path
          fill={BORDEAUX}
          d="M150 30C210 10 290 40 300 100C310 160 250 200 180 180C110 160 90 80 150 30Z"
        />
      </CornerSvg>
    </>
  );
}

function DiscoverShapes() {
  return (
    <>
      <CornerSvg className="top-0 right-0 h-[min(38vw,16rem)] w-[min(44vw,19rem)] sm:h-[18rem] sm:w-[21rem]">
        <path
          fill={ROSE}
          d="M100 0H320V150C270 110 210 95 160 120C110 145 95 200 70 150C45 100 70 30 100 0Z"
        />
        <path
          fill={TERRACOTTA}
          d="M190 0H320V110C285 85 245 80 215 100C185 120 180 155 165 125C150 95 170 25 190 0Z"
        />
      </CornerSvg>
      <CornerSvg className="bottom-10 left-0 h-[min(32vw,13rem)] w-[min(38vw,16rem)] sm:h-56 sm:w-[18rem]">
        <path
          fill={BORDEAUX}
          d="M0 80C55 50 130 60 170 120C210 180 170 250 90 260C20 270 0 210 0 150V80Z"
        />
      </CornerSvg>
    </>
  );
}

function DetailShapes() {
  return (
    <>
      <CornerSvg className="top-16 left-0 h-[min(28vw,12rem)] w-[min(32vw,14rem)] sm:h-48 sm:w-56">
        <path
          fill={TERRACOTTA}
          d="M0 40C50 10 120 20 150 80C180 140 140 200 70 210C10 220 0 150 0 100V40Z"
        />
      </CornerSvg>
      <CornerSvg className="right-0 bottom-[18%] h-[min(34vw,14rem)] w-[min(36vw,15rem)] sm:h-60 sm:w-60">
        <path
          fill={ROSE}
          d="M60 40C120 10 220 20 280 80C310 110 300 200 240 230C170 270 80 240 50 170C30 120 20 70 60 40Z"
        />
      </CornerSvg>
      <CornerSvg className="top-[36%] right-0 h-[min(18vw,7rem)] w-[min(12vw,5rem)] sm:h-32 sm:w-20">
        <path
          fill={BORDEAUX}
          d="M160 20C220 5 290 40 295 100C300 160 240 190 175 170C110 150 100 60 160 20Z"
        />
      </CornerSvg>
    </>
  );
}

function SavedShapes() {
  return (
    <>
      <CornerSvg className="top-6 left-0 h-[min(34vw,14rem)] w-[min(40vw,17rem)] sm:h-56 sm:w-[19rem]">
        <path
          fill={ROSE}
          d="M0 30C55 0 140 15 180 80C220 145 180 220 100 230C30 240 0 180 0 120V30Z"
        />
      </CornerSvg>
      <CornerSvg className="right-0 bottom-6 h-[min(36vw,15rem)] w-[min(40vw,17rem)] sm:h-[17rem] sm:w-[19rem]">
        <path
          fill={BORDEAUX}
          d="M70 50C130 15 230 25 290 90C320 125 310 210 250 245C180 285 90 260 55 185C30 135 25 85 70 50Z"
        />
      </CornerSvg>
      <CornerSvg className="top-[40%] right-0 h-[min(18vw,7.5rem)] w-[min(13vw,5.5rem)] sm:h-36 sm:w-24">
        <path
          fill={TERRACOTTA}
          d="M150 25C210 5 290 40 300 100C310 160 240 195 170 175C100 155 90 70 150 25Z"
        />
      </CornerSvg>
    </>
  );
}
