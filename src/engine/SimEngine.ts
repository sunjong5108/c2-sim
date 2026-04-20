/* ═══════════════════════════════════════════════════════════
   C2 Protocol Simulator — Simulation Engine
   물리 기반 시뮬레이션 엔진 (독립 모듈)
   - Great Circle 항법
   - 교전 시스템 (RCWS, 청상어, 자폭드론, 충돌공격)
   - 센서 탐지 (레이더, TASS, 소노부이)
   - 편대 기동 (syncFormAll 속도 동기화)
   - ICD 준수 CSV 생성 (0xDE31~0xFE3B)
   ═══════════════════════════════════════════════════════════ */

import {
  WP_ARRIVE_M,
  RADAR_RANGE,
  SONOBUOY_RANGE,
  TASS_RANGE,
  TASS_OFFSET,
  PLAT_REG,
} from "./constants";
import { hav, brg, mvPt, sMs, mDs, hms, toDeg } from "./geo";
import type {
  PlatformState,
  PlatformTarget,
  ScheduledActionGroup,
  DeployedSonobuoy,
  DeployedDrone,
  DetectedTrack,
  Snapshot,
  ResolvedTarget,
} from "../types/engine";
import type { ActionConfig } from "../types/action";
import type { ScenarioConfig, WeatherState } from "../types/scenario";
import type { WaypointGroup, Waypoint } from "../types/waypoint";

export default class SimEngine {
  platforms: PlatformState[] = [];
  simTime = 0;
  startSec = 0;
  history: Snapshot[] = [];
  running = false;
  speed = 1;
  weather: WeatherState = { direction: 0, speed: 0, rainfall: 0, state: 0, snowfall: 0 };
  deployedSonobuoys: DeployedSonobuoy[] = [];
  deployedDrones: DeployedDrone[] = [];
  detectedTracks: DetectedTrack[] = [];

  load(sc: ScenarioConfig): void {
    this.simTime = 0;
    this.history = [];
    this.running = false;
    this.deployedSonobuoys = [];
    this.deployedDrones = [];
    const p = (sc.scenarioStart || "06:00").split(":");
    this.startSec = (+(p[0] ?? 0) || 0) * 3600 + (+(p[1] ?? 0) || 0) * 60 + (+(p[2] ?? 0) || 0);
    this.platforms = (sc.units || []).map<PlatformState>((u) => {
      const wps: WaypointGroup[] = u.wps || [];
      const firstWp = wps[0]?.waypoints?.[0];
      const iLat = firstWp?.lat ?? 35.1;
      const iLon = firstWp?.lon ?? 129.0;
      const targets: PlatformTarget[] = [];
      const scheduledActs: ScheduledActionGroup[] = [];
      for (const w of wps) {
        const pts: Waypoint[] = w.waypoints || [];
        const isSonoWP = w.type === "소노부이투하";
        const isFig8 = w.fig8Loop || w.type === "8자기동" || w.type === "타원기동";

        if (w.concurrent) {
          if (w.actions?.length) {
            scheduledActs.push({
              time: w.start || 0,
              endTime: (w.start || 0) + (w.duration || 0),
              actions: w.actions,
              wpName: w.name,
              wpType: w.type,
              _fired: false,
            });
          }
          continue;
        }

        const fig8LoopStart = targets.length;
        const wpDuration = w.duration || 600;
        const sonoActs = (w.actions || []).filter(
          (a): a is ActionConfig => a.category === "weapon" && a.weaponKey === "sonobuoy",
        );
        const otherActs = (w.actions || []).filter(
          (a) => !(a.category === "weapon" && a.weaponKey === "sonobuoy"),
        );
        const isFormation = !!w.formation;
        const wpFormLeaderId =
          w.formation?.role === "member" && w.formation?.leaderId ? w.formation.leaderId : null;
        const wpFormOffset = w.formation?.offset || 0;
        const wpFormPredecessorId =
          w.formation?.role === "member" && w.formation?.predecessorId
            ? w.formation.predecessorId
            : null;
        const wpFormSpacing = w.formation?.spacing || 0;
        const smoothed = pts;
        const fig8EndTime = (w.start || 0) + wpDuration;
        const wpMaxSpeedMs =
          (w.maxSpeed ?? 0) > 0
            ? sMs(w.maxSpeed as number, w.maxSpeedUnit || u.speedUnit || "knots")
            : 0;
        const wpTargets: PlatformTarget[] = [];
        for (let pi = 0; pi < smoothed.length; pi++) {
          const sPt = smoothed[pi]!;
          let ptActions: ActionConfig[] = [];
          if (pi === 0) ptActions = [...otherActs];
          if (isSonoWP && pi < sonoActs.length) {
            const sb = sonoActs[pi]!;
            ptActions.push({
              ...sb,
              params: { ...sb.params, target_lat: sPt.lat, target_lon: sPt.lon },
            });
          } else if (!isSonoWP && pi === 0) {
            ptActions.push(...sonoActs);
          }
          wpTargets.push({
            lat: sPt.lat,
            lon: sPt.lon,
            alt: sPt.alt || 0,
            speed: sMs(sPt.speed || 0, sPt.speedUnit || u.speedUnit || "knots"),
            speedDisp: sPt.speed || 0,
            speedUnit: sPt.speedUnit || u.speedUnit || "knots",
            maxSpeedMs: wpMaxSpeedMs,
            wpIdx: targets.length + pi,
            wpName: w.name,
            wpStart: w.start || 0,
            wpEnd: fig8EndTime,
            wpType: w.type || "이동",
            isFirst: pi === 0,
            isLast: pi === smoothed.length - 1,
            _trackId: sPt._trackId || null,
            _targetName: sPt._targetName || null,
            fig8: !!isFig8,
            fig8LoopStart,
            fig8EndTime,
            formLeaderId: wpFormLeaderId,
            formOffset: wpFormOffset,
            formBarrier: isFormation && sPt._formBarrier === true,
            formTotal: isFormation ? sPt._formTotal || 0 : 0,
            formPredecessorId: wpFormPredecessorId,
            formTargetSpacing: wpFormSpacing,
            actions: ptActions,
            _actTrig: false,
          });
        }
        const pArriveM = Math.max(2, Math.round((u.platformLen || 10) / 2));
        const prevWasFig8 = targets.length > 0 && targets[targets.length - 1]?.fig8 === true;
        if (
          !isFig8 &&
          !isFormation &&
          !prevWasFig8 &&
          w.type !== "충돌공격" &&
          u.side !== "enemy" &&
          wpTargets.length >= 2 &&
          wpDuration > 0
        ) {
          const prevLat = targets.length > 0 ? targets[targets.length - 1]!.lat : iLat;
          const prevLon = targets.length > 0 ? targets[targets.length - 1]!.lon : iLon;
          const segDists: number[] = [];
          segDists.push(hav(prevLat, prevLon, wpTargets[0]!.lat, wpTargets[0]!.lon));
          for (let i = 1; i < wpTargets.length; i++) {
            segDists.push(
              hav(wpTargets[i - 1]!.lat, wpTargets[i - 1]!.lon, wpTargets[i]!.lat, wpTargets[i]!.lon),
            );
          }
          let totalTimeAtUserSpd = 0;
          for (let i = 0; i < segDists.length; i++) {
            const segSpd =
              i === 0 ? wpTargets[0]!.speed : wpTargets[i - 1]!.speed || wpTargets[i]!.speed;
            if (segSpd > 0 && segDists[i]! > pArriveM) totalTimeAtUserSpd += segDists[i]! / segSpd;
          }
          if (totalTimeAtUserSpd > 0 && wpDuration > 0) {
            const scale = totalTimeAtUserSpd / wpDuration;
            if (Math.abs(scale - 1) > 0.01) for (const t of wpTargets) t.speed *= scale;
          }
        }
        for (const t of wpTargets) {
          t.wpIdx = targets.length;
          targets.push(t);
        }
      }
      let suicideTrackId: number | null = null;
      for (let ti = targets.length - 1; ti >= 0; ti--) {
        const tid = targets[ti]?._trackId;
        if (tid) {
          suicideTrackId = tid;
          break;
        }
      }
      if (!suicideTrackId) {
        for (const w of wps) {
          if (w.collisionTarget?.id) {
            suicideTrackId = w.collisionTarget.id;
            break;
          }
        }
      }
      const arriveM = Math.max(2, Math.min(10, Math.round((u.platformLen || 10) / 2)));
      const turnRate =
        u.turnRate || Math.max(1.5, Math.min(30, 300 / (u.platformLen || 10)));
      return {
        ...u,
        lat: iLat,
        lon: iLon,
        alt: 0,
        heading: 0,
        speedMs: 0,
        fuel: u.side === "enemy" ? 0 : 100,
        curTgt: 0,
        active: true,
        targets,
        scheduledActs,
        suicideTrackId,
        arriveM,
        turnRate,
        sensorRanges: (() => {
          const src = u.sensorRanges || {
            radar: RADAR_RANGE,
            tass: TASS_RANGE,
            sonobuoy: SONOBUOY_RANGE,
            rcws: 2000,
          };
          const spec = PLAT_REG.find((r) => r.key === u.platformType)?.sr;
          if (!spec) return src;
          return {
            radar: spec.radar === 0 ? 0 : src.radar,
            tass: spec.tass === 0 ? 0 : src.tass,
            sonobuoy: spec.sonobuoy === 0 ? 0 : src.sonobuoy,
            rcws: spec.rcws === 0 ? 0 : src.rcws,
          };
        })(),
        liveWpn: { ...(u.weaponStatus?.consumable || {}) } as Record<string, number>,
        liveSen: { ...(u.weaponStatus?.persistent || {}) } as Record<string, number>,
        initSen: { ...(u.weaponStatus?.persistent || {}) } as Record<string, number>,
        rcws_ammo: u.weaponStatus?.consumable?.rcws_ammo || 0,
        rcwsFiring: [],
        activeActs: [],
      };
    });
  }

