/* ═══════════════════════════════════════════════════════════
   C2 Protocol Simulator — Formation Utilities
   편대 오프셋, 속도 동기화, 대형 배치
   ═══════════════════════════════════════════════════════════ */

import { hav, brg, mvPt, sMs, mDs } from "./geo.js";

/**
 * 편대 오프셋 계산: 리더=중앙(0), 팔로워 좌우 교대
 * idx 0 → 0 (리더, 중앙)
 * idx 1 → -spacing (좌1)
 * idx 2 → +spacing (우1)
 * idx 3 → -2×spacing (좌2)
 * idx 4 → +2×spacing (우2)
 */
export function formOff(idx, total, spacing) {
  if (idx === 0) return 0;
  const rank = Math.ceil(idx / 2);
  const side = idx % 2 === 1 ? -1 : 1;
  return side * rank * spacing;
}

/**
 * 편대원 간 최소 이격거리 (CPA 기반 안전 검사)
 * ─ COLREGs / USV 스웜 충돌회피 교리의 CPA(Closest Point of Approach) 개념
 * ─ 모든 편대원이 같은 속도 스텝으로 같은 인덱스를 지나간다고 가정하고
 *   인덱스별 쌍 거리를 전수 검사. 최소 거리가 Ship Safety Distance 미만이면 위험.
 * @returns { minD, worst: {i, j, k} }
 */
export function minPairwiseDistance(allMemberPts) {
  let minD = Infinity;
  let worst = null;
  const M = allMemberPts.length;
  for (let i = 0; i < M; i++) {
    for (let j = i + 1; j < M; j++) {
      const a = allMemberPts[i], b = allMemberPts[j];
      const len = Math.min(a.length, b.length);
      for (let k = 0; k < len; k++) {
        const d = hav(a[k].lat, a[k].lon, b[k].lat, b[k].lon);
        if (d < minD) { minD = d; worst = { i, j, k, d }; }
      }
    }
  }
  return { minD: minD === Infinity ? 0 : minD, worst };
}

/**
 * 경로 오프셋: 구간별 수직 방향으로 경유점 이동
 * 편대이동용 (꺾이는 구간도 간격 유지)
 */
export function offsetRoute(pts, offM) {
  if (pts.length < 2) return pts.map(p => ({ ...p }));
  return pts.map((p, i) => {
    let perpB;
    if (i === 0) perpB = (brg(pts[0].lat, pts[0].lon, pts[1].lat, pts[1].lon) + 90) % 360;
    else if (i === pts.length - 1) perpB = (brg(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon) + 90) % 360;
    else {
      const b1 = brg(pts[i - 1].lat, pts[i - 1].lon, p.lat, p.lon);
      const b2 = brg(p.lat, p.lon, pts[i + 1].lat, pts[i + 1].lon);
      let avg = (b1 + b2) / 2;
      if (Math.abs(b1 - b2) > 180) avg += 180;
      perpB = (avg + 90) % 360;
    }
    const [la, lo] = mvPt(p.lat, p.lon, perpB, offM);
    return { ...p, lat: Math.round(la * 1e6) / 1e6, lon: Math.round(lo * 1e6) / 1e6 };
  });
}

/**
 * 편대 속도 동기화 (해군 Wheel in Line Abreast 원리)
 * 가장 긴 구간 유닛 = 설정 속도 (최대), 나머지 = 거리 비례 감속
 * → 설정 속도를 초과하는 유닛 없음
 * → 모든 유닛이 같은 시간에 다음 경유점 도착
 */
export function syncFormAll(allPts) {
  if (allPts.length < 2 || allPts[0].length < 2) return allPts;
  const n = allPts[0].length;
  if (!allPts.every(pts => pts.length === n)) return allPts;
  const result = allPts.map(pts => pts.map(p => ({ ...p })));
  for (let i = 0; i < n - 1; i++) {
    const dists = allPts.map(pts => hav(pts[i].lat, pts[i].lon, pts[i + 1].lat, pts[i + 1].lon));
    const maxDist = Math.max(...dists);
    const setSpd = allPts[0][i].speed || allPts[0][i + 1].speed || 1;
    const unit = allPts[0][i].speedUnit || "knots";
    if (maxDist < 0.1) {
      for (let m = 0; m < allPts.length; m++) {
        result[m][i].speed = setSpd;
        result[m][i].speedUnit = unit;
      }
      continue;
    }
    // segTime = 가장 긴 구간 / 설정 속도 → 가장 빠른 유닛 = 설정 속도
    const segTime = maxDist / sMs(setSpd, unit);
    for (let m = 0; m < allPts.length; m++) {
      const mSpd = dists[m] / segTime; // m/s
      result[m][i].speed = Math.round(mDs(mSpd, unit) * 1e6) / 1e6;
      result[m][i].speedUnit = unit;
    }
  }
  for (let m = 0; m < allPts.length; m++) {
    result[m][n - 1].speed = allPts[0][n - 1].speed;
    result[m][n - 1].speedUnit = allPts[0][n - 1].speedUnit;
  }
  return result;
}
