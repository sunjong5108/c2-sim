/* ═══════════════════════════════════════════════════════════
   C2 Protocol Simulator — Simulation Engine
   물리 기반 시뮬레이션 엔진 (독립 모듈)
   - Great Circle 항법
   - 교전 시스템 (RCWS, 청상어, 자폭드론, 충돌공격)
   - 센서 탐지 (레이더, TASS, 소노부이)
   - 편대 기동 (syncFormAll 속도 동기화)
   - ICD 준수 CSV 생성 (0xDE31~0xFE3B)
   ═══════════════════════════════════════════════════════════ */

import { WP_ARRIVE_M, RADAR_RANGE, SONOBUOY_RANGE, TASS_RANGE, TASS_OFFSET } from "./constants.js";
import { hav, brg, mvPt, sMs, mDs, hms } from "./geo.js";
// patterns.js: 엔진에서는 직접 사용하지 않음 (패턴 생성은 UI 레벨에서 처리)

export default class SimEngine {
  constructor() {
    this.platforms = [];
    this.simTime = 0;
    this.startSec = 0;
    this.history = [];
    this.running = false;
    this.speed = 1;
    this.weather = { direction: 0, speed: 0, rainfall: 0, state: 0, snowfall: 0 };
    this.deployedSonobuoys = [];
    this.deployedDrones = [];
  }