  _tryMoveWithAvoidance(p: PlatformState, dist: number): boolean {
    if (dist < 0.001) return true;
    if (p.side !== "friendly") {
      const [nl, no] = mvPt(p.lat, p.lon, p.heading, dist);
      p.lat = nl;
      p.lon = no;
      return true;
    }
    const pTg = p.targets?.[p.curTgt];
    const pAssembly = !!pTg?.formBarrier;
    const pLid = pAssembly ? pTg!.formLeaderId || p.platformId : null;
    const deflections = [0, 15, -15, 30, -30, 45, -45, 60, -60, 90, -90];
    for (const deflect of deflections) {
      const tryH = (p.heading + deflect + 360) % 360;
      const [nl, no] = mvPt(p.lat, p.lon, tryH, dist);
      let collide = false;
      for (const q of this.platforms) {
        if (q === p || !q.active || q.side !== "friendly") continue;
        if (pAssembly) {
          const qTg = q.targets?.[q.curTgt];
          if (qTg?.formBarrier) {
            const qLid = qTg.formLeaderId || q.platformId;
            if (qLid === pLid) continue;
          }
        }
        const safetyD = Math.max(20, ((p.platformLen || 10) + (q.platformLen || 10)) / 2 + 10);
        const dBefore = hav(p.lat, p.lon, q.lat, q.lon);
        const dAfter = hav(nl, no, q.lat, q.lon);
        if (dAfter < safetyD && dAfter < dBefore) {
          collide = true;
          break;
        }
      }
      if (!collide) {
        p.lat = nl;
        p.lon = no;
        if (deflect !== 0) p.heading = tryH;
        return true;
      }
    }
    return false;
  }

  resolveTgt(a: ActionConfig): ResolvedTarget {
    const tid = a.params?.ref_track_id;
    if (tid != null && tid > 0) {
      const enemy = this.platforms.find((ep) => ep.platformId === tid && ep.side === "enemy");
      if (enemy && enemy.active) {
        return { lat: enemy.lat, lon: enemy.lon, name: enemy.name, id: enemy.platformId, live: true };
      }
      if (enemy && !enemy.active) {
        return {
          lat: enemy.lat,
          lon: enemy.lon,
          name: enemy.name,
          id: enemy.platformId,
          live: false,
          destroyed: true,
        };
      }
    }
    return {
      lat: a.params?.target_lat,
      lon: a.params?.target_lon,
      name: a.params?._targetName || null,
      id: tid,
      live: false,
    };
  }

