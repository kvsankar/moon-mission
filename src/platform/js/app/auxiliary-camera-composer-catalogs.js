export const COMPOSER_SURFACE_POINT_CONTROL_GROUPS = Object.freeze([
    {
        label: "Sun on Earth",
        options: [
            { key: "viewSubSolarEarth", label: "Sub-Solar", color: "solar" },
            { key: "viewSolarGlintEarth", label: "Glint", color: "solar" },
        ],
    },
    {
        label: "Moon on Earth",
        options: [
            { key: "viewSubMoonEarth", label: "Sub-Moon", color: "moon" },
            { key: "viewLunarGlintEarth", label: "Glint", color: "moon" },
        ],
    },
    {
        label: "Craft on Earth",
        options: [
            { key: "viewSubCraftEarth", label: "Sub-Craft", color: "craft" },
        ],
    },
]);

export const COMPOSER_PLANET_MAGNITUDE_BY_BODY = Object.freeze({
    Mercury: -1.9,
    Venus: -4.4,
    Earth: -3.9,
    Mars: -2.0,
    Jupiter: -2.7,
    Saturn: 0.5,
    Uranus: 5.7,
    Neptune: 7.8,
});

export const COMPOSER_CONSTELLATION_LABELS = Object.freeze([
    { name: "Andromeda", raDeg: 10.5, decDeg: 37 },
    { name: "Aquila", raDeg: 295.5, decDeg: 5 },
    { name: "Aquarius", raDeg: 336, decDeg: -10 },
    { name: "Aries", raDeg: 37.5, decDeg: 20 },
    { name: "Auriga", raDeg: 87, decDeg: 40 },
    { name: "Bootes", raDeg: 217.5, decDeg: 30 },
    { name: "Cancer", raDeg: 130.5, decDeg: 20 },
    { name: "Canis Major", raDeg: 101.25, decDeg: -25 },
    { name: "Canis Minor", raDeg: 112.5, decDeg: 5 },
    { name: "Capricornus", raDeg: 315, decDeg: -20 },
    { name: "Carina", raDeg: 130.5, decDeg: -60 },
    { name: "Cassiopeia", raDeg: 15, decDeg: 60 },
    { name: "Centaurus", raDeg: 198.75, decDeg: -47 },
    { name: "Corona Borealis", raDeg: 237, decDeg: 30 },
    { name: "Corvus", raDeg: 186, decDeg: -18 },
    { name: "Crater", raDeg: 171, decDeg: -15 },
    { name: "Crux", raDeg: 187.5, decDeg: -60 },
    { name: "Cygnus", raDeg: 307.5, decDeg: 40 },
    { name: "Draco", raDeg: 262.5, decDeg: 65 },
    { name: "Gemini", raDeg: 105, decDeg: 25 },
    { name: "Hydra", raDeg: 157.5, decDeg: -20 },
    { name: "Leo", raDeg: 157.5, decDeg: 15 },
    { name: "Libra", raDeg: 228, decDeg: -15 },
    { name: "Lyra", raDeg: 282, decDeg: 35 },
    { name: "Ophiuchus", raDeg: 258, decDeg: -5 },
    { name: "Orion", raDeg: 84, decDeg: 0 },
    { name: "Pegasus", raDeg: 337.5, decDeg: 20 },
    { name: "Perseus", raDeg: 49.5, decDeg: 45 },
    { name: "Pisces", raDeg: 7.5, decDeg: 10 },
    { name: "Sagittarius", raDeg: 285, decDeg: -25 },
    { name: "Scorpius", raDeg: 247.5, decDeg: -30 },
    { name: "Taurus", raDeg: 67.5, decDeg: 18 },
    { name: "Triangulum", raDeg: 30, decDeg: 30 },
    { name: "Ursa Major", raDeg: 165, decDeg: 55 },
    { name: "Ursa Minor", raDeg: 225, decDeg: 75 },
    { name: "Vela", raDeg: 142.5, decDeg: -45 },
    { name: "Virgo", raDeg: 198, decDeg: 0 },
]);
