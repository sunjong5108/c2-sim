/* ═══════════════════════════════════════════════════════════
   C2 Protocol Simulator — Constants
   ICD §2.1 플랫폼 레지스트리 + 무기/센서 정의
   ═══════════════════════════════════════════════════════════ */

import type {
  PlatformRegistryEntry,
  EnemyTypeEntry,
  WeaponStatus,
} from "../types/platform";
import type {
  WeaponActionDef,
  SensorActionDef,
  ActionFieldKey,
} from "../types/action";
import type { WaypointType } from "../types/waypoint";

export const KNOTS_TO_MS = 0.514444;
export const MS_TO_KNOTS = 1.94384;
export const EARTH_R = 6371000;
export const WP_ARRIVE_M = 2;
export const RADAR_RANGE = 15000;
export const SONOBUOY_RANGE = 5000;
export const TASS_RANGE = 8000;
export const TASS_OFFSET = 300;

export const PLAT_REG: readonly PlatformRegistryEntry[] = [
  { key: "해검S", prefix: 1100, cat: "USV", unit: "knots", label: "해검S (소형 USV)", len: 3, tr: 15,
    wpn: { sonobuoy: 0, blueshark: 0, rcws: 0, drone: 0 },
    sen: { tass: 0, "eo/ir": 1 },
    sr: { radar: 0, tass: 0, sonobuoy: 0, rcws: 0 } },
  { key: "해검3", prefix: 1200, cat: "USV", unit: "knots", label: "해검3 (중형 USV)", len: 6, tr: 10,
    wpn: { sonobuoy: 0, blueshark: 0, rcws: 0, drone: 0 },
    sen: { tass: 0, "eo/ir": 1 },
    sr: { radar: 15000, tass: 0, sonobuoy: 0, rcws: 0 } },
  { key: "해검5", prefix: 1300, cat: "USV", unit: "knots", label: "해검5 (대형 USV)", len: 9, tr: 8,
    wpn: { sonobuoy: 0, blueshark: 0, rcws: 0, drone: 0 },
    sen: { tass: 0, "eo/ir": 1 },
    sr: { radar: 15000, tass: 0, sonobuoy: 0, rcws: 0 } },
  { key: "전투용USV", prefix: 2100, cat: "USV", unit: "knots", label: "전투용 USV", len: 7, tr: 8,
    wpn: { sonobuoy: 0, blueshark: 0, rcws: 1, drone: 0, rcws_ammo: 200 },
    sen: { tass: 0, "eo/ir": 1 },
    sr: { radar: 15000, tass: 0, sonobuoy: 0, rcws: 2000 } },
  { key: "자폭용USV", prefix: 2200, cat: "USV", unit: "knots", label: "자폭용 USV", len: 3, tr: 15,
    wpn: { sonobuoy: 0, blueshark: 0, rcws: 0, drone: 0, rcws_ammo: 0 },
    sen: { tass: 0, "eo/ir": 0 },
    sr: { radar: 0, tass: 0, sonobuoy: 0, rcws: 0 } },
  { key: "유인구축함", prefix: 2300, cat: "SHIP", unit: "knots", label: "유인 구축함 (모함)", len: 150, tr: 1.5,
    wpn: { sonobuoy: 4, blueshark: 2, rcws: 1, drone: 2, rcws_ammo: 500 },
    sen: { tass: 1, "eo/ir": 1 },
    sr: { radar: 15000, tass: 8000, sonobuoy: 5000, rcws: 2000 } },
  { key: "자폭드론", prefix: 2400, cat: "UAV", unit: "m/s", label: "자폭 드론 (UAV)", len: 2, tr: 30,
    wpn: { sonobuoy: 0, blueshark: 0, rcws: 0, drone: 0 },
    sen: { tass: 0, "eo/ir": 0 },
    sr: { radar: 0, tass: 0, sonobuoy: 0, rcws: 0 } },
];

