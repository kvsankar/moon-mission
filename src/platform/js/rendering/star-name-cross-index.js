/**
 * HIP-keyed display-name cross index for the browser star catalog.
 * Generated from local bright-star names, Skyfield named_star_dict, and
 * CDS IV/27A HD-DM-GC-HR-HIP Bayer/Flamsteed Cross Index.
 * Display-name precedence belongs in star-display-names.js; records live
 * in ascending-HIP JSON shards.
 */

import part1 from "./catalog-data/star-name-cross-index-01.json" with { type: "json" };
import part2 from "./catalog-data/star-name-cross-index-02.json" with { type: "json" };
import part3 from "./catalog-data/star-name-cross-index-03.json" with { type: "json" };
import part4 from "./catalog-data/star-name-cross-index-04.json" with { type: "json" };

export const STAR_NAME_CROSS_INDEX = Object.freeze({
  ...part1,
  ...part2,
  ...part3,
  ...part4,
});
