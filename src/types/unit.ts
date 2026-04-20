/* ═══════════════════════════════════════════════════════════
   Unit (top-level scenario entity) type
   ═══════════════════════════════════════════════════════════ */

import type {
  PlatformCategory,
  SpeedUnit,
  UnitSide,
  WeaponStatus,
  SensorRanges,
} from "./platform";
import type { WaypointGroup } from "./waypoint";

export interface Unit {
  name: string;
  side: UnitSide;
  type: PlatformCategory;
  platformType: string;
  platformId: number;
  platformLen: number;
  turnRate: number;
  speedUnit: SpeedUnit;
  weaponStatus: WeaponStatus;
  sensorRanges: SensorRanges;
  wps: WaypointGroup[];
}
