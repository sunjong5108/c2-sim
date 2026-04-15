/* Shared UI helper components */
import { S } from "../styles/theme.js";

export function F({l,children,style}){return(<div style={{marginBottom:8,...style}}><label style={{display:"block",fontSize:9,fontWeight:600,color:"#4a5e80",textTransform:"uppercase",letterSpacing:.8,marginBottom:2}}>{l}</label>{children}</div>);}
export function WF({l,s,v,set}){return(<div style={{background:"rgba(255,255,255,.02)",border:"1px solid #1e2d4a",borderRadius:5,padding:"4px 6px"}}><div style={{fontSize:10,fontWeight:600,marginBottom:1}}>{l}</div><div style={{display:"flex",alignItems:"center",gap:4}}><input type="number" value={v} onChange={e=>set(Math.max(0,+e.target.value))} min={0} style={{...S.inp,width:42,padding:"2px 4px",textAlign:"center"}}/><span style={{fontSize:7,color:"#4a5e80"}}>{s}</span></div></div>);}
export function MT({c,t}){return <span style={{fontSize:7,color:c,background:c+"18",padding:"0 3px",borderRadius:2,border:`1px solid ${c}30`,lineHeight:"12px",whiteSpace:"nowrap"}}>{t}</span>;}
export function Mod({t,close,children,w}){return(<div style={S.mO} onClick={close}><div style={{...S.m,width:w||480}} onClick={e=>e.stopPropagation()}><h3 style={{fontSize:13,fontWeight:600,marginBottom:12}}>{t}</h3>{children}</div></div>);}
