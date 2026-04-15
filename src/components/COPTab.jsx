import { S } from "../styles/theme.js";
import { SONOBUOY_RANGE, UNIT_COLORS } from "../engine/constants.js";
import { hms, ela } from "../engine/geo.js";
import { useState, useRef, useEffect } from "react";

const UC = UNIT_COLORS;

export default function COPTab({units,ss,sRun,sSp,setSSp,totSec,oSt,oSp,oRs}){
  const cR=useRef(null);const[mc,setMc]=useState({lat:35.12,lon:129.08});const[zm,setZm]=useState(.5);
  useEffect(()=>{const la=[],lo=[];units.forEach(u=>u.wps.forEach(w=>(w.waypoints||[]).forEach(p=>{la.push(p.lat);lo.push(p.lon);})));
    if(la.length){setMc({lat:(Math.min(...la)+Math.max(...la))/2,lon:(Math.min(...lo)+Math.max(...lo))/2});setZm(Math.min(2,.15/Math.max(Math.max(...la)-Math.min(...la),Math.max(...lo)-Math.min(...lo),.01)));}},[units]);

  useEffect(()=>{const c=cR.current;if(!c)return;const ctx=c.getContext("2d");const dpr=window.devicePixelRatio||1;const W=c.offsetWidth,H=c.offsetHeight;c.width=W*dpr;c.height=H*dpr;ctx.scale(dpr,dpr);
    ctx.fillStyle="#0a0e17";ctx.fillRect(0,0,W,H);const ppd=W*zm*100;const toX=lon=>W/2+(lon-mc.lon)*ppd;const toY=lat=>H/2-(lat-mc.lat)*ppd;
    ctx.strokeStyle="rgba(30,45,74,.4)";ctx.lineWidth=.5;const gs=zm>1?.01:zm>.3?.05:.1;
    for(let lat=Math.floor((mc.lat-H/2/ppd)/gs)*gs;lat<=mc.lat+H/2/ppd;lat+=gs){const y=toY(lat);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();ctx.fillStyle="#4a5e80";ctx.font="9px monospace";ctx.fillText(lat.toFixed(3),4,y-3);}
    for(let lon=Math.floor((mc.lon-W/2/ppd)/gs)*gs;lon<=mc.lon+W/2/ppd;lon+=gs){const x=toX(lon);ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();ctx.fillText(lon.toFixed(3),x+3,12);}
    // WP paths (all waypoints connected)
    units.forEach((u,ui)=>{const co=u.side==="enemy"?"#ef4444":UC[ui%UC.length];ctx.strokeStyle=co+"40";ctx.lineWidth=1.5;ctx.setLineDash([4,4]);
      const pts=u.wps.flatMap(w=>w.waypoints||[]);
      if(pts.length>1){ctx.beginPath();ctx.moveTo(toX(pts[0].lon),toY(pts[0].lat));for(let i=1;i<pts.length;i++)ctx.lineTo(toX(pts[i].lon),toY(pts[i].lat));ctx.stroke();}
      ctx.setLineDash([]);pts.forEach((p,i)=>{const x=toX(p.lon),y=toY(p.lat);ctx.fillStyle=co+"60";ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();ctx.fillStyle=co;ctx.font="7px monospace";ctx.fillText(`#${i+1}`,x+5,y-2);});});
    // Live platforms
    (ss?.platforms||[]).forEach(p=>{const x=toX(p.lon),y=toY(p.lat),co=p.side==="enemy"?"#ef4444":"#3b82f6",hr=(p.hdg-90)*Math.PI/180;
      // Draw RCWS range circle for friendly with RCWS
      if(p.side!=="enemy"&&p.lw?.rcws>0){
        const pf=units.find(u=>u.platformId===p.id);
        const rcwsR=pf?.sensorRanges?.rcws||2000;
        const rcwsPx=rcwsR/111320*ppd;
        ctx.strokeStyle="rgba(249,115,22,0.25)";ctx.lineWidth=1;ctx.setLineDash([3,3]);
        ctx.beginPath();ctx.arc(x,y,rcwsPx,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
        ctx.fillStyle="rgba(249,115,22,0.05)";ctx.beginPath();ctx.arc(x,y,rcwsPx,0,Math.PI*2);ctx.fill();
      }
      // Skip rendering destroyed platforms (draw X instead)
      if(!p.active){
        ctx.strokeStyle="#ef4444";ctx.lineWidth=3;
        ctx.beginPath();ctx.moveTo(x-8,y-8);ctx.lineTo(x+8,y+8);ctx.stroke();
        ctx.beginPath();ctx.moveTo(x+8,y-8);ctx.lineTo(x-8,y+8);ctx.stroke();
        ctx.fillStyle="#ef4444";ctx.font="bold 9px monospace";ctx.fillText(p.name+" ✕",x+12,y+3);
        return;
      }
      ctx.strokeStyle=co;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(hr)*18,y+Math.sin(hr)*18);ctx.stroke();
      ctx.save();ctx.translate(x,y);ctx.rotate(hr+Math.PI/2);ctx.fillStyle=co;ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(-7,8);ctx.lineTo(7,8);ctx.closePath();ctx.fill();ctx.strokeStyle="#fff";ctx.lineWidth=1;ctx.stroke();ctx.restore();
      ctx.fillStyle="#e2e8f0";ctx.font="bold 10px monospace";ctx.fillText(p.name,x+14,y-6);ctx.fillStyle="#8899b4";ctx.font="9px monospace";
      ctx.fillText(`${p.spd.toFixed(1)}${p.spdU} ${p.curWpName}`,x+14,y+5);
      if(p.alt!==0){ctx.fillStyle=p.alt<0?"#6366f1":"#f59e0b";ctx.fillText(`${p.alt>0?"▲":"▼"}${Math.abs(p.alt).toFixed(0)}m`,x+14,y+16);ctx.fillStyle="#8899b4";}
      if(p.side!=="enemy")ctx.fillText(`⛽${p.fuel.toFixed(0)}%`,x+14,y+(p.alt!==0?27:16));
      // ── 충돌공격 실시간 추적선 ──
      if(p.suicideTrackId&&p.active){
        const tracked=(ss?.platforms||[]).find(ep=>ep.id===p.suicideTrackId&&ep.side==="enemy");
        if(tracked){
          const tx=toX(tracked.lon),ty=toY(tracked.lat);
          ctx.strokeStyle="#ef444480";ctx.lineWidth=1.5;ctx.setLineDash([4,4]);
          ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(tx,ty);ctx.stroke();ctx.setLineDash([]);
          ctx.fillStyle="#ef4444";ctx.font="7px monospace";ctx.fillText(`🎯 ${tracked.name}`,x+14,y+(p.alt!==0?38:27));
        }
      }
      // Draw engagement lines + results
      if(p.acts?.length){let ey=y+27;
        for(const a of p.acts){if(!a.result)continue;
          const st=a.result.status;
          const isSunk=st?.includes("SUNK")||st?.includes("KAMIKAZE");
          const isDmg=st==="DAMAGE"||st==="BURST_FIRE";
          const isMiss=st?.includes("MISS")||st==="OUT_OF_RANGE";
          // 좌표: result에 실시간 좌표가 있으면 우선, 없으면 params 정적 좌표 사용
          const aTgtLat=a.result.tgtLat??a.params?.target_lat;
          const aTgtLon=a.result.tgtLon??a.params?.target_lon;
          // Draw attack line to target
          if(aTgtLat!=null&&aTgtLon!=null&&(isSunk||isDmg)){
            const tx=toX(aTgtLon),ty=toY(aTgtLat);
            const lc=isSunk?"#ef4444":isDmg?"#f97316":"#8899b4";
            ctx.strokeStyle=lc;ctx.lineWidth=isSunk?2:1;ctx.setLineDash(isSunk?[]:[2,2]);
            ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(tx,ty);ctx.stroke();ctx.setLineDash([]);
            // Explosion marker for sunk
            if(isSunk){ctx.fillStyle="#ef4444";ctx.font="14px sans-serif";ctx.fillText("💥",tx-7,ty+5);}
          }
          // Text label
          const col=isSunk?"#ef4444":isDmg?"#f97316":isMiss?"#6b7280":"#8899b4";
          ctx.fillStyle=col;ctx.font="bold 8px monospace";
          const lbl=`${a.icon||"•"} ${st}${a.result.hitEnemyName?` → ${a.result.hitEnemyName}`:""}${a.result.distToTarget!=null?` (${a.result.distToTarget}m)`:""}`;
          ctx.fillText(lbl,x+14,ey);ey+=10;
        }
      }
    });
    // Deployed sonobuoys (투하 연출 + 탐지 범위)
    (ss?.sonobuoys||[]).forEach(sb=>{
      const x=toX(sb.lon),y=toY(sb.lat);
      const elapsed=ss.t-sb.deployTime;const remaining=sb.duration-elapsed;
      const isActive=remaining>0;
      // 탐지 범위 원
      if(isActive){
        const rPx=(sb.range||SONOBUOY_RANGE)/111320*ppd;
        ctx.strokeStyle="rgba(6,182,212,0.15)";ctx.lineWidth=1;ctx.setLineDash([2,3]);
        ctx.beginPath();ctx.arc(x,y,rPx,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
        ctx.fillStyle="rgba(6,182,212,0.03)";ctx.beginPath();ctx.arc(x,y,rPx,0,Math.PI*2);ctx.fill();
      }
      // 소노부이 마커
      ctx.fillStyle=isActive?"#06b6d4":"#4a5e80";ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=isActive?"#06b6d4":"#4a5e80";ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.stroke();
      ctx.font="bold 7px monospace";ctx.fillStyle=isActive?"#06b6d4":"#4a5e80";
      ctx.fillText(`SB-${sb.id}`,x+8,y-2);
      ctx.font="6px monospace";ctx.fillStyle="#4a5e80";
      ctx.fillText(isActive?`${Math.round(remaining)}s | ${sb.depth||50}m`:"만료",x+8,y+7);
      // 투하 모함 연결선 (투하 직후 몇 초간)
      if(elapsed<10&&sb.deployFromLat){
        const fx=toX(sb.deployFromLon),fy=toY(sb.deployFromLat);
        ctx.strokeStyle="#06b6d440";ctx.lineWidth=1;ctx.setLineDash([2,2]);
        ctx.beginPath();ctx.moveTo(fx,fy);ctx.lineTo(x,y);ctx.stroke();ctx.setLineDash([]);
      }
    });
    // Deployed drones (active ones)
    (ss?.drones||[]).filter(d=>d.active).forEach(d=>{
      const x=toX(d.curLon||d.lon),y=toY(d.curLat||d.lat);
      ctx.fillStyle="#8b5cf6";ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();
      ctx.font="8px monospace";ctx.fillStyle="#8b5cf6";ctx.fillText(`DR ${d.phase||""}`,x+7,y+3);
      // Draw drone→target line if attacking
      if(d.tgtLat!=null&&d.tgtLon!=null&&d.phase==="attack_run"){
        const tx=toX(d.tgtLon),ty=toY(d.tgtLat);
        ctx.strokeStyle="#8b5cf640";ctx.lineWidth=1;ctx.setLineDash([2,2]);
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(tx,ty);ctx.stroke();ctx.setLineDash([]);
      }
    });
    // ── RCWS 사격 중 표시 ──
    (ss?.platforms||[]).forEach(p=>{
      if(!p.active||!p.rcwsFiring?.length)return;
      const px=toX(p.lon),py=toY(p.lat);
      for(const f of p.rcwsFiring){
        if(f.firedBursts>=f.bc||!f.tgtLat)continue;
        const tx=toX(f.tgtLon),ty=toY(f.tgtLat);
        // 사격선 (주황 실선 + 애니메이션 효과)
        ctx.strokeStyle="#f97316";ctx.lineWidth=2;ctx.setLineDash([]);
        ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(tx,ty);ctx.stroke();
        // 탄착점 표시
        ctx.fillStyle="#f97316";ctx.beginPath();ctx.arc(tx,ty,4,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle="#f9731660";ctx.lineWidth=1;ctx.beginPath();ctx.arc(tx,ty,8,0,Math.PI*2);ctx.stroke();
        // 사격 정보
        ctx.fillStyle="#f97316";ctx.font="bold 8px monospace";
        ctx.fillText(`🔥 ${f.firedBursts}/${f.bc} (${p.rcws_ammo}발)`,px+14,py-16);
        if(f.tgtName)ctx.fillText(`→ ${f.tgtName}`,px+14,py-26);
      }
    });
    // ── 센서 탐지 트랙 표시 ──
    const drawnTracks=new Set();
    (ss?.detectedTracks||[]).forEach(dt=>{
      const tKey=`${dt.trackId}`;
      const tx=toX(dt.lon),ty=toY(dt.lat);
      const sc=dt.sensorType==="RADAR"?"#3b82f6":dt.sensorType==="TASS"?"#10b981":"#06b6d4";
      // Track ID 라벨 (한 번만)
      if(!drawnTracks.has(tKey)){
        drawnTracks.add(tKey);
        ctx.strokeStyle=sc;ctx.lineWidth=1.5;ctx.setLineDash([3,3]);
        ctx.beginPath();ctx.arc(tx,ty,12,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
        ctx.fillStyle=sc;ctx.font="bold 8px monospace";
        ctx.fillText(`TRK-${dt.trackId}`,tx+15,ty-10);
        ctx.font="7px monospace";ctx.fillStyle="#8899b4";
        ctx.fillText(dt.trackName,tx+15,ty);
      }
      // 센서별 탐지선
      if(dt.sensorType==="TASS"&&dt.sLat!=null){
        const sx=toX(dt.sLon),sy=toY(dt.sLat); // TASS 센서 위치 (모함 후방 300m)
        // TASS 센서 마커 (작은 녹색 다이아몬드)
        ctx.fillStyle="#10b981";ctx.save();ctx.translate(sx,sy);ctx.rotate(Math.PI/4);
        ctx.fillRect(-3,-3,6,6);ctx.restore();
        // 모함→TASS 연결선
        if(dt.shipLat!=null){
          const shx=toX(dt.shipLon),shy=toY(dt.shipLat);
          ctx.strokeStyle="#10b98140";ctx.lineWidth=0.8;ctx.setLineDash([2,2]);
          ctx.beginPath();ctx.moveTo(shx,shy);ctx.lineTo(sx,sy);ctx.stroke();ctx.setLineDash([]);
          // 모함 heading 방향 표시 (짧은 녹색 선)
          if(dt.heading!=null){
            const hr=(dt.heading-90)*Math.PI/180;
            ctx.strokeStyle="#10b98160";ctx.lineWidth=1.5;ctx.setLineDash([]);
            ctx.beginPath();ctx.moveTo(shx,shy);ctx.lineTo(shx+Math.cos(hr)*20,shy+Math.sin(hr)*20);ctx.stroke();
            ctx.fillStyle="#10b98180";ctx.font="6px monospace";
            ctx.fillText(`HDG${dt.heading}°`,shx+Math.cos(hr)*22,shy+Math.sin(hr)*22);
          }
        }
        // Bearing 선: TASS→표적 (녹색 실선)
        ctx.strokeStyle="#10b981";ctx.lineWidth=1.5;ctx.setLineDash([]);
        ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(tx,ty);ctx.stroke();
        // Bearing + 거리 라벨
        const mx=(sx+tx)/2,my=(sy+ty)/2;
        ctx.fillStyle="#10b981";ctx.font="bold 7px monospace";
        ctx.fillText(`BRG ${dt.bearing}°`,mx+4,my-4);
        ctx.font="6px monospace";ctx.fillStyle="#10b98180";
        ctx.fillText(`${dt.dist}m`,mx+4,my+5);
      } else if(dt.sensorType==="SONOBUOY"&&dt.sLat!=null){
        // 소노부이→표적 탐지선 (시안 점선)
        const sx=toX(dt.sLon),sy=toY(dt.sLat);
        ctx.strokeStyle="#06b6d4";ctx.lineWidth=1.2;ctx.setLineDash([4,3]);
        ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(tx,ty);ctx.stroke();ctx.setLineDash([]);
        // 거리 라벨
        const mx=(sx+tx)/2,my=(sy+ty)/2;
        ctx.fillStyle="#06b6d4";ctx.font="7px monospace";
        ctx.fillText(`${dt.dist}m BRG${dt.bearing}°`,mx+4,my-2);
      } else if(dt.sensorType==="RADAR"&&dt.sLat!=null){
        // 레이더: 센서→표적 얇은 점선
        const sx=toX(dt.sLon),sy=toY(dt.sLat);
        ctx.strokeStyle="#3b82f640";ctx.lineWidth=0.7;ctx.setLineDash([2,4]);
        ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(tx,ty);ctx.stroke();ctx.setLineDash([]);
      }
      // 센서 유형 뱃지
      ctx.fillStyle=sc;ctx.font="6px monospace";
      if(dt.sensorType==="TASS")ctx.fillText(`TASS HDG:${dt.heading||0}° BRG:${dt.bearing}°`,tx+15,ty+9);
      else ctx.fillText(dt.sensorType+(dt.bearing!=null?` BRG:${dt.bearing}°`:""),tx+15,ty+9);
    });
    // Scale
    const sm=zm>.5?1000:5000,sp=sm/111320*ppd;ctx.strokeStyle="#8899b4";ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(20,H-30);ctx.lineTo(20+sp,H-30);ctx.stroke();ctx.fillStyle="#8899b4";ctx.font="10px monospace";ctx.fillText(sm>=1000?sm/1000+"km":sm+"m",20+sp/2-10,H-38);
  },[ss,units,mc,zm]);

  const wh=e=>{e.preventDefault();setZm(z=>Math.max(.05,Math.min(5,z*(e.deltaY<0?1.15:.87))));};
  const dr=useRef(null);
  return(<div style={{display:"flex",flexDirection:"column",flex:1,minHeight:0,overflow:"hidden"}}>
    <div style={S.tb}><div style={S.tbG}>{!sRun?<button style={S.btnP} onClick={oSt}>▶</button>:<button style={{...S.btn,borderColor:"#f59e0b",color:"#f59e0b"}} onClick={oSp}>⏸</button>}<button style={S.btn} onClick={oRs}>↺</button></div>
      <div style={S.tbG}>{[1,2,5,10,30].map(s=><button key={s} onClick={()=>setSSp(s)} style={{...S.btn,padding:"3px 7px",fontSize:9,...(sSp===s?{background:"rgba(59,130,246,.2)",borderColor:"#3b82f6",color:"#3b82f6"}:{})}}>{`×${s}`}</button>)}</div>
      <div style={S.tbG}><button style={{...S.btn,padding:"3px 8px"}} onClick={()=>setZm(z=>Math.min(5,z*1.3))}>+</button><button style={{...S.btn,padding:"3px 8px"}} onClick={()=>setZm(z=>Math.max(.05,z*.7))}>−</button></div>
      {ss&&<div style={{marginLeft:"auto",display:"flex",gap:6}}><span style={S.tD}>T+{ela(ss.t)}</span><span style={S.tD}>{ss.abs}</span></div>}
    </div>
    <div style={{flex:1,position:"relative",overflow:"hidden"}}>
      <canvas ref={cR} style={{width:"100%",height:"100%",cursor:"grab"}} onWheel={wh}
        onMouseDown={e=>{dr.current={x:e.clientX,y:e.clientY,lat:mc.lat,lon:mc.lon};}}
        onMouseMove={e=>{if(!dr.current)return;const ppd=cR.current.offsetWidth*zm*100;setMc({lat:dr.current.lat+(e.clientY-dr.current.y)/ppd,lon:dr.current.lon-(e.clientX-dr.current.x)/ppd});}}
        onMouseUp={()=>{dr.current=null;}} onMouseLeave={()=>{dr.current=null;}}/>
      <div style={{position:"absolute",top:8,right:8,width:260,maxHeight:"70%",overflowY:"auto",background:"rgba(10,14,23,.92)",border:"1px solid #1e2d4a",borderRadius:8,padding:8}}>
        <div style={{fontSize:9,color:"#4a5e80",fontWeight:600,marginBottom:4}}>플랫폼 현황</div>
        {(ss?.platforms||[]).map((p,i)=><div key={i} style={{padding:"3px 0",borderBottom:"1px solid #1e2d4a",fontSize:9,opacity:p.active?1:.5}}>
          <div style={{display:"flex",gap:3,alignItems:"center"}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:p.side==="enemy"?"#ef4444":"#3b82f6"}}/>
            <b>{p.name}</b>
            {!p.active&&<span style={{color:"#ef4444",fontSize:8,fontWeight:700}}>파괴</span>}
            <span style={{color:"#4a5e80",marginLeft:"auto"}}>{p.pt}</span>
          </div>
          <div style={{color:"#4a5e80",paddingLeft:9}}>{p.lat.toFixed(4)},{p.lon.toFixed(4)} | {p.spd.toFixed(1)}{p.spdU}{p.alt!==0?` | ${p.alt>0?"▲":"▼"}${Math.abs(p.alt)}m`:""}{p.side!=="enemy"?` ⛽${p.fuel.toFixed(0)}%`:""}</div>
          {p.rcws_ammo>0&&<div style={{paddingLeft:9,fontSize:7,color:"#f97316"}}>🟠 RCWS 잔탄: {p.rcws_ammo}발{p.rcwsFiring?.length>0?` | 🔥사격중 (${p.rcwsFiring.filter(f=>f.firedBursts<f.bc).length}세션)`:""}</div>}
          {p.acts?.filter(a=>a.result).slice(-3).map((a,j)=>{
            const st=a.result.status;
            const col=st?.includes("SUNK")||st?.includes("KAMIKAZE")?"#ef4444":st==="DAMAGE"?"#f97316":st?.includes("MISS")||st==="OUT_OF_RANGE"?"#6b7280":"#8899b4";
            return(<div key={j} style={{paddingLeft:9,marginTop:1}}>
              <span style={{color:col,fontSize:8,fontWeight:600}}>
                {a.icon} {st}
                {a.result.distToTarget!=null&&` (${a.result.distToTarget}m`}
                {a.result.rcwsRange!=null&&`/${a.result.rcwsRange}m)`}
                {a.result.hitEnemyName&&` → ${a.result.hitEnemyName}`}
              </span>
              {a.result.note&&<div style={{fontSize:7,color:"#4a5e80",paddingLeft:0}}>{a.result.note}</div>}
            </div>);
          })}
        </div>)}
        {/* ── 탐지 현황 ── */}
        {(ss?.detectedTracks||[]).length>0&&<>
          <div style={{fontSize:9,color:"#06b6d4",fontWeight:600,marginTop:6,marginBottom:3,borderTop:"1px solid #1e2d4a",paddingTop:4}}>📡 탐지 현황 ({(ss?.detectedTracks||[]).length})</div>
          {[...new Map((ss?.detectedTracks||[]).map(t=>[t.trackId,t])).values()].map((dt,i)=>{
            const sensors=(ss?.detectedTracks||[]).filter(t=>t.trackId===dt.trackId);
            const sc=dt.sensorType==="RADAR"?"#3b82f6":dt.sensorType==="TASS"?"#10b981":"#06b6d4";
            return(<div key={i} style={{padding:"2px 0",fontSize:8,borderBottom:"1px solid #1e2d4a20"}}>
              <div style={{display:"flex",gap:3,alignItems:"center"}}>
                <span style={{color:sc,fontWeight:700}}>TRK-{dt.trackId}</span>
                <span style={{color:"#ef4444"}}>{dt.trackName}</span>
                <span style={{color:"#4a5e80",marginLeft:"auto"}}>{dt.dist}m</span>
              </div>
              <div style={{paddingLeft:6,fontSize:7,color:"#4a5e80"}}>
                {sensors.map(s=>s.sensorType).filter((v,i,a)=>a.indexOf(v)===i).join(" + ")} | {dt.lat.toFixed(4)},{dt.lon.toFixed(4)}
                {dt.bearing!=null&&` | BRG:${dt.bearing}°`}
              </div>
              {sensors.filter(s=>s.sensorType==="TASS").map((t,ti)=>(
                <div key={ti} style={{paddingLeft:6,fontSize:7,color:"#10b981"}}>
                  TASS: HDG={t.heading}° BRG={t.bearing}° ({t.sensorName})
                </div>
              ))}
            </div>);
          })}
        </>}
      </div>
    </div>
  </div>);
}

// ═══ Export Tab — Per-message CSV ═══