import * as THREE from "three";

const VIEW_MODE_2D = "map2d";
const VIEW_MODE_3D = "globe3d";
const MAP_TILE_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const MAP_TILE_ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
const LEAFLET_CSS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const EARTH_TEXTURE_URL = "images/earth/2_no_clouds_8k.jpg";
const DEFAULT_MAP_CENTER = [12, 0];
const DEFAULT_MAP_ZOOM = 2;
const TRACK_WRAP_OFFSETS = [-360, 0, 360];
const GROUND_TRACK_START_EVENT_KEY = "returnCorrection3";
const GROUND_TRACK_PANEL_EVENT_KEYS = [
    "returnCorrection3",
    "serviceModuleSeparation",
    "crewModuleRaiseBurn",
    "entryInterface",
    "splashdown",
];
const J2000_OBLIQUITY_RADIANS = THREE.MathUtils.degToRad(23.439291111);
const EARTH_REFERENCE_RADIUS_KM = 6378.1363;
const KM_TO_MILES = 0.621371192237334;
const KMPS_TO_MPH = 2236.9362920544;
const GROUND_TRACK_EVENT_WINDOW_EPSILON_MS = 1000;
const GROUND_TRACK_COLOR = "#2b84c6";
const GROUND_TRACK_GENERATED_COLOR = "#ffb347";
const PANEL_EDGE_MARGIN_PX = 8;
const PANEL_DEFAULT_LEFT_PX = 10;
const PANEL_DEFAULT_BOTTOM_GAP_PX = 12;
const GLOBE_RADIUS = 1.0;
const GLOBE_TRACK_ALTITUDE = 1.014;
const GLOBE_MARKER_ALTITUDE = 1.035;
const GLOBE_MIN_DISTANCE = 1.9;
const GLOBE_MAX_DISTANCE = 5.2;
const GLOBE_FOV_DEGREES = 32;
const GLOBE_WORLD_NORTH = new THREE.Vector3(0, 1, 0);
const GLOBE_VIEW_UP = new THREE.Vector3(0, 1, 0);
const GLOBE_VIEW_FRONT = new THREE.Vector3(0, 0, 1);
const COMPOSER_PANEL_ASPECT_RATIO = 16 / 9;
const GROUND_TRACK_PANEL_REGISTRY_ID = "workflow:splashdown";
export {
    GROUND_TRACK_PANEL_REGISTRY_ID,
    VIEW_MODE_2D,
    VIEW_MODE_3D,
    MAP_TILE_URL,
    MAP_TILE_ATTRIBUTION,
    LEAFLET_CSS_URL,
    EARTH_TEXTURE_URL,
    DEFAULT_MAP_CENTER,
    DEFAULT_MAP_ZOOM,
    TRACK_WRAP_OFFSETS,
    GROUND_TRACK_START_EVENT_KEY,
    GROUND_TRACK_PANEL_EVENT_KEYS,
    J2000_OBLIQUITY_RADIANS,
    EARTH_REFERENCE_RADIUS_KM,
    KM_TO_MILES,
    KMPS_TO_MPH,
    GROUND_TRACK_EVENT_WINDOW_EPSILON_MS,
    GROUND_TRACK_COLOR,
    GROUND_TRACK_GENERATED_COLOR,
    PANEL_EDGE_MARGIN_PX,
    PANEL_DEFAULT_LEFT_PX,
    PANEL_DEFAULT_BOTTOM_GAP_PX,
    GLOBE_RADIUS,
    GLOBE_TRACK_ALTITUDE,
    GLOBE_MARKER_ALTITUDE,
    GLOBE_MIN_DISTANCE,
    GLOBE_MAX_DISTANCE,
    GLOBE_FOV_DEGREES,
    GLOBE_WORLD_NORTH,
    GLOBE_VIEW_UP,
    GLOBE_VIEW_FRONT,
    COMPOSER_PANEL_ASPECT_RATIO,
};
