/* ═══════════════════════════════════════════════════════════
   Foundry Ontology bridge — placeholder
   Foundry Code Workspace에서 OSDK generate 후 `@osdk/...`에서 import한
   Ontology object 타입을 이 파일에서 re-export.
   ═══════════════════════════════════════════════════════════ */

import type { Unit } from "../types/unit";
import type { ScenarioConfig } from "../types/scenario";

/**
 * Foundry ontology object shape를 기존 도메인 타입으로 변환하는 adapter
 * 자리표시자. 실제 OSDK 사용 시 `@osdk/client`의 `objectSet` 결과를
 * 여기에서 매핑.
 */
export function ontologyToUnit(raw: unknown): Unit {
  return raw as Unit;
}

export function ontologyToScenario(raw: unknown): ScenarioConfig {
  return raw as ScenarioConfig;
}
