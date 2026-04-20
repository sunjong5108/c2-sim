import { useState, useRef, useEffect, useMemo } from "react";
import { MT } from "./UIHelpers";
import { S } from "../styles/theme";
import { hms, ela, cLanes } from "../engine/geo";
import { WP_COLORS, UNIT_COLORS } from "../engine/constants";
import type { Unit } from "../types/unit";

const UC = UNIT_COLORS;

interface ScenarioTabProps {
  units: Unit[];
  sel: number;
  setSel: (i: number) => void;
  scStart: string;
  setScStart: (v: string) => void;
  durM: number;
  setDurM: (v: number) => void;
  durS: number;
  setDurS: (v: number) => void;
  totSec: number;
  tick: number;
  setTick: (v: number) => void;
  oAU: () => void;
  oAW: () => void;
  eU: (i: number) => void;
  eW: (ui: number, wi: number) => void;
  dU: (i: number) => void;
  dW: (ui: number, wi: number) => void;
  eJ: () => void;
  iJ: () => void;
}

export default function ScTab({
  units,
  sel,
  setSel,
  scStart,
  setScStart,
  durM,
  setDurM,
  durS,
  setDurS,
  totSec,
  tick,
  setTick,
  oAU,
  oAW,
  eU,
  eW,
  dU,
  dW,
  eJ,
  iJ,
}: ScenarioTabProps) {
  const gR = useRef<HTMLDivElement | null>(null);
  const [gW, setGW] = useState(800);
  useEffect(() => {
    const el = gR.current;
    if (el) setGW(el.clientWidth);
    const o = new ResizeObserver((e) => {
      if (e[0]) setGW(e[0].contentRect.width);
    });
    if (el) o.observe(el);
    return () => o.disconnect();
  }, []);
  const iW = Math.max(gW, totSec * Math.max(gW / totSec, 0.5));
  const sS = useMemo(() => {
    const p = scStart.split(":");
    return (+(p[0] ?? 0) || 0) * 3600 + (+(p[1] ?? 0) || 0) * 60;
  }, [scStart]);
  const lanes = useMemo(() => units.map((u) => cLanes(u.wps)), [units]);
  const LH = 38;
  const BH = 28;
  const PD = 6;
  const rH = (lc: number) => PD * 2 + lc * LH;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
      <div style={S.tb}>
        <div style={S.tbG}>
          <span style={S.tbL}>시작</span>
          <input
            type="time"
            value={scStart}
            onChange={(e) => setScStart(e.target.value)}
            step="1"
            style={{ ...S.inp, width: 82 }}
          />
        </div>
        <div style={S.tbG}>
          <span style={S.tbL}>전체</span>
          <input
            type="number"
            value={durM}
            onChange={(e) => setDurM(+e.target.value)}
            min={0}
            style={{ ...S.inp, width: 44, textAlign: "center" }}
          />
          <span style={{ fontSize: 8, color: "#4a5e80" }}>m</span>
          <input
            type="number"
            value={durS}
            onChange={(e) => setDurS(+e.target.value)}
            min={0}
            max={59}
            style={{ ...S.inp, width: 44, textAlign: "center" }}
          />
          <span style={{ fontSize: 8, color: "#4a5e80" }}>s</span>
        </div>
        <div style={S.tbG}>
          <select value={tick} onChange={(e) => setTick(+e.target.value)} style={S.inp}>
            {[30, 60, 120, 300, 600, 900, 1800].map((v) => (
              <option key={v} value={v}>
                {v < 60 ? v + "s" : v / 60 + "m"}
              </option>
            ))}
          </select>
        </div>
        <div style={S.tbG}>
          <span style={S.tD}>
            {hms(sS)}—{hms(sS + totSec)}
          </span>
        </div>
        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          <button style={S.btnP} onClick={oAU}>
            ＋유닛
          </button>
          <button style={S.btn} onClick={oAW}>
            ＋WP
          </button>
          <button style={S.btn} onClick={eJ}>
            ⬇
          </button>
          <button style={S.btn} onClick={iJ}>
            ⬆
          </button>
        </div>
      </div>
      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
        <div style={S.side}>
          <div style={S.sideH}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#8899b4" }}>유닛</span>
            <span style={{ fontSize: 9, color: "#4a5e80" }}>{units.length}</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {!units.length ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "#4a5e80",
                  fontSize: 11,
                }}
              >
                유닛 추가
              </div>
            ) : (
              units.map((u, i) => {
                const lc = lanes[i]?.count || 1;
                const ws = u.weaponStatus?.consumable || {};
                const ps = u.weaponStatus?.persistent || {};
                const tWps = u.wps.reduce((s, w) => s + (w.waypoints?.length || 0), 0);
                return (
                  <div
                    key={i}
                    onClick={() => setSel(i)}
                    onDoubleClick={() => eU(i)}
                    style={{
                      ...S.uRow,
                      minHeight: rH(lc),
                      background: i === sel ? "rgba(59,130,246,.1)" : "transparent",
                      borderLeft: i === sel ? "3px solid #3b82f6" : "3px solid transparent",
                    }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: u.side === "enemy" ? "#ef4444" : UC[i % UC.length],
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          lineHeight: "15px",
                        }}
                      >
                        [{u.side === "enemy" ? "적" : "아"}] {u.name}
                      </div>
                      <div style={{ display: "flex", gap: 2, flexWrap: "nowrap", overflow: "hidden", marginTop: 1 }}>
                        <MT c="#4a5e80" t={u.wps.length + "WP"} />
                        <MT c="#06b6d4" t={tWps + "pt"} />
                        <MT c="#f59e0b" t={u.platformType} />
                        <MT c="#8899b4" t={"ID:" + u.platformId} />
                        <MT c="#4a5e80" t={(u.platformLen || 10) + "m"} />
                      </div>
                      {u.side !== "enemy" && (
                        <div style={{ display: "flex", gap: 2, marginTop: 1, overflow: "hidden" }}>
                          {(ws.sonobuoy ?? 0) > 0 && <MT c="#06b6d4" t={"S" + ws.sonobuoy} />}
                          {(ws.blueshark ?? 0) > 0 && <MT c="#ef4444" t={"B" + ws.blueshark} />}
                          {(ws.rcws ?? 0) > 0 && <MT c="#f97316" t="R" />}
                          {(ws.drone ?? 0) > 0 && <MT c="#8b5cf6" t={"D" + ws.drone} />}
                          {(ps.tass ?? 0) > 0 && <MT c="#10b981" t="T" />}
                          {(ps["eo/ir"] ?? 0) > 0 && <MT c="#3b82f6" t="E" />}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        eU(i);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#3b82f6",
                        cursor: "pointer",
                        opacity: 0.4,
                        fontSize: 10,
                        flexShrink: 0,
                      }}
                      title="편집"
                    >
                      ✎
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        dU(i);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#ef4444",
                        cursor: "pointer",
                        opacity: 0.4,
                        fontSize: 11,
                        flexShrink: 0,
                      }}
                      title="삭제"
                    >
                      ✕
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }} ref={gR}>
          <div style={{ height: 32, borderBottom: "1px solid #1e2d4a", background: "#111827", overflowX: "auto", flexShrink: 0 }}>
            <div style={{ width: iW, height: "100%", position: "relative" }}>
              {Array.from({ length: Math.floor(totSec / tick) + 1 }, (_, i) => i * tick).map((s) => (
                <div
                  key={s}
                  style={{
                    position: "absolute",
                    left: (s / totSec) * iW,
                    top: 0,
                    height: "100%",
                    borderLeft: "1px solid rgba(30,45,74,.6)",
                    display: "flex",
                    alignItems: "center",
                    paddingLeft: 4,
                    fontSize: 9,
                    color: s % (tick * 2) === 0 ? "#8899b4" : "#4a5e80",
                  }}
                >
                  {hms(sS + s)}
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, overflow: "auto", position: "relative", minHeight: 0 }}>
            <div style={{ width: iW, minHeight: "100%", position: "relative" }}>
              {!units.length ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: 200,
                    color: "#4a5e80",
                    fontSize: 11,
                  }}
                >
                  📊
                </div>
              ) : (
                units.map((u, ui) => {
                  const ld = lanes[ui] || { count: 1, map: [] };
                  return (
                    <div
                      key={ui}
                      style={{
                        height: rH(ld.count),
                        borderBottom: "1px solid #1e2d4a",
                        position: "relative",
                        background: ui % 2 === 0 ? "rgba(22,33,55,.5)" : "rgba(17,24,39,.5)",
                      }}
                      onDoubleClick={() => {
                        setSel(ui);
                        oAW();
                      }}
                    >
                      {Array.from({ length: Math.floor(totSec / tick) + 1 }, (_, i) => i * tick).map((s) => (
                        <div
                          key={s}
                          style={{
                            position: "absolute",
                            top: 0,
                            bottom: 0,
                            left: (s / totSec) * iW,
                            width: 1,
                            background: "rgba(30,45,74,.35)",
                            pointerEvents: "none",
                          }}
                        />
                      ))}
                      {u.wps.map((wp, wi) => {
                        const ln = ld.map[wi] || 0;
                        const l = (wp.start / totSec) * iW;
                        const bw = Math.max((wp.duration / totSec) * iW, 20);
                        const t = PD + ln * LH + (LH - BH) / 2;
                        const c = wp.concurrent
                          ? "#a855f7"
                          : WP_COLORS[wp.type] || UC[ui % UC.length];
                        const ac = wp.actions?.length || 0;
                        const nPts = wp.waypoints?.length || 0;
                        const isConc = wp.concurrent;
                        return (
                          <div
                            key={wi}
                            title={`${wp.name} | ${ela(wp.duration)} | ${
                              isConc ? "동시실행" : nPts + "경유점"
                            } | ${ac}액션 | 클릭:편집 우클릭:삭제`}
                            onClick={() => eW(ui, wi)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              if (confirm(`삭제: ${wp.name}?`)) dW(ui, wi);
                            }}
                            style={{
                              position: "absolute",
                              left: l,
                              width: bw,
                              top: t,
                              height: BH,
                              borderRadius: 4,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              padding: "0 5px",
                              fontSize: 9,
                              fontWeight: 600,
                              color: "#fff",
                              background: isConc
                                ? `repeating-linear-gradient(135deg,${c}cc,${c}cc 4px,${c}99 4px,${c}99 8px)`
                                : `linear-gradient(135deg,${c},${c}dd)`,
                              borderLeft: `3px solid ${c}`,
                              boxShadow: "0 1px 4px rgba(0,0,0,.3)",
                              overflow: "hidden",
                              whiteSpace: "nowrap",
                              zIndex: 2,
                              borderStyle: isConc ? "dashed" : "solid",
                              borderWidth: isConc ? "1px" : "0",
                              borderColor: isConc ? c + "80" : "transparent",
                              borderLeftStyle: "solid",
                              borderLeftWidth: "3px",
                            }}
                          >
                            {ld.count > 1 && (
                              <span style={{ opacity: 0.5, fontSize: 7, marginRight: 2 }}>L{ln + 1}</span>
                            )}
                            {isConc && <span style={{ fontSize: 7, marginRight: 2 }}>⚡</span>}
                            <span>{wp.name}</span>
                            {!isConc && nPts > 1 && (
                              <span
                                style={{
                                  marginLeft: 3,
                                  fontSize: 7,
                                  background: "rgba(255,255,255,.2)",
                                  padding: "0 3px",
                                  borderRadius: 2,
                                }}
                              >
                                {wp.type === "소노부이투하"
                                  ? "🔵"
                                  : wp.type === "8자기동"
                                    ? "∞"
                                    : wp.type === "타원기동"
                                      ? "⊙"
                                      : wp.type === "충돌공격"
                                        ? "💥"
                                        : wp.type === "편대이동"
                                          ? "👥"
                                          : "📍"}
                                {nPts}
                              </span>
                            )}
                            {wp.collisionTarget && (
                              <span
                                style={{
                                  marginLeft: 2,
                                  fontSize: 7,
                                  background: "rgba(220,38,38,.3)",
                                  padding: "0 3px",
                                  borderRadius: 2,
                                }}
                              >
                                →{wp.collisionTarget.name}
                              </span>
                            )}
                            {wp.formation && (
                              <span
                                style={{
                                  marginLeft: 2,
                                  fontSize: 7,
                                  background: "rgba(99,102,241,.3)",
                                  padding: "0 3px",
                                  borderRadius: 2,
                                }}
                              >
                                👥{wp.formation.role === "leader" ? "L" : "M"}
                                {wp.formation.offset > 0 ? "+" : ""}
                                {wp.formation.offset}m
                              </span>
                            )}
                            {ac > 0 && wp.type !== "소노부이투하" && (
                              <span
                                style={{
                                  marginLeft: 2,
                                  fontSize: 7,
                                  background: "rgba(255,255,255,.2)",
                                  padding: "0 3px",
                                  borderRadius: 2,
                                }}
                              >
                                🎯{ac}
                              </span>
                            )}
                            {!isConc && (
                              <span
                                style={{
                                  marginLeft: "auto",
                                  fontSize: 8,
                                  opacity: 0.7,
                                  paddingLeft: 3,
                                }}
                              >
                                {wp.waypoints?.[0]?.speed || 0}
                                {(wp.waypoints?.[0]?.speedUnit || "knots") === "knots" ? "kt" : "m/s"}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
      <div style={S.sum}>
        <span>
          유닛:<b>{units.length}</b>
        </span>
        <span>
          WP:<b>{units.reduce((s, u) => s + u.wps.length, 0)}</b>
        </span>
        <span>
          경유점:
          <b style={{ color: "#06b6d4" }}>
            {units.reduce(
              (s, u) => s + u.wps.reduce((ss, w) => ss + (w.concurrent ? 0 : w.waypoints?.length || 0), 0),
              0,
            )}
          </b>
        </span>
        <span>
          동시:
          <b style={{ color: "#a855f7" }}>
            {units.reduce((s, u) => s + u.wps.filter((w) => w.concurrent).length, 0)}
          </b>
        </span>
        <span>
          액션:
          <b style={{ color: "#ef4444" }}>
            {units.reduce((s, u) => s + u.wps.reduce((ss, w) => ss + (w.actions?.length || 0), 0), 0)}
          </b>
        </span>
      </div>
    </div>
  );
}
