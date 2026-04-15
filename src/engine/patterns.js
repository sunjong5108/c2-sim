/* ═══════════════════════════════════════════════════════════
   C2 Protocol Simulator — Pattern Generators
   8자 기동, 타원 기동, 코너 스무딩
   ═══════════════════════════════════════════════════════════ */

import { hav, brg, mvPt } from "./geo.js";

// 파라메트릭 곡선 점군(pts)을 호장 균등 N+1개 점으로 리샘플.
// 곡선이 폐곡선(pts[0] ≈ pts[last])이라고 가정하고 시작점은 보존.
// 반환: { pts: [...N+1], total: 전체 호장(m) } — pts[N] === pts[0] 복제(폐합 보장).
function resampleUniformArcLen(pts, N) {
  const m = pts.length;
  const cum = [0];
  for (let i = 1; i < m; i++) {
    cum.push(cum[i - 1] + hav(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon));
  }
  const total = cum[m - 1];
  const out = [{ ...pts[0] }];
  if (total <= 0) {
    for (let i = 1; i <= N; i++) out.push({ ...pts[0] });
    return { pts: out, total: 0 };
  }
  const step = total / N;
  let j = 0;
  for (let k = 1; k < N; k++) {
    const target = k * step;
    while (j < m - 2 && cum[j + 1] < target) j++;
    const segLen = cum[j + 1] - cum[j];
    const t = segLen > 0 ? (target - cum[j]) / segLen : 0;
    const lat = pts[j].lat + (pts[j + 1].lat - pts[j].lat) * t;
    const lon = pts[j].lon + (pts[j + 1].lon - pts[j].lon) * t;
    out.push({
      ...pts[0],
      lat: Math.round(lat * 1e6) / 1e6,
      lon: Math.round(lon * 1e6) / 1e6,
    });
  }
  out.push({ ...pts[0] }); // 폐합
  return { pts: out, total };
}

// 호장 균등 리샘플 공개 헬퍼: 리더 sub-WP 배열에서 전체 호장 L 계산용.
export function pathArcLen(pts) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += hav(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
  }
  return total;
}

/**
 * 8자 기동 (차단선 기동) 경유점 생성기
 * Lissajous: x(t)=sin(t)*dist/2, y(t)=sin(2t)*lateral/2
 * → 파라메트릭 고해상도 샘플(NHi=1024) 후 호장 균등 N+1 점으로 리샘플.
 * 팔로워는 순환 인덱스 shift만으로 등호장 간격 유지 가능.
 * @param platformLen - 최대 플랫폼 길이 (최소 곡률 반경 보장용, 현재는 참조만)
 */
export function genFig8(oLat, oLon, dLat, dLon, lateralM, speed, speedUnit, platformLen, tPhase = 0, N = 64) {
  const midLat = (oLat + dLat) / 2, midLon = (oLon + dLon) / 2;
  const dist = hav(oLat, oLon, dLat, dLon);
  const axisB = brg(oLat, oLon, dLat, dLon);
  const perpB = (axisB + 90) % 360;
  const halfDist = dist / 2;
  const halfLat = lateralM / 2;
  const NHi = 1024;
  const raw = [];
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

/**
 * 타원 기동 경유점 생성기
 * x(t)=cos(t)*반장축, y(t)=sin(t)*반단축, t∈[0,2π]
 * → 파라메트릭 고해상도 샘플(NHi=1024) 후 호장 균등 N+1 점으로 리샘플.
 */
export function genEllipse(oLat, oLon, dLat, dLon, lateralM, speed, speedUnit, platformLen, tPhase = 0, N = 64) {
  const midLat = (oLat + dLat) / 2, midLon = (oLon + dLon) / 2;
  const dist = hav(oLat, oLon, dLat, dLon);
  const axisB = brg(oLat, oLon, dLat, dLon);
  const perpB = (axisB + 90) % 360;
  const a = dist / 2;        // semi-major axis
  const b = lateralM / 2;    // semi-minor axis
  const NHi = 1024;
  const raw = [];
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

/**
 * 선회율 기반 자동 경유점 삽입
 * 급선회 구간에 아크 경유점을 자동 생성하여 현실적 선회 경로 보장
 * @param pts - 경유점 배열
 * @param turnRate - 최대 선회율 (°/s)
 * @param speedMs - 이동 속도 (m/s)
 * @param platformLen - 플랫폼 길이 (m)
 */
export function insertTurnArc(pts, turnRate, speedMs, platformLen) {
  if (!turnRate || turnRate <= 0 || pts.length < 3 || speedMs <= 0) return pts;
  // 최소 선회 반경: r = V / (ω), ω = turnRate * π/180
  const minTurnR = Math.max(platformLen * 2, speedMs / (turnRate * Math.PI / 180));
  const threshold = 10; // 10° 이하 꺾임은 삽입 불필요
  const result = [{ ...pts[0] }];
  for (let i = 1; i < pts.length - 1; i++) {
    const b1 = brg(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
    const b2 = brg(pts[i].lat, pts[i].lon, pts[i + 1].lat, pts[i + 1].lon);
    let dAngle = b2 - b1;
    if (dAngle > 180) dAngle -= 360;
    if (dAngle < -180) dAngle += 360;
    const absAngle = Math.abs(dAngle);
    if (absAngle < threshold) { result.push({ ...pts[i] }); continue; }
    // 전후 구간 거리
    const d1 = hav(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
    const d2 = hav(pts[i].lat, pts[i].lon, pts[i + 1].lat, pts[i + 1].lon);
    // 아크 반경: 선회 반경, 전후 구간의 40% 중 작은 값
    const arcR = Math.min(minTurnR, d1 * 0.4, d2 * 0.4);
    // 아크 포인트 수: 각도가 클수록 많이 (10°마다 1포인트)
    const nArc = Math.max(3, Math.round(absAngle / 10));
    for (let j = 0; j <= nArc; j++) {
      const t = j / nArc;
      let iLat, iLon;
      if (t <= 0.5) {
        const seg = t * 2;
        [iLat, iLon] = mvPt(pts[i].lat, pts[i].lon, (b1 + 180) % 360, arcR * (1 - seg));
      } else {
        const seg = (t - 0.5) * 2;
        [iLat, iLon] = mvPt(pts[i].lat, pts[i].lon, b2, arcR * seg);
      }
      result.push({ ...pts[i], lat: Math.round(iLat * 1e6) / 1e6, lon: Math.round(iLon * 1e6) / 1e6 });
    }
  }
  result.push({ ...pts[pts.length - 1] });
  return result;
}