  _releaseFormationBarriers(): void {
    const groups = new Map<number, PlatformState[]>();
    for (const p of this.platforms) {
      if (!p.active) continue;
      const tg = p.targets?.[p.curTgt];
      if (!tg?.formBarrier) continue;
      const lid = tg.formLeaderId || p.platformId;
      if (!groups.has(lid)) groups.set(lid, []);
      groups.get(lid)!.push(p);
    }
    for (const [, members] of groups) {
      if (!members.length) continue;
      const expected = members.reduce(
        (mx, mp) => Math.max(mx, mp.targets[mp.curTgt]?.formTotal || 0),
        0,
      );
      if (expected <= 0 || members.length < expected) continue;
      const arrM0 = members[0]!.arriveM || WP_ARRIVE_M;
      const allReady = members.every((mp) => {
        const t = mp.targets[mp.curTgt]!;
        return hav(mp.lat, mp.lon, t.lat, t.lon) < (mp.arriveM || arrM0);
      });
      if (allReady) {
        for (const mp of members) {
          const relTg = mp.targets[mp.curTgt];
          if (relTg) relTg.formBarrier = false;
          mp.curTgt++;
          const nt = mp.targets[mp.curTgt];
          if (nt) {
            const nd = hav(mp.lat, mp.lon, nt.lat, nt.lon);
            if (nd > 1) mp.heading = brg(mp.lat, mp.lon, nt.lat, nt.lon);
          }
        }
      }
    }
  }

