/* ═══════════════════════════════════════════════════════════
   Weapon/sensor action definitions and runtime instances
   (ICD 0xFF37 weapons, 0xFF39 sensors)
   ═══════════════════════════════════════════════════════════ */

export type WeaponActionKey = "sonobuoy" | "blueshark" | "rcws" | "drone";
export type SensorActionKey = "tass" | "eoir";

export type ActionFieldKey =
  | "target_lat"
  | "target_lon"
  | "operating_depth"
  | "active_duration"
  | "ref_track_id"
  | "rounds_per_burst"
  | "burst_count"
  | "burst_interval"
  | "cruise_altitude"
  | "cruise_speed"
  | "loiter_radius"
  | "activate"
  | "heading"
  | "zoom_level";

export interface WeaponActionDef {
  key: WeaponActionKey;
  type: number;
  label: string;
  icon: string;
  color: string;
  fields: ActionFieldKey[];
}

export interface SensorActionDef {
  key: SensorActionKey;
  type: number;
  label: string;
  icon: string;
  color: string;
  fields: ActionFieldKey[];
}

export interface ActionParams {
  target_lat?: number;
  target_lon?: number;
  operating_depth?: number;
  active_duration?: number;
  ref_track_id?: number | null;
  rounds_per_burst?: number;
  burst_count?: number;
  burst_interval?: number;
  cruise_altitude?: number;
  cruise_speed?: number;
  loiter_radius?: number;
  activate?: number;
  heading?: number;
  zoom_level?: number;
  _targetName?: string | null;
}

interface BaseActionConfig {
  label: string;
  icon: string;
  color?: string;
  fields?: ActionFieldKey[];
  type: number;
  params: ActionParams;
}

export interface WeaponAction extends BaseActionConfig {
  category: "weapon";
  weaponKey: WeaponActionKey;
  weaponType: number;
}

export interface SensorAction extends BaseActionConfig {
  category: "sensor";
  sensorKey: SensorActionKey;
  sensorType: number;
}

export type ActionConfig = WeaponAction | SensorAction;

export interface ActionResult {
  status?: string;
  note?: string;
  hitEnemyId?: number | null;
  hitEnemyName?: string | null;
  hitEnemyDist?: number;
  distToTarget?: number;
  tgtLat?: number | null;
  tgtLon?: number | null;
  tgtName?: string | null;
  fireLat?: number;
  fireLon?: number;
  trackId?: number | null;
  burst?: number;
  of?: number;
  rounds?: number;
  ammoLeft?: number;
  dist?: number;
  rcwsRange?: number;
  totalRounds?: number;
}

export interface ActiveActResult {
  category: "weapon" | "sensor";
  weaponKey?: string;
  sensorKey?: string;
  label: string;
  icon?: string;
  color?: string;
  params?: ActionParams;
  at: number;
  result: ActionResult | null;
  fromConcurrent?: boolean;
  concWpName?: string;
}
