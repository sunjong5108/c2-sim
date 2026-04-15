/* ═══════════════════════════════════════════════════════════
   useSimEngine — Custom hook for simulation engine lifecycle
   엔진 인스턴스 관리, 시나리오 로드, 틱 실행
   ═══════════════════════════════════════════════════════════ */

import { useRef, useState, useCallback, useEffect } from "react";
import { SimEngine } from "../engine/index.js";

const TICK_INTERVAL = 200; // ms
const DT = 0.2;            // seconds per tick

export default function useSimEngine() {
  const engRef = useRef(null);
  const timerRef = useRef(null);
  const [snapshot, setSnapshot] = useState(null);
  const [simRunning, setSimRunning] = useState(false);
  const [simSpeed, setSimSpeedState] = useState(1);
  const [simTime, setSimTime] = useState(0);

  // Lazy init engine
  if (!engRef.current) {
    engRef.current = new SimEngine();
  }

  const engine = engRef.current;

  /** 시나리오 로드 */
  const loadScenario = useCallback((scenarioConfig) => {
    engine.load(scenarioConfig);
    setSnapshot(engine.snap());
    setSimTime(0);
    setSimRunning(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, [engine]);

  /** 시뮬레이션 시작 */
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

  /** 시뮬레이션 일시정지 */
  const pause = useCallback(() => {
    engine.running = false;
    setSimRunning(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, [engine]);

  /** 시뮬레이션 리셋 */
  const reset = useCallback(() => {
    pause();
    engine.simTime = 0;
    engine.history = [];
    engine.deployedSonobuoys = [];
    engine.deployedDrones = [];
    engine.platforms.forEach(p => {
      p.curTgt = 0; p.active = true; p.speedMs = 0; p.fuel = p.side === "enemy" ? 0 : 100;
      p.liveWpn = { ...(p.weaponStatus?.consumable || {}) };
      p.liveSen = { ...(p.weaponStatus?.persistent || {}) };
      p.rcwsFiring = []; p.activeActs = [];
      p.heading = 0; p._suicideChecked = false;
      if (p.targets) p.targets.forEach(t => { t._actTrig = false; });
      if (p.scheduledActs) p.scheduledActs.forEach(sa => { sa._fired = false; });
      const firstWp = p.wps?.[0]?.waypoints?.[0];
      if (firstWp) { p.lat = firstWp.lat; p.lon = firstWp.lon; }
    });
    setSnapshot(engine.snap());
    setSimTime(0);
  }, [engine, pause]);

  /** 속도 배율 변경 */
  const setSimSpeed = useCallback((spd) => {
    engine.speed = spd;
    setSimSpeedState(spd);
  }, [engine]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  return {
    engine,        // 엔진 인스턴스 직접 접근 (CSV 생성 등)
    snapshot,      // 현재 프레임 스냅샷
    simTime,       // 현재 시뮬레이션 시간 (초)
    simRunning,    // 실행 중 여부
    simSpeed,      // 속도 배율
    loadScenario,  // 시나리오 로드
    start,         // 시작
    pause,         // 일시정지
    reset,         // 리셋
    setSimSpeed,   // 속도 변경
  };
}