  tick(dt = 1): Snapshot {
    this.simTime += dt * this.speed;
    this._releaseFormationBarriers();
    for (const p of this.platforms) {
      if (!p.active) {
        p.speedMs = 0;
        continue;
      }

      if (p.scheduledActs) {
        for (const sa of p.scheduledActs) {
          if (sa._fired || this.simTime < sa.time) continue;
          sa._fired = true;
          for (const a of sa.actions) {
            const actResult = {
              ...a,
              at: this.simTime,
              result: null as Record<string, unknown> | null,
              fromConcurrent: true,
              concWpName: sa.wpName,
            };
            if (a.category === "weapon" && (p.liveWpn[a.weaponKey] ?? 0) > 0) p.liveWpn[a.weaponKey]!--;
            if (a.category === "sensor") {
              const k = a.sensorKey === "eoir" ? "eo/ir" : "tass";
              if (a.params?.activate !== undefined) p.liveSen[k] = a.params.activate;
            }
            const rt = this.resolveTgt(a);
            if (a.category === "weapon" && a.weaponKey === "sonobuoy") {
              this.deployedSonobuoys.push({
                id: 2500 + this.deployedSonobuoys.length + 1,
                lat: a.params?.target_lat || p.lat,
                lon: a.params?.target_lon || p.lon,
                depth: a.params?.operating_depth || 50,
                duration: a.params?.active_duration || 300,
                deployTime: this.simTime,
                range: p.sensorRanges?.sonobuoy || SONOBUOY_RANGE,
                parentId: p.platformId,
                parentName: p.name,
                deployFromLat: p.lat,
                deployFromLon: p.lon,
              });
            }
            if (a.category === "weapon" && a.weaponKey === "drone") {
              this.deployedDrones.push({
                id: 2400 + this.deployedDrones.length + 1,
                lat: p.lat,
                lon: p.lon,
                alt: a.params?.cruise_altitude || 200,
                speed: a.params?.cruise_speed || 40,
                loiter: a.params?.loiter_radius || 500,
                deployTime: this.simTime,
                tgtLat: rt.lat ?? null,
                tgtLon: rt.lon ?? null,
                trackId: rt.id ?? null,
                phase: "cruise",
                active: true,
                parentId: p.platformId,
              });
            }
            if (a.category === "weapon" && a.weaponKey === "rcws") {
              const rpb = a.params?.rounds_per_burst || 5;
              const bc = a.params?.burst_count || 3;
              const bi = a.params?.burst_interval || 2;
              p.rcwsFiring.push({
                trackId: rt.id ?? null,
                tgtLat: rt.lat ?? null,
                tgtLon: rt.lon ?? null,
                tgtName: rt.name || null,
                rpb,
                bc,
                bi,
                firedBursts: 0,
                nextBurstTime: this.simTime,
                startTime: this.simTime,
                totalRounds: rpb * bc,
              });
              actResult.result = {
                status: "RCWS_FIRING_START",
                note: `점사 시작 (동시실행): ${rpb}발×${bc}회`,
              };
            }
            if (a.category === "weapon" && a.weaponKey === "blueshark") {
              const tgtLat = rt.lat;
              const tgtLon = rt.lon;
              if (tgtLat != null && tgtLon != null) {
                const hitEnemy = rt.live && !rt.destroyed;
                actResult.result = {
                  hitEnemyId: rt.id ?? null,
                  hitEnemyName: rt.name || null,
                  tgtLat,
                  tgtLon,
                  fireLat: p.lat,
                  fireLon: p.lon,
                  distToTarget: Math.round(hav(p.lat, p.lon, tgtLat, tgtLon)),
                  status: hitEnemy ? "TORPEDO_HIT_SUNK" : "TORPEDO_MISS",
                  note: hitEnemy ? `청상어 동시실행 → ${rt.name} 실시간 유도` : "빗나감",
                };
                if (hitEnemy) {
                  const enemy = this.platforms.find((ep) => ep.platformId === rt.id);
                  if (enemy) {
                    enemy.active = false;
                    enemy.sunkBy = "blueshark";
                    enemy.sunkAt = this.simTime;
                  }
                }
              }
            }
            p.activeActs.push(actResult as never);
          }
        }
      }

      if (p.curTgt >= p.targets.length) {
        p.speedMs = 0;
        if (p.platformType === "자폭용USV" && p.active && !p._suicideChecked) {
          p._suicideChecked = true;
          const hullRadius = Math.max(2, (p.platformLen || 3) / 2);
          let hitTarget: PlatformState | null = null;
          let minD = Infinity;
          if (p.suicideTrackId) {
            const tracked = this.platforms.find(
              (ep) => ep.platformId === p.suicideTrackId && ep.side === "enemy" && ep.active,
            );
            if (tracked) {
              hitTarget = tracked;
              minD = hav(p.lat, p.lon, tracked.lat, tracked.lon);
              p.lat = tracked.lat;
              p.lon = tracked.lon;
              minD = 0;
            }
          }
          if (!hitTarget) {
            for (const ep of this.platforms) {
              if (ep.side !== "enemy" || !ep.active) continue;
              const enemyRadius = Math.max(2, (ep.platformLen || 10) / 2);
              const de = hav(p.lat, p.lon, ep.lat, ep.lon);
              if (de <= hullRadius + enemyRadius && de < minD) {
                minD = de;
                hitTarget = ep;
              }
            }
          }
          if (hitTarget) {
            hitTarget.active = false;
            hitTarget.sunkBy = "자폭USV";
            hitTarget.sunkAt = this.simTime;
            p.active = false;
            p.sunkBy = "자폭(자진)";
            p.sunkAt = this.simTime;
            p.activeActs.push({
              category: "weapon",
              weaponKey: "suicide_usv",
              label: "충돌 공격",
              icon: "💥",
              at: this.simTime,
              result: {
                status: "KAMIKAZE_SUNK",
                hitEnemyId: hitTarget.platformId,
                hitEnemyName: hitTarget.name,
                hitEnemyDist: Math.round(minD),
                note: `자폭용USV 충돌 → ${hitTarget.name} 침몰`,
              },
            });
          } else {
            p.activeActs.push({
              category: "weapon",
              weaponKey: "suicide_usv",
              label: "충돌 공격",
              icon: "💥",
              at: this.simTime,
              result: { status: "KAMIKAZE_MISS", note: "표적 위치 도달, 표적 부재" },
            });
            p.active = false;
            p.sunkBy = "자폭(자진)";
            p.sunkAt = this.simTime;
          }
        }
        continue;
      }

      if (p.active && p.suicideTrackId) {
        const trackedEnemy = this.platforms.find(
          (ep) => ep.platformId === p.suicideTrackId && ep.side === "enemy",
        );
        if (trackedEnemy && trackedEnemy.active) {
          for (const t of p.targets) {
            if (t._trackId === p.suicideTrackId) {
              t.lat = trackedEnemy.lat;
              t.lon = trackedEnemy.lon;
            }
          }
          const collisionDist = hav(p.lat, p.lon, trackedEnemy.lat, trackedEnemy.lon);
          const moveStep = p.speedMs * dt * this.speed;
          if (collisionDist <= moveStep && !p._suicideChecked) {
            p._suicideChecked = true;
            p.lat = trackedEnemy.lat;
            p.lon = trackedEnemy.lon;
            trackedEnemy.active = false;
            trackedEnemy.sunkBy = "자폭USV";
            trackedEnemy.sunkAt = this.simTime;
            p.active = false;
            p.sunkBy = "자폭(자진)";
            p.sunkAt = this.simTime;
            p.activeActs.push({
              category: "weapon",
              weaponKey: "suicide_usv",
              label: "충돌 공격",
              icon: "💥",
              at: this.simTime,
              result: {
                status: "KAMIKAZE_SUNK",
                hitEnemyId: trackedEnemy.platformId,
                hitEnemyName: trackedEnemy.name,
                hitEnemyDist: 0,
                note: `${p.name} 충돌 → ${trackedEnemy.name} 침몰 (실시간 추적)`,
              },
            });
            continue;
          }
        }
      }

      const tg = p.targets[p.curTgt]!;
      if (this.simTime < tg.wpStart) {
        p.speedMs = 0;
        continue;
      }
      if (tg.actions?.length && !tg._actTrig) {
        tg._actTrig = true;
        for (const a of tg.actions) {
          const actResult = {
            ...a,
            at: this.simTime,
            result: null as Record<string, unknown> | null,
          };
          if (a.category === "weapon" && (p.liveWpn[a.weaponKey] ?? 0) > 0) p.liveWpn[a.weaponKey]!--;
          if (a.category === "sensor") {
            const k = a.sensorKey === "eoir" ? "eo/ir" : "tass";
            if (a.params?.activate !== undefined) p.liveSen[k] = a.params.activate;
          }
          const rt = this.resolveTgt(a);
          if (a.category === "weapon" && a.weaponKey === "sonobuoy") {
            this.deployedSonobuoys.push({
              id: 2500 + this.deployedSonobuoys.length + 1,
              lat: a.params?.target_lat || p.lat,
              lon: a.params?.target_lon || p.lon,
              depth: a.params?.operating_depth || 50,
              duration: a.params?.active_duration || 300,
              deployTime: this.simTime,
              range: p.sensorRanges?.sonobuoy || SONOBUOY_RANGE,
              parentId: p.platformId,
              parentName: p.name,
              deployFromLat: p.lat,
              deployFromLon: p.lon,
            });
          }
          if (a.category === "weapon" && a.weaponKey === "drone") {
            this.deployedDrones.push({
              id: 2400 + this.deployedDrones.length + 1,
              lat: p.lat,
              lon: p.lon,
              alt: a.params?.cruise_altitude || 200,
              speed: a.params?.cruise_speed || 40,
              loiter: a.params?.loiter_radius || 500,
              deployTime: this.simTime,
              tgtLat: rt.lat ?? null,
              tgtLon: rt.lon ?? null,
              trackId: rt.id ?? null,
              phase: "cruise",
              active: true,
              parentId: p.platformId,
            });
          }
          if (a.category === "weapon" && a.weaponKey === "rcws") {
            const rpb = a.params?.rounds_per_burst || 5;
            const bc = a.params?.burst_count || 3;
            const bi = a.params?.burst_interval || 2;
            p.rcwsFiring.push({
              trackId: rt.id ?? null,
              tgtLat: rt.lat ?? null,
              tgtLon: rt.lon ?? null,
              tgtName: rt.name || null,
              rpb,
              bc,
              bi,
              firedBursts: 0,
              nextBurstTime: this.simTime,
              startTime: this.simTime,
              totalRounds: rpb * bc,
            });
            actResult.result = {
              status: "RCWS_FIRING_START",
              note: `점사 시작: ${rpb}발×${bc}회 (간격${bi}s)`,
              totalRounds: rpb * bc,
            };
          }
          if (a.category === "weapon" && a.weaponKey === "blueshark") {
            const tgtLat = rt.lat;
            const tgtLon = rt.lon;
            if (tgtLat != null && tgtLon != null) {
              const distToTarget = hav(p.lat, p.lon, tgtLat, tgtLon);
              const hitEnemy = rt.live && !rt.destroyed;
              actResult.result = {
                hitEnemyId: rt.id ?? null,
                hitEnemyName: rt.name || null,
                distToTarget: Math.round(distToTarget),
                tgtLat,
                tgtLon,
                fireLat: p.lat,
                fireLon: p.lon,
                status: hitEnemy ? "TORPEDO_HIT_SUNK" : "TORPEDO_MISS",
                note: hitEnemy ? `청상어 → ${rt.name} 실시간 유도 명중` : "청상어 빗나감",
              };
              if (hitEnemy) {
                const enemy = this.platforms.find((ep) => ep.platformId === rt.id);
                if (enemy) {
                  enemy.active = false;
                  enemy.sunkBy = "blueshark";
                  enemy.sunkAt = this.simTime;
                }
              }
            }
          }
          p.activeActs.push(actResult as never);
        }
      }
      const dist = hav(p.lat, p.lon, tg.lat, tg.lon);
      const arrM = p.arriveM || WP_ARRIVE_M;
      if (dist < arrM && !(tg.fig8 && this.simTime >= tg.fig8EndTime)) {
        if (tg.formBarrier) {
          p.speedMs = 0;
          continue;
        }
        if (tg.fig8 && tg.isLast && this.simTime < tg.fig8EndTime) {
          p.curTgt = tg.fig8LoopStart;
        } else {
          p.curTgt++;
        }
        const nxt = p.targets[p.curTgt];
        if (nxt) {
          const nDist = hav(p.lat, p.lon, nxt.lat, nxt.lon);
          if (nDist > 1) p.heading = brg(p.lat, p.lon, nxt.lat, nxt.lon);
          let effSpd = p.speedMs;
          if (nxt.maxSpeedMs > 0 && effSpd > nxt.maxSpeedMs) effSpd = nxt.maxSpeedMs;
          const remain = effSpd * dt * this.speed - dist;
          if (remain > 0 && nDist > 0.1) {
            this._tryMoveWithAvoidance(p, Math.min(remain, nDist));
          }
        }
        continue;
      }
      if (tg.fig8 && this.simTime >= tg.fig8EndTime) {
        let nextIdx = p.curTgt + 1;
        while (
          nextIdx < p.targets.length &&
          p.targets[nextIdx]!.fig8 &&
          p.targets[nextIdx]!.fig8LoopStart === tg.fig8LoopStart
        )
          nextIdx++;
        p.curTgt = nextIdx;
        const nxt = p.targets[p.curTgt];
        if (nxt) {
          const nxtWpName = nxt.wpName;
          let endIdx = nextIdx;
          while (endIdx < p.targets.length && p.targets[endIdx]!.wpName === nxtWpName) endIdx++;
          let totalDist = hav(p.lat, p.lon, p.targets[nextIdx]!.lat, p.targets[nextIdx]!.lon);
          for (let k = nextIdx; k < endIdx - 1; k++) {
            totalDist += hav(
              p.targets[k]!.lat,
              p.targets[k]!.lon,
              p.targets[k + 1]!.lat,
              p.targets[k + 1]!.lon,
            );
          }
          const wpEndT =
            p.targets[endIdx - 1]?.wpEnd || this.simTime + Math.max(1, totalDist / 5);
          const timeBudget = Math.max(1, wpEndT - this.simTime);
          let realSpdMs = totalDist / timeBudget;
          if (nxt.maxSpeedMs > 0 && realSpdMs > nxt.maxSpeedMs) realSpdMs = nxt.maxSpeedMs;
          if (realSpdMs < nxt.speed) realSpdMs = nxt.speed;
          if (nxt.maxSpeedMs > 0 && realSpdMs > nxt.maxSpeedMs) realSpdMs = nxt.maxSpeedMs;
          for (let k = nextIdx; k < endIdx; k++) p.targets[k]!.speed = realSpdMs;
          p.speedMs = realSpdMs;

          const nd = hav(p.lat, p.lon, nxt.lat, nxt.lon);
          if (nd > 1) p.heading = brg(p.lat, p.lon, nxt.lat, nxt.lon);
          if (this.simTime >= nxt.wpStart) {
            const md = Math.min(p.speedMs * dt * this.speed, nd);
            if (md > 0.01) this._tryMoveWithAvoidance(p, md);
          }
        }
        continue;
      }
      if (tg.formLeaderId) {
        const leader = this.platforms.find((lp) => lp.platformId === tg.formLeaderId);
        if (leader && leader.active && leader.curTgt < leader.targets.length) {
          const ltg = leader.targets[leader.curTgt]!;
          if (ltg.wpName === tg.wpName) {
            if (this.simTime < ltg.wpStart) {
              p.speedMs = 0;
              continue;
            }
          } else {
            let leaderBefore = false;
            for (let i = leader.curTgt + 1; i < leader.targets.length; i++) {
              if (leader.targets[i]!.wpName === tg.wpName) {
                leaderBefore = true;
                break;
              }
            }
            if (leaderBefore) {
              p.speedMs = 0;
              continue;
            }
          }
        }
      }
      const prevTgt = p.curTgt > 0 ? p.targets[p.curTgt - 1]! : null;
      p.speedMs = prevTgt && prevTgt.wpName === tg.wpName ? prevTgt.speed : tg.speed;
      const segMaxMs = prevTgt && prevTgt.wpName === tg.wpName ? prevTgt.maxSpeedMs : tg.maxSpeedMs;
      if (segMaxMs > 0 && p.speedMs > segMaxMs) p.speedMs = segMaxMs;
      if (tg.formPredecessorId && !tg.formBarrier) {
        const pred = this.platforms.find((lp) => lp.platformId === tg.formPredecessorId);
        if (pred && pred.active && pred.curTgt < pred.targets.length) {
          const predTg = pred.targets[pred.curTgt];
          const predOnSameWp = !!predTg && predTg.wpName === tg.wpName;
          if (predOnSameWp) {
            const actualD = hav(p.lat, p.lon, pred.lat, pred.lon);
            const targetD = tg.formTargetSpacing || 0;
            if (targetD > 0) {
              const err = actualD - targetD;
              const kP = 0.3;
              const baseSpd = pred.speedMs > 0 ? pred.speedMs : p.speedMs;
              let newSpd = baseSpd + kP * err;
              if (newSpd < 0) newSpd = 0;
              const cap = segMaxMs > 0 ? segMaxMs : baseSpd > 0 ? baseSpd * 2 + 5 : 30;
              if (newSpd > cap) newSpd = cap;
              p.speedMs = newSpd;
            }
          }
        }
      }
      if (dist > 1) {
        const desiredB = brg(p.lat, p.lon, tg.lat, tg.lon);
        const isPatternWP = tg.fig8 || tg.wpType === "편대이동";
        if (isPatternWP) {
          p.heading = desiredB;
        } else {
          let hDiff = desiredB - p.heading;
          if (hDiff > 180) hDiff -= 360;
          if (hDiff < -180) hDiff += 360;
          const maxTurn = (p.turnRate || 10) * dt * this.speed;
          if (Math.abs(hDiff) <= maxTurn) {
            p.heading = desiredB;
          } else {
            p.heading = (p.heading + (hDiff > 0 ? maxTurn : -maxTurn) + 360) % 360;
          }
        }
      }
      if (isNaN(p.heading)) p.heading = 0;
      const md = Math.min(p.speedMs * dt * this.speed, dist);
      if (md > 0.01) {
        if (!this._tryMoveWithAvoidance(p, md)) p.speedMs = 0;
      }
      if (tg.alt !== undefined && tg.alt !== p.alt) {
        const altRate = Math.min(Math.abs(tg.alt - p.alt), 5 * dt * this.speed);
        p.alt += (tg.alt > p.alt ? 1 : -1) * altRate;
      }
      if (p.side !== "enemy" && p.fuel > 0)
        p.fuel = Math.max(0, p.fuel - 0.001 * (p.speedMs / 10) * dt * this.speed);
    }

    for (const d of this.deployedDrones) {
      if (!d.active) continue;
      const t = this.simTime - d.deployTime;
      if (d.trackId) {
        const trackedEnemy = this.platforms.find(
          (ep) => ep.platformId === d.trackId && ep.side === "enemy",
        );
        if (trackedEnemy && trackedEnemy.active) {
          d.tgtLat = trackedEnemy.lat;
          d.tgtLon = trackedEnemy.lon;
        }
      }
      if (d.tgtLat != null && d.tgtLon != null) {
        const distToTgt = hav(d.curLat || d.lat, d.curLon || d.lon, d.tgtLat, d.tgtLon);
        const moveStep = d.speed * dt * this.speed;
        if (distToTgt <= moveStep) {
          d.curLat = d.tgtLat;
          d.curLon = d.tgtLon;
          let hitTarget: PlatformState | null = d.trackId
            ? this.platforms.find(
                (ep) => ep.platformId === d.trackId && ep.side === "enemy" && ep.active,
              ) || null
            : null;
          if (!hitTarget) {
            for (const ep of this.platforms) {
              if (ep.side !== "enemy" || !ep.active) continue;
              const enemyRadius = Math.max(2, (ep.platformLen || 10) / 2);
              if (hav(d.tgtLat, d.tgtLon, ep.lat, ep.lon) <= enemyRadius) {
                hitTarget = ep;
                break;
              }
            }
          }
          d.active = false;
          d.phase = "destroyed";
          d.destroyedAt = this.simTime;
          const parent = this.platforms.find((pp) => pp.platformId === d.parentId);
          if (parent) {
            if (hitTarget) {
              const hitDist = hav(d.tgtLat, d.tgtLon, hitTarget.lat, hitTarget.lon);
              hitTarget.active = false;
              hitTarget.sunkBy = "자폭드론";
              hitTarget.sunkAt = this.simTime;
              parent.activeActs.push({
                category: "weapon",
                weaponKey: "drone_suicide",
                label: "자폭드론 돌입",
                icon: "💥",
                at: this.simTime,
                result: {
                  status: "DRONE_SUNK",
                  hitEnemyId: hitTarget.platformId,
                  hitEnemyName: hitTarget.name,
                  hitEnemyDist: Math.round(hitDist),
                  note: `자폭드론 돌입 → ${hitTarget.name} 침몰`,
                },
              });
            } else {
              parent.activeActs.push({
                category: "weapon",
                weaponKey: "drone_suicide",
                label: "자폭드론 돌입",
                icon: "💥",
                at: this.simTime,
                result: { status: "DRONE_MISS", note: "표적 위치 도달, 표적 부재" },
              });
            }
          }
        } else {
          const b = brg(d.curLat || d.lat, d.curLon || d.lon, d.tgtLat, d.tgtLon);
          const [nl, no] = mvPt(d.curLat || d.lat, d.curLon || d.lon, b, moveStep);
          d.curLat = nl;
          d.curLon = no;
          d.phase = "attack_run";
        }
      } else {
        const angle = (t * 0.05) % (2 * Math.PI);
        const [la, lo] = mvPt(d.lat, d.lon, toDeg(angle), d.loiter);
        d.curLat = la;
        d.curLon = lo;
        d.phase = "loiter";
      }
    }

    for (const p of this.platforms) {
      if (!p.active || !p.rcwsFiring?.length) continue;
      const rcwsRange = p.sensorRanges?.rcws || 2000;
      for (const f of p.rcwsFiring) {
        if (f.firedBursts >= f.bc) continue;
        if (this.simTime < f.nextBurstTime) continue;
        if (f.trackId) {
          const en = this.platforms.find(
            (e) => e.platformId === f.trackId && e.side === "enemy",
          );
          if (en) {
            f.tgtLat = en.lat;
            f.tgtLon = en.lon;
          }
        }
        const dist = f.tgtLat != null ? hav(p.lat, p.lon, f.tgtLat, f.tgtLon!) : Infinity;
        const inRange = dist <= rcwsRange;
        if (inRange && p.rcws_ammo >= f.rpb) {
          p.rcws_ammo -= f.rpb;
          f.firedBursts++;
          f.nextBurstTime = this.simTime + f.bi;
          p.activeActs.push({
            category: "weapon",
            weaponKey: "rcws_burst",
            label: "RCWS 점사",
            icon: "🟠",
            at: this.simTime,
            result: {
              status: "BURST_FIRE",
              burst: f.firedBursts,
              of: f.bc,
              rounds: f.rpb,
              ammoLeft: p.rcws_ammo,
              dist: Math.round(dist),
              tgtName: f.tgtName,
              trackId: f.trackId,
              tgtLat: f.tgtLat,
              tgtLon: f.tgtLon,
              note: `점사 ${f.firedBursts}/${f.bc} (${f.rpb}발) 잔탄:${p.rcws_ammo}`,
            },
          });
        } else if (!inRange) {
          p.activeActs.push({
            category: "weapon",
            weaponKey: "rcws_burst",
            label: "RCWS",
            icon: "🟠",
            at: this.simTime,
            result: {
              status: "OUT_OF_RANGE",
              dist: Math.round(dist),
              rcwsRange,
              note: `사거리 밖 (${Math.round(dist)}m>${rcwsRange}m)`,
            },
          });
          f.firedBursts = f.bc;
        } else if (p.rcws_ammo < f.rpb) {
          f.firedBursts = f.bc;
          p.activeActs.push({
            category: "weapon",
            weaponKey: "rcws_burst",
            label: "RCWS",
            icon: "🟠",
            at: this.simTime,
            result: { status: "AMMO_DEPLETED", ammoLeft: p.rcws_ammo, note: "탄약 소진" },
          });
        }
      }
      p.rcwsFiring = p.rcwsFiring.filter((f) => f.firedBursts < f.bc);
    }

    this.detectedTracks = [];
    for (const p of this.platforms) {
      if (!p.active || p.side === "enemy") continue;
      const sr = p.sensorRanges;
      for (const en of this.platforms) {
        if (en.side !== "enemy" || !en.active) continue;
        const d = hav(p.lat, p.lon, en.lat, en.lon);
        const isSub = en.platformType === "적잠수함" || en.type === "ENEMY_SUB";
        if (!isSub && d <= sr.radar) {
          this.detectedTracks.push({
            sensorType: "RADAR",
            sensorId: p.platformId,
            sensorName: p.name,
            sLat: p.lat,
            sLon: p.lon,
            trackId: en.platformId,
            trackName: en.name,
            lat: en.lat,
            lon: en.lon,
            dist: Math.round(d),
            bearing: Math.round(brg(p.lat, p.lon, en.lat, en.lon)),
          });
        }
        if (isSub && d <= sr.tass && p.liveSen?.tass) {
          const tassHdg = (p.heading + 180) % 360;
          const [tLat, tLon] = mvPt(p.lat, p.lon, tassHdg, 300);
          const dTass = hav(tLat, tLon, en.lat, en.lon);
          if (dTass <= sr.tass) {
            const tassBrg = Math.round(brg(tLat, tLon, en.lat, en.lon));
            const sensorHdg = Math.round(p.heading);
            this.detectedTracks.push({
              sensorType: "TASS",
              sensorId: p.platformId,
              sensorName: p.name,
              sLat: tLat,
              sLon: tLon,
              shipLat: p.lat,
              shipLon: p.lon,
              trackId: en.platformId,
              trackName: en.name,
              lat: en.lat,
              lon: en.lon,
              dist: Math.round(dTass),
              bearing: tassBrg,
              heading: sensorHdg,
            });
          }
        }
      }
      for (const sb of this.deployedSonobuoys) {
        if (this.simTime - sb.deployTime > sb.duration) continue;
        for (const en of this.platforms) {
          if (en.side !== "enemy" || !en.active) continue;
          const isSub = en.platformType === "적잠수함" || en.type === "ENEMY_SUB";
          if (!isSub) continue;
          const d = hav(sb.lat, sb.lon, en.lat, en.lon);
          if (d <= sb.range) {
            this.detectedTracks.push({
              sensorType: "SONOBUOY",
              sensorId: sb.id,
              sensorName: `SB-${sb.id}`,
              sLat: sb.lat,
              sLon: sb.lon,
              trackId: en.platformId,
              trackName: en.name,
              lat: en.lat,
              lon: en.lon,
              dist: Math.round(d),
              bearing: Math.round(brg(sb.lat, sb.lon, en.lat, en.lon)),
            });
          }
        }
      }
    }
    const snap = this.snap();
    this.history.push(snap);
    return snap;
  }

