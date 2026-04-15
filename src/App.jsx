import { useState, useRef, useEffect, useCallback, useMemo } from "react";

// ═══ Engine Imports ═══
import SimEngine from "./engine/SimEngine.js";
import {
  KNOTS_TO_MS, MS_TO_KNOTS, EARTH_R, WP_ARRIVE_M,
  RADAR_RANGE, SONOBUOY_RANGE, TASS_RANGE, TASS_OFFSET,
  PLAT_REG, ENEMY_TYPES, WPN_ACTS, SEN_ACTS,
  WP_TYPES, WP_TYPES_ENEMY, WP_COLORS, FIELD_LABELS, UNIT_COLORS,
  defaultWeaponStatus
} from "./engine/constants.js";
import { hav, brg, mvPt, sMs, mDs, hms, ela, toRad, toDeg, cLanes, dlCSV } from "./engine/geo.js";
import { genFig8, genEllipse, insertTurnArc } from "./engine/patterns.js";
import { formOff, minPairwiseDistance, offsetRoute, syncFormAll } from "./engine/formations.js";
import { S } from "./styles/theme.js";
import AB from "./components/ActionButton.jsx";
import ScTab from "./components/ScenarioTab.jsx";
import COPTab from "./components/COPTab.jsx";
import ExpTab from "./components/CSVExport.jsx";
import { F, WF, MT, Mod } from "./components/UIHelpers.jsx";


// Backward compatibility aliases
const UC = UNIT_COLORS;
const FL = FIELD_LABELS;
const defWS = defaultWeaponStatus;


function mkEng() { return new SimEngine(); }


