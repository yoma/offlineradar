import { cn } from "@/lib/utils";

/**
 * Soft organic edge shapes from the DateOfflineHub Instagram look.
 * Decorative only. Different layouts per surface, kept low-contrast.
 * Do not place over the homepage hero photo; use home-lower below it.
 */
export type BrandShapeVariant =
  | "home-lower"
  | "discover"
  | "detail"
  | "about"
  | "saved";

const FILL = {
  rose: "var(--brand-shape-rose)",
  terracotta: "var(--brand-shape-terracotta)",
  bordeaux: "var(--brand-shape-bordeaux)",
} as const;

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
        "pointer-events-none absolute inset-0 overflow-hidden",
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

function Blob({
  className,
  fill,
  d,
  viewBox = "0 0 320 320",
}: {
  className?: string;
  fill: string;
  d: string;
  viewBox?: string;
}) {
  return (
    <svg
      className={cn("absolute", className)}
      viewBox={viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d={d} fill={fill} />
    </svg>
  );
}

/** Softer side accents for tip + how-it-works under the hero. */
function HomeLowerShapes() {
  return (
    <>
      <Blob
        className="top-[8%] left-[-16%] h-[14rem] w-[14rem] opacity-[0.34] sm:h-[18rem] sm:w-[18rem] sm:opacity-[0.4]"
        fill={FILL.rose}
        d="M20 120C55 60 130 35 185 60C240 85 270 155 245 210C220 265 145 285 90 255C35 225 -15 180 20 120Z"
      />
      <Blob
        className="top-[4%] left-[-6%] h-[8rem] w-[9rem] opacity-[0.28] sm:h-[11rem] sm:w-[12rem]"
        fill={FILL.terracotta}
        d="M30 80C70 40 135 35 170 70C205 105 200 170 160 200C120 230 55 220 30 175C5 130 0 110 30 80Z"
      />
      <Blob
        className="right-[-12%] bottom-[5%] h-[12rem] w-[13rem] opacity-[0.3] sm:h-[16rem] sm:w-[17rem] sm:opacity-[0.36]"
        fill={FILL.terracotta}
        d="M250 220C295 250 310 310 275 340C240 370 175 360 145 320C115 280 130 220 175 200C205 185 225 200 250 220Z"
        viewBox="0 0 360 400"
      />
      <Blob
        className="right-[-4%] bottom-[18%] h-[6rem] w-[5rem] opacity-[0.26] sm:h-[7.5rem] sm:w-[6rem]"
        fill={FILL.bordeaux}
        d="M280 160C310 185 305 230 275 255C245 280 200 270 185 235C170 200 195 160 230 150C250 145 265 145 280 160Z"
      />
    </>
  );
}

function DiscoverShapes() {
  return (
    <>
      <Blob
        className="top-[-4%] right-[-18%] h-[15rem] w-[15rem] opacity-[0.3] sm:h-[20rem] sm:w-[20rem] sm:opacity-[0.36]"
        fill={FILL.rose}
        d="M260 30C300 75 295 150 255 195C215 240 140 250 90 215C40 180 25 105 60 55C95 5 165 -10 215 10C235 20 245 5 260 30Z"
      />
      <Blob
        className="bottom-[10%] left-[-14%] h-[11rem] w-[12rem] opacity-[0.24] sm:h-[15rem] sm:w-[16rem]"
        fill={FILL.bordeaux}
        d="M25 220C65 260 130 265 170 230C210 195 215 130 175 95C135 60 70 70 40 110C10 150 -5 190 25 220Z"
      />
    </>
  );
}

function DetailShapes() {
  return (
    <>
      <Blob
        className="top-[12%] left-[-12%] h-[10rem] w-[10rem] opacity-[0.22] sm:h-[13rem] sm:w-[13rem]"
        fill={FILL.terracotta}
        d="M40 100C75 55 145 45 185 80C225 115 230 180 190 215C150 250 80 245 45 205C10 165 5 145 40 100Z"
      />
      <Blob
        className="right-[-10%] bottom-[20%] h-[12rem] w-[11rem] opacity-[0.26] sm:h-[15rem] sm:w-[14rem]"
        fill={FILL.rose}
        d="M240 180C285 200 300 260 270 300C240 340 175 340 140 305C105 270 110 210 150 185C180 165 210 165 240 180Z"
      />
    </>
  );
}

function AboutShapes() {
  return (
    <>
      <Blob
        className="top-[-2%] right-[-20%] h-[13rem] w-[14rem] opacity-[0.32] sm:h-[17rem] sm:w-[18rem]"
        fill={FILL.rose}
        d="M250 20C295 55 300 125 265 170C230 215 155 225 110 185C65 145 55 75 95 35C135 -5 195 -10 230 10C240 15 240 5 250 20Z"
      />
      <Blob
        className="bottom-[-4%] left-[-16%] h-[12rem] w-[13rem] opacity-[0.28] sm:h-[16rem] sm:w-[17rem]"
        fill={FILL.terracotta}
        d="M30 240C75 280 150 285 195 245C240 205 245 135 205 95C165 55 95 60 55 100C15 140 -5 210 30 240Z"
      />
      <Blob
        className="right-[-3%] bottom-[35%] h-[5.5rem] w-[4.5rem] opacity-[0.25]"
        fill={FILL.bordeaux}
        d="M280 150C305 170 300 210 275 230C250 250 215 240 205 210C195 180 220 150 250 145C265 142 270 140 280 150Z"
      />
    </>
  );
}

function SavedShapes() {
  return (
    <>
      <Blob
        className="top-[6%] left-[-15%] h-[11rem] w-[12rem] opacity-[0.26] sm:h-[14rem] sm:w-[15rem]"
        fill={FILL.rose}
        d="M20 90C55 40 130 25 175 55C220 85 235 155 200 200C165 245 90 250 45 210C0 170 -15 140 20 90Z"
      />
      <Blob
        className="right-[-14%] bottom-[8%] h-[13rem] w-[12rem] opacity-[0.24] sm:h-[17rem] sm:w-[15rem]"
        fill={FILL.bordeaux}
        d="M250 200C290 230 295 295 260 330C225 365 160 360 130 320C100 280 115 220 160 200C190 185 220 180 250 200Z"
      />
    </>
  );
}