  load(sc){
    this.simTime=0;this.history=[];this.running=false;this.deployedSonobuoys=[];this.deployedDrones=[];
    const p=(sc.scenarioStart||"06:00").split(":");this.startSec=(+p[0]||0)*3600+(+p[1]||0)*60+(+p[2]||0);
    this.platforms=(sc.units||[]).map(u=>{
      const wps=u.wps||[];
      const firstWp=wps[0]?.waypoints?.[0];
      const iLat=firstWp?.lat??35.1,iLon=firstWp?.lon??129.0;
      // Build flat waypoint target list from sequential WPs + scheduled actions from concurrent WPs
      const targets=[];
      const scheduledActs=[]; // {time, actions[], wpName, wpType}
      for(const w of wps){
        const pts=w.waypoints||[];
        const isSonoWP=w.type==="소노부이투하";
        const isFig8=w.fig8Loop||w.type==="8자기동"||w.type==="타원기동";

        // ── Concurrent WP: 경유점은 이동에 사용하지 않고, 액션만 시간 기반 예약 ──
        if(w.concurrent){
          if(w.actions?.length){
            scheduledActs.push({time:w.start||0,endTime:(w.start||0)+(w.duration||0),
              actions:w.actions,wpName:w.name,wpType:w.type,_fired:false});
          }
          continue; // skip waypoint target generation
        }

        // ── Sequential WP: 기존 로직 (경유점 → 이동 타겟) ──
        const fig8LoopStart=targets.length;
        let wpDuration=w.duration||600;
        const sonoActs=(w.actions||[]).filter(a=>a.weaponKey==="sonobuoy");
        const otherActs=(w.actions||[]).filter(a=>a.weaponKey!=="sonobuoy");
        const isFormation=!!w.formation;
        // WP 단위 편대 멤버 게이트: 이 WP의 sub-target에만 리더 id 부여 (다음 WP는 독립)
        const wpFormLeaderId=(w.formation?.role==="member"&&w.formation?.leaderId)?w.formation.leaderId:null;
        const wpFormOffset=w.formation?.offset||0;
        // 경유점 = 원본 그대로 사용 (COP 표시와 실제 이동 경로 일치 보장)
        // 선회율 제한은 tick에서 실시간 적용 → 별도 아크 경유점 불필요
        const smoothed=pts;
        const fig8EndTime=(w.start||0)+wpDuration;
        // WP 최대 속력 (m/s) — 0 또는 미설정이면 제한 없음
        const wpMaxSpeedMs=w.maxSpeed>0?sMs(w.maxSpeed,w.maxSpeedUnit||u.speedUnit||"knots"):0;
        // 경유점 목록 먼저 생성
        const wpTargets=[];
        for(let pi=0;pi<smoothed.length;pi++){
          let ptActions=[];
          if(pi===0)ptActions=[...otherActs];
          if(isSonoWP&&pi<sonoActs.length){
            ptActions.push({...sonoActs[pi],params:{...sonoActs[pi].params,target_lat:smoothed[pi].lat,target_lon:smoothed[pi].lon}});
          } else if(!isSonoWP&&pi===0){
            ptActions.push(...sonoActs);
          }
          wpTargets.push({lat:smoothed[pi].lat,lon:smoothed[pi].lon,alt:smoothed[pi].alt||0,
            speed:sMs(smoothed[pi].speed||0,smoothed[pi].speedUnit||u.speedUnit||"knots"),
            speedDisp:smoothed[pi].speed||0,speedUnit:smoothed[pi].speedUnit||u.speedUnit||"knots",
            maxSpeedMs:wpMaxSpeedMs,
            wpIdx:targets.length+pi,wpName:w.name,wpStart:w.start||0,wpEnd:fig8EndTime,wpType:w.type||"이동",
            isFirst:pi===0,isLast:pi===smoothed.length-1,
            _trackId:smoothed[pi]._trackId||null,_targetName:smoothed[pi]._targetName||null,
            fig8:isFig8,fig8LoopStart,fig8EndTime,
            formLeaderId:wpFormLeaderId,formOffset:wpFormOffset,
            formBarrier:smoothed[pi]._formBarrier===true,
            formTotal:smoothed[pi]._formTotal||0,
            actions:ptActions,_actTrig:false});
        }
        // ── 소요시간 기반 속도 보정 (fig8/충돌공격/편대 WP 제외) ──
        // ── 소요시간 기반 속도 보정 (fig8/충돌공격/편대 WP/적군 제외) ──
        // 편대 WP는 syncFormAll이 이미 속도를 동기화했으므로 스케일링 금지
        // 적군은 설정 속도 그대로 사용 (duration 무관)
        const pArriveM=Math.max(2,Math.round((u.platformLen||10)/2));
        // 직전 WP가 8자/타원이면 스케일 스킵: fig8은 임의 위상에서 종료하므로
        // "prev=마지막 sub-WP" 가정이 무효 → 스케일이 비현실적(대개 과소)으로 계산되어 다음 WP가 정체.
        const prevWasFig8=targets.length>0&&targets[targets.length-1]?.fig8===true;
        if(!isFig8&&!isFormation&&!prevWasFig8&&w.type!=="충돌공격"&&u.side!=="enemy"&&wpTargets.length>=2&&wpDuration>0){
          // 구간별 거리 + 이전 위치(또는 직전 WP 마지막 위치) → 첫 경유점
          const prevLat=targets.length>0?targets[targets.length-1].lat:iLat;
          const prevLon=targets.length>0?targets[targets.length-1].lon:iLon;
          const segDists=[];
          segDists.push(hav(prevLat,prevLon,wpTargets[0].lat,wpTargets[0].lon));
          for(let i=1;i<wpTargets.length;i++){
            segDists.push(hav(wpTargets[i-1].lat,wpTargets[i-1].lon,wpTargets[i].lat,wpTargets[i].lon));
          }
          // 사용자 설정 속도 기준 소요시간 계산 (tick 동작과 동일한 속도 사용)
          let totalTimeAtUserSpd=0;
          for(let i=0;i<segDists.length;i++){
            // tick 동작: 첫 경유점(i=0) → tg.speed(=T0), 이후 → prevTgt.speed(=T[i-1])
            const segSpd=i===0?wpTargets[0].speed:(wpTargets[i-1].speed||wpTargets[i].speed);
            if(segSpd>0&&segDists[i]>pArriveM)totalTimeAtUserSpd+=segDists[i]/segSpd;
          }
          // 속도 배율: WP duration에 맞게 속도 보정 (빠르면 감속, 느리면 가속)
          if(totalTimeAtUserSpd>0&&wpDuration>0){
            const scale=totalTimeAtUserSpd/wpDuration;
            if(Math.abs(scale-1)>0.01){for(const t of wpTargets)t.speed*=scale;}
          }
        }
        for(const t of wpTargets){t.wpIdx=targets.length;targets.push(t);}
      }
      // 자폭용USV: 마지막 타겟에 trackId가 있으면 실시간 추적 활성화
      let suicideTrackId=null;
      for(let ti=targets.length-1;ti>=0;ti--){if(targets[ti]._trackId){suicideTrackId=targets[ti]._trackId;break;}}
      // 충돌공격 WP에서 설정된 collisionTarget도 suicideTrackId로 사용
      if(!suicideTrackId){for(const w of wps){if(w.collisionTarget?.id){suicideTrackId=w.collisionTarget.id;break;}}}
      const arriveM=Math.max(2,Math.min(10,Math.round((u.platformLen||10)/2)));
      // 최대 선회율 (°/s): 플랫폼 tr 필드 또는 길이 기반 기본값
      const turnRate=u.turnRate||Math.max(1.5,Math.min(30,300/(u.platformLen||10)));
      // 편대 리더 게이트는 target 단위로 저장됨(targets[i].formLeaderId) — 플랫폼 전역 필드 사용 안 함
      return{...u,lat:iLat,lon:iLon,alt:0,heading:0,speedMs:0,fuel:u.side==="enemy"?0:100,
        curTgt:0,active:true,targets,scheduledActs,suicideTrackId,arriveM,turnRate,
        sensorRanges:u.sensorRanges||{radar:RADAR_RANGE,tass:TASS_RANGE,sonobuoy:SONOBUOY_RANGE,rcws:2000},
        liveWpn:{...(u.weaponStatus?.consumable||{})},liveSen:{...(u.weaponStatus?.persistent||{})},
        rcws_ammo:u.weaponStatus?.consumable?.rcws_ammo||0,rcwsFiring:[],activeActs:[]};
    });
  }
  // ── 아군 충돌 회피 이동 (편향 기반) ──
  // COLREGs Rule 8 + APF 이산화: 직진이 막히면 우현(+) 우선으로 편향 시도.
  // 편향 후보를 작은 각도부터 차례로 시도, 첫 비충돌 방향으로 실제 이동.
  // - 적군(enemy)은 편향 없이 곧바로 이동.
  // - 반환값: true=이동 성공, false=모든 방향 막힘(호출자가 speedMs=0 처리).
  _tryMoveWithAvoidance(p,dist){
    if(dist<0.001)return true;
    if(p.side!=="friendly"){
      const[nl,no]=mvPt(p.lat,p.lon,p.heading,dist);
      p.lat=nl;p.lon=no;
      return true;
    }
    const deflections=[0,15,-15,30,-30,45,-45,60,-60,90,-90];
    for(const deflect of deflections){
      const tryH=(p.heading+deflect+360)%360;
      const[nl,no]=mvPt(p.lat,p.lon,tryH,dist);
      let collide=false;
      for(const q of this.platforms){
        if(q===p||!q.active||q.side!=="friendly")continue;
        const safetyD=Math.max(20,((p.platformLen||10)+(q.platformLen||10))/2+10);
        const dBefore=hav(p.lat,p.lon,q.lat,q.lon);
        const dAfter=hav(nl,no,q.lat,q.lon);
        if(dAfter<safetyD&&dAfter<dBefore){collide=true;break;}
      }
      if(!collide){
        p.lat=nl;p.lon=no;
        if(deflect!==0)p.heading=tryH;
        return true;
      }
    }
    return false;
  }
  // ── 표적 실시간 위치 조회: ref_track_id가 있으면 해당 적의 현재 위치 사용 ──
  resolveTgt(a){
    const tid=a.params?.ref_track_id;
    if(tid!=null&&tid>0){
      const enemy=this.platforms.find(ep=>ep.platformId===tid&&ep.side==="enemy");
      if(enemy&&enemy.active)return{lat:enemy.lat,lon:enemy.lon,name:enemy.name,id:enemy.platformId,live:true};
      if(enemy&&!enemy.active)return{lat:enemy.lat,lon:enemy.lon,name:enemy.name,id:enemy.platformId,live:false,destroyed:true};
    }
    // fallback: 정적 좌표
    return{lat:a.params?.target_lat,lon:a.params?.target_lon,name:a.params?._targetName||null,id:tid,live:false};
  }
  // ── 편대 진입 barrier 동시 해제 pre-pass ──
  // 패턴(8자/타원) 편대 WP 의 sub-WP 0 에 진입한 모든 편대원을 묶어,
  // formTotal 전원이 arrM 이내로 도달했을 때 같은 tick 에 한꺼번에 curTgt++ 한다.
  // 이로써 모든 멤버가 같은 tick 에 loop 에 진입 → 이후 syncFormAll 이 위상 유지 보장.
  _releaseFormationBarriers(){
    const groups=new Map();
    for(const p of this.platforms){
      if(!p.active)continue;
      const tg=p.targets?.[p.curTgt];
      if(!tg?.formBarrier)continue;
      const lid=tg.formLeaderId||p.platformId;
      if(!groups.has(lid))groups.set(lid,[]);
      groups.get(lid).push(p);
    }
    for(const [,members] of groups){
      if(!members.length)continue;
      const expected=members.reduce((mx,mp)=>Math.max(mx,mp.targets[mp.curTgt].formTotal||0),0);
      if(expected<=0||members.length<expected)continue;
      const arrM0=members[0].arriveM||WP_ARRIVE_M;
      const allReady=members.every(mp=>{
        const t=mp.targets[mp.curTgt];
        return hav(mp.lat,mp.lon,t.lat,t.lon)<(mp.arriveM||arrM0);
      });
      if(allReady){
        for(const mp of members){
          mp.curTgt++;
          const nt=mp.targets[mp.curTgt];
          if(nt){
            const nd=hav(mp.lat,mp.lon,nt.lat,nt.lon);
            if(nd>1)mp.heading=brg(mp.lat,mp.lon,nt.lat,nt.lon);
          }
        }
      }
    }
  }
  tick(dt=1){
    this.simTime+=dt*this.speed;
    this._releaseFormationBarriers();
    for(const p of this.platforms){
      if(!p.active){p.speedMs=0;continue;}

      // ── Process scheduled actions (concurrent WPs) — time-based, independent of movement ──
      if(p.scheduledActs){
        for(const sa of p.scheduledActs){
          if(sa._fired||this.simTime<sa.time)continue;
          sa._fired=true;
          for(const a of sa.actions){
            const actResult={...a,at:this.simTime,result:null,fromConcurrent:true,concWpName:sa.wpName};
            if(a.category==="weapon"&&p.liveWpn[a.weaponKey]>0)p.liveWpn[a.weaponKey]--;
            if(a.category==="sensor"){const k=a.sensorKey==="eoir"?"eo/ir":"tass";if(a.params?.activate!==undefined)p.liveSen[k]=a.params.activate;}
            const rt=this.resolveTgt(a);
            if(a.weaponKey==="sonobuoy")this.deployedSonobuoys.push({id:2500+this.deployedSonobuoys.length+1,lat:a.params?.target_lat||p.lat,lon:a.params?.target_lon||p.lon,depth:a.params?.operating_depth||50,duration:a.params?.active_duration||300,deployTime:this.simTime,range:p.sensorRanges?.sonobuoy||SONOBUOY_RANGE,parentId:p.platformId,parentName:p.name,deployFromLat:p.lat,deployFromLon:p.lon});
            if(a.weaponKey==="drone"){this.deployedDrones.push({id:2400+this.deployedDrones.length+1,lat:p.lat,lon:p.lon,alt:a.params?.cruise_altitude||200,speed:a.params?.cruise_speed||40,loiter:a.params?.loiter_radius||500,deployTime:this.simTime,tgtLat:rt.lat||null,tgtLon:rt.lon||null,trackId:rt.id||null,phase:"cruise",active:true,parentId:p.platformId});}
            if(a.weaponKey==="rcws"){
              const rpb=a.params?.rounds_per_burst||5,bc=a.params?.burst_count||3,bi=a.params?.burst_interval||2;
              p.rcwsFiring.push({trackId:rt.id||null,tgtLat:rt.lat,tgtLon:rt.lon,tgtName:rt.name||null,rpb,bc,bi,firedBursts:0,nextBurstTime:this.simTime,startTime:this.simTime,totalRounds:rpb*bc});
              actResult.result={status:"RCWS_FIRING_START",note:`점사 시작 (동시실행): ${rpb}발×${bc}회`};
            }
            if(a.weaponKey==="blueshark"){
              const tgtLat=rt.lat,tgtLon=rt.lon;
              if(tgtLat!=null&&tgtLon!=null){const hitEnemy=rt.live&&!rt.destroyed;
                actResult.result={hitEnemyId:rt.id||null,hitEnemyName:rt.name||null,
                  tgtLat,tgtLon,fireLat:p.lat,fireLon:p.lon,
                  distToTarget:Math.round(hav(p.lat,p.lon,tgtLat,tgtLon)),
                  status:hitEnemy?"TORPEDO_HIT_SUNK":"TORPEDO_MISS",note:hitEnemy?`청상어 동시실행 → ${rt.name} 실시간 유도`:"빗나감"};
                if(hitEnemy){const enemy=this.platforms.find(ep=>ep.platformId===rt.id);if(enemy){enemy.active=false;enemy.sunkBy="blueshark";enemy.sunkAt=this.simTime;}}
              }
            }
            p.activeActs.push(actResult);
          }
        }
      }

      // ── Sequential movement processing ──
      if(p.curTgt>=p.targets.length){p.speedMs=0;
        // 비추적 자폭USV: 마지막 경유점 도달 후 반경탐색
        if(p.platformType==="자폭용USV"&&p.active&&!p.suicideTrackId&&!p._suicideChecked){
          p._suicideChecked=true;
          let hitTarget=null,minD=Infinity;
          for(const ep of this.platforms){if(ep.side!=="enemy"||!ep.active)continue;
            const de=hav(p.lat,p.lon,ep.lat,ep.lon);if(de<minD){minD=de;hitTarget=ep;}}
          if(hitTarget&&minD<300){
            hitTarget.active=false;hitTarget.sunkBy="자폭USV";hitTarget.sunkAt=this.simTime;
            p.active=false;p.sunkBy="자폭(자진)";p.sunkAt=this.simTime;
            p.activeActs.push({category:"weapon",weaponKey:"suicide_usv",label:"충돌 공격",icon:"💥",at:this.simTime,
              result:{status:"KAMIKAZE_SUNK",hitEnemyId:hitTarget.platformId,hitEnemyName:hitTarget.name,
                hitEnemyDist:Math.round(minD),note:`자폭용USV 충돌 → ${hitTarget.name} 침몰`}});
          } else {
            p.activeActs.push({category:"weapon",weaponKey:"suicide_usv",label:"충돌 공격",icon:"💥",at:this.simTime,
              result:{status:"KAMIKAZE_MISS",note:"반경 300m 내 표적 없음"}});
            p.active=false;p.sunkBy="자폭(자진)";p.sunkAt=this.simTime;
          }
        }
        continue;
      }

      // ── 충돌 공격 실시간 추적: tg 참조 전에 모든 추적 타겟 좌표 갱신 ──
      if(p.active&&p.suicideTrackId){
        const trackedEnemy=this.platforms.find(ep=>ep.platformId===p.suicideTrackId&&ep.side==="enemy");
        if(trackedEnemy&&trackedEnemy.active){
          // 추적 대상의 현재 위치로 _trackId가 있는 모든 타겟 갱신
          for(const t of p.targets){if(t._trackId===p.suicideTrackId){t.lat=trackedEnemy.lat;t.lon=trackedEnemy.lon;}}
          // 충돌 판정: USV↔적 거리 100m 이내 시 즉시 충돌 (경유점 도달과 무관)
          const collisionDist=hav(p.lat,p.lon,trackedEnemy.lat,trackedEnemy.lon);
          if(collisionDist<100&&!p._suicideChecked){
            p._suicideChecked=true;
            trackedEnemy.active=false;trackedEnemy.sunkBy="자폭USV";trackedEnemy.sunkAt=this.simTime;
            p.active=false;p.sunkBy="자폭(자진)";p.sunkAt=this.simTime;
            p.activeActs.push({category:"weapon",weaponKey:"suicide_usv",label:"충돌 공격",icon:"💥",at:this.simTime,
              result:{status:"KAMIKAZE_SUNK",hitEnemyId:trackedEnemy.platformId,hitEnemyName:trackedEnemy.name,
                hitEnemyDist:Math.round(collisionDist),note:`${p.name} 충돌 → ${trackedEnemy.name} 침몰 (실시간 추적)`}});
            continue; // 파괴됨 → 이동 처리 건너뜀
          }
        }
      }

      const tg=p.targets[p.curTgt];
      if(this.simTime<tg.wpStart){p.speedMs=0;continue;}
      // Trigger actions
      if(tg.actions?.length&&!tg._actTrig){tg._actTrig=true;
        for(const a of tg.actions){
          const actResult={...a,at:this.simTime,result:null};
          if(a.category==="weapon"&&p.liveWpn[a.weaponKey]>0)p.liveWpn[a.weaponKey]--;
          if(a.category==="sensor"){const k=a.sensorKey==="eoir"?"eo/ir":"tass";if(a.params?.activate!==undefined)p.liveSen[k]=a.params.activate;}
          // 표적 실시간 위치 조회
          const rt=this.resolveTgt(a);
          // ── Sonobuoy deploy ──
          if(a.weaponKey==="sonobuoy")this.deployedSonobuoys.push({id:2500+this.deployedSonobuoys.length+1,lat:a.params?.target_lat||p.lat,lon:a.params?.target_lon||p.lon,depth:a.params?.operating_depth||50,duration:a.params?.active_duration||300,deployTime:this.simTime,range:p.sensorRanges?.sonobuoy||SONOBUOY_RANGE,parentId:p.platformId,parentName:p.name,deployFromLat:p.lat,deployFromLon:p.lon});
          // ── Suicide Drone deploy — 실시간 표적 위치로 돌입 ──
          if(a.weaponKey==="drone"){
            this.deployedDrones.push({id:2400+this.deployedDrones.length+1,
              lat:p.lat,lon:p.lon,alt:a.params?.cruise_altitude||200,speed:a.params?.cruise_speed||40,
              loiter:a.params?.loiter_radius||500,deployTime:this.simTime,
              tgtLat:rt.lat||null,tgtLon:rt.lon||null,trackId:rt.id||null,
              phase:"cruise",active:true,parentId:p.platformId});
          }
          // ── RCWS — 점사 세션 생성 (실시간 추적) ──
          if(a.weaponKey==="rcws"){
            const rpb=a.params?.rounds_per_burst||5,bc=a.params?.burst_count||3,bi=a.params?.burst_interval||2;
            p.rcwsFiring.push({
              trackId:rt.id||null,tgtLat:rt.lat,tgtLon:rt.lon,tgtName:rt.name||null,
              rpb,bc,bi,firedBursts:0,nextBurstTime:this.simTime,startTime:this.simTime,
              totalRounds:rpb*bc
            });
            actResult.result={status:"RCWS_FIRING_START",note:`점사 시작: ${rpb}발×${bc}회 (간격${bi}s)`,totalRounds:rpb*bc};
          }
          // ── Blueshark — 실시간 표적 위치로 어뢰 유도 ──
          if(a.weaponKey==="blueshark"){
            const tgtLat=rt.lat,tgtLon=rt.lon;
            if(tgtLat!=null&&tgtLon!=null){
              const distToTarget=hav(p.lat,p.lon,tgtLat,tgtLon);
              const hitEnemy=rt.live&&!rt.destroyed;
              actResult.result={
                hitEnemyId:rt.id||null,hitEnemyName:rt.name||null,
                distToTarget:Math.round(distToTarget),
                tgtLat,tgtLon, // 실시간 표적 좌표 저장
                fireLat:p.lat,fireLon:p.lon, // 발사 위치
                status:hitEnemy?"TORPEDO_HIT_SUNK":"TORPEDO_MISS",
                note:hitEnemy?`청상어 → ${rt.name} 실시간 유도 명중`:"청상어 빗나감"
              };
              if(hitEnemy){const enemy=this.platforms.find(ep=>ep.platformId===rt.id);if(enemy){enemy.active=false;enemy.sunkBy="blueshark";enemy.sunkAt=this.simTime;}}
            }
          }
          p.activeActs.push(actResult);
        }
      }
      const dist=hav(p.lat,p.lon,tg.lat,tg.lon);
      const arrM=p.arriveM||WP_ARRIVE_M;
      // ── 경유점 도착: 모든 유닛 동일 처리 (편대 멤버 포함) ──
      if(dist<arrM){
        // 편대 진입 barrier: 전원이 sub-WP 0 에 도달할 때까지 대기
        // 실제 해제(curTgt++)는 _releaseFormationBarriers pre-pass 가 담당.
        if(tg.formBarrier){p.speedMs=0;continue;}
        if(tg.fig8&&tg.isLast&&this.simTime<tg.fig8EndTime){p.curTgt=tg.fig8LoopStart;}
        else{p.curTgt++;}
        const nxt=p.targets[p.curTgt];
        if(nxt){
          const nDist=hav(p.lat,p.lon,nxt.lat,nxt.lon);
          if(nDist>1)p.heading=brg(p.lat,p.lon,nxt.lat,nxt.lon);
          // maxSpeed 클램프 (이어달리기 잔여 이동)
          let effSpd=p.speedMs;
          if(nxt.maxSpeedMs>0&&effSpd>nxt.maxSpeedMs)effSpd=nxt.maxSpeedMs;
          const remain=effSpd*dt*this.speed-dist;
          if(remain>0&&nDist>0.1){
            // 잔여 이동도 편향 회피 적용. 실패해도 speedMs 유지 — 다음 tick 주 이동에서 재시도.
            this._tryMoveWithAvoidance(p,Math.min(remain,nDist));
          }
        }
        continue;
      }
      // ── 8자/타원 소요시간 종료 → 다음 WP로 진행 ──
      if(tg.fig8&&this.simTime>=tg.fig8EndTime){
        let nextIdx=p.curTgt+1;
        while(nextIdx<p.targets.length&&p.targets[nextIdx].fig8&&p.targets[nextIdx].fig8LoopStart===tg.fig8LoopStart)nextIdx++;
        p.curTgt=nextIdx;
        const nxt=p.targets[p.curTgt];
        if(nxt){
          // ── Runtime 재스케일 ──
          // fig8 은 임의 위상에서 종료되므로 유닛의 실제 위치와 남은 시간 예산을 이용해
          // 다음 WP 의 sub-WP 속도를 실제 경로 길이에 맞춰 재계산한다. 그렇지 않으면
          // 사용자-설정 속도가 과/부족하여 overshoot + turn-rate orbit 또는 미도달 발생.
          const nxtWpName=nxt.wpName;
          let endIdx=nextIdx;
          while(endIdx<p.targets.length&&p.targets[endIdx].wpName===nxtWpName)endIdx++;
          let totalDist=hav(p.lat,p.lon,p.targets[nextIdx].lat,p.targets[nextIdx].lon);
          for(let k=nextIdx;k<endIdx-1;k++){
            totalDist+=hav(p.targets[k].lat,p.targets[k].lon,p.targets[k+1].lat,p.targets[k+1].lon);
          }
          const wpEndT=p.targets[endIdx-1]?.wpEnd||(this.simTime+Math.max(1,totalDist/5));
          const timeBudget=Math.max(1,wpEndT-this.simTime);
          let realSpdMs=totalDist/timeBudget;
          // 사용자 최대 속력 상한이 있으면 clamp
          if(nxt.maxSpeedMs>0&&realSpdMs>nxt.maxSpeedMs)realSpdMs=nxt.maxSpeedMs;
          // 너무 느려서 못 미칠 경우 사용자-설정 값과 max 로 하한 보정
          if(realSpdMs<nxt.speed)realSpdMs=nxt.speed;
          if(nxt.maxSpeedMs>0&&realSpdMs>nxt.maxSpeedMs)realSpdMs=nxt.maxSpeedMs;
          for(let k=nextIdx;k<endIdx;k++)p.targets[k].speed=realSpdMs;
          p.speedMs=realSpdMs;

          const nd=hav(p.lat,p.lon,nxt.lat,nxt.lon);
          if(nd>1)p.heading=brg(p.lat,p.lon,nxt.lat,nxt.lon);
          if(this.simTime>=nxt.wpStart){
            const md=Math.min(p.speedMs*dt*this.speed,nd);
            if(md>0.01)this._tryMoveWithAvoidance(p,md);
          }
        }
        continue;
      }
      // ── 편대 멤버: 리더가 실제로 이동 상태일 때만 멤버도 이동 ──
      // 게이트는 현재 타겟 단위(tg.formLeaderId)로 판단 — 편대 WP에서만 작동, 이후 일반 WP에서는 독립 이동
      if(tg.formLeaderId){
        const leader=this.platforms.find(lp=>lp.platformId===tg.formLeaderId);
        const ltg=leader?.targets[leader?.curTgt];
        const leaderReady=leader&&leader.active&&leader.curTgt<leader.targets.length&&ltg&&this.simTime>=ltg.wpStart;
        if(!leaderReady){p.speedMs=0;continue;}
      }
      // ── 이동: 모든 유닛이 자기 WP 방향으로 이동 ──
      const prevTgt=p.curTgt>0?p.targets[p.curTgt-1]:null;
      p.speedMs=(prevTgt&&prevTgt.wpName===tg.wpName)?prevTgt.speed:tg.speed;
      // ── WP 최대 속력 클램프: syncFormAll/스케일링 결과가 maxSpeed를 초과하지 않도록 ──
      const segMaxMs=(prevTgt&&prevTgt.wpName===tg.wpName)?prevTgt.maxSpeedMs:tg.maxSpeedMs;
      if(segMaxMs>0&&p.speedMs>segMaxMs)p.speedMs=segMaxMs;
      if(dist>1){
        const desiredB=brg(p.lat,p.lon,tg.lat,tg.lon);
        const isPatternWP=tg.fig8||tg.wpType==="편대이동";
        if(isPatternWP){
          p.heading=desiredB; // 패턴 WP: N=64 고밀도 곡선, 직접 heading
        } else {
          // 일반 WP: 선회율 제한
          let hDiff=desiredB-p.heading;
          if(hDiff>180)hDiff-=360;if(hDiff<-180)hDiff+=360;
          const maxTurn=(p.turnRate||10)*dt*this.speed;
          if(Math.abs(hDiff)<=maxTurn){p.heading=desiredB;}
          else{p.heading=(p.heading+(hDiff>0?maxTurn:-maxTurn)+360)%360;}
        }
      }
      if(isNaN(p.heading))p.heading=0;
      const md=Math.min(p.speedMs*dt*this.speed,dist);
      if(md>0.01){
        // 편향 기반 회피 이동 — 충돌 예측 시 우현 우선으로 각도 틀어 지나감
        if(!this._tryMoveWithAvoidance(p,md))p.speedMs=0;
      }
      if(tg.alt!==undefined&&tg.alt!==p.alt){const altRate=Math.min(Math.abs(tg.alt-p.alt),5*dt*this.speed);p.alt+=(tg.alt>p.alt?1:-1)*altRate;}
      if(p.side!=="enemy"&&p.fuel>0)p.fuel=Math.max(0,p.fuel-0.001*(p.speedMs/10)*dt*this.speed);
    }
    // ── (편대 대형은 offsetPat + syncFormAll 속도 동기화로 유지) ──
    // ── Deployed drones: cruise → loiter → suicide attack ──
    for(const d of this.deployedDrones){
      if(!d.active)continue;
      const t=this.simTime-d.deployTime;
      // ── 실시간 표적 추적: trackId가 있으면 매 tick마다 적 현재 위치로 갱신 ──
      if(d.trackId){
        const trackedEnemy=this.platforms.find(ep=>ep.platformId===d.trackId&&ep.side==="enemy");
        if(trackedEnemy&&trackedEnemy.active){
          d.tgtLat=trackedEnemy.lat;d.tgtLon=trackedEnemy.lon;
        }
      }
      if(d.tgtLat!=null&&d.tgtLon!=null){
        const distToTgt=hav(d.curLat||d.lat,d.curLon||d.lon,d.tgtLat,d.tgtLon);
        if(distToTgt<100){
          // Arrived at target → suicide attack
          let hitTarget=null,minD=Infinity;
          for(const ep of this.platforms){if(ep.side!=="enemy"||!ep.active)continue;
            const de=hav(d.tgtLat,d.tgtLon,ep.lat,ep.lon);if(de<minD){minD=de;hitTarget=ep;}}
          const hitEnemy=hitTarget&&minD<300;
          d.active=false;d.phase="destroyed";d.destroyedAt=this.simTime;
          // Record on parent platform
          const parent=this.platforms.find(p=>p.platformId===d.parentId);
          if(parent){
            if(hitEnemy){
              hitTarget.active=false;hitTarget.sunkBy="자폭드론";hitTarget.sunkAt=this.simTime;
              parent.activeActs.push({category:"weapon",weaponKey:"drone_suicide",label:"자폭드론 돌입",icon:"💥",at:this.simTime,
                result:{status:"DRONE_SUNK",hitEnemyId:hitTarget.platformId,hitEnemyName:hitTarget.name,
                  hitEnemyDist:Math.round(minD),note:`자폭드론 돌입 → ${hitTarget.name} 침몰`}});
            } else {
              parent.activeActs.push({category:"weapon",weaponKey:"drone_suicide",label:"자폭드론 돌입",icon:"💥",at:this.simTime,
                result:{status:"DRONE_MISS",note:"반경 300m 내 표적 없음"}});
            }
          }
        } else {
          // Fly toward target
          const b=brg(d.curLat||d.lat,d.curLon||d.lon,d.tgtLat,d.tgtLon);
          const md=Math.min(d.speed*dt*this.speed,distToTgt);
          const[nl,no]=mvPt(d.curLat||d.lat,d.curLon||d.lon,b,md);
          d.curLat=nl;d.curLon=no;d.phase="attack_run";
        }
      } else {
        // No target → loiter in circle
        const angle=(t*0.05)%(2*Math.PI);
        const[la,lo]=mvPt(d.lat,d.lon,toDeg(angle),d.loiter);
        d.curLat=la;d.curLon=lo;d.phase="loiter";
      }
    }
    // ── RCWS 점사 처리 (매 tick) ──
    for(const p of this.platforms){
      if(!p.active||!p.rcwsFiring?.length)continue;
      const rcwsRange=p.sensorRanges?.rcws||2000;
      for(const f of p.rcwsFiring){
        if(f.firedBursts>=f.bc)continue; // 완료된 세션
        if(this.simTime<f.nextBurstTime)continue; // 다음 점사 시간 안됨
        // 실시간 표적 위치 갱신
        if(f.trackId){const en=this.platforms.find(e=>e.platformId===f.trackId&&e.side==="enemy");if(en){f.tgtLat=en.lat;f.tgtLon=en.lon;}}
        // 사거리 판정 + 발사
        const dist=f.tgtLat!=null?hav(p.lat,p.lon,f.tgtLat,f.tgtLon):Infinity;
        const inRange=dist<=rcwsRange;
        if(inRange&&p.rcws_ammo>=f.rpb){
          p.rcws_ammo-=f.rpb;f.firedBursts++;f.nextBurstTime=this.simTime+f.bi;
          p.activeActs.push({category:"weapon",weaponKey:"rcws_burst",label:"RCWS 점사",icon:"🟠",at:this.simTime,
            result:{status:"BURST_FIRE",burst:f.firedBursts,of:f.bc,rounds:f.rpb,ammoLeft:p.rcws_ammo,
              dist:Math.round(dist),tgtName:f.tgtName,trackId:f.trackId,
              tgtLat:f.tgtLat,tgtLon:f.tgtLon,
              note:`점사 ${f.firedBursts}/${f.bc} (${f.rpb}발) 잔탄:${p.rcws_ammo}`}});
        } else if(!inRange){
          p.activeActs.push({category:"weapon",weaponKey:"rcws_burst",label:"RCWS",icon:"🟠",at:this.simTime,
            result:{status:"OUT_OF_RANGE",dist:Math.round(dist),rcwsRange,note:`사거리 밖 (${Math.round(dist)}m>${rcwsRange}m)`}});
          f.firedBursts=f.bc; // 세션 종료
        } else if(p.rcws_ammo<f.rpb){
          f.firedBursts=f.bc; // 탄약 부족 → 종료
          p.activeActs.push({category:"weapon",weaponKey:"rcws_burst",label:"RCWS",icon:"🟠",at:this.simTime,
            result:{status:"AMMO_DEPLETED",ammoLeft:p.rcws_ammo,note:"탄약 소진"}});
        }
      }
      p.rcwsFiring=p.rcwsFiring.filter(f=>f.firedBursts<f.bc); // 완료 세션 제거
    }
    // ── 센서 탐지 (매 tick) ──
    // 레이더: 수상 표적만 (수상함, 드론) / TASS·소노부이: 수중 표적만 (잠수함)
    this.detectedTracks=[];
    for(const p of this.platforms){
      if(!p.active||p.side==="enemy")continue;
      const sr=p.sensorRanges||{};
      for(const en of this.platforms){
        if(en.side!=="enemy"||!en.active)continue;
        const d=hav(p.lat,p.lon,en.lat,en.lon);
        const isSub=en.platformType==="적잠수함"||en.type==="ENEMY_SUB";
        // 레이더: 수상/공중 표적만 탐지 (잠수함 불가)
        if(!isSub&&d<=sr.radar){this.detectedTracks.push({sensorType:"RADAR",sensorId:p.platformId,sensorName:p.name,sLat:p.lat,sLon:p.lon,trackId:en.platformId,trackName:en.name,lat:en.lat,lon:en.lon,dist:Math.round(d),bearing:Math.round(brg(p.lat,p.lon,en.lat,en.lon))});}
        // TASS: 수중 표적만 탐지 — bearing(TASS센서→표적 절대 방위각), heading(센서 플랫폼 heading)
        if(isSub&&d<=sr.tass&&p.liveSen?.tass){
          // TASS 센서 위치 = 모함 heading 반대 방향 300m 후방
          const tassHdg=(p.heading+180)%360;
          const[tLat,tLon]=mvPt(p.lat,p.lon,tassHdg,300);
          const dTass=hav(tLat,tLon,en.lat,en.lon);
          if(dTass<=sr.tass){
            const tassBrg=Math.round(brg(tLat,tLon,en.lat,en.lon)); // TASS위치→표적 절대 방위각
            const sensorHdg=Math.round(p.heading); // 센서 플랫폼 heading (선수 방향)
            this.detectedTracks.push({sensorType:"TASS",sensorId:p.platformId,sensorName:p.name,
              sLat:tLat,sLon:tLon, // TASS 센서 실제 위치 (모함 후방)
              shipLat:p.lat,shipLon:p.lon, // 모함 위치
              trackId:en.platformId,trackName:en.name,lat:en.lat,lon:en.lon,dist:Math.round(dTass),
              bearing:tassBrg, // TASS센서→표적 절대 방위각
              heading:sensorHdg // 센서 플랫폼 heading
            });
          }
        }
      }
      // 소노부이 탐지: 수중 표적만 (잠수함) — 소노부이 위치 포함
      for(const sb of this.deployedSonobuoys){
        if(this.simTime-sb.deployTime>sb.duration)continue;
        for(const en of this.platforms){
          if(en.side!=="enemy"||!en.active)continue;
          const isSub=en.platformType==="적잠수함"||en.type==="ENEMY_SUB";
          if(!isSub)continue;
          const d=hav(sb.lat,sb.lon,en.lat,en.lon);
          if(d<=sb.range){this.detectedTracks.push({sensorType:"SONOBUOY",sensorId:sb.id,sensorName:`SB-${sb.id}`,sLat:sb.lat,sLon:sb.lon,trackId:en.platformId,trackName:en.name,lat:en.lat,lon:en.lon,dist:Math.round(d),bearing:Math.round(brg(sb.lat,sb.lon,en.lat,en.lon))});}
        }
      }
    }
    const snap=this.snap();this.history.push(snap);return snap;
  }
  snap(){
    const abs=this.startSec+this.simTime;
    const enemies=this.platforms.filter(p=>p.side==="enemy");
    return{t:Math.round(this.simTime*10)/10,abs:hms(abs),
      platforms:this.platforms.map(p=>{
        // Find current WP name
        const ct=p.targets?.[p.curTgt];
        const curWpName=ct?.wpName||"-";
        const totalWps=p.wps?.length||0;
        return{id:p.platformId,name:p.name,type:p.type,pt:p.platformType,side:p.side,
          lat:Math.round(p.lat*1e6)/1e6,lon:Math.round(p.lon*1e6)/1e6,alt:p.alt||0,
          hdg:Math.round(p.heading*100)/100,
          spd:Math.round(mDs(p.speedMs,p.speedUnit||"knots")*100)/100,spdU:p.speedUnit||"knots",
          fuel:Math.round(p.fuel*10)/10,
          curTgt:p.curTgt,totalTgts:p.targets?.length||0,totalWps,curWpName,active:p.active,
          lw:{...p.liveWpn},ls:{...p.liveSen},acts:p.activeActs||[],
          rcws_ammo:p.rcws_ammo||0,rcwsFiring:(p.rcwsFiring||[]).map(f=>({...f})),
          suicideTrackId:p.suicideTrackId||null,formLeaderId:ct?.formLeaderId||null,formOffset:ct?.formOffset||0};
      }),
      enemies:enemies.map(e=>({id:e.platformId,lat:Math.round(e.lat*1e6)/1e6,lon:Math.round(e.lon*1e6)/1e6,hdg:Math.round(e.heading*100)/100,spd:Math.round(mDs(e.speedMs,e.speedUnit||"knots")*100)/100,active:e.active,pt:e.platformType,type:e.type})),
      sonobuoys:this.deployedSonobuoys.map(s=>({...s})),
      drones:this.deployedDrones.map(d=>({...d,curLat:d.curLat,curLon:d.curLon})),
      weather:this.weather,
      detectedTracks:this.detectedTracks||[],
    };
  }
  // ═══ Per-message CSV generators (ICD §3~§4) ═══
  _hz(hz){return this.history.filter((s,i)=>i===0||Math.floor(s.t*hz)!==Math.floor(this.history[i-1].t*hz));}
  csv_0xDE31(){ // 1Hz
    let c="sim_time_sec,abs_time,id,altitude,fuel_status,heading,latitude,longitude,speed,speed_unit,weapon_status\n";
    for(const s of this._hz(1))for(const p of s.platforms){if(p.side==="enemy")continue;
      const ws=JSON.stringify({consumable:{sonobuoy:p.lw?.sonobuoy??0,blueshark:p.lw?.blueshark??0,rcws:p.lw?.rcws??0,drone:p.lw?.drone??0},persistent:{tass:p.ls?.tass??0,"eo/ir":p.ls?.["eo/ir"]??0}});
      c+=`${s.t},${s.abs},${p.id},${p.alt},${p.fuel},${p.hdg},${p.lat},${p.lon},${p.spd},${p.spdU},"${ws.replace(/"/g,'""')}"\n`;}
    return c;
  }
  csv_0xDE33(){ // 1Hz
    let c="sim_time_sec,abs_time,id,platform_id,bearing,latitude,longitude,tracks\n";
    for(const s of this._hz(1))for(const p of s.platforms){if(p.side==="enemy")continue;
      const pf=this.platforms.find(x=>x.platformId===p.id);
      const rng=pf?.sensorRanges?.radar??0;
      if(rng<=0)continue; // 레이더 미탑재 플랫폼 건너뜀
      const tracks={};let ti=1;
      for(const e of s.enemies){if(e.pt==="적잠수함"||e.type==="ENEMY_SUB")continue;const d=hav(p.lat,p.lon,e.lat,e.lon);if(d<rng)tracks[`track_${String(ti++).padStart(3,'0')}`]={latitude:e.lat,longitude:e.lon};}
      c+=`${s.t},${s.abs},${p.id+10000},${p.id},${p.hdg},${p.lat},${p.lon},"${JSON.stringify(tracks).replace(/"/g,'""')}"\n`;}
    return c;
  }
  csv_0xDE35(){
    let c="sim_time_sec,abs_time,direction,speed,rainfall,state,snowfall\n";
    if(this.history.length>0){const s=this.history[0];c+=`${s.t},${s.abs},${this.weather.direction},${this.weather.speed},${this.weather.rainfall},${this.weather.state},${this.weather.snowfall}\n`;}
    return c;
  }
  csv_0xFE31(){ // 1Hz
    let c="sim_time_sec,abs_time,id,tracks,latitude,longitude\n";
    for(const s of this._hz(1))for(const sb of s.sonobuoys){
      const elapsed=s.t-sb.deployTime;if(elapsed>sb.duration||elapsed<0)continue;
      const rng=sb.range||SONOBUOY_RANGE;
      const tracks={};let ti=1;
      for(const e of s.enemies){if(e.pt!=="적잠수함"&&e.type!=="ENEMY_SUB")continue;const d=hav(sb.lat,sb.lon,e.lat,e.lon);if(d<rng)tracks[`track_${String(ti++).padStart(3,'0')}`]={latitude:e.lat,longitude:e.lon};}
      c+=`${s.t},${s.abs},${sb.id},"${JSON.stringify(tracks).replace(/"/g,'""')}",${sb.lat},${sb.lon}\n`;}
    return c;
  }
  csv_0xFE33(){
    // TASS tracks: {id: {latitude, longitude, heading(센서 플랫폼 heading), bearing(TASS→표적 절대 방위각)}}
    let c="sim_time_sec,abs_time,id,tracks,latitude,longitude\n";
    // 안정적 TASS ID 매핑: TASS 탑재 플랫폼 순서대로 2600, 2601, ...
    const tassIdMap={};let tassSeq=1;
    for(const p of this.platforms){if(p.side!=="enemy"&&p.liveSen?.tass)tassIdMap[p.platformId]=2600+tassSeq++;}
    for(const s of this._hz(1))for(const p of s.platforms){
      if(p.side==="enemy"||!p.ls?.tass)continue;
      const pf=this.platforms.find(x=>x.platformId===p.id);
      const tassR=pf?.sensorRanges?.tass||TASS_RANGE;
      const tassHdg=(p.hdg+180)%360;
      const[tLat,tLon]=mvPt(p.lat,p.lon,tassHdg,TASS_OFFSET);
      const tracks={};let ti=1;
      for(const e of s.enemies){
        if(e.pt!=="적잠수함"&&e.type!=="ENEMY_SUB")continue;
        const d=hav(tLat,tLon,e.lat,e.lon);
        if(d<tassR){
          const sensorHeading=p.hdg;
          const brgSensorToTarget=brg(tLat,tLon,e.lat,e.lon);
          tracks[`track_${String(ti++).padStart(3,'0')}`]={
            latitude:e.lat, longitude:e.lon,
            heading:Math.round(sensorHeading*100)/100,
            bearing:Math.round(brgSensorToTarget*100)/100
          };
        }
      }
      const tassId=tassIdMap[p.id]??2600;
      c+=`${s.t},${s.abs},${tassId},"${JSON.stringify(tracks).replace(/"/g,'""')}",${Math.round(tLat*1e6)/1e6},${Math.round(tLon*1e6)/1e6}\n`;}
    return c;
  }
  csv_0xFE39(){ // 1Hz
    let c="sim_time_sec,abs_time,id,tracks,altitude,latitude,longitude,speed\n";
    for(const s of this._hz(1))for(const d of s.drones){
      const elapsed=s.t-d.deployTime;if(elapsed<0)continue;
      const lat=d.curLat||d.lat,lon=d.curLon||d.lon;
      const tracks={};let ti=1;
      for(const e of s.enemies){if(e.pt==="적잠수함"||e.type==="ENEMY_SUB")continue;const dd=hav(lat,lon,e.lat,e.lon);if(dd<RADAR_RANGE)tracks[`track_${String(ti++).padStart(3,'0')}`]={latitude:e.lat,longitude:e.lon};}
      c+=`${s.t},${s.abs},${d.id},"${JSON.stringify(tracks).replace(/"/g,'""')}",${d.alt},${Math.round(lat*1e6)/1e6},${Math.round(lon*1e6)/1e6},${d.speed}\n`;}
    return c;
  }
  csv_0xFE3B(){ // 2Hz
    let c="sim_time_sec,abs_time,id,platform_id,eoir_heading,latitude,longitude,zoom_level,stream_url\n";
    for(const s of this._hz(2))for(const p of s.platforms){
      if(p.side==="enemy"||!p.ls?.["eo/ir"])continue;
      c+=`${s.t},${s.abs},${p.id+30000},${p.id},0.0,${p.lat},${p.lon},1,rtsp://sim/${p.id}/eoir\n`;}
    return c;
  }
}