// ═══ Main App ═══
export default function App(){
  const[tab,setTab]=useState("scenario");
  const[units,setUnits]=useState([]);const[sel,setSel]=useState(-1);
  const[scStart,setScStart]=useState("06:00");
  const[durM,setDurM]=useState(120);const[durS,setDurS]=useState(0);const[tick,setTick]=useState(300);
  const[showAU,setShowAU]=useState(false);const[showAW,setShowAW]=useState(false);
  const[editUnitIdx,setEditUnitIdx]=useState(-1); // -1=신규, >=0=편집
  const[editWP,setEditWP]=useState(null); // null=신규, {ui,wi}=편집

  // Add unit
  const[nuN,setNuN]=useState("");const[nuSide,setNuSide]=useState("friendly");
  const[nuPT,setNuPT]=useState("유인구축함");const[nuET,setNuET]=useState("적수상함");
  const[nuS,setNuS]=useState(4);const[nuB,setNuB]=useState(2);const[nuR,setNuR]=useState(1);const[nuD,setNuD]=useState(2);const[nuT,setNuT]=useState(1);const[nuE,setNuE]=useState(1);
  const[nuRA,setNuRA]=useState(200); // RCWS 탄약수
  const[nuLen,setNuLen]=useState(150); // 플랫폼 길이 (m)
  const[nuTR,setNuTR]=useState(2); // 최대 선회율 (°/s)
  const[nuRadar,setNuRadar]=useState(15000);const[nuTassR,setNuTassR]=useState(8000);const[nuSonoR,setNuSonoR]=useState(5000);const[nuRcwsR,setNuRcwsR]=useState(2000);

  // Add WP
  const[wU,setWU]=useState(0);const[wN,setWN]=useState("WP-01");
  const[wSM,setWSM]=useState(0);const[wSS,setWSS]=useState(0);const[wDM,setWDM]=useState(10);const[wDS,setWDS]=useState(0);
  const[wTy,setWTy]=useState("이동");
  const[wPts,setWPts]=useState([{lat:35.1,lon:129.0,alt:0,speed:15,speedUnit:"knots"}]); // 경유점 배열
  const[wActs,setWActs]=useState([]);
  // 소노부이투하 WP 전용 파라미터
  const[wSbDepth,setWsbDepth]=useState(50);
  const[wSbDur,setWsbDur]=useState(300);
  // 8자기동 WP 전용 파라미터
  const[f8OLat,setF8OLat]=useState(35.1);const[f8OLon,setF8OLon]=useState(129.0);
  const[f8DLat,setF8DLat]=useState(35.15);const[f8DLon,setF8DLon]=useState(129.0);
  const[f8Range,setF8Range]=useState(2000); // lateral range in meters
  const[f8Spd,setF8Spd]=useState(15);const[f8SpdU,setF8SpdU]=useState("knots");
  // WP 동시 실행
  const[wConc,setWConc]=useState(false);
  // 편대 기동 (8자/타원 전용)
  const[wFormUnits,setWFormUnits]=useState([]); // 편대원 유닛 인덱스 배열
  const[wFormSpacing,setWFormSpacing]=useState(200); // 간격 (m)
  const[wMaxSpd,setWMaxSpd]=useState(0); // 최대 속력 (0=제한 없음)
  const[wMaxSpdU,setWMaxSpdU]=useState("knots");
  // 충돌 공격 표적
  const[wCollTgt,setWCollTgt]=useState(null); // {id,name}

  const eng=useRef(mkEng());
  const[ss,setSS]=useState(null);const[sRun,setSRun]=useState(false);const[sSp,setSSp]=useState(1);const sIv=useRef(null);
  const totSec=useMemo(()=>Math.max(durM*60+durS,10),[durM,durS]);

  const syncDef=useCallback(pk=>{const r=PLAT_REG.find(x=>x.key===pk);const w=defWS(pk);setNuS(w.consumable.sonobuoy);setNuB(w.consumable.blueshark);setNuR(w.consumable.rcws);setNuD(w.consumable.drone);setNuT(w.persistent.tass);setNuE(w.persistent["eo/ir"]);setNuRA(w.consumable.rcws_ammo||0);
    const sr=r?.sr||{};setNuRadar(sr.radar??15000);setNuTassR(sr.tass??8000);setNuSonoR(sr.sonobuoy??5000);setNuRcwsR(sr.rcws??2000);
    setNuLen(r?.len||10);
    setNuTR(r?.tr||Math.max(1.5,Math.min(30,300/(r?.len||10))));
  },[]);
  const nxId=useCallback((pt,side)=>{
    if(side==="enemy"){
      const used=units.filter(u=>u.side==="enemy").map(u=>u.platformId);
      let id=9001;while(used.includes(id))id++;return id;
    }
    const r=PLAT_REG.find(x=>x.key===pt);
    const base=r?.prefix||1100;
    const used=units.map(u=>u.platformId);
    let id=base;while(used.includes(id))id++;return id;
  },[units]);
  const[nuPID,setNuPID]=useState(0); // 수동 ID (0=자동)

  const addUnit=()=>{if(!nuN.trim())return;const s=nuSide,pt=s==="friendly"?nuPT:nuET;
    const rg=s==="friendly"?PLAT_REG.find(r=>r.key===pt):ENEMY_TYPES.find(r=>r.key===pt);
    const ws=s==="friendly"?{consumable:{sonobuoy:nuS,blueshark:nuB,rcws:nuR,drone:nuD,rcws_ammo:nuRA},persistent:{tass:nuT,"eo/ir":nuE}}:{consumable:{},persistent:{}};
    const sr=s==="friendly"?{radar:nuRadar,tass:nuTassR,sonobuoy:nuSonoR,rcws:nuRcwsR}:{radar:0,tass:0,sonobuoy:0,rcws:0};
    const pid=nuPID>0?nuPID:nxId(pt,s);
    if(editUnitIdx>=0){
      setUnits(p=>{const c=[...p];c[editUnitIdx]={...c[editUnitIdx],name:nuN.trim(),side:s,type:rg?.cat||"USV",platformType:pt,platformId:nuPID>0?nuPID:c[editUnitIdx].platformId,platformLen:nuLen,turnRate:nuTR,speedUnit:rg?.unit||"knots",weaponStatus:ws,sensorRanges:sr};return c;});
    } else {
      setUnits(p=>[...p,{name:nuN.trim(),side:s,type:rg?.cat||"USV",platformType:pt,platformId:pid,platformLen:nuLen,turnRate:nuTR,speedUnit:rg?.unit||"knots",weaponStatus:ws,sensorRanges:sr,wps:[]}]);
      setSel(units.length);
    }
    setShowAU(false);setNuN("");setEditUnitIdx(-1);setNuPID(0);};

  const openAU=()=>{setEditUnitIdx(-1);setNuN("");setNuSide("friendly");setNuPT("유인구축함");syncDef("유인구축함");setNuPID(0);setShowAU(true);};

  const openEditUnit=(i)=>{
    const u=units[i];if(!u)return;
    setEditUnitIdx(i);setNuN(u.name);setNuSide(u.side);
    if(u.side==="friendly"){setNuPT(u.platformType);
      const ws=u.weaponStatus||{};const c=ws.consumable||{};const p=ws.persistent||{};
      setNuS(c.sonobuoy||0);setNuB(c.blueshark||0);setNuR(c.rcws||0);setNuD(c.drone||0);setNuT(p.tass||0);setNuE(p["eo/ir"]||0);setNuRA(c.rcws_ammo||0);
      const sr=u.sensorRanges||{};setNuRadar(sr.radar??15000);setNuTassR(sr.tass??8000);setNuSonoR(sr.sonobuoy??5000);setNuRcwsR(sr.rcws??2000);
    } else {setNuET(u.platformType);}
    setNuPID(u.platformId||0);
    const rg2=u.side==="friendly"?PLAT_REG.find(r=>r.key===u.platformType):ENEMY_TYPES.find(r=>r.key===u.platformType);
    setNuLen(u.platformLen??rg2?.len??10);
    setNuTR(u.turnRate??rg2?.tr??Math.max(1.5,Math.min(30,300/(u.platformLen??10))));
    setShowAU(true);
  };

  const addWP=()=>{const idx=wU;if(idx<0||idx>=units.length)return;
    // 편대 최대 플랫폼 길이 (패턴 곡률 반경 보장용)
    const formMemIds=[idx,...wFormUnits.filter(fi=>fi!==idx)];
    const maxPlatLen=Math.max(...formMemIds.map(fi=>units[fi]?.platformLen||10));
    // 8자기동/타원기동: 자동 경유점 생성 (플랫폼 길이 반영)
    // 패턴 시작점은 리더 유닛의 현재 위치(마지막 경유점)에 가장 가까운 곡선 지점으로 회전
    let usePts=wPts;
    let patternTStart=0; // 리더 곡선의 절대 parametric 위상 (팔로워 계산에 사용)
    if(wTy==="8자기동"||wTy==="타원기동"){
      const gen=wTy==="8자기동"?genFig8:genEllipse;
      // Step A: 기본 곡선 생성 (tPhase=0)
      usePts=gen(f8OLat,f8OLon,f8DLat,f8DLon,f8Range,f8Spd,f8SpdU,maxPlatLen,0);
      if(usePts.length===0)return;
      // Step B: 리더 유닛의 현재 위치(마지막 기존 WP의 마지막 경유점) 찾기
      const leaderU=units[idx];
      const lastExistingWp=leaderU?.wps?.length?leaderU.wps[leaderU.wps.length-1]:null;
      const lastPt=lastExistingWp?.waypoints?.length?lastExistingWp.waypoints[lastExistingWp.waypoints.length-1]:null;
      if(lastPt){
        // Step C: usePts에서 lastPt에 가장 가까운 인덱스 탐색
        const Nseg=usePts.length-1;
        let bestIdx=0,bestD=Infinity;
        for(let i=0;i<Nseg;i++){
          const d=hav(lastPt.lat,lastPt.lon,usePts[i].lat,usePts[i].lon);
          if(d<bestD){bestD=d;bestIdx=i;}
        }
        // Step D: tStart 계산 & 리더 곡선 재생성 (회전된 시작점)
        if(bestIdx!==0){
          patternTStart=(bestIdx/Nseg)*2*Math.PI;
          usePts=gen(f8OLat,f8OLon,f8DLat,f8DLon,f8Range,f8Spd,f8SpdU,maxPlatLen,patternTStart);
          if(usePts.length===0)return;
        }
      }
    }
    // 충돌공격: 표적이 선택되어야 함
    if(wTy==="충돌공격"){
      if(!wCollTgt){alert("충돌 공격 표적을 선택하세요.");return;}
      const en=units.find(u=>u.platformId===wCollTgt.id);
      const eLat=en?.wps?.[0]?.waypoints?.[0]?.lat||35.1;
      const eLon=en?.wps?.[0]?.waypoints?.[0]?.lon||129.0;
      const su=units[idx]?.speedUnit||"knots";
      usePts=[{lat:eLat,lon:eLon,alt:0,speed:su==="m/s"?30:20,speedUnit:su,_trackId:wCollTgt.id,_targetName:wCollTgt.name}];
    }
    if(usePts.length===0)return;
    // ── 선회율 기반 자동 경유점 삽입 (일반 WP만, 패턴/충돌/편대 제외) ──
    const uRef=units[idx];
    const isRegularWP=wTy!=="8자기동"&&wTy!=="타원기동"&&wTy!=="충돌공격"&&wTy!=="편대이동";
    let wpDurSec=Math.max(wDM*60+wDS,1);
    if(isRegularWP&&usePts.length>=3&&uRef){
      const uTR=uRef.turnRate||Math.max(1.5,Math.min(30,300/(uRef.platformLen||10)));
      const firstSpd=sMs(usePts[0]?.speed||0,usePts[0]?.speedUnit||uRef.speedUnit||"knots");
      if(uTR>0&&firstSpd>0){
        const beforePts=[...usePts];
        usePts=insertTurnArc(beforePts,uTR,firstSpd,uRef.platformLen||10);
        if(usePts.length>beforePts.length){
          let dO=0;for(let i=1;i<beforePts.length;i++)dO+=hav(beforePts[i-1].lat,beforePts[i-1].lon,beforePts[i].lat,beforePts[i].lon);
          let dN=0;for(let i=1;i<usePts.length;i++)dN+=hav(usePts[i-1].lat,usePts[i-1].lon,usePts[i].lat,usePts[i].lon);
          if(dO>0.1&&dN>dO)wpDurSec=Math.round(wpDurSec*(dN/dO));
        }
      }
    }
    // 소노부이투하 WP: 각 경유점에 소노부이 투하 액션 자동 생성
    let finalActs=[...wActs];
    if(wTy==="소노부이투하"){
      usePts.forEach((pt,pi)=>{
        finalActs.push({
          category:"weapon",weaponKey:"sonobuoy",weaponType:0,
          label:`소노부이 #${pi+1}`,icon:"🔵",color:"#06b6d4",
          params:{target_lat:pt.lat,target_lon:pt.lon,operating_depth:wSbDepth,active_duration:wSbDur}
        });
      });
    }
    // ── 편대 기동: 편대원별 오프셋 WP 일괄 생성 ──
    const isPatrol=wTy==="8자기동"||wTy==="타원기동";
    const hasFormation=(isPatrol||wTy==="편대이동")&&wFormUnits.length>0&&!editWP;
    const allMembers=hasFormation?[idx,...wFormUnits.filter(fi=>fi!==idx)]:[idx];
    const totalM=allMembers.length;

    if(editWP){
      // ── WP 편집 모드: 기존 WP 업데이트 ──
      const wpObj={name:wN||"WP",start:wSM*60+wSS,duration:wpDurSec,type:wTy,
        concurrent:wConc,waypoints:usePts.map(p=>({...p,speed:+p.speed})),actions:finalActs,
        ...(wMaxSpd>0?{maxSpeed:+wMaxSpd,maxSpeedUnit:wMaxSpdU}:{}),
        ...(wTy==="소노부이투하"?{sonobuoyConfig:{depth:wSbDepth,duration:wSbDur}}:{}),
        ...(wTy==="8자기동"?{fig8Config:{oLat:f8OLat,oLon:f8OLon,dLat:f8DLat,dLon:f8DLon,range:f8Range},fig8Loop:true}:{}),
        ...(wTy==="타원기동"?{ellipseConfig:{oLat:f8OLat,oLon:f8OLon,dLat:f8DLat,dLon:f8DLon,range:f8Range},fig8Loop:true}:{}),
        ...(wTy==="충돌공격"&&wCollTgt?{collisionTarget:{id:wCollTgt.id,name:wCollTgt.name}}:{})};
      setUnits(prev=>{const c=[...prev];const wps=[...c[editWP.ui].wps];wps[editWP.wi]=wpObj;
        c[editWP.ui]={...c[editWP.ui],wps:wps.sort((a,b)=>a.start-b.start)};return c;});
    } else {
      // ── 신규 WP 추가 (편대 포함) ──
      // Step 1: 편대원별 경유점 생성 — 평행 곡선 (line abreast / IAMSAR parallel-track 교리)
      //   - 패턴(8자/타원): 각 팔로워가 독자적인 평행 곡선을 추적
      //     · 곡선 중심(origin/dest)을 8자 축에 수직 방향으로 formOff 만큼 이동
      //     · 평행 곡선이므로 어느 위상에서도 Euclidean 간격이 정확히 유지됨
      //     · 동일 인덱스 기준 syncFormAll 로 시간 동기화 → 함께 loop 수행
      //   - 편대이동: 평행 오프셋 (직선 구간 line abreast)
      const patrolAxisB=isPatrol?brg(f8OLat,f8OLon,f8DLat,f8DLon):0;
      const patrolPerpB=(patrolAxisB+90)%360;
      const allMemberPts=allMembers.map((unitIdx,mi)=>{
        if(mi===0||!hasFormation||totalM<=1)return[...usePts.map(p=>({...p}))];
        if(isPatrol){
          const latOff=formOff(mi,totalM,wFormSpacing); // 부호 있는 측방 오프셋
          const [fOLat,fOLon]=mvPt(f8OLat,f8OLon,patrolPerpB,latOff);
          const [fDLat,fDLon]=mvPt(f8DLat,f8DLon,patrolPerpB,latOff);
          const gen=wTy==="8자기동"?genFig8:genEllipse;
          return gen(fOLat,fOLon,fDLat,fDLon,f8Range,f8Spd,f8SpdU,maxPlatLen,patternTStart);
        }
        const latOff=formOff(mi,totalM,wFormSpacing);
        return latOff!==0?offsetRoute(usePts,latOff):[...usePts.map(p=>({...p}))];
      });

      // Step 2: CPA(Closest Point of Approach) 기반 충돌 안전 검사
      // ─ COLREGs / USV 스웜 교리: 모든 편대원 쌍의 모든 tick에 대해 최소 이격거리 측정
      // ─ Ship Safety Distance = max(30m, 플랫폼 길이 × 2) 미만이면 생성 거부
      if(hasFormation&&totalM>1){
        const {minD,worst}=minPairwiseDistance(allMemberPts);
        const safetyM=Math.max(30,Math.round(maxPlatLen*2));
        if(minD<safetyM){
          const pairMsg=worst?`편대원 #${worst.i+1}↔#${worst.j+1} (tick ${worst.k})`:"편대원 쌍";
          const hint=isPatrol
            ?(wTy==="8자기동"
              ?"\n\n원인: 8자기동 자기교차(중앙 크로스오버)로 인해 간격이 곡선 둘레의 절반 근처일 때 충돌이 발생합니다. 간격을 늘리거나 편대원 수를 줄여주세요."
              :"\n\n원인: 간격이 너무 작아 편대원이 곡선 상 같은 지점에 배치됩니다. 간격을 늘려주세요.")
            :"\n\n원인: 평행 오프셋 간격이 안전거리 미만입니다. 간격을 늘려주세요.";
          alert(`⚠ 편대 충돌 위험 감지\n\n최소 이격거리: ${Math.round(minD)}m (안전거리 ${safetyM}m 미달)\n위치: ${pairMsg}\n현재 간격: ${wFormSpacing}m${hint}`);
          return;
        }
      }

      // Step 3: 속도 동기화
      // ─ 패턴(tPhase 비대칭일 때 세그먼트 길이 차이 보정) / 편대이동 모두 적용
      // ─ 모든 편대원이 같은 tick에 동일 인덱스 경유점 통과 → CPA 검사가 유효
      const syncedPts=hasFormation&&totalM>1?syncFormAll(allMemberPts):allMemberPts;
      // Step 3.5: 패턴(8자/타원) 편대 진입 barrier 마킹
      //   - 모든 편대원이 각자의 sub-WP 0에 도달하기 전에는 어느 누구도 loop를 시작하면 안 됨
      //   - SimEngine 의 tick pre-pass 가 `formBarrier && formTotal` 을 사용하여 동시 해제
      //   - 리더는 patternTStart 로 curve[0] ≈ 현재 위치 → approach ≈ 0
      //   - 팔로워는 arc-length shift 된 curve[0] 까지 approach 필요 → 몇 tick 지연
      //   - barrier 없이는 리더가 먼저 loop 진행 → 영구 위상 이탈 → 간격 붕괴
      if(isPatrol&&hasFormation&&totalM>1){
        for(let m=0;m<totalM;m++){
          syncedPts[m][0]={...syncedPts[m][0],_formBarrier:true,_formTotal:totalM};
        }
      }
      // Step 3: WP 생성
      setUnits(prev=>{
        const c=[...prev];
        allMembers.forEach((unitIdx,mi)=>{
          // 패턴: along-track 스페이싱(mi × spacing, 음수=뒤), 편대이동: 수직 오프셋
          const off=hasFormation&&totalM>1
            ?(isPatrol?-mi*wFormSpacing:formOff(mi,totalM,wFormSpacing))
            :0;
          const leaderPlatformId=c[allMembers[0]]?.platformId;
          const wpObj={name:totalM>1?`${wN||"WP"}-F${mi+1}`:wN||"WP",
            start:wSM*60+wSS,duration:wpDurSec,type:wTy,
            concurrent:wConc,
            waypoints:syncedPts[mi].map(p=>({...p,speed:+p.speed})),
            actions:mi===0?finalActs:[],
            formation:hasFormation?{role:mi===0?"leader":"member",leaderId:leaderPlatformId,spacing:wFormSpacing,total:totalM,offset:Math.round(off)}:null,
            ...(wMaxSpd>0?{maxSpeed:+wMaxSpd,maxSpeedUnit:wMaxSpdU}:{}),
            ...(wTy==="소노부이투하"?{sonobuoyConfig:{depth:wSbDepth,duration:wSbDur}}:{}),
            ...(wTy==="8자기동"?{fig8Config:{oLat:f8OLat,oLon:f8OLon,dLat:f8DLat,dLon:f8DLon,range:f8Range},fig8Loop:true}:{}),
            ...(wTy==="타원기동"?{ellipseConfig:{oLat:f8OLat,oLon:f8OLon,dLat:f8DLat,dLon:f8DLon,range:f8Range},fig8Loop:true}:{}),
            ...(wTy==="충돌공격"&&wCollTgt?{collisionTarget:{id:wCollTgt.id,name:wCollTgt.name}}:{})};
          c[unitIdx]={...c[unitIdx],wps:[...c[unitIdx].wps,wpObj].sort((a,b)=>a.start-b.start)};
        });
        return c;
      });
    }
    setShowAW(false);setWActs([]);setWFormUnits([]);setEditWP(null);setWCollTgt(null);};

  const openAW=ui=>{const idx=ui>=0?ui:(sel>=0?sel:0);if(!units.length)return;
    setEditWP(null);
    setWU(idx);const u=units[idx];setWN(`WP-${String(u.wps.length+1).padStart(2,'0')}`);
    const lw=u.wps[u.wps.length-1];const as=lw?lw.start+lw.duration:0;
    setWSM(Math.floor(as/60));setWSS(as%60);setWDM(10);setWDS(0);
    const su=u.speedUnit||"knots";const lastPt=lw?.waypoints?.[lw.waypoints.length-1];
    setWPts([{lat:lastPt?.lat??35.1,lon:lastPt?.lon??129.0,alt:0,speed:su==="m/s"?30:15,speedUnit:su}]);
    setWTy("이동");setWActs([]);setWsbDepth(50);setWsbDur(300);
    setF8OLat(lastPt?.lat??35.1);setF8OLon(lastPt?.lon??129.0);setF8DLat((lastPt?.lat??35.1)+0.05);setF8DLon(lastPt?.lon??129.0);
    setF8Range(2000);setF8Spd(su==="m/s"?30:15);setF8SpdU(su);
    setWConc(false);setWFormUnits([]);setWFormSpacing(Math.max(50,Math.round((u.platformLen||10)*3)));setWCollTgt(null);
    setWMaxSpd(0);setWMaxSpdU(u.speedUnit||"knots");
    setShowAW(true);};

  const openEditWP=(ui,wi)=>{
    const u=units[ui];if(!u)return;const wp=u.wps[wi];if(!wp)return;
    setEditWP({ui,wi});setWU(ui);setWN(wp.name);
    const startS=wp.start||0;setWSM(Math.floor(startS/60));setWSS(startS%60);
    const durS=wp.duration||600;setWDM(Math.floor(durS/60));setWDS(durS%60);
    setWTy(wp.type||"이동");setWConc(wp.concurrent||false);
    setWPts(wp.waypoints?.length?wp.waypoints.map(p=>({...p})):[{lat:35.1,lon:129.0,alt:0,speed:15,speedUnit:u.speedUnit||"knots"}]);
    setWActs(wp.actions?.map(a=>({...a,params:{...a.params}}))||[]);
    // Sonobuoy config
    if(wp.sonobuoyConfig){setWsbDepth(wp.sonobuoyConfig.depth||50);setWsbDur(wp.sonobuoyConfig.duration||300);}
    // Fig8/Ellipse config
    const fc=wp.fig8Config||wp.ellipseConfig;
    if(fc){setF8OLat(fc.oLat||35.1);setF8OLon(fc.oLon||129.0);setF8DLat(fc.dLat||35.15);setF8DLon(fc.dLon||129.0);setF8Range(fc.range||2000);}
    if(wp.waypoints?.[0]){setF8Spd(wp.waypoints[0].speed||15);setF8SpdU(wp.waypoints[0].speedUnit||u.speedUnit||"knots");}
    setWFormUnits([]);setWFormSpacing(wp.formation?.spacing||200);
    setWCollTgt(wp.collisionTarget||null);
    setWMaxSpd(wp.maxSpeed||0);setWMaxSpdU(wp.maxSpeedUnit||u.speedUnit||"knots");
    setShowAW(true);
  };

  const delWP=(ui,wi)=>setUnits(p=>{const c=[...p];c[ui]={...c[ui],wps:c[ui].wps.filter((_,i)=>i!==wi)};return c;});
  const delUnit=i=>setUnits(p=>p.filter((_,j)=>j!==i));

  // Sim
  const startSim=()=>{const e=eng.current;e.load({scenarioStart:scStart,totalDurationSec:totSec,units});e.speed=sSp;e.running=true;setSRun(true);setSS(e.snap());
    if(sIv.current)clearInterval(sIv.current);sIv.current=setInterval(()=>{if(!e.running)return;const st=e.tick(0.2);setSS({...st});if(e.simTime>=totSec){e.running=false;setSRun(false);clearInterval(sIv.current);}},200);};
  const stopSim=()=>{eng.current.running=false;setSRun(false);if(sIv.current)clearInterval(sIv.current);};
  const resetSim=()=>{stopSim();eng.current.simTime=0;eng.current.history=[];setSS(null);};
  useEffect(()=>{eng.current.speed=sSp;},[sSp]);
  useEffect(()=>()=>{if(sIv.current)clearInterval(sIv.current);},[]);

  const expJSON=()=>{const b=new Blob([JSON.stringify({version:5,scenarioStart:scStart,totalDurationSec:totSec,tickIntervalSec:tick,units},null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="scenario.json";a.click();};
  const impJSON=()=>{const i=document.createElement("input");i.type="file";i.accept=".json";i.onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{try{const d=JSON.parse(ev.target.result);if(d.scenarioStart)setScStart(d.scenarioStart);const ts=d.totalDurationSec||7200;setDurM(Math.floor(ts/60));setDurS(ts%60);if(d.tickIntervalSec)setTick(d.tickIntervalSec);if(d.units){setUnits(d.units);setSel(0);}}catch{alert("유효하지 않은 JSON");}};r.readAsText(f);};i.click();};
  const getAW=()=>units[wU]?.weaponStatus||{consumable:{},persistent:{}};

  // CSS Reset
  useEffect(()=>{const id='__c2r';if(document.getElementById(id))return;const s=document.createElement('style');s.id=id;
    s.textContent=`*,*::before,*::after{box-sizing:border-box!important;margin:0;padding:0}html{height:100%!important;overflow:hidden!important}body{margin:0!important;padding:0!important;height:100%!important;width:100%!important;overflow:hidden!important;background:#0a0e17!important;display:block!important;place-items:unset!important;min-width:0!important;min-height:0!important;font-family:'Noto Sans KR',system-ui,sans-serif!important;color:#e2e8f0!important}#root,#__next,[data-reactroot]{margin:0!important;padding:0!important;max-width:none!important;width:100%!important;height:100%!important;overflow:hidden!important;text-align:left!important}::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#1e2d4a;border-radius:3px}`;
    document.head.appendChild(s);document.querySelectorAll('link[rel="stylesheet"]').forEach(l=>{if((l.getAttribute('href')||'').includes('index'))l.disabled=true;});},[]);

  return(<div style={S.root}>
    <div style={S.hdr}>
      <div style={S.hL}><div style={S.logo}>C2</div><div><div style={{fontSize:13,fontWeight:600}}>C2 Protocol <span style={{color:"#06b6d4"}}>Simulator</span> <span style={{fontSize:9,color:"#4a5e80"}}>v3</span></div><div style={{fontSize:8,color:"#4a5e80",textTransform:"uppercase",letterSpacing:.5}}>Multi-WP · Per-MSG CSV · TASS Tracks</div></div></div>
      <div style={{display:"flex",gap:4}}>{[["scenario","📊 시나리오"],["cop","🗺️ COP"],["export","📤 CSV"]].map(([k,l])=><button key={k} onClick={()=>setTab(k)} style={{...S.tab,...(tab===k?S.tabA:{})}}>{l}</button>)}</div>
    </div>

    {tab==="scenario"&&<ScTab {...{units,sel,setSel,scStart,setScStart,durM,setDurM,durS,setDurS,totSec,tick,setTick}} oAU={openAU} oAW={()=>openAW(-1)} eU={openEditUnit} eW={openEditWP} dU={i=>{if(confirm("삭제?"))delUnit(i)}} dW={delWP} eJ={expJSON} iJ={impJSON}/>}
    {tab==="cop"&&<COPTab {...{units,ss,sRun,sSp,setSSp:setSSp,totSec}} oSt={startSim} oSp={stopSim} oRs={resetSim}/>}
    {tab==="export"&&<ExpTab eng={eng} ss={ss} units={units}/>}

    {/* ══ ADD UNIT ══ */}
    {showAU&&<Mod t={editUnitIdx>=0?`✏️ 유닛 편집 — ${units[editUnitIdx]?.name||""}`:"🔷 유닛 추가"} close={()=>{setShowAU(false);setEditUnitIdx(-1);}} w={nuSide==="friendly"?740:440}>
      <div style={{display:"flex",gap:16}}>
        <div style={{flex:1}}>
          <F l="진영"><select value={nuSide} onChange={e=>setNuSide(e.target.value)} style={S.inp}><option value="friendly">아군</option><option value="enemy">적군</option></select></F>
          {nuSide==="friendly"?<F l="플랫폼 (§2.1)"><select value={nuPT} onChange={e=>{setNuPT(e.target.value);syncDef(e.target.value);if(editUnitIdx<0)setNuPID(0);}} style={S.inp}>{PLAT_REG.map(r=><option key={r.key} value={r.key}>[{r.cat}] {r.label} — {r.prefix}x · {r.unit} · {r.len}m</option>)}</select></F>
            :<F l="적군 유형"><select value={nuET} onChange={e=>{setNuET(e.target.value);const er=ENEMY_TYPES.find(r=>r.key===e.target.value);setNuLen(er?.len||10);setNuTR(er?.tr||Math.max(1.5,Math.min(30,300/(er?.len||10))));}} style={S.inp}>{ENEMY_TYPES.map(r=><option key={r.key} value={r.key}>{r.label} — {r.unit} ({r.len}m)</option>)}</select></F>}
          <F l="콜사인"><input value={nuN} onChange={e=>setNuN(e.target.value)} placeholder="e.g. ALPHA-1" style={S.inp} onKeyDown={e=>{if(e.key==="Enter")addUnit();}} autoFocus/></F>
          <F l={`플랫폼 ID (${nuPID>0?"수동":"자동"}: ${nuPID>0?nuPID:nxId(nuSide==="friendly"?nuPT:nuET,nuSide)})`}>
            <div style={{display:"flex",gap:4,alignItems:"center"}}>
              <input type="number" value={nuPID||""} onChange={e=>setNuPID(+e.target.value||0)} placeholder={String(nxId(nuSide==="friendly"?nuPT:nuET,nuSide))} style={{...S.inp,flex:1}}/>
              <button style={{...S.btn,fontSize:8,padding:"3px 6px",flexShrink:0}} onClick={()=>setNuPID(0)}>자동</button>
            </div>
            <div style={{fontSize:7,color:"#4a5e80",marginTop:2}}>
              {nuSide==="friendly"?`${(PLAT_REG.find(r=>r.key===nuPT)?.prefix||1100)}x 범위 | `:""}
              0 = 자동 생성{nuPID>0&&units.some(u=>u.platformId===nuPID&&(editUnitIdx<0||units.indexOf(u)!==editUnitIdx))?" | ⚠ ID 중복!":""}
            </div>
          </F>
          <F l={`플랫폼 길이 (${nuLen}m) — 선회율·도착 반경 자동 조정`}>
            <div style={{display:"flex",gap:4,alignItems:"center"}}>
              <input type="number" value={nuLen} onChange={e=>{const v=Math.max(1,+e.target.value||1);setNuLen(v);setNuTR(Math.round(Math.max(1.5,Math.min(30,300/v))*10)/10);}} style={{...S.inp,flex:1}} step="1" min="1"/>
              <span style={{fontSize:8,color:"#4a5e80",flexShrink:0}}>m</span>
            </div>
            <div style={{fontSize:7,color:"#4a5e80",marginTop:2}}>
              도착 판정: {Math.max(2,Math.min(10,Math.round(nuLen/2)))}m | 선회율: {nuTR}°/s | 최소 선회 반경: {Math.round(nuLen*2)}m
            </div>
          </F>
          <F l={`최대 선회율 (${nuTR}°/s) — 경유점 사이 자동 선회 경유점 삽입`}>
            <div style={{display:"flex",gap:4,alignItems:"center"}}>
              <input type="number" value={nuTR} onChange={e=>setNuTR(Math.max(0.5,+e.target.value||1))} style={{...S.inp,flex:1}} step="0.5" min="0.5" max="60"/>
              <span style={{fontSize:8,color:"#4a5e80",flexShrink:0}}>°/s</span>
              <button style={{...S.btn,fontSize:8,padding:"3px 6px",flexShrink:0}} onClick={()=>setNuTR(Math.round(Math.max(1.5,Math.min(30,300/nuLen))*10)/10)}>자동</button>
            </div>
            <div style={{fontSize:7,color:"#4a5e80",marginTop:2}}>
              {nuTR>=15?"매우 기민 (소형 USV/드론)":nuTR>=8?"기민 (중형 USV)":nuTR>=3?"보통 (대형 함정/잠수함)":"저속 선회 (대형 수상함)"} | 180° 선회: {Math.round(180/nuTR)}초
            </div>
          </F>
        </div>
        {nuSide==="friendly"&&<div style={{flex:1,borderLeft:"1px solid #1e2d4a",paddingLeft:16}}>
          <div style={{fontSize:11,fontWeight:700,color:"#f59e0b",marginBottom:8}}>⚙️ weapon_status</div>
          <div style={{fontSize:9,color:"#8899b4",fontWeight:600,marginBottom:4}}>CONSUMABLE (0xFF37)</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10}}>
            <WF l="🔵 소노부이" s="t=0" v={nuS} set={setNuS}/><WF l="🔴 청상어" s="t=1" v={nuB} set={setNuB}/>
            <WF l="🟠 RCWS" s="t=2" v={nuR} set={setNuR}/><WF l="🟣 드론" s="t=3" v={nuD} set={setNuD}/>
            {nuR>0&&<WF l="🟠 RCWS 탄약" s="발" v={nuRA} set={setNuRA}/>}
          </div>
          <div style={{fontSize:9,color:"#8899b4",fontWeight:600,marginBottom:4}}>PERSISTENT (0xFF39)</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            <WF l="📡 TASS" s="t=0" v={nuT} set={setNuT}/><WF l="📷 EO/IR" s="t=1" v={nuE} set={setNuE}/>
          </div>
          <div style={{borderTop:"1px solid #1e2d4a",marginTop:10,paddingTop:8}}>
            <div style={{fontSize:9,color:"#06b6d4",fontWeight:600,marginBottom:4}}>📡 센서 탐지범위 / 무장 사거리 (meters)</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              <WF l="📡 레이더" s="0xDE33" v={nuRadar} set={setNuRadar}/>
              <WF l="📡 TASS" s="0xFE33" v={nuTassR} set={setNuTassR}/>
              <WF l="📡 소노부이" s="0xFE31" v={nuSonoR} set={setNuSonoR}/>
              <WF l="🟠 RCWS" s="사거리" v={nuRcwsR} set={setNuRcwsR}/>
            </div>
          </div>
        </div>}
      </div>
      <div style={S.mA}><button style={S.btn} onClick={()=>{setShowAU(false);setEditUnitIdx(-1);}}>취소</button><button style={S.btnP} onClick={addUnit}>{editUnitIdx>=0?"저장":"추가"}</button></div>
    </Mod>}

    {/* ══ ADD WP ══ */}
    {showAW&&<Mod t={editWP?`✏️ WP 편집 — ${units[editWP.ui]?.wps[editWP.wi]?.name||""}`:units[wU]?.side==="enemy"?`📍 적 WP 설정 (${units[wU]?.platformType||""})`:"📍 WP 추가"} close={()=>{setShowAW(false);setEditWP(null);}} w={units[wU]?.side!=="enemy"?840:580}>
      <div style={{display:"flex",gap:16}}>
        <div style={{flex:"1 1 340px",minWidth:280}}>
          <F l="대상 유닛"><select value={wU} disabled={!!editWP} onChange={e=>{const i=+e.target.value;setWU(i);setWActs([]);const su=units[i]?.speedUnit||"knots";setWPts(p=>p.map(x=>({...x,speedUnit:su})));}} style={{...S.inp,opacity:editWP?.5:1}}>{units.map((u,i)=><option key={i} value={i}>[{u.side==="enemy"?"적":"아"}] {u.name}</option>)}</select></F>
          <F l="WP 이름"><input value={wN} onChange={e=>setWN(e.target.value)} style={S.inp}/></F>
          {/* ── 동시 실행 토글 ── */}
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,padding:"5px 8px",
            background:wConc?"rgba(168,85,247,0.08)":"rgba(255,255,255,0.02)",
            border:`1px solid ${wConc?"rgba(168,85,247,0.3)":"#1e2d4a"}`,borderRadius:5,cursor:"pointer"}}
            onClick={()=>setWConc(c=>!c)}>
            <div style={{width:32,height:16,borderRadius:8,background:wConc?"#a855f7":"#1e2d4a",position:"relative",transition:"background 0.2s",flexShrink:0}}>
              <div style={{width:12,height:12,borderRadius:6,background:"#fff",position:"absolute",top:2,left:wConc?18:2,transition:"left 0.2s"}}/>
            </div>
            <div>
              <div style={{fontSize:10,fontWeight:600,color:wConc?"#a855f7":"#8899b4"}}>
                {wConc?"⚡ 동시 실행 (Concurrent)":"순차 실행 (Sequential)"}
              </div>
              <div style={{fontSize:7,color:"#4a5e80"}}>
                {wConc?"이동 없이 시작시각에 액션만 실행 — 다른 WP와 병렬 동작":"경유점 순서대로 이동 후 액션 실행"}
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <F l="시작 (분:초)" style={{flex:1}}><div style={{display:"flex",gap:3,alignItems:"center"}}><input type="number" value={wSM} onChange={e=>setWSM(+e.target.value)} min={0} style={{...S.inp,width:50}}/><b style={{color:"#4a5e80"}}>:</b><input type="number" value={wSS} onChange={e=>setWSS(+e.target.value)} min={0} max={59} style={{...S.inp,width:50}}/></div></F>
            <F l="소요 (분:초)" style={{flex:1}}><div style={{display:"flex",gap:3,alignItems:"center"}}><input type="number" value={wDM} onChange={e=>setWDM(+e.target.value)} min={0} style={{...S.inp,width:50}}/><b style={{color:"#4a5e80"}}>:</b><input type="number" value={wDS} onChange={e=>setWDS(+e.target.value)} min={0} max={59} style={{...S.inp,width:50}}/></div></F>
            <F l="최대 속력 (0=제한 없음)" style={{flex:1.2}}>
              <div style={{display:"flex",gap:3}}>
                <input type="number" value={wMaxSpd} onChange={e=>setWMaxSpd(Math.max(0,+e.target.value))} min={0} step={0.1} style={{...S.inp,flex:1}}/>
                <select value={wMaxSpdU} onChange={e=>setWMaxSpdU(e.target.value)} style={{...S.inp,width:60}}>
                  <option value="knots">knots</option>
                  <option value="m/s">m/s</option>
                </select>
              </div>
            </F>
          </div>
          <F l="WP 유형"><select value={wTy} onChange={e=>setWTy(e.target.value)} style={{...S.inp,borderColor:wTy==="소노부이투하"?"#06b6d4":wTy==="잠항"?"#6366f1":wTy==="8자기동"?"#ec4899":wTy==="타원기동"?"#f59e0b":wTy==="충돌공격"?"#dc2626":wTy==="편대이동"?"#6366f1":"#1e2d4a"}}>{(units[wU]?.side==="enemy"?WP_TYPES_ENEMY:WP_TYPES).map(t=><option key={t}>{t}</option>)}</select></F>

          {/* ═══ 소노부이투하 WP 설정 ═══ */}
          {!wConc&&wTy==="소노부이투하"&&(
            <div style={{background:"rgba(6,182,212,0.06)",border:"1px solid rgba(6,182,212,0.2)",borderRadius:5,padding:8,marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:"#06b6d4",marginBottom:6}}>🔵 소노부이 투하 설정 (0xFF37 type=0)</div>
              <div style={{fontSize:8,color:"#8899b4",marginBottom:6}}>각 경유점 위치에 소노부이가 자동 투하됩니다 ({wPts.length}개 투하 예정)</div>
              <div style={{display:"flex",gap:8}}>
                <F l="운용 수심 (m)" style={{flex:1,marginBottom:0}}><input type="number" value={wSbDepth} onChange={e=>setWsbDepth(+e.target.value)} min={1} style={S.inp}/></F>
                <F l="운용 시간 (sec)" style={{flex:1,marginBottom:0}}><input type="number" value={wSbDur} onChange={e=>setWsbDur(+e.target.value)} min={10} style={S.inp}/></F>
              </div>
              {units[wU]?.weaponStatus?.consumable?.sonobuoy!=null&&(
                <div style={{fontSize:8,marginTop:4,color:wPts.length<=units[wU].weaponStatus.consumable.sonobuoy?"#10b981":"#ef4444"}}>
                  탑재량: {units[wU].weaponStatus.consumable.sonobuoy}개 | 투하 예정: {wPts.length}개
                  {wPts.length>units[wU].weaponStatus.consumable.sonobuoy&&" ⚠ 탑재량 초과"}
                </div>
              )}
            </div>
          )}

          {/* ═══ 8자기동(차단선 기동) WP 설정 ═══ */}
          {!wConc&&wTy==="8자기동"&&(
            <div style={{background:"rgba(236,72,153,0.06)",border:"1px solid rgba(236,72,153,0.2)",borderRadius:5,padding:8,marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:"#ec4899",marginBottom:6}}>∞ 8자 기동 (차단선 기동) 설정</div>
              <div style={{fontSize:8,color:"#8899b4",marginBottom:6}}>
                가로 = 출발지↔목적지 거리 | 세로 = 기동 범위 (사용자 지정)
              </div>
              <div style={{display:"flex",gap:8}}>
                <F l="출발지 위도" style={{flex:1}}><input type="number" step="0.0001" value={f8OLat} onChange={e=>setF8OLat(+e.target.value)} style={S.inp}/></F>
                <F l="출발지 경도" style={{flex:1}}><input type="number" step="0.0001" value={f8OLon} onChange={e=>setF8OLon(+e.target.value)} style={S.inp}/></F>
              </div>
              <div style={{display:"flex",gap:8}}>
                <F l="목적지 위도" style={{flex:1}}><input type="number" step="0.0001" value={f8DLat} onChange={e=>setF8DLat(+e.target.value)} style={S.inp}/></F>
                <F l="목적지 경도" style={{flex:1}}><input type="number" step="0.0001" value={f8DLon} onChange={e=>setF8DLon(+e.target.value)} style={S.inp}/></F>
              </div>
              <div style={{display:"flex",gap:8}}>
                <F l="기동 범위 (m)" style={{flex:1}}><input type="number" value={f8Range} onChange={e=>setF8Range(Math.max(100,+e.target.value))} min={100} style={S.inp}/></F>
                <div style={{flex:1,display:"flex",alignItems:"flex-end",paddingBottom:8}}>
                  <div style={{fontSize:8,color:"#ec4899",background:"rgba(236,72,153,0.06)",padding:"4px 8px",borderRadius:3,border:"1px solid rgba(236,72,153,0.15)",width:"100%",textAlign:"center"}}>
                    ∞ WP 소요시간({Math.max(wDM*60+wDS,1)}초) 동안 반복
                  </div>
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <F l="기동 속도" style={{flex:1}}><input type="number" step="0.1" value={f8Spd} onChange={e=>setF8Spd(+e.target.value)} style={S.inp}/></F>
                <F l="속도 단위" style={{flex:1}}><select value={f8SpdU} onChange={e=>setF8SpdU(e.target.value)} style={S.inp}><option value="knots">knots</option><option value="m/s">m/s</option></select></F>
              </div>
              {/* Preview info + curvature warning */}
              {(()=>{
                const pDist=hav(f8OLat,f8OLon,f8DLat,f8DLon);
                const rMin=pDist>0?f8Range*f8Range/(2*pDist):Infinity;
                const mpl=Math.max(units[wU]?.platformLen||10,...wFormUnits.map(fi=>units[fi]?.platformLen||10));
                const minTR=mpl*2;
                const tight=rMin<minTR;
                return <div style={{marginTop:6,padding:5,background:tight?"rgba(239,68,68,0.08)":"rgba(236,72,153,0.04)",borderRadius:3,fontSize:8,color:tight?"#ef4444":"#ec4899",lineHeight:1.6}}>
                  <b>미리보기:</b> 가로: {Math.round(pDist)}m | 세로: {f8Range}m | 최소 곡률반경: {Math.round(rMin)}m<br/>
                  방위: {Math.round(brg(f8OLat,f8OLon,f8DLat,f8DLon))}° | N=64 경유점 | WP 종료시까지 무한 반복
                  {tight&&<><br/><b>⚠ 최대 플랫폼({mpl}m)의 최소 선회반경({minTR}m)보다 패턴 곡률반경({Math.round(rMin)}m)이 작습니다.</b><br/>
                  권장: 기동범위를 {Math.ceil(Math.sqrt(minTR*pDist*2))}m 이상으로 설정하거나 소형 플랫폼 사용</>}
                </div>;
              })()}
              {/* Mini SVG preview of figure-8 */}
              <div style={{marginTop:6,display:"flex",justifyContent:"center"}}>
                <svg viewBox="-60 -40 120 80" width="200" height="100" style={{background:"rgba(0,0,0,0.2)",borderRadius:4}}>
                  {(()=>{
                    const pts=[];const n=48;
                    for(let i=0;i<=n;i++){const t=(i/n)*2*Math.PI;pts.push([Math.sin(t)*45,Math.sin(2*t)*25]);}
                    const d=pts.map((p,i)=>`${i===0?"M":"L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
                    return <><path d={d} fill="none" stroke="#ec4899" strokeWidth="1.5" opacity="0.8"/>
                      <circle cx={pts[0][0]} cy={pts[0][1]} r="3" fill="#10b981"/>
                      <circle cx={pts[Math.floor(n/2)][0]} cy={pts[Math.floor(n/2)][1]} r="3" fill="#ef4444"/>
                      <text x="-55" y="-28" fill="#4a5e80" fontSize="6">출발</text>
                      <text x="30" y="-28" fill="#4a5e80" fontSize="6">목적</text>
                      <line x1="-50" y1="0" x2="50" y2="0" stroke="#4a5e80" strokeWidth="0.5" strokeDasharray="2,2"/>
                      <text x="-55" y="35" fill="#ec4899" fontSize="5">↕ {f8Range}m</text>
                    </>;
                  })()}
                </svg>
              </div>
            </div>
          )}

          {/* ═══ 타원기동 WP 설정 ═══ */}
          {!wConc&&wTy==="타원기동"&&(
            <div style={{background:"rgba(245,158,11,0.06)",border:"1px solid rgba(245,158,11,0.2)",borderRadius:5,padding:8,marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:"#f59e0b",marginBottom:6}}>⊙ 타원 기동 설정</div>
              <div style={{fontSize:8,color:"#8899b4",marginBottom:6}}>
                가로 = 출발지↔목적지 거리 | 세로 = 기동 범위 (사용자 지정)
              </div>
              <div style={{display:"flex",gap:8}}>
                <F l="출발지 위도" style={{flex:1}}><input type="number" step="0.0001" value={f8OLat} onChange={e=>setF8OLat(+e.target.value)} style={S.inp}/></F>
                <F l="출발지 경도" style={{flex:1}}><input type="number" step="0.0001" value={f8OLon} onChange={e=>setF8OLon(+e.target.value)} style={S.inp}/></F>
              </div>
              <div style={{display:"flex",gap:8}}>
                <F l="목적지 위도" style={{flex:1}}><input type="number" step="0.0001" value={f8DLat} onChange={e=>setF8DLat(+e.target.value)} style={S.inp}/></F>
                <F l="목적지 경도" style={{flex:1}}><input type="number" step="0.0001" value={f8DLon} onChange={e=>setF8DLon(+e.target.value)} style={S.inp}/></F>
              </div>
              <div style={{display:"flex",gap:8}}>
                <F l="기동 범위 (m)" style={{flex:1}}><input type="number" value={f8Range} onChange={e=>setF8Range(Math.max(100,+e.target.value))} min={100} style={S.inp}/></F>
                <div style={{flex:1,display:"flex",alignItems:"flex-end",paddingBottom:8}}>
                  <div style={{fontSize:8,color:"#f59e0b",background:"rgba(245,158,11,0.06)",padding:"4px 8px",borderRadius:3,border:"1px solid rgba(245,158,11,0.15)",width:"100%",textAlign:"center"}}>
                    ∞ WP 소요시간({Math.max(wDM*60+wDS,1)}초) 동안 반복
                  </div>
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <F l="기동 속도" style={{flex:1}}><input type="number" step="0.1" value={f8Spd} onChange={e=>setF8Spd(+e.target.value)} style={S.inp}/></F>
                <F l="속도 단위" style={{flex:1}}><select value={f8SpdU} onChange={e=>setF8SpdU(e.target.value)} style={S.inp}><option value="knots">knots</option><option value="m/s">m/s</option></select></F>
              </div>
              {(()=>{
                const pDist=hav(f8OLat,f8OLon,f8DLat,f8DLon);
                const rMin=pDist>0?f8Range*f8Range/(2*pDist):Infinity;
                const mpl=Math.max(units[wU]?.platformLen||10,...wFormUnits.map(fi=>units[fi]?.platformLen||10));
                const minTR=mpl*2;
                const tight=rMin<minTR;
                return <div style={{marginTop:6,padding:5,background:tight?"rgba(239,68,68,0.08)":"rgba(245,158,11,0.04)",borderRadius:3,fontSize:8,color:tight?"#ef4444":"#f59e0b",lineHeight:1.6}}>
                  <b>미리보기:</b> 장축: {Math.round(pDist)}m | 단축: {f8Range}m | 최소 곡률반경: {Math.round(rMin)}m<br/>
                  방위: {Math.round(brg(f8OLat,f8OLon,f8DLat,f8DLon))}° | N=64 경유점 | WP 종료시까지 무한 반복
                  {tight&&<><br/><b>⚠ 최대 플랫폼({mpl}m)의 최소 선회반경({minTR}m)보다 패턴 곡률반경({Math.round(rMin)}m)이 작습니다.</b><br/>
                  권장: 기동범위를 {Math.ceil(Math.sqrt(minTR*pDist*2))}m 이상으로 설정</>}
                </div>;
              })()}
              <div style={{marginTop:6,display:"flex",justifyContent:"center"}}>
                <svg viewBox="-60 -40 120 80" width="200" height="100" style={{background:"rgba(0,0,0,0.2)",borderRadius:4}}>
                  {(()=>{
                    const pts=[];const n=48;
                    for(let i=0;i<=n;i++){const t=(i/n)*2*Math.PI;pts.push([Math.cos(t)*45,Math.sin(t)*25]);}
                    const d=pts.map((p,i)=>`${i===0?"M":"L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
                    return<><path d={d+" Z"} fill="rgba(245,158,11,0.1)" stroke="#f59e0b" strokeWidth="1.5" opacity="0.8"/>
                      <circle cx={45} cy={0} r="3" fill="#10b981"/><circle cx={-45} cy={0} r="3" fill="#ef4444"/>
                      <text x="35" y="-10" fill="#4a5e80" fontSize="6">출발</text>
                      <text x="-55" y="-10" fill="#4a5e80" fontSize="6">목적</text>
                      <line x1="-50" y1="0" x2="50" y2="0" stroke="#4a5e80" strokeWidth="0.5" strokeDasharray="2,2"/>
                      <line x1="0" y1="-30" x2="0" y2="30" stroke="#4a5e80" strokeWidth="0.5" strokeDasharray="2,2"/>
                      <text x="3" y="-28" fill="#f59e0b" fontSize="5">↕ {f8Range}m</text>
                    </>;
                  })()}
                </svg>
              </div>
            </div>
          )}

          {/* ═══ 충돌공격 WP 설정 ═══ */}
          {!wConc&&wTy==="충돌공격"&&(
            <div style={{background:"rgba(220,38,38,0.08)",border:"1px solid rgba(220,38,38,0.3)",borderRadius:5,padding:8,marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:"#dc2626",marginBottom:6}}>💥 충돌 공격 설정</div>
              <div style={{fontSize:8,color:"#8899b4",marginBottom:6}}>
                표적을 선택하면 시뮬레이션 중 표적의 <b style={{color:"#dc2626"}}>최신 위치를 실시간 추적</b>하여 충돌합니다.<br/>
                경유점 수동 설정 불필요 — 표적 위치로 자동 항해합니다.
              </div>
              <F l="🎯 충돌 표적 선택">
                <select value={wCollTgt?.id||""} onChange={e=>{
                  if(!e.target.value){setWCollTgt(null);return;}
                  const en=units.find(u=>u.platformId===+e.target.value);
                  if(en)setWCollTgt({id:en.platformId,name:en.name});
                }} style={{...S.inp,borderColor:wCollTgt?"#dc2626":"#1e2d4a",fontSize:10}}>
                  <option value="">— 표적 선택 —</option>
                  {units.filter(u=>u.side==="enemy").map(en=>{
                    const eLat=en.wps?.[0]?.waypoints?.[0]?.lat;
                    const eLon=en.wps?.[0]?.waypoints?.[0]?.lon;
                    return <option key={en.platformId} value={en.platformId}>
                      [{en.platformType}] {en.name} (ID:{en.platformId}) {eLat!=null?`— ${eLat.toFixed(4)}, ${eLon?.toFixed(4)}`:""}</option>;
                  })}
                </select>
              </F>
              {wCollTgt&&(
                <div style={{marginTop:6,padding:6,background:"rgba(220,38,38,0.04)",borderRadius:4,border:"1px solid rgba(220,38,38,0.15)"}}>
                  <div style={{fontSize:9,fontWeight:700,color:"#dc2626"}}>💥 → {wCollTgt.name} (ID:{wCollTgt.id})</div>
                  <div style={{fontSize:7,color:"#8899b4",marginTop:2,lineHeight:1.5}}>
                    ✓ 시작시각에 표적 방향으로 자동 항해<br/>
                    ✓ 매 tick 표적 실시간 위치로 항로 갱신<br/>
                    ✓ 100m 이내 접근 시 충돌 → 양측 침몰
                  </div>
                </div>
              )}
              {!wCollTgt&&units.filter(u=>u.side==="enemy").length===0&&(
                <div style={{fontSize:8,color:"#ef4444",padding:4}}>⚠ 적 유닛이 없습니다. 먼저 적 유닛을 추가하세요.</div>
              )}
            </div>
          )}

          {/* ═══ 편대이동 WP 설정 ═══ */}
          {!wConc&&wTy==="편대이동"&&(
            <div style={{background:"rgba(99,102,241,0.06)",border:"1px solid rgba(99,102,241,0.2)",borderRadius:5,padding:8,marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:"#6366f1",marginBottom:6}}>👥 편대 이동 설정</div>
              <div style={{fontSize:8,color:"#8899b4",marginBottom:6,lineHeight:1.6}}>
                아래 경유점에 이동 경로를 설정하고, 편대원을 선택하면<br/>
                각 유닛이 <b style={{color:"#6366f1"}}>이동 방향 수직으로 간격을 유지</b>하며 함께 이동합니다.<br/>
                경로가 꺾이는 구간에서도 각 구간별 수직 방향이 자동 계산됩니다.
              </div>
            </div>
          )}

          {/* ═══ 편대 설정 (8자/타원/편대이동) ═══ */}
          {!wConc&&(wTy==="8자기동"||wTy==="타원기동"||wTy==="편대이동")&&units.filter((u,i)=>i!==wU&&u.side==="friendly"&&(u.type==="USV"||u.type==="SHIP")).length>0&&(
            <div style={{background:"rgba(99,102,241,0.06)",border:"1px solid rgba(99,102,241,0.2)",borderRadius:5,padding:8,marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:"#6366f1",marginBottom:6}}>👥 편대 기동 설정</div>
              <div style={{fontSize:8,color:"#8899b4",marginBottom:6}}>
                편대원을 선택하면 각 유닛별 오프셋 경유점이 자동 생성됩니다. (충돌 방지)
              </div>
              <F l="편대원 선택 (다중 선택)">
                <div style={{maxHeight:100,overflowY:"auto",border:"1px solid #1e2d4a",borderRadius:4,padding:4}}>
                  {units.map((u,i)=>{
                    if(i===wU||u.side==="enemy"||(u.type!=="USV"&&u.type!=="SHIP"))return null;
                    const checked=wFormUnits.includes(i);
                    return(
                      <label key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"3px 4px",cursor:"pointer",
                        background:checked?"rgba(99,102,241,0.08)":"transparent",borderRadius:3,marginBottom:1}}>
                        <input type="checkbox" checked={checked} onChange={()=>{
                          setWFormUnits(prev=>checked?prev.filter(x=>x!==i):[...prev,i]);
                        }} style={{accentColor:"#6366f1"}}/>
                        <div style={{width:7,height:7,borderRadius:"50%",background:UC[i%UC.length],flexShrink:0}}/>
                        <span style={{fontSize:9,fontWeight:checked?600:400,color:checked?"#e2e8f0":"#8899b4"}}>
                          [{u.type}] {u.name} <span style={{color:"#4a5e80"}}>(ID:{u.platformId})</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </F>
              <div style={{display:"flex",gap:8}}>
                <F l="유닛 간 간격 (m)" style={{flex:1}}>
                  <input type="number" value={wFormSpacing} onChange={e=>setWFormSpacing(Math.max(10,+e.target.value))} min={10} style={S.inp}/>
                  <div style={{fontSize:7,color:"#4a5e80",marginTop:2}}>
                    권장: {Math.max(50,Math.round((units[wU]?.platformLen||10)*3))}m (플랫폼 길이 {units[wU]?.platformLen||10}m × 3)
                    {wFormSpacing<(units[wU]?.platformLen||10)*1.5&&<span style={{color:"#ef4444"}}> ⚠ 간격이 플랫폼 길이보다 좁음</span>}
                  </div>
                </F>
                <div style={{flex:1,display:"flex",alignItems:"flex-end",paddingBottom:8}}>
                  <div style={{fontSize:8,color:"#6366f1",background:"rgba(99,102,241,0.06)",padding:"4px 8px",borderRadius:3,border:"1px solid rgba(99,102,241,0.15)",width:"100%",textAlign:"center"}}>
                    {(wTy==="8자기동"||wTy==="타원기동")
                      ?`편대 ${1+wFormUnits.length}척 | 종렬 총 길이 ${wFormUnits.length*wFormSpacing}m`
                      :`편대 ${1+wFormUnits.length}척 | 총 폭 ${Math.round(2*Math.ceil(wFormUnits.length/2)*wFormSpacing)}m`}
                  </div>
                </div>
              </div>
              {/* Formation offset preview */}
              {wFormUnits.length>0&&(
                <div style={{marginTop:4,padding:4,background:"rgba(99,102,241,0.03)",borderRadius:3}}>
                  <div style={{fontSize:8,color:"#6366f1",fontWeight:600,marginBottom:3}}>
                    {(wTy==="8자기동"||wTy==="타원기동")?"Follow-the-Leader 미리보기 (종렬 추종):":"오프셋 · 속도 동기화 미리보기:"}
                  </div>
                  {[wU,...wFormUnits].map((ui,mi)=>{
                    const total=1+wFormUnits.length;
                    const isPat=wTy==="8자기동"||wTy==="타원기동";
                    const off=isPat?-mi*wFormSpacing:Math.round(formOff(mi,total,wFormSpacing));
                    return(<div key={mi} style={{fontSize:7,color:"#8899b4",display:"flex",gap:6}}>
                      <span style={{color:mi===0?"#6366f1":"#8899b4",fontWeight:mi===0?600:400}}>
                        {mi===0?"★":"•"} {units[ui]?.name||"?"} → {isPat?(mi===0?"0m (리더)":`${off}m (리더 후방 ${-off}m)`):`${off>0?"+":""}${off}m ${mi===0?"(리더)":"(편대원)"}`}
                      </span>
                    </div>);
                  })}
                  <div style={{fontSize:7,color:"#10b981",marginTop:3}}>
                    {(wTy==="8자기동"||wTy==="타원기동")
                      ?"🚢 해군 Corpen 교리 (Turn-in-Succession): 모든 편대원이 리더 경로를 동일 속도로 추종. 팔로워는 리더보다 간격×순번 m 만큼 뒤에서 같은 궤적을 그립니다. 자기교차 없음, 속도 감속 없음."
                      :"⚡ 속도 동기화: 가장 먼 구간의 편대원이 설정 속도(최대)로 이동하고, 나머지는 비례 감속하여 같은 시간에 같은 경유점을 통과합니다. 어떤 편대원도 설정 속도를 초과하지 않습니다."}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ 경유점 (Waypoints) ═══ */}
          {wConc?(
          <div style={{borderTop:"1px solid #1e2d4a",marginTop:8,paddingTop:8}}>
            <div style={{background:"rgba(168,85,247,0.06)",border:"1px solid rgba(168,85,247,0.2)",borderRadius:5,padding:8}}>
              <div style={{fontSize:10,fontWeight:700,color:"#a855f7",marginBottom:4}}>⚡ 동시 실행 모드</div>
              <div style={{fontSize:8,color:"#8899b4",lineHeight:1.6}}>
                이 WP는 <b>이동 없이</b> 시작시각(T+{wSM*60+wSS}s)에 우측 액션만 실행됩니다.<br/>
                다른 순차 WP(이동, 8자기동 등)와 동시에 병렬 동작합니다.<br/>
                <span style={{color:"#a855f7"}}>예시: 차단선 기동 중 RCWS 사격, 이동 중 자폭드론 발사</span>
              </div>
            </div>
          </div>
          ):(wTy!=="8자기동"&&wTy!=="타원기동"&&wTy!=="충돌공격")?(
          <div style={{borderTop:"1px solid #1e2d4a",marginTop:8,paddingTop:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <span style={{fontSize:10,color:"#f59e0b",fontWeight:700}}>▸ 경유점 (0xFF33) — {wPts.length}개</span>
              <button style={{...S.btnP,fontSize:9,padding:"2px 8px"}} onClick={()=>setWPts(p=>[...p,{lat:p[p.length-1]?.lat??35.1,lon:(p[p.length-1]?.lon??129.0)+0.01,alt:0,speed:p[p.length-1]?.speed??15,speedUnit:p[p.length-1]?.speedUnit??"knots"}])}>+ 경유점</button>
            </div>
            {/* 표적 위치로 경유점 추가 (아군 전용) */}
            {units[wU]?.side!=="enemy"&&units.filter(u=>u.side==="enemy").length>0&&(
              <div style={{display:"flex",gap:4,marginBottom:4,alignItems:"center"}}>
                <span style={{fontSize:8,color:"#ef4444",fontWeight:600,flexShrink:0}}>🎯</span>
                <select id="__wpTgtSel" style={{...S.inp,fontSize:9,flex:1}} defaultValue="">
                  <option value="">표적 위치로 경유점 추가...</option>
                  {units.filter(u=>u.side==="enemy").map(en=>{
                    const eLat=en.wps?.[0]?.waypoints?.[0]?.lat;
                    const eLon=en.wps?.[0]?.waypoints?.[0]?.lon;
                    return <option key={en.platformId} value={JSON.stringify({lat:eLat,lon:eLon,name:en.name,id:en.platformId})}>
                      [{en.platformType}] {en.name} {eLat!=null?`(${eLat.toFixed(4)}, ${eLon?.toFixed(4)})`:""}</option>;
                  })}
                </select>
                <button style={{...S.btnP,fontSize:8,padding:"2px 6px",background:"linear-gradient(135deg,#ef4444,#dc2626)",borderColor:"#ef4444",flexShrink:0}} onClick={()=>{
                  const sel=document.getElementById("__wpTgtSel");if(!sel?.value)return;
                  try{const d=JSON.parse(sel.value);
                    const lastPt=wPts[wPts.length-1];
                    setWPts(p=>[...p,{lat:d.lat||35.1,lon:d.lon||129.0,alt:0,speed:lastPt?.speed||15,speedUnit:lastPt?.speedUnit||"knots",_targetName:d.name,_trackId:d.id||null}]);
                    sel.value="";
                  }catch{}
                }}>추가</button>
              </div>
            )}
            {/* 적 유닛 경유점 안내 */}
            {units[wU]?.side==="enemy"&&(
              <div style={{fontSize:8,color:"#ef4444",marginBottom:4,padding:4,background:"rgba(239,68,68,0.04)",borderRadius:3,border:"1px solid rgba(239,68,68,0.15)"}}>
                ⚠ 적 {units[wU]?.platformType} 이동 경로 설정 — 경유점 순서대로 이동합니다
                {(units[wU]?.platformType==="적잠수함"||wTy==="잠항")&&" | 잠항 WP: alt 값을 음수로 설정하면 수심(m)"}
              </div>
            )}
            <div style={{maxHeight:200,overflowY:"auto"}}>
              {wPts.map((pt,pi)=>{
                const showAlt=wTy==="잠항"||units[wU]?.platformType==="적잠수함"||units[wU]?.cat==="UAV"||units[wU]?.platformType==="자폭드론";
                const isEnemy=units[wU]?.side==="enemy";
                return(
                <div key={pi} style={{display:"flex",gap:4,alignItems:"center",marginBottom:4,padding:4,background:pt._targetName?"rgba(239,68,68,0.04)":wTy==="소노부이투하"?"rgba(6,182,212,0.04)":isEnemy?"rgba(239,68,68,0.02)":"rgba(255,255,255,0.02)",borderRadius:4,border:pt._targetName?"1px solid rgba(239,68,68,0.2)":wTy==="소노부이투하"?"1px solid rgba(6,182,212,0.2)":isEnemy?"1px solid rgba(239,68,68,0.1)":"1px solid #1e2d4a"}}>
                  <span style={{fontSize:9,color:pt._targetName?"#ef4444":wTy==="소노부이투하"?"#06b6d4":isEnemy?"#ef4444":"#06b6d4",fontWeight:700,width:18,textAlign:"center",flexShrink:0}}>{pt._targetName?"🎯":wTy==="소노부이투하"?"🔵":`#${pi+1}`}</span>
                  <div style={{display:"grid",gridTemplateColumns:showAlt?"1fr 1fr .7fr .7fr .5fr":"1fr 1fr .8fr .5fr",gap:3,flex:1}}>
                    <input type="number" step="0.0001" value={pt.lat} placeholder="위도" onChange={e=>{const v=[...wPts];v[pi]={...v[pi],lat:+e.target.value};setWPts(v);}} style={{...S.inp,fontSize:9,padding:"2px 4px"}} title="위도"/>
                    <input type="number" step="0.0001" value={pt.lon} placeholder="경도" onChange={e=>{const v=[...wPts];v[pi]={...v[pi],lon:+e.target.value};setWPts(v);}} style={{...S.inp,fontSize:9,padding:"2px 4px"}} title="경도"/>
                    {showAlt&&<input type="number" step="1" value={pt.alt||0} placeholder="고도/수심" onChange={e=>{const v=[...wPts];v[pi]={...v[pi],alt:+e.target.value};setWPts(v);}} style={{...S.inp,fontSize:9,padding:"2px 4px",borderColor:pt.alt<0?"#6366f1":"#1e2d4a"}} title="고도(m)/수심(음수)"/>}
                    <input type="number" step="0.1" value={pt.speed} placeholder="속도" onChange={e=>{const v=[...wPts];v[pi]={...v[pi],speed:+e.target.value};setWPts(v);}} style={{...S.inp,fontSize:9,padding:"2px 4px"}} title="속도"/>
                    <select value={pt.speedUnit} onChange={e=>{const v=[...wPts];v[pi]={...v[pi],speedUnit:e.target.value};setWPts(v);}} style={{...S.inp,fontSize:9,padding:"2px 4px"}}>
                      <option value="knots">kt</option><option value="m/s">m/s</option>
                    </select>
                  </div>
                  {pt._targetName&&<span style={{fontSize:7,color:"#ef4444",flexShrink:0,maxWidth:50,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pt._targetName}</span>}
                  {wPts.length>1&&<button onClick={()=>setWPts(p=>p.filter((_,i)=>i!==pi))} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:10,flexShrink:0}}>✕</button>}
                </div>);
              })}
            </div>
            <div style={{fontSize:8,color:"#4a5e80",marginTop:4}}>
              위도 · 경도{(wTy==="잠항"||units[wU]?.platformType==="적잠수함")?" · 고도/수심(m)":""} · 속도({units[wU]?.speedUnit||"knots"}) · 단위
              {units[wU]?.side==="enemy"&&" | 적 이동 경로"}
            </div>
          </div>
          ):(
          <div style={{borderTop:"1px solid #1e2d4a",marginTop:8,paddingTop:8}}>
            {wTy==="충돌공격"?(
              <div>
                <div style={{fontSize:10,color:"#dc2626",fontWeight:700,marginBottom:4}}>💥 충돌 공격 (자동 항해)</div>
                <div style={{fontSize:8,color:"#8899b4",marginBottom:4}}>
                  {wCollTgt?`표적 "${wCollTgt.name}" (ID:${wCollTgt.id})의 실시간 위치로 자동 항해합니다.`:"표적을 선택하세요."}
                </div>
              </div>
            ):(
              <div>
                <div style={{fontSize:10,color:wTy==="타원기동"?"#f59e0b":"#ec4899",fontWeight:700,marginBottom:4}}>{wTy==="타원기동"?"⊙ 타원기동":"∞ 8자기동"} 경유점 (자동 생성)</div>
                <div style={{fontSize:8,color:"#8899b4",marginBottom:4}}>
                  1루프 {wTy==="타원기동"?21:17}경유점 · WP 소요시간({Math.max(wDM*60+wDS,1)}초) 동안 무한 반복
                </div>
                <div style={{maxHeight:100,overflowY:"auto",background:wTy==="타원기동"?"rgba(245,158,11,0.03)":"rgba(236,72,153,0.03)",borderRadius:3,padding:4,border:`1px solid ${wTy==="타원기동"?"rgba(245,158,11,0.1)":"rgba(236,72,153,0.1)"}`}}>
                  {(wTy==="타원기동"?genEllipse:genFig8)(f8OLat,f8OLon,f8DLat,f8DLon,f8Range,f8Spd,f8SpdU).slice(0,6).map((pt,i)=>(
                    <div key={i} style={{fontSize:7,color:"#8899b4",fontFamily:"monospace"}}>
                      #{i+1} {pt.lat.toFixed(4)}, {pt.lon.toFixed(4)} @ {pt.speed}{pt.speedUnit==="knots"?"kt":"m/s"}
                    </div>
                  ))}
                  <div style={{fontSize:7,color:"#4a5e80"}}>... 외 {Math.max(0,(wTy==="타원기동"?21:17)-6)}개 (1루프)</div>
                </div>
              </div>
            )}
          </div>
          )}
        </div>

        {/* Right: Actions */}
        {units[wU]?.side!=="enemy"&&<div style={{flex:"1 1 300px",minWidth:260,borderLeft:"1px solid #1e2d4a",paddingLeft:16,maxHeight:480,overflowY:"auto"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#ef4444",marginBottom:6}}>🎯 WP 액션</div>
          {wActs.length>0&&<div style={{marginBottom:8}}>{wActs.map((a,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:4,padding:"3px 6px",background:"rgba(255,255,255,0.02)",borderRadius:3,marginBottom:2,border:`1px solid ${a.color||"#1e2d4a"}30`}}>
              <span style={{fontSize:11}}>{a.icon}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:9,fontWeight:600}}>{a.label}</div>
                {a.params?._targetName&&<div style={{fontSize:7,color:"#ef4444"}}>🎯 {a.params._targetName}</div>}
                {!a.params?._targetName&&a.params?.target_lat!=null&&<div style={{fontSize:7,color:"#4a5e80"}}>{a.params.target_lat?.toFixed(4)}, {a.params.target_lon?.toFixed(4)}</div>}
              </div>
              <button onClick={()=>setWActs(p=>p.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:10}}>✕</button>
            </div>))}</div>}
          <div style={{fontSize:9,color:"#8899b4",fontWeight:600,marginBottom:4}}>무장 (0xFF37)</div>
          {WPN_ACTS.map(wa=>{const av=(getAW()?.consumable?.[wa.key]||0)-wActs.filter(a=>a.weaponKey===wa.key).length;
            return <AB key={wa.key} act={wa} rem={av} onAdd={p=>setWActs(prev=>[...prev,{category:"weapon",weaponKey:wa.key,weaponType:wa.type,...wa,params:p}])} dLat={wPts[wPts.length-1]?.lat||35.1} dLon={wPts[wPts.length-1]?.lon||129.0} enemies={units.filter(u=>u.side==="enemy")}/>;
          })}
          <div style={{fontSize:9,color:"#8899b4",fontWeight:600,marginBottom:4,marginTop:8}}>센서 (0xFF39)</div>
          {SEN_ACTS.map(sa=>{const av=getAW()?.persistent?.[sa.key==="eoir"?"eo/ir":"tass"]||0;
            return <AB key={sa.key} act={sa} rem={av} isSensor onAdd={p=>setWActs(prev=>[...prev,{category:"sensor",sensorKey:sa.key,sensorType:sa.type,...sa,params:p}])} dLat={wPts[wPts.length-1]?.lat||35.1} dLon={wPts[wPts.length-1]?.lon||129.0} enemies={units.filter(u=>u.side==="enemy")}/>;
          })}
        </div>}
      </div>
      <div style={S.mA}><button style={S.btn} onClick={()=>{setShowAW(false);setEditWP(null);}}>취소</button>
        <button style={S.btnP} onClick={addWP}>{editWP?"저장":`추가 (${wPts.length}경유점${wActs.length>0?` +${wActs.length}액션`:""})`}</button></div>
    </Mod>}
  </div>);
}

// ═══ Action Button ═══