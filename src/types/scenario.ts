/* ═══════════════════════════════════════════════════════════
   Scenario config (JSON import/export shape)
   ═══════════════════════════════════════════════════════════ */

import type { Unit } from "./unit";

export interface ScenarioConfig {
  version?: number;
  scenarioStart: string;
  totalDurationSec: number;
  tickIntervalSec?: number;
  units: Unit[];
}

export interface WeatherState {
  direction: number;
  speed: number;
  rainfall: number;
  state: number;
  snowfall: number;
}
