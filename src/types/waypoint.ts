/* ═══════════════════════════════════════════════════════════
   Waypoint and WP-group (sub-scenario) types
   ═══════════════════════════════════════════════════════════ */

import type { SpeedUnit } from "./platform";
import type { ActionConfig } from "./action";

export type WaypointType =
  | "이동"
  | "정찰"
  | "감시"
  | "타격"
  | "대기"
  | "귀환"
  | "소노부이투하"
  | "8자기동"
  | "타원기동"
  | "충돌공격"
  | "편대이동"
  | "기동"
  | "잠항"
  | "기타";

export interface Waypoint {
  lat: number;
  lon: number;
  alt?: number;
  speed: number;
  speedUnit: SpeedUnit;
  _trackId?: number | null;
  _targetName?: string | null;
  _formBarrier?: boolean;
  _formTotal?: number;
}

export type FormationRole = "leader" | "member";

export interface FormationConfig {
  role: FormationRole;
  leaderId?: number | null;
  predecessorId?: number | null;
  spacing: number;
  total: number;
  offset: number;
}

export interface PatternCenterConfig {
  oLat: number;
  oLon: number;
  dLat: number;
  dLon: number;
  range: number;
}

export interface SonobuoyConfig {
  depth: number;
  duration: number;
}

export interface CollisionTarget {
  id: number;
  name: string;
}

export interface WaypointGroup {
  name: string;
  start: number;
  duration: number;
  type: WaypointType;
  concurrent: boolean;
  waypoints: Waypoint[];
  actions: ActionConfig[];
  formation?: FormationConfig | null;
  maxSpeed?: number;
  maxSpeedUnit?: SpeedUnit;
  sonobuoyConfig?: SonobuoyConfig;
  fig8Config?: PatternCenterConfig;
  ellipseConfig?: PatternCenterConfig;
  fig8Loop?: boolean;
  collisionTarget?: CollisionTarget;
}
