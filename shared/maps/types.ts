// Map data format. Maps are stored as JSON in /shared/maps/ and compiled into a World.
// Coordinates: x right, z toward the top of the hill (downhill is -z), heights in metres.
// Angles in map files are in degrees.

export interface MapData {
  id: string;
  name: string;
  course: CourseDef;
  spawn: { x: number; z: number; heading: number };
  startGate: { z: number; halfWidth: number };
  finish: { z: number; halfWidth: number };
  features: FeatureDef[];
  rails: RailDef[];
  scenery?: { treeCount?: number; seed?: number };
}

export interface CourseDef {
  /** Height of the course at s = 0 (top). */
  topHeight: number;
  /** Half width of the groomed piste (m). */
  halfWidth: number;
  /** Total length down the fall line (m). Terrain is generated a bit beyond this. */
  length: number;
  /** [s, slope] knots: s = distance downhill from the top (m), slope = descent angle (deg). Linear in tan(slope). */
  profile: [number, number][];
  /** Curvature radius where the piste edge rises into the banks (m). */
  bermRadius?: number;
  /** Max bank angle beyond the piste (deg). */
  bermAngle?: number;
  /** Off-piste roughness amplitude (m). */
  undulation?: number;
}

interface FeatureBase {
  id: string;
  /** Start of the feature on its axis (kicker toe / ramp toe). */
  x: number;
  z: number;
  /** Axis heading in degrees, 0 = straight down the fall line, positive turns left. */
  heading?: number;
}

/** Tabletop: kicker, back face, flat deck (the gap), rounded knuckle, landing. */
export interface JumpDef extends FeatureBase {
  type: 'jump';
  lipHeight: number;
  lipAngle: number;
  /** Lip to start of knuckle (m). */
  gap: number;
  /** How far the deck sits below the lip (m). */
  deckDrop?: number;
  /** Deck descent angle (deg). */
  deckAngle?: number;
  /** Knuckle length (m). */
  knuckle?: number;
  landingAngle: number;
  kickerWidth: number;
  deckWidth: number;
  landingWidth: number;
  sideAngle?: number;
  /** Fillet size where the landing runs into the slope (m). */
  landingBlend?: number;
}

/** Kicker on its own (no table), e.g. a pop-on kicker in front of a rail or a side hit. */
export interface KickerDef extends FeatureBase {
  type: 'kicker';
  lipHeight: number;
  lipAngle: number;
  width: number;
  backAngle?: number;
  sideAngle?: number;
}

/** Smooth snow ramp that rises to a flat top parallel to the slope, used to ride onto rails/boxes. */
export interface OnrampDef extends FeatureBase {
  type: 'onramp';
  height: number;
  length: number;
  topLength: number;
  width: number;
  backAngle?: number;
  sideAngle?: number;
}

export type FeatureDef = JumpDef | KickerDef | OnrampDef;

export interface RailDef {
  id: string;
  kind: 'rail' | 'box';
  /** Box width (m). Rails are round bars. */
  width?: number;
  /** Polyline nodes; h is the height of the riding surface above the base slope (not features). */
  nodes: { x: number; z: number; h: number }[];
}