  snap(): Snapshot {
    const abs = this.startSec + this.simTime;
    const enemies = this.platforms.filter((p) => p.side === "enemy");
    return {
      t: Math.round(this.simTime * 10) / 10,
      abs: hms(abs),
      platforms: this.platforms.map((p) => {
        const ct = p.targets?.[p.curTgt];
        const curWpName = ct?.wpName || "-";
        const totalWps = p.wps?.length || 0;
        return {
          id: p.platformId,
          name: p.name,
          type: p.type,
          pt: p.platformType,
          side: p.side,
          lat: Math.round(p.lat * 1e6) / 1e6,
          lon: Math.round(p.lon * 1e6) / 1e6,
          alt: p.alt || 0,
          hdg: Math.round(p.heading * 100) / 100,
          spd: Math.round(mDs(p.speedMs, p.speedUnit || "knots") * 100) / 100,
          spdU: p.speedUnit || "knots",
          fuel: Math.round(p.fuel * 10) / 10,
          curTgt: p.curTgt,
          totalTgts: p.targets?.length || 0,
          totalWps,
          curWpName,
          active: p.active,
          lw: { ...p.liveWpn },
          ls: { ...p.liveSen },
          iSen: { ...p.initSen },
          acts: p.activeActs || [],
          rcws_ammo: p.rcws_ammo || 0,
          rcwsFiring: (p.rcwsFiring || []).map((f) => ({ ...f })),
          suicideTrackId: p.suicideTrackId || null,
          formLeaderId: ct?.formLeaderId || null,
          formOffset: ct?.formOffset || 0,
        };
      }),
      enemies: enemies.map((e) => ({
        id: e.platformId,
        lat: Math.round(e.lat * 1e6) / 1e6,
        lon: Math.round(e.lon * 1e6) / 1e6,
        hdg: Math.round(e.heading * 100) / 100,
        spd: Math.round(mDs(e.speedMs, e.speedUnit || "knots") * 100) / 100,
        active: e.active,
        pt: e.platformType,
        type: e.type,
      })),
      sonobuoys: this.deployedSonobuoys.map((s) => ({ ...s })),
      drones: this.deployedDrones.map((d) => ({ ...d, curLat: d.curLat, curLon: d.curLon })),
      weather: this.weather,
      detectedTracks: this.detectedTracks || [],
    };
  }

