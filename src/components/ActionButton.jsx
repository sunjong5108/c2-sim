import { F } from "./UIHelpers.jsx";
import { FIELD_LABELS } from "../engine/constants.js";
const FL = FIELD_LABELS;
import { S } from "../styles/theme.js";
import { useState } from "react";


export default function AB({act,rem,onAdd,isSensor,dLat,dLon,enemies}){
  const[o,setO]=useState(false);const[p,setP]=useState({});const[selTgt,setSelTgt]=useState("");
  const hasTarget=act.fields.some(f=>f==="target_lat"||f==="target_lon");
  const init=()=>{const x={};act.fields.forEach(f=>{x[f]=f==="target_lat"?dLat:f==="target_lon"?dLon:f==="operating_depth"?50:f==="active_duration"?300:f==="cruise_altitude"?200:f==="cruise_speed"?40:f==="loiter_radius"?500:f==="activate"?1:f==="zoom_level"?1:f==="rounds_per_burst"?5:f==="burst_count"?3:f==="burst_interval"?2:0;});setP(x);setSelTgt("");};
  const dis=!isSensor&&rem<=0;
  const selectEnemy=(eid)=>{
    setSelTgt(eid);
    if(!eid){return;}
    const en=(enemies||[]).find(e=>String(e.platformId)===eid);
    if(!en)return;
    // Get enemy's first waypoint position as target (or initial position)
    const eLat=en.wps?.[0]?.waypoints?.[0]?.lat||35.1;
    const eLon=en.wps?.[0]?.waypoints?.[0]?.lon||129.0;
    setP(prev=>({...prev,target_lat:eLat,target_lon:eLon,ref_track_id:en.platformId}));
  };
  return(<div style={{marginBottom:3}}>
    <button onClick={()=>{if(!dis){init();setO(!o);}}} style={{...S.btn,width:"100%",justifyContent:"flex-start",padding:"3px 8px",opacity:dis?.35:1,cursor:dis?"not-allowed":"pointer",borderColor:o?act.color:"#1e2d4a"}}>
      <span>{act.icon}</span><span style={{flex:1,textAlign:"left",fontSize:9}}>{act.label}</span>
      <span style={{fontSize:8,color:rem>0||isSensor?"#10b981":"#ef4444"}}>{isSensor?(rem>0?"탑재":"X"):`잔:${rem}`}</span>
    </button>
    {o&&<div style={{background:"rgba(255,255,255,0.02)",border:`1px solid ${act.color}30`,borderRadius:5,padding:6,marginTop:2}}>
      {/* ── 표적 선택 드롭다운 (target_lat/lon 필드가 있는 무장만) ── */}
      {hasTarget&&(enemies||[]).length>0&&(
        <div style={{marginBottom:6,padding:4,background:"rgba(239,68,68,0.06)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:4}}>
          <label style={{display:"block",fontSize:8,fontWeight:700,color:"#ef4444",marginBottom:3,textTransform:"uppercase",letterSpacing:.5}}>🎯 표적 선택 (자동 좌표 입력)</label>
          <select value={selTgt} onChange={e=>selectEnemy(e.target.value)} style={{...S.inp,fontSize:10,borderColor:"rgba(239,68,68,0.3)"}}>
            <option value="">— 직접 좌표 입력 —</option>
            {(enemies||[]).map(en=>{
              const eLat=en.wps?.[0]?.waypoints?.[0]?.lat;
              const eLon=en.wps?.[0]?.waypoints?.[0]?.lon;
              return <option key={en.platformId} value={en.platformId}>
                [{en.platformType}] {en.name} (ID:{en.platformId}) {eLat!=null?`— ${eLat.toFixed(4)}, ${eLon?.toFixed(4)}`:""}
              </option>;
            })}
          </select>
          {selTgt&&<div style={{fontSize:8,color:"#10b981",marginTop:2}}>✓ 선택된 표적의 위치가 자동 입력되었습니다</div>}
        </div>
      )}
      {hasTarget&&!(enemies||[]).length&&(
        <div style={{fontSize:8,color:"#4a5e80",marginBottom:4,padding:3,background:"rgba(255,255,255,0.02)",borderRadius:3}}>
          ℹ 적군 유닛이 없습니다. 좌표를 직접 입력하세요.
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
        {act.fields.map(f=><F key={f} l={FL[f]||f} style={{marginBottom:2}}>
          {f==="activate"?<select value={p[f]??1} onChange={e=>setP(x=>({...x,[f]:+e.target.value}))} style={S.inp}><option value={1}>ON</option><option value={0}>OFF</option></select>
            :<input type="number" step={f.includes("lat")||f.includes("lon")?.0001:1} value={p[f]??""} onChange={e=>{setP(x=>({...x,[f]:+e.target.value}));if(f==="target_lat"||f==="target_lon")setSelTgt("");}} style={{...S.inp,...(selTgt&&(f==="target_lat"||f==="target_lon")?{borderColor:"rgba(16,185,129,0.4)",background:"rgba(16,185,129,0.05)"}:{})}}/>}
        </F>)}
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:4,marginTop:3}}>
        <button style={{...S.btn,fontSize:9,padding:"2px 6px"}} onClick={()=>setO(false)}>취소</button>
        <button style={{...S.btnP,fontSize:9,padding:"2px 6px"}} onClick={()=>{onAdd({...p,_targetName:selTgt?(enemies||[]).find(e=>String(e.platformId)===selTgt)?.name:null});setO(false);}}>추가</button>
      </div>
    </div>}
  </div>);
}

// ═══ Scenario Tab ═══