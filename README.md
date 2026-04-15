# C2 Protocol Simulator v4.0

ICD 기반 C2 프로토콜 시뮬레이터 — React 어플리케이션

## 아키텍처

```
c2-sim/
├── index.html                    # Vite 엔트리
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx                  # React DOM 마운트
    ├── index.css                 # 기본 스타일
    ├── App.jsx                   # 메인 UI (시나리오/COP/CSV 탭)
    ├── engine/                   # ★ 독립 시뮬레이션 엔진
    │   ├── index.js              # Barrel export
    │   ├── constants.js          # 플랫폼 레지스트리, 무기/센서 정의
    │   ├── geo.js                # 항법 함수 (haversine, bearing, movePoint)
    │   ├── patterns.js           # 기동 패턴 (8자, 타원, 코너 스무딩)
    │   ├── formations.js         # 편대 유틸 (오프셋, 속도 동기화)
    │   └── SimEngine.js          # ★ 핵심 시뮬레이션 엔진 클래스
    └── hooks/
        └── useSimEngine.js       # 엔진 라이프사이클 훅
```

## 엔진 모듈 구조

### `SimEngine` (클래스)
```javascript
import SimEngine from "./engine/SimEngine.js";

const engine = new SimEngine();
engine.load(scenarioConfig);    // 시나리오 로드
engine.tick(0.2);               // 물리 시뮬레이션 1틱 (dt=0.2초)
const snapshot = engine.snap(); // 현재 상태 스냅샷
const csv = engine.csv_0xDE31(); // ICD CSV 생성
```

### 엔진 하위 모듈

| 모듈 | 역할 | 주요 함수 |
|------|------|-----------|
| `constants.js` | ICD §2.1 플랫폼 레지스트리 | `PLAT_REG`, `ENEMY_TYPES`, `WPN_ACTS` |
| `geo.js` | Great Circle 항법 | `hav()`, `brg()`, `mvPt()`, `sMs()` |
| `patterns.js` | 기동 패턴 생성 | `genFig8()`, `genEllipse()`, `smoothCorners()` |
| `formations.js` | 편대 제어 | `formOff()`, `syncFormAll()`, `offsetRoute()` |
| `SimEngine.js` | 물리 엔진 | `load()`, `tick()`, `snap()`, `csv_*()` |

## 설치 및 실행

```bash
cd c2-sim
npm install
npm run dev
```

## 기능 목록

### 시나리오 설정 (Tab 1)
- 아군/적군 유닛 추가·편집·삭제
- 플랫폼 유형별 무기/센서 자동 설정
- WP 유형: 이동, 정찰, 감시, 타격, 대기, 귀환, 소노부이투하, 8자기동, 타원기동, 충돌공격, 편대이동
- 편대 기동: 리더 중앙 + 좌우 교대 배치, syncFormAll 속도 동기화
- Gantt 차트 시각화
- JSON 시나리오 내보내기/가져오기

### COP 지도 (Tab 2)
- Canvas 기반 전술 상황도
- 실시간 플랫폼 위치, 경유점 경로
- 교전 시각화 (RCWS 사격선, 어뢰 궤적, 자폭 충돌)
- 센서 탐지 범위원 (레이더, TASS, 소노부이)
- TASS 예인선 + 방위각/heading 표시
- 시뮬레이션 제어 (재생/일시정지/리셋, 속도 x1~x30)

### CSV 추출 (Tab 3)
- ICD 스키마 준수 7종 CSV
  - `0xDE31` 아군 플랫폼 (1Hz)
  - `0xDE33` 레이더 탐지 (1Hz)
  - `0xDE35` 기상 (비주기)
  - `0xFE31` 소노부이 (1Hz)
  - `0xFE33` TASS (1Hz)
  - `0xFE39` 자폭드론 (1Hz)
  - `0xFE3B` EO/IR (2Hz)

### 교전 시스템
| 무기 | 효과 | 실시간 추적 |
|------|------|-------------|
| RCWS | 점사 (rounds×burst) | ref_track_id |
| 청상어 | 어뢰 명중/빗나감 | ref_track_id |
| 자폭드론 | 순항→선회→돌입 | trackId |
| 자폭USV | 충돌 공격 | suicideTrackId |

### 센서 탐지 필터링
| 센서 | 탐지 대상 | 비탐지 |
|------|-----------|--------|
| 레이더 | 적 수상함, 적 드론 | 적 잠수함 |
| TASS | 적 잠수함 | 적 수상함/드론 |
| 소노부이 | 적 잠수함 | 적 수상함/드론 |