  _hz(hz: number): Snapshot[] {
    return this.history.filter(
      (s, i) =>
        i === 0 || Math.floor(s.t * hz) !== Math.floor((this.history[i - 1] as Snapshot).t * hz),
    );
  }

  csv_0xDE31(): string {
    let c =
      "sim_time_sec,abs_time,id,altitude,fuel_status,heading,latitude,longitude,speed,speed_unit,weapon_status\n";
    for (const s of this._hz(1))
      for (const p of s.platforms) {
        if (p.side === "enemy") continue;
        if (!p.active) continue;
        const ws = JSON.stringify({
          consumable: {
            sonobuoy: p.lw?.sonobuoy ?? 0,
            blueshark: p.lw?.blueshark ?? 0,
            rcws: p.lw?.rcws ?? 0,
            drone: p.lw?.drone ?? 0,
          },
          persistent: { tass: p.iSen?.tass ?? 0, "eo/ir": p.iSen?.["eo/ir"] ?? 0 },
        });
        c += `${s.t},${s.abs},${p.id},${p.alt},${p.fuel},${p.hdg},${p.lat},${p.lon},${p.spd},${p.spdU},"${ws.replace(/"/g, '""')}"\n`;
      }
    return c;
  }

  csv_0xDE33(): string {
    let c = "sim_time_sec,abs_time,id,platform_id,bearing,latitude,longitude,tracks\n";
    for (const s of this._hz(1))
      for (const p of s.platforms) {
        if (p.side === "enemy") continue;
        if (!p.active) continue;
        const pf = this.platforms.find((x) => x.platformId === p.id);
        const rng = pf?.sensorRanges?.radar ?? 0;
        if (rng <= 0) continue;
        const tracks: Record<string, { latitude: number; longitude: number }> = {};
        let ti = 1;
        for (const e of s.enemies) {
          if (e.pt === "적잠수함" || e.type === "ENEMY_SUB") continue;
          const d = hav(p.lat, p.lon, e.lat, e.lon);
          if (d < rng) tracks[`track_${String(ti++).padStart(3, "0")}`] = { latitude: e.lat, longitude: e.lon };
        }
        c += `${s.t},${s.abs},${p.id + 10000},${p.id},${p.hdg},${p.lat},${p.lon},"${JSON.stringify(
          tracks,
        ).replace(/"/g, '""')}"\n`;
      }
    return c;
  }

