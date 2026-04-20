/* ═══════════════════════════════════════════════════════════
   C2 Protocol Simulator — Pattern Generators
   8자 기동, 타원 기동, 코너 스무딩
   ═══════════════════════════════════════════════════════════ */

import { hav, brg, mvPt } from "./geo";
import type { Waypoint } from "../types/waypoint";
import type { SpeedUnit } from "../types/platform";

interface ResampleResult {
  pts: Waypoint[];
  total: number;
}

// 파라메트릭 곡선 점군(pts)을 호장 균등 N+1개 점으로 리샘플.
function resampleUniformArcLen(pts: Waypoint[], N: number): ResampleResult {
  const m = pts.length;
  const cum: number[] = [0];
  for (let i = 1; i < m; i++) {
    cum.push(cum[i - 1]! + hav(pts[i - 1]!.lat, pts[i - 1]!.lon, pts[i]!.lat, pts[i]!.lon));
  }
  const total = cum[m - 1]!;
  const out: Waypoint[] = [{ ...pts[0]! }];
  if (total <= 0) {
    for (let i = 1; i <= N; i++) out.push({ ...pts[0]! });
    return { pts: out, total: 0 };
  }
  const step = total / N;
  let j = 0;
  for (let k = 1; k < N; k++) {
    const target = k * step;
    while (j < m - 2 && cum[j + 1]! < target) j++;
    const segLen = cum[j + 1]! - cum[j]!;
    const t = segLen > 0 ? (target - cum[j]!) / segLen : 0;
    const lat = pts[j]!.lat + (pts[j + 1]!.lat - pts[j]!.lat) * t;
    const lon = pts[j]!.lon + (pts[j + 1]!.lon - pts[j]!.lon) * t;
    out.push({
      ...pts[0]!,
      lat: Math.round(lat * 1e6) / 1e6,
      lon: Math.round(lon * 1e6) / 1e6,
    });
  }
  out.push({ ...pts[0]! }); // 폐합
  return { pts: out, total };
}

/** 호장 균등 리샘플 공개 헬퍼 */
export function pathArcLen(pts: Waypoint[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += hav(pts[i - 1]!.lat, pts[i - 1]!.lon, pts[i]!.lat, pts[i]!.lon);
  }
  return total;
}

/** 8자 기동 (차단선 기동) 경유점 생성기 */
export function genFig8(
  oLat: number,
  oLon: number,
  dLat: number,
  dLon: number,
  lateralM: number,
  speed: number,
  speedUnit: SpeedUnit,
  _platformLen?: number,
  tPhase = 0,
  N = 64,
): Waypoint[] {
  const midLat = (oLat + dLat) / 2;
  const midLon = (oLon + dLon) / 2;
  const dist = hav(oLat, oLon, dLat, dLon);
  const axisB = brg(oLat, oLon, dLat, dLon);
  const perpB = (axisB + 90) % 360;
  const halfDist = dist / 2;
  const halfLat = lateralM / 2;
  const NHi = 1024;
  const raw: Waypoint[] = [];
  for (let i = 0; i <= NHi; i++) {
    const t = tPhase + (i / NHi) * 2 * Math.PI;
    const xOff = Math.sin(t) * halfDist;
    const yOff = Math.sin(2 * t) * halfLat;
    const [pLat1, pLon1] = mvPt(midLat, midLon, axisB, xOff);
    const [pLat2, pLon2] = mvPt(pLat1, pLon1, perpB, yOff);
    raw.push({ lat: pLat2, lon: pLon2, alt: 0, speed, speedUnit });
  }
  return resampleUniformArcLen(raw, N).pts;
}

/** 타원 기동 경유점 생성기 */
export function genEllipse(
  oLat: number,
  oLon: number,
  dLat: number,
  dLon: number,
  lateralM: number,
  speed: number,
  speedUnit: SpeedUnit,
  _platformLen?: number,
  tPhase = 0,
  N = 64,
): Waypoint[] {
  const midLat = (oLat + dLat) / 2;
  const midLon = (oLon + dLon) / 2;
  const dist = hav(oLat, oLon, dLat, dLon);
  const axisB = brg(oLat, oLon, dLat, dLon);
  const perpB = (axisB + 90) % 360;
  const a = dist / 2;
  const b = lateralM / 2;
  const NHi = 1024;
  const raw: Waypoint[] = [];
  for (let i = 0; i <= NHi; i++) {
    const t = tPhase + (i / NHi) * 2 * Math.PI;
    const xOff = Math.cos(t) * a;
    const yOff = Math.sin(t) * b;
    const [pLat1, pLon1] = mvPt(midLat, midLon, axisB, xOff);
    const [pLat2, pLon2] = mvPt(pLat1, pLon1, perpB, yOff);
    raw.push({ lat: pLat2, lon: pLon2, alt: 0, speed, speedUnit });
  }
  return resampleUniformArcLen(raw, N).pts;
}

/** 선회율 기반 자동 경유점 삽입 */
export function insertTurnArc(
  pts: Waypoint[],
  turnRate: number,
  speedMs: number,
  platformLen: number,
): Waypoint[] {
  if (!turnRate || turnRate <= 0 || pts.length < 3 || speedMs <= 0) return pts;
  const minTurnR = Math.max(platformLen * 2, speedMs / ((turnRate * Math.PI) / 180));
  const threshold = 10;
  const result: Waypoint[] = [{ ...pts[0]! }];
  for (let i = 1; i < pts.length - 1; i++) {
    const b1 = brg(pts[i - 1]!.lat, pts[i - 1]!.lon, pts[i]!.lat, pts[i]!.lon);
    const b2 = brg(pts[i]!.lat, pts[i]!.lon, pts[i + 1]!.lat, pts[i + 1]!.lon);
    let dAngle = b2 - b1;
    if (dAngle > 180) dAngle -= 360;
    if (dAngle < -180) dAngle += 360;
    const absAngle = Math.abs(dAngle);
    if (absAngle < threshold) {
      result.push({ ...pts[i]! });
      continue;
    }
    const d1 = hav(pts[i - 1]!.lat, pts[i - 1]!.lon, pts[i]!.lat, pts[i]!.lon);
    const d2 = hav(pts[i]!.lat, pts[i]!.lon, pts[i + 1]!.lat, pts[i + 1]!.lon);
    const arcR = Math.min(minTurnR, d1 * 0.4, d2 * 0.4);
    const nArc = Math.max(3, Math.round(absAngle / 10));
    for (let j = 0; j <= nArc; j++) {
      const t = j / nArc;
      let iLat: number;
      let iLon: number;
      if (t <= 0.5) {
        const seg = t * 2;
        [iLat, iLon] = mvPt(pts[i]!.lat, pts[i]!.lon, (b1 + 180) % 360, arcR * (1 - seg));
      } else {
        const seg = (t - 0.5) * 2;
        [iLat, iLon] = mvPt(pts[i]!.lat, pts[i]!.lon, b2, arcR * seg);
      }
      result.push({
        ...pts[i]!,
        lat: Math.round(iLat * 1e6) / 1e6,
        lon: Math.round(iLon * 1e6) / 1e6,
      });
    }
  }
  result.push({ ...pts[pts.length - 1]! });
  return result;
}
