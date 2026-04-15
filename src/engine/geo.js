/* ═══════════════════════════════════════════════════════════
   C2 Protocol Simulator — Geo Utilities
   Great Circle 항법 함수 + 단위 변환
   ═══════════════════════════════════════════════════════════ */

import { EARTH_R, KNOTS_TO_MS, MS_TO_KNOTS } from "./constants.js";

export const toRad = d => d * Math.PI / 180;
export const toDeg = r => r * 180 / Math.PI;

/** Haversine 거리 (m) */
export function hav(lat1, lon1, lat2, lon2) {
  const [r1, r2, dl, dn] = [toRad(lat1), toRad(lat2), toRad(lat2 - lat1), toRad(lon2 - lon1)];
  const h = Math.sin(dl / 2) ** 2 + Math.cos(r1) * Math.cos(r2) * Math.sin(dn / 2) ** 2;
  return EARTH_R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** 방위각 (degrees, 0=N, 90=E) */
export function brg(lat1, lon1, lat2, lon2) {
  const [r1, r2, dn] = [toRad(lat1), toRad(lat2), toRad(lon2 - lon1)];
  return (toDeg(Math.atan2(
    Math.sin(dn) * Math.cos(r2),
    Math.cos(r1) * Math.sin(r2) - Math.sin(r1) * Math.cos(r2) * Math.cos(dn)
  )) + 360) % 360;
}

/** 위치 이동 (lat, lon, bearing°, distance m) → [newLat, newLon] */
export function mvPt(la, lo, b, d) {
  const dd = d / EARTH_R, br = toRad(b), l1 = toRad(la), o1 = toRad(lo);
  const l2 = Math.asin(Math.sin(l1) * Math.cos(dd) + Math.cos(l1) * Math.sin(dd) * Math.cos(br));
  return [
    toDeg(l2),
    toDeg(o1 + Math.atan2(Math.sin(br) * Math.sin(dd) * Math.cos(l1), Math.cos(dd) - Math.sin(l1) * Math.sin(l2)))
  ];
}

/** 속도 변환: 표시 단위 → m/s */
export function sMs(v, unit) { return unit === "knots" ? v * KNOTS_TO_MS : v; }

/** 속도 변환: m/s → 표시 단위 */
export function mDs(v, unit) { return unit === "knots" ? v * MS_TO_KNOTS : v; }

/** 초 → HH:MM:SS */
export function hms(s) {
  s = Math.round(Math.max(0, s));
  return `${String(Math.floor(s / 3600) % 24).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** 초 → 경과시간 표시 (3m45s) */
export function ela(s) {
  s = Math.round(s);
  const m = Math.floor(s / 60), r = s % 60;
  return m === 0 ? r + "s" : r === 0 ? m + "m" : `${m}m${String(r).padStart(2, '0')}s`;
}

/** Gantt 레인 계산: 동시 실행 WP 레이아웃 */
export function cLanes(wps) {
  if (!wps.length) return { count: 1, map: [] };
  const s = wps.map((w, i) => ({ ...w, oi: i })).sort((a, b) => a.start - b.start);
  const e = [], m = new Array(wps.length);
  for (const w of s) {
    const en = w.start + w.duration;
    let p = false;
    for (let l = 0; l < e.length; l++) {
      if (w.start >= e[l]) { e[l] = en; m[w.oi] = l; p = true; break; }
    }
    if (!p) { m[w.oi] = e.length; e.push(en); }
  }
  return { count: Math.max(e.length, 1), map: m };
}

/** CSV 다운로드 헬퍼 */
export function dlCSV(name, data) {
  const b = new Blob(["\uFEFF" + data], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