  csv_0xDE35(): string {
    let c = "sim_time_sec,abs_time,direction,speed,rainfall,state,snowfall\n";
    if (this.history.length > 0) {
      const s = this.history[0]!;
      c += `${s.t},${s.abs},${this.weather.direction},${this.weather.speed},${this.weather.rainfall},${this.weather.state},${this.weather.snowfall}\n`;
    }
    return c;
  }

  csv_0xFE31(): string {
    let c = "sim_time_sec,abs_time,id,tracks,latitude,longitude\n";
    for (const s of this._hz(1))
      for (const sb of s.sonobuoys) {
        const elapsed = s.t - sb.deployTime;
        if (elapsed > sb.duration || elapsed < 0) continue;
        const rng = sb.range || SONOBUOY_RANGE;
        const tracks: Record<string, { latitude: number; longitude: number }> = {};
        let ti = 1;
        for (const e of s.enemies) {
          if (e.pt !== "적잠수함" && e.type !== "ENEMY_SUB") continue;
          const d = hav(sb.lat, sb.lon, e.lat, e.lon);
          if (d < rng) tracks[`track_${String(ti++).padStart(3, "0")}`] = { latitude: e.lat, longitude: e.lon };
        }
        c += `${s.t},${s.abs},${sb.id},"${JSON.stringify(tracks).replace(/"/g, '""')}",${sb.lat},${sb.lon}\n`;
      }
    return c;
  }

