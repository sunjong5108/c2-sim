/* C2 Protocol Simulator — Theme */

import type { CSSProperties } from "react";

export const S: Record<string, CSSProperties> = {
  root:{fontFamily:"'Noto Sans KR',system-ui,sans-serif",background:"#0a0e17",color:"#e2e8f0",height:"100vh",display:"flex",flexDirection:"column",overflow:"hidden"},
  hdr:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 14px",borderBottom:"1px solid #1e2d4a",background:"linear-gradient(180deg,rgba(15,23,42,.95),#0a0e17)",flexShrink:0},
  hL:{display:"flex",alignItems:"center",gap:8},logo:{width:28,height:28,background:"linear-gradient(135deg,#3b82f6,#06b6d4)",borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:10,color:"#fff"},
  tab:{fontFamily:"inherit",fontSize:11,fontWeight:500,padding:"4px 10px",border:"1px solid #1e2d4a",borderRadius:5,background:"#151d2e",color:"#8899b4",cursor:"pointer"},
  tabA:{background:"rgba(59,130,246,.15)",borderColor:"#3b82f6",color:"#3b82f6"},
  tb:{display:"flex",alignItems:"center",gap:6,padding:"5px 12px",borderBottom:"1px solid #1e2d4a",background:"#111827",flexWrap:"wrap",flexShrink:0},
  tbG:{display:"flex",alignItems:"center",gap:4,paddingRight:8,borderRight:"1px solid #1e2d4a"},
  tbL:{fontSize:8,color:"#4a5e80",textTransform:"uppercase",letterSpacing:.8,marginRight:2},
  tD:{fontSize:11,fontWeight:600,color:"#06b6d4",background:"rgba(6,182,212,.08)",padding:"3px 8px",borderRadius:4,border:"1px solid rgba(6,182,212,.2)"},
  btn:{fontFamily:"inherit",fontSize:10,fontWeight:500,padding:"4px 10px",border:"1px solid #1e2d4a",borderRadius:5,background:"#151d2e",color:"#8899b4",cursor:"pointer",display:"flex",alignItems:"center",gap:4},
  btnP:{fontFamily:"inherit",fontSize:10,fontWeight:500,padding:"4px 10px",border:"1px solid #3b82f6",borderRadius:5,background:"linear-gradient(135deg,#3b82f6,#2563eb)",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",gap:4},
  inp:{fontFamily:"monospace",fontSize:11,padding:"4px 7px",border:"1px solid #1e2d4a",borderRadius:4,background:"#151d2e",color:"#e2e8f0",outline:"none",width:"100%",boxSizing:"border-box"},
  side:{width:220,minWidth:220,borderRight:"1px solid #1e2d4a",background:"#111827",display:"flex",flexDirection:"column",minHeight:0},
  sideH:{padding:"7px 10px",borderBottom:"1px solid #1e2d4a",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0},
  uRow:{display:"flex",alignItems:"center",padding:"4px 10px",borderBottom:"1px solid #1e2d4a",gap:6,cursor:"pointer",overflow:"hidden"},
  sum:{display:"flex",alignItems:"center",gap:14,padding:"5px 14px",borderTop:"1px solid #1e2d4a",background:"#111827",fontSize:10,color:"#4a5e80",flexShrink:0},
  mO:{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100},
  m:{background:"#151d2e",border:"1px solid #2a3f6a",borderRadius:10,padding:20,maxWidth:"95vw",maxHeight:"90vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.5)"},
  mA:{display:"flex",justifyContent:"flex-end",gap:6,marginTop:14},
  card:{background:"#111827",border:"1px solid #1e2d4a",borderRadius:8,padding:12},
};
