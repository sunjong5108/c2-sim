/* ═══════════════════════════════════════════════════════════
   useSimEngine — Custom hook for simulation engine lifecycle
   엔진 인스턴스 관리, 시나리오 로드, 틱 실행
   ═══════════════════════════════════════════════════════════ */

import { useRef, useState, useCallback, useEffect } from "react";
import { SimEngine } from "../engine";
import type { Snapshot } from "../types/engine";
import type { ScenarioConfig } from "../types/scenario";

const TICK_INTERVAL = 200;
const DT = 0.2;

export interface UseSimEngineReturn {
  engine: SimEngine;
  snapshot: Snapshot | null;
  simTime: number;
  simRunning: boolean;
  simSpeed: number;
  loadScenario: (scenarioConfig: ScenarioConfig) => void;
  start: () => void;
  pause: () => void;
  reset: () => void;
  setSimSpeed: (spd: number) => void;
}

export default function useSimEngine(): UseSimEngineReturn {
  const engRef = useRef<SimEngine | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [simRunning, setSimRunning] = useState(false);
  const [simSpeed, setSimSpeedState] = useState(1);
  const [simTime, setSimTime] = useState(0);

  if (!engRef.current) {
    engRef.current = new SimEngine();
  }

  const engine = engRef.current;

  const loadScenario = useCallback(
    (scenarioConfig: ScenarioConfig) => {
      engine.load(scenarioConfig);
      setSnapshot(engine.snap());
      setSimTime(0);
      setSimRunning(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    },
    [engine],
  );

  const start = useCallback(() => {
    if (timerRef.current) return;
    engine.running = true;
    setSimRunning(true);
    timerRef.current = setInterval(() => {
      const snap = engine.tick(DT);
      setSnapshot(snap);
      setSimTime(engine.simTime);
    }, TICK_INTERVAL);
  }, [engine]);

  const pause = useCallback(() => {
    engine.running = false;
    setSimRunning(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [engine]);

  const reset = useCallback(() => {
    pause();
    engine.simTime = 0;
    engine.history = [];
    engine.deployedSonobuoys = [];
    engine.deployedDrones = [];
    engine.platforms.forEach((p) => {
      p.curTgt = 0;
      p.active = true;
      p.speedMs = 0;
      p.fuel = p.side === "enemy" ? 0 : 100;
      p.liveWpn = { ...(p.weaponStatus?.consumable || {}) } as Record<string, number>;
      p.liveSen = { ...(p.weaponStatus?.persistent || {}) } as Record<string, number>;
      p.rcwsFiring = [];
      p.activeActs = [];
      p.heading = 0;
      p._suicideChecked = false;
      if (p.targets) p.targets.forEach((t) => { t._actTrig = false; });
      if (p.scheduledActs) p.scheduledActs.forEach((sa) => { sa._fired = false; });
      const firstWp = p.wps?.[0]?.waypoints?.[0];
      if (firstWp) {
        p.lat = firstWp.lat;
        p.lon = firstWp.lon;
      }
    });
    setSnapshot(engine.snap());
    setSimTime(0);
  }, [engine, pause]);

  const setSimSpeed = useCallback(
    (spd: number) => {
      engine.speed = spd;
      setSimSpeedState(spd);
    },
    [engine],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return {
    engine,
    snapshot,
    simTime,
    simRunning,
    simSpeed,
    loadScenario,
    start,
    pause,
    reset,
    setSimSpeed,
  };
}