  csv_0xFE33(): string {
    let c = "sim_time_sec,abs_time,id,tracks,latitude,longitude\n";
    const tassIdMap: Record<number, number> = {};
    let tassSeq = 1;
    for (const p of this.platforms) {
      if (p.side !== "enemy" && p.liveSen?.tass) tassIdMap[p.platformId] = 2600 + tassSeq++;
    }
    for (const s of this._hz(1))
      for (const p of s.platforms) {
        if (p.side === "enemy" || !p.ls?.tass) continue;
        if (!p.active) continue;
        const pf = this.platforms.find((x) => x.platformId === p.id);
        const tassR = pf?.sensorRanges?.tass || TASS_RANGE;
        const tassHdg = (p.hdg + 180) % 360;
        const [tLat, tLon] = mvPt(p.lat, p.lon, tassHdg, TASS_OFFSET);
        const tracks: Record<
          string,
          { latitude: number; longitude: number; heading: number; bearing: number }
        > = {};
        let ti = 1;
        for (const e of s.enemies) {
          if (e.pt !== "적잠수함" && e.type !== "ENEMY_SUB") continue;
          const d = hav(tLat, tLon, e.lat, e.lon);
          if (d < tassR) {
            const sensorHeading = p.hdg;
            const brgSensorToTarget = brg(tLat, tLon, e.lat, e.lon);
            tracks[`track_${String(ti++).padStart(3, "0")}`] = {
              latitude: e.lat,
              longitude: e.lon,
              heading: Math.round(sensorHeading * 100) / 100,
              bearing: Math.round(brgSensorToTarget * 100) / 100,
            };
          }
        }
        const tassId = tassIdMap[p.id] ?? 2600;
        c += `${s.t},${s.abs},${tassId},"${JSON.stringify(tracks).replace(/"/g, '""')}",${
          Math.round(tLat * 1e6) / 1e6
        },${Math.round(tLon * 1e6) / 1e6}\n`;
      }
    return c;
  }

  csv_0xFE39(): string {
    let c = "sim_time_sec,abs_time,id,tracks,altitude,latitude,longitude,speed\n";
    for (const s of this._hz(1))
      for (const d of s.drones) {
        const elapsed = s.t - d.deployTime;
        if (elapsed < 0) continue;
        if (!d.active) continue;
        const lat = d.curLat || d.lat;
        const lon = d.curLon || d.lon;
        const tracks: Record<string, { latitude: number; longitude: number }> = {};
        let ti = 1;
        for (const e of s.enemies) {
          if (e.pt === "적잠수함" || e.type === "ENEMY_SUB") continue;
          const dd = hav(lat, lon, e.lat, e.lon);
          if (dd < RADAR_RANGE) tracks[`track_${String(ti++).padStart(3, "0")}`] = { latitude: e.lat, longitude: e.lon };
        }
        c += `${s.t},${s.abs},${d.id},"${JSON.stringify(tracks).replace(/"/g, '""')}",${d.alt},${
          Math.round(lat * 1e6) / 1e6
        },${Math.round(lon * 1e6) / 1e6},${d.speed}\n`;
      }
    return c;
  }

  csv_0xFE3B(): string {
    let c =
      "sim_time_sec,abs_time,id,platform_id,eoir_heading,latitude,longitude,zoom_level,stream_url\n";
    for (const s of this._hz(2))
      for (const p of s.platforms) {
        if (p.side === "enemy" || !p.ls?.["eo/ir"]) continue;
        if (!p.active) continue;
        c += `${s.t},${s.abs},${p.id + 30000},${p.id},0.0,${p.lat},${p.lon},1,rtsp://sim/${p.id}/eoir\n`;
      }
    return c;
  }
}
