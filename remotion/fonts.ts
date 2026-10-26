/**
 * Brand fonts, bundled from Fontsource (SIL OFL 1.1) so renders never need
 * the network. The render waits until all three faces are loaded.
 */

import "@fontsource/bricolage-grotesque/700.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/600.css";
import { continueRender, delayRender } from "remotion";

const FACES = [
  '700 100px "Bricolage Grotesque"',
  '400 40px "DM Sans"',
  '600 40px "DM Sans"',
];

let started = false;

export function waitForBrandFonts(): void {
  if (started || typeof document === "undefined") return;
  started = true;
  const handle = delayRender("Loading brand fonts");
  Promise.all(FACES.map((face) => document.fonts.load(face)))
    .then(() => continueRender(handle))
    .catch((error) => {
      console.error("[reel] fonts failed", error);
      continueRender(handle);
    });
}
