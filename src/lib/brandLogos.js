/**
 * Coach / partner brand marks, keyed by the `brandLogo` id a program sets in the catalog.
 *
 * The assets live here rather than in trainingCatalog.js on purpose: that catalog is
 * imported under plain Node by scripts/audit-exercise-skills.mjs, and Node cannot parse a
 * PNG import. Keeping the catalog to a plain string id leaves it runtime-agnostic.
 *
 * Two presentation styles, because partners hand over two kinds of artwork:
 *
 *   free  — white-on-transparent line art. Sits directly on the card with no container.
 *           FKH's theme guardrails clamp `bg`/`surface` to 2–35% lightness so a white mark
 *           is always legible, but the hue is the athlete's choice, which is why these are
 *           keyed transparent rather than shipped on their own background.
 *   boxed — full-colour artwork that carries its own background (gradients, chrome, texture).
 *           It can't be keyed out without destroying the art, so it renders inside a rounded
 *           tile, the way an app icon does. Reads as deliberate instead of like a stray
 *           rectangle sitting on the card.
 *
 * Adding a partner: drop the asset in assets/brands/, add an entry here, and set
 * `brandLogo` on the program. Nothing else needs to change.
 */
import cramerMark from "../assets/brands/cramer-basketball-mark.png";
import secondToNone from "../assets/brands/2nd-to-none.png";
import hoopStudy from "../assets/brands/hoopstudy.png";

const BRAND_LOGOS = {
  "cramer-basketball": {
    name: "Cramer Basketball",
    style: "free",
    /* Monogram, not the full lockup: every placement pairs the mark with the partner name
       as text, so a wordmark baked into the art would print the name twice. */
    mark: cramerMark,
  },
  "2nd-to-none": {
    name: "2nd To None",
    style: "boxed",
    /* Self-contained badge artwork — one square asset serves every size. */
    mark: secondToNone,
  },
  "hoopstudy": {
    name: "HoopStudy",
    style: "boxed",
    /* Official "#HOOPSTUDY" channel wordmark on white — renders in a rounded tile.
       Source for the In-Season Hooper program (adapted from HoopStudy's 8-week
       in-season plan by Adam Menner). */
    mark: hoopStudy,
  },
};

/** Returns the brand's assets, or null for programs with no partner logo (most of them). */
export function getBrandLogo(id) {
  return (id && BRAND_LOGOS[id]) || null;
}
