/* ═══════════════════════════════════════════════════════════
   Platform registry types (ICD §2.1)
   ═══════════════════════════════════════════════════════════ */

export type SpeedUnit = "knots" | "m/s";

export type PlatformCategory = "USV" | "SHIP" | "UAV" | "ENEMY_SHIP" | "ENEMY_SUB" | "ENEMY_UAV";

export type UnitSide = "friendly" | "enemy";

export interface WeaponConfig {
  sonobuoy: number;
  blueshark: number;
  rcws: number;
  drone: number;
  rcws_ammo?: number;
}

export interface SensorConfig {
  tass: number;
  "eo/ir": number;
}

export interface SensorRanges {
  radar: number;
  tass: number;
  sonobuoy: number;
  rcws: number;
}

export interface PlatformRegistryEntry {
  key: string;
  prefix: number;
  cat: PlatformCategory;
  unit: SpeedUnit;
  label: string;
  len: number;
  tr: number;
  wpn: WeaponConfig;
  sen: SensorConfig;
  sr: SensorRanges;
}

export interface EnemyTypeEntry {
  key: string;
  cat: PlatformCategory;
  unit: SpeedUnit;
  label: string;
  len: number;
  tr: number;
}

export interface WeaponStatus {
  consumable: Partial<WeaponConfig> & Record<string, number | undefined>;
  persistent: Partial<SensorConfig> & Record<string, number | undefined>;
}
