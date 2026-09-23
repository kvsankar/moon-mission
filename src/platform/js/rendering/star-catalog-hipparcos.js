/**
 * Hipparcos Vmag<=6 star catalog for sky rendering.
 * Source: C:/sankar/projects/skyfield-ts/showcase/web/public/catalogs/hip_main.dat.gz
 * Parsing rules match skyfield-ts showcase parser: finite HIP/Vmag/RA/DE,
 * Vmag <= 6.0. The generated records live in ascending-HIP JSON shards.
 */

import part1 from "./catalog-data/star-catalog-hipparcos-01.json" with { type: "json" };
import part2 from "./catalog-data/star-catalog-hipparcos-02.json" with { type: "json" };
import part3 from "./catalog-data/star-catalog-hipparcos-03.json" with { type: "json" };
import part4 from "./catalog-data/star-catalog-hipparcos-04.json" with { type: "json" };
import part5 from "./catalog-data/star-catalog-hipparcos-05.json" with { type: "json" };
import part6 from "./catalog-data/star-catalog-hipparcos-06.json" with { type: "json" };

export const HIPPARCOS_VMAG6_CATALOG = Object.freeze([
  ...part1,
  ...part2,
  ...part3,
  ...part4,
  ...part5,
  ...part6,
]);

// Compatibility aliases for existing renderer call sites.
export const STAR_CATALOG_HIPPARCOS_V6 = HIPPARCOS_VMAG6_CATALOG;
export const STAR_CATALOG_BRIGHT = HIPPARCOS_VMAG6_CATALOG;
export const BRIGHT_STAR_CATALOG = HIPPARCOS_VMAG6_CATALOG;

export function getHipparcosVmag6Catalog() {
  return HIPPARCOS_VMAG6_CATALOG;
}

export function getBrightStarCatalog() {
  return HIPPARCOS_VMAG6_CATALOG;
}
