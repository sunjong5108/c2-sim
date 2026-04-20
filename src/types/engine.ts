/* ═══════════════════════════════════════════════════════════
   Engine runtime types: mutable platform state, snapshots,
   deployed munitions, detected tracks.
   ═══════════════════════════════════════════════════════════ */

import type { Unit } from "./unit";
import type { ActionConfig, ActiveActResult, ActionParams } from "./action";
import type { WaypointType } from "./waypoint";
import type { WeatherState } from "./scenario";

export interface PlatformTarget {
  lat: number;
  lon: number;
  alt: number;
  speed: number;
  speedDisp: number;
  speedUnit: string;
  maxSpeedMs: number;
  wpIdx: number;
  wpName: string;
  wpStart: number;
  wpEnd: number;
  wpType: WaypointType | string;
  isFirst: boolean;
  isLast: boolean;
  _trackId: number | null;
  _targetName: string | null;
  fig8: boolean;
  fig8LoopStart: number;
  fig8EndTime: number;
  formLeaderId: number | null;
  formOffset: number;
  formBarrier: boolean;
  formTotal: number;
  formPredecessorId: number | null;
  formTargetSpacing: number;
  actions: ActionConfig[];
  _actTrig: boolean;
}

export interface ScheduledActionGroup {
  time: number;
  endTime: number;
  actions: ActionConfig[];
  wpName: string;
  wpType: WaypointType | string;
  _fired: boolean;
}

export interface RcwsFiringSession {
  trackId: number | null;
  tgtLat: number | null;
  tgtLon: number | null;
  tgtName: string | null;
  rpb: number;
  bc: number;
  bi: number;
  firedBursts: number;
  nextBurstTime: number;
  startTime: number;
  totalRounds: number;
}

export interface DeployedSonobuoy {
  id: number;
  lat: number;
  lon: number;
  depth: number;
  duration: number;
  deployTime: number;
  range: number;
  parentId: number;
  parentName: string;
  deployFromLat: number;
  deployFromLon: number;
}

export type DronePhase = "cruise" | "attack_run" | "loiter" | "destroyed";

export interface DeployedDrone {
  id: number;
  lat: number;
  lon: number;
  alt: number;
  speed: number;
  loiter: number;
  deployTime: number;
  tgtLat: number | null;
  tgtLon: number | null;
  trackId: number | null;
  phase: DronePhase;
  active: boolean;
  parentId: number;
  curLat?: number;
  curLon?: number;
  destroyedAt?: number;
}

export interface PlatformState extends Unit {
  lat: number;
  lon: number;
  alt: number;
  heading: number;
  speedMs: number;
  fuel: number;
  curTgt: number;
  active: boolean;
  targets: PlatformTarget[];
  scheduledActs: ScheduledActionGroup[];
  suicideTrackId: number | null;
  arriveM: number;
  liveWpn: Record<string, number>;
  liveSen: Record<string, number>;
  initSen: Record<string, number>;
  rcws_ammo: number;
  rcwsFiring: RcwsFiringSession[];
  activeActs: ActiveActResult[];
  _suicideChecked?: boolean;
  sunkBy?: string;
  sunkAt?: number;
}

export interface DetectedTrack {
  sensorType: "RADAR" | "TASS" | "SONOBUOY";
  sensorId: number;
  sensorName: string;
  sLat: number;
  sLon: number;
  shipLat?: number;
  shipLon?: number;
  trackId: number;
  trackName: string;
  lat: number;
  lon: number;
  dist: number;
  bearing: number;
  heading?: number;
}

export interface PlatformSnapshot {
  id: number;
  name: string;
  type: string;
  pt: string;
  side: string;
  lat: number;
  lon: number;
  alt: number;
  hdg: number;
  spd: number;
  spdU: string;
  fuel: number;
  curTgt: number;
  totalTgts: number;
  totalWps: number;
  curWpName: string;
  active: boolean;
  lw: Record<string, number>;
  ls: Record<string, number>;
  iSen: Record<string, number>;
  acts: ActiveActResult[];
  rcws_ammo: number;
  rcwsFiring: RcwsFiringSession[];
  suicideTrackId: number | null;
  formLeaderId: number | null;
  formOffset: number;
}

export interface EnemySnapshot {
  id: number;
  lat: number;
  lon: number;
  hdg: number;
  spd: number;
  active: boolean;
  pt: string;
  type: string;
}

export interface Snapshot {
  t: number;
  abs: string;
  platforms: PlatformSnapshot[];
  enemies: EnemySnapshot[];
  sonobuoys: DeployedSonobuoy[];
  drones: DeployedDrone[];
  weather: WeatherState;
  detectedTracks: DetectedTrack[];
}

export interface ResolvedTarget {
  lat: number | null | undefined;
  lon: number | null | undefined;
  name: string | null;
  id: number | null | undefined;
  live: boolean;
  destroyed?: boolean;
}

export type { ActionParams };
