import { S } from "../styles/theme.js";
import { dlCSV } from "../engine/geo.js";


export default function ExpTab({eng,ss,units}){
  const hl=eng.current?.history?.length||0;
  const msgs=[
    {id:"0xDE31",name:"아군 플랫폼",sec:"§3.1",hz:"1Hz",cols:"id, altitude, fuel_status, heading, latitude, longitude, speed, weapon_status(JSON)",fn:()=>eng.current.csv_0xDE31()},
    {id:"0xDE33",name:"레이더",sec:"§3.2",hz:"1Hz",cols:"id, platform_id, bearing, latitude, longitude, tracks(JSON)",fn:()=>eng.current.csv_0xDE33()},
    {id:"0xDE35",name:"기상",sec:"§3.3",hz:"비주기",cols:"direction, speed, rainfall, state, snowfall",fn:()=>eng.current.csv_0xDE35()},
    {id:"0xFE31",name:"소노부이",sec:"§3.4",hz:"1Hz",cols:"id, tracks(JSON), latitude, longitude",fn:()=>eng.current.csv_0xFE31()},
    {id:"0xFE33",name:"TASS",sec:"§3.5",hz:"1Hz",cols:"id, tracks({id:{lat,lon,heading,bearing}}), latitude, longitude",fn:()=>eng.current.csv_0xFE33()},
    {id:"0xFE39",name:"자폭드론",sec:"§3.6",hz:"1Hz",cols:"id, tracks(JSON), altitude, latitude, longitude, speed(m/s)",fn:()=>eng.current.csv_0xFE39()},
    {id:"0xFE3B",name:"EO/IR",sec:"§3.7",hz:"2Hz",cols:"id, platform_id, eoir_heading, latitude, longitude, zoom_level, stream_url",fn:()=>eng.current.csv_0xFE3B()},
  ];
  const dlAll=()=>{if(!hl){alert("시뮬레이션을 먼저 실행하세요.");return;}msgs.forEach(m=>dlCSV(`${m.id}_${m.name}.csv`,m.fn()));};

  return(<div style={{padding:20,maxWidth:960,overflowY:"auto",flex:1,minHeight:0}}>
    <h2 style={{fontSize:16,fontWeight:700,marginBottom:12}}>📤 ICD 메시지별 CSV 내보내기</h2>
    <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center"}}>
      <button style={{...S.btnP,fontSize:12,padding:"8px 16px"}} onClick={dlAll}>⬇ 전체 다운로드 (7개 CSV)</button>
      <span style={{fontSize:10,color:"#4a5e80"}}>{hl>0?`${hl} ticks 기록`:"시뮬레이션 필요"}</span>
    </div>
    <div style={{display:"grid",gap:8}}>
      {msgs.map((m,i)=>(
        <div key={i} style={{...S.card,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:10,fontWeight:700,color:"#06b6d4",background:"rgba(6,182,212,.1)",padding:"2px 8px",borderRadius:4,flexShrink:0}}>{m.id}</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:11,fontWeight:600}}>{m.name} <span style={{fontWeight:400,color:"#4a5e80"}}>{m.sec} · {m.hz}</span></div>
            <div style={{fontSize:8,color:"#8899b4",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{m.cols}</div>
          </div>
          <button style={{...S.btn,flexShrink:0,fontSize:9}} onClick={()=>{if(!hl){alert("시뮬 필요");return;}dlCSV(`${m.id}_${m.name}.csv`,m.fn());}}>⬇ CSV</button>
        </div>
      ))}
    </div>
    {hl>0&&<div style={{...S.card,marginTop:16}}>
      <div style={{fontSize:11,fontWeight:600,marginBottom:6}}>TASS tracks 포맷 미리보기 (0xFE33)</div>
      <pre style={{background:"#0a0e17",border:"1px solid #1e2d4a",borderRadius:4,padding:8,fontSize:9,color:"#10b981",maxHeight:120,overflowY:"auto",whiteSpace:"pre-wrap"}}>
{`// TASS tracks JSON 구조:
{
  "track_001": {
    "latitude": 35.1234,
    "longitude": 129.0567,
    "heading": 45.00,    // 센서 플랫폼 heading (선수 방향)
    "bearing": 120.50    // TASS→표적 절대 방위각
  },
  "track_002": { ... }
}`}
      </pre>
    </div>}
  </div>);
}

// ═══ Shared ═══
