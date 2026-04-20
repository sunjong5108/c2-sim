/* Shared UI helper components */
import type { CSSProperties, ReactNode } from "react";
import { S } from "../styles/theme";

interface FieldProps {
  l: string;
  children: ReactNode;
  style?: CSSProperties;
}

export function F({ l, children, style }: FieldProps) {
  return (
    <div style={{ marginBottom: 8, ...style }}>
      <label
        style={{
          display: "block",
          fontSize: 9,
          fontWeight: 600,
          color: "#4a5e80",
          textTransform: "uppercase",
          letterSpacing: 0.8,
          marginBottom: 2,
        }}
      >
        {l}
      </label>
      {children}
    </div>
  );
}

interface WeaponFieldProps {
  l: string;
  s: string;
  v: number;
  set: (value: number) => void;
}

export function WF({ l, s, v, set }: WeaponFieldProps) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,.02)",
        border: "1px solid #1e2d4a",
        borderRadius: 5,
        padding: "4px 6px",
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 1 }}>{l}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input
          type="number"
          value={v}
          onChange={(e) => set(Math.max(0, +e.target.value))}
          min={0}
          style={{ ...S.inp, width: 42, padding: "2px 4px", textAlign: "center" }}
        />
        <span style={{ fontSize: 7, color: "#4a5e80" }}>{s}</span>
      </div>
    </div>
  );
}

interface MarkerTagProps {
  c: string;
  t: string;
}

export function MT({ c, t }: MarkerTagProps) {
  return (
    <span
      style={{
        fontSize: 7,
        color: c,
        background: c + "18",
        padding: "0 3px",
        borderRadius: 2,
        border: `1px solid ${c}30`,
        lineHeight: "12px",
        whiteSpace: "nowrap",
      }}
    >
      {t}
    </span>
  );
}

interface ModalProps {
  t: string;
  close: () => void;
  children: ReactNode;
  w?: number;
}

export function Mod({ t, close, children, w }: ModalProps) {
  return (
    <div style={S.mO} onClick={close}>
      <div style={{ ...S.m, width: w || 480 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{t}</h3>
        {children}
      </div>
    </div>
  );
}