export const ENEMY_TYPES: readonly EnemyTypeEntry[] = [
  { key: "적수상함", cat: "ENEMY_SHIP", unit: "knots", label: "적 수상함", len: 120, tr: 2 },
  { key: "적잠수함", cat: "ENEMY_SUB", unit: "knots", label: "적 잠수함", len: 70, tr: 3 },
  { key: "적드론", cat: "ENEMY_UAV", unit: "m/s", label: "적 드론", len: 2, tr: 30 },
];

export const WPN_ACTS: readonly WeaponActionDef[] = [
  { key: "sonobuoy", type: 0, label: "소노부이 투하", icon: "🔵", color: "#06b6d4",
    fields: ["target_lat", "target_lon", "operating_depth", "active_duration"] },
  { key: "blueshark", type: 1, label: "청상어 발사", icon: "🔴", color: "#ef4444",
    fields: ["target_lat", "target_lon", "ref_track_id"] },
  { key: "rcws", type: 2, label: "RCWS 사격", icon: "🟠", color: "#f97316",
    fields: ["target_lat", "target_lon", "ref_track_id", "rounds_per_burst", "burst_count", "burst_interval"] },
  { key: "drone", type: 3, label: "자폭드론 발사", icon: "🟣", color: "#8b5cf6",
    fields: ["target_lat", "target_lon", "cruise_altitude", "cruise_speed", "loiter_radius"] },
];

export const SEN_ACTS: readonly SensorActionDef[] = [
  { key: "tass", type: 0, label: "TASS 활성화", icon: "📡", color: "#10b981", fields: ["activate"] },
  { key: "eoir", type: 1, label: "EO/IR 지향", icon: "📷", color: "#3b82f6",
    fields: ["target_lat", "target_lon", "heading", "zoom_level"] },
];

export const WP_TYPES: readonly WaypointType[] = [
  "이동", "정찰", "감시", "타격", "대기", "귀환",
  "소노부이투하", "8자기동", "타원기동", "충돌공격", "편대이동", "기타",
];
export const WP_TYPES_ENEMY: readonly WaypointType[] = [
  "이동", "정찰", "감시", "대기", "기동", "잠항", "기타",
];
export const WP_COLORS: Record<string, string> = {
  "이동": "#3b82f6", "정찰": "#06b6d4", "감시": "#8b5cf6", "타격": "#ef4444",
  "대기": "#6b7280", "귀환": "#10b981", "소노부이투하": "#06b6d4", "기동": "#f97316",
  "잠항": "#6366f1", "8자기동": "#ec4899", "타원기동": "#f59e0b",
  "충돌공격": "#dc2626", "편대이동": "#6366f1", "기타": "#f59e0b",
};

export const FIELD_LABELS: Record<ActionFieldKey, string> = {
  target_lat: "타겟 위도",
  target_lon: "타겟 경도",
  operating_depth: "운용수심(m)",
  active_duration: "운용시간(sec)",
  ref_track_id: "트랙ID",
  cruise_altitude: "순항고도(m)",
  cruise_speed: "순항속도(m/s)",
  loiter_radius: "선회반경(m)",
  activate: "ON/OFF",
  heading: "방위(deg)",
  zoom_level: "배율(1-3)",
  rounds_per_burst: "점사 발수",
  burst_count: "점사 횟수",
  burst_interval: "점사 간격(sec)",
};

export const UNIT_COLORS: readonly string[] = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#a855f7",
];

export function defaultWeaponStatus(platformKey: string): WeaponStatus {
  const r = PLAT_REG.find((x) => x.key === platformKey);
  if (!r) {
    return {
      consumable: { sonobuoy: 0, blueshark: 0, rcws: 0, drone: 0 },
      persistent: { tass: 0, "eo/ir": 0 },
    };
  }
  return { consumable: { ...r.wpn }, persistent: { ...r.sen } };
}
