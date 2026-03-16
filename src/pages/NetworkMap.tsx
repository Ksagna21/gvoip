import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAllowedIpbx } from "@/hooks/useAllowedIpbx";
import { RefreshCw, ZoomIn, ZoomOut, RotateCcw, Maximize2, Server, Activity } from "lucide-react";

interface IPBX { id:string;name:string;ip_address:string;status:string;ping_latency:number|null; }
interface SipTrunk { id:string;name:string;ipbx_id:string;remote_ipbx_id:string|null;status:string;latency:number|null;channels:number|null;max_channels:number|null;provider:string|null;remote_ip:string|null;local_ip:string|null; }
interface Pos { x:number;y:number; }

const C = {
  online:  "#0ea5e9",
  offline: "#f43f5e",
  warn:    "#f59e0b",
  up:      "#10b981",
  down:    "#f43f5e",
  text:    "hsl(var(--foreground))",
  muted:   "hsl(var(--muted-foreground))",
  border:  "hsl(var(--border))",
  bg:      "hsl(var(--background))",
  card:    "hsl(var(--card))",
  teal:    "#0d9488",
};

const nodeColor = (s:string) => s==="online"?C.online:s==="offline"?C.offline:C.warn;
const trunkColor = (s:string, lat:number|null) => {
  if(s==="down") return C.down;
  if(lat&&lat>100) return C.warn;
  return C.up;
};

const autoLayout = (n:number,cx:number,cy:number):Pos[] => {
  if(!n) return [];
  if(n===1) return [{x:cx,y:cy}];
  const r = Math.min(230,90+n*30);
  return Array.from({length:n},(_,i)=>({
    x:cx+r*Math.cos(2*Math.PI*i/n-Math.PI/2),
    y:cy+r*Math.sin(2*Math.PI*i/n-Math.PI/2),
  }));
};

const NetworkMap = () => {
  const {applyFilter,allowedIpbxIds,isAdmin,ready} = useAllowedIpbx();
  const [ipbxList,setIpbxList] = useState<IPBX[]>([]);
  const [trunks,setTrunks]     = useState<SipTrunk[]>([]);
  const [pos,setPos]           = useState<Record<string,Pos>>({});
  const [loading,setLoading]   = useState(true);
  const [zoom,setZoom]         = useState(1);
  const [pan,setPan]           = useState({x:0,y:0});
  const [drag,setDrag]         = useState<string|null>(null);
  const [dragOff,setDragOff]   = useState({x:0,y:0});
  const [panning,setPanning]   = useState(false);
  const [panStart,setPanStart] = useState({x:0,y:0});
  const [hN,setHN]             = useState<string|null>(null);
  const [hT,setHT]             = useState<string|null>(null);
  const [tick,setTick]         = useState(0);
  const [full,setFull]         = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const W=1100,H=580;

  useEffect(()=>{const id=setInterval(()=>setTick(t=>(t+1)%1000),30);return()=>clearInterval(id);},[]);

  const fetchData=useCallback(async()=>{
    setLoading(true);
    let q:any=supabase.from("ipbx").select("id,name,ip_address,status,ping_latency");
    if(!isAdmin&&allowedIpbxIds?.length) q=q.in("id",allowedIpbxIds);
    else if(!isAdmin&&allowedIpbxIds!==null) q=q.in("id",["00000000-0000-0000-0000-000000000000"]);
    const [r1,r2]=await Promise.all([q,
      applyFilter(supabase.from("sip_trunks").select("id,name,ipbx_id,remote_ipbx_id,status,latency,channels,max_channels,provider,remote_ip,local_ip"))]);
    const nodes:IPBX[]=r1.data||[];
    const rawTrunks:SipTrunk[]=r2.data||[];

    // Auto-détection des connexions inter-IPBX
    // Si le remote_ip d'un trunk correspond à l'ip_address d'un autre IPBX → lier
    const enriched = rawTrunks.map(t => {
      if(t.remote_ipbx_id) return t;
      const matchedIpbx = nodes.find(n =>
        n.id !== t.ipbx_id && n.ip_address &&
        t.remote_ip && t.remote_ip === n.ip_address
      );
      return matchedIpbx ? {...t, remote_ipbx_id: matchedIpbx.id} : t;
    });

    setIpbxList(nodes); setTrunks(enriched);
    setPos(prev=>{
      const next={...prev};
      if(nodes.some(n=>!next[n.id])){
        const p=autoLayout(nodes.length,W/2,H/2);
        nodes.forEach((n,i)=>{if(!next[n.id])next[n.id]=p[i];});
      }
      return next;
    });
    setLoading(false);
  },[isAdmin,allowedIpbxIds,applyFilter]);

  useEffect(()=>{if(ready)fetchData();},[ready,fetchData]);
  useEffect(()=>{if(!ready)return;const id=setInterval(fetchData,30000);return()=>clearInterval(id);},[ready,fetchData]);

  const resetLayout=()=>{
    const p=autoLayout(ipbxList.length,W/2,H/2);
    const next:Record<string,Pos>={};
    ipbxList.forEach((n,i)=>{next[n.id]=p[i];});
    setPos(next);setZoom(1);setPan({x:0,y:0});
  };
  const getSVGPt=(e:React.MouseEvent)=>{
    const svg=svgRef.current;if(!svg)return{x:0,y:0};
    const pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;
    const inv=svg.getScreenCTM()?.inverse();
    const p=inv?pt.matrixTransform(inv):pt;
    return{x:(p.x-pan.x)/zoom,y:(p.y-pan.y)/zoom};
  };
  const onNDown=(e:React.MouseEvent,id:string)=>{
    e.stopPropagation();const p=getSVGPt(e);
    setDrag(id);setDragOff({x:p.x-(pos[id]?.x||0),y:p.y-(pos[id]?.y||0)});
  };
  const onMove=(e:React.MouseEvent)=>{
    if(drag){const p=getSVGPt(e);setPos(prev=>({...prev,[drag]:{x:p.x-dragOff.x,y:p.y-dragOff.y}}));}
    else if(panning)setPan({x:e.clientX-panStart.x,y:e.clientY-panStart.y});
  };
  const onUp=()=>{setDrag(null);setPanning(false);};
  const onSDown=(e:React.MouseEvent)=>{
    const t=e.target as SVGElement;
    if(t===svgRef.current||["rect","svg"].includes(t.tagName)){
      setPanning(true);setPanStart({x:e.clientX-pan.x,y:e.clientY-pan.y});
    }
  };
  const onWheel=(e:React.WheelEvent)=>{e.preventDefault();setZoom(z=>Math.max(0.2,Math.min(4,z-e.deltaY*0.001)));};

  const online=ipbxList.filter(i=>i.status==="online").length;
  const offline=ipbxList.filter(i=>i.status==="offline").length;
  const tUp=trunks.filter(t=>t.status==="up").length;
  const tDown=trunks.filter(t=>t.status==="down").length;
  const activeCh=trunks.reduce((a,t)=>a+(t.channels||0),0);
  const avgLat=trunks.filter(t=>t.latency).length?Math.round(trunks.reduce((a,t)=>a+(t.latency||0),0)/trunks.filter(t=>t.latency).length):null;

  // Tooltip component
  const Tip=({x,y,children}:{x:number;y:number;children:React.ReactNode})=>(
    <foreignObject x={x} y={y} width={190} height={130} style={{overflow:"visible"}}>
      <div style={{background:"hsl(var(--card))",border:"1px solid hsl(var(--border))",borderRadius:10,padding:"10px 14px",fontSize:12,color:"hsl(var(--foreground))",boxShadow:"0 8px 24px rgba(0,0,0,0.18)",whiteSpace:"nowrap",width:"fit-content",fontFamily:"Raleway,sans-serif"}}>
        {children}
      </div>
    </foreignObject>
  );

  // Track rendered pairs to avoid double lines
  const renderedPairs = new Set<string>();

  const renderTrunks=()=>trunks.map(t=>{
    const src=pos[t.ipbx_id];
    const dst=t.remote_ipbx_id?pos[t.remote_ipbx_id]:null;
    if(!src)return null;
    const tc=trunkColor(t.status,t.latency);
    const isH=hT===t.id;
    const isDash=t.status==="down";

    if(!dst){
      const ang=(Object.keys(pos).indexOf(t.ipbx_id)*60)*(Math.PI/180);
      const ex=src.x+Math.cos(ang)*72,ey=src.y+Math.sin(ang)*72;
      return(
        <g key={t.id} onMouseEnter={()=>setHT(t.id)} onMouseLeave={()=>setHT(null)}>
          <line x1={src.x} y1={src.y} x2={ex} y2={ey} stroke={tc} strokeWidth={isH?2.5:1.5} strokeDasharray={isDash?"7,4":"none"} strokeOpacity={0.7}/>
          <circle cx={ex} cy={ey} r={4} fill={tc} opacity={0.5}/>
          {t.latency&&(<><rect x={(src.x+ex)/2-16} y={(src.y+ey)/2-16} width={32} height={13} rx={6} fill="hsl(var(--card))" stroke={tc} strokeWidth={0.8}/><text x={(src.x+ex)/2} y={(src.y+ey)/2-7} fill={tc} fontSize={8} textAnchor="middle" fontFamily="Raleway,sans-serif" fontWeight="600">{t.latency}ms</text></>)}
          {isH&&<Tip x={ex+8} y={ey-10}>
            <div style={{fontWeight:700,color:tc,marginBottom:4}}>{t.name}</div>
            <div style={{color:"#64748b",fontSize:11}}>Provider: {t.provider||"—"}</div>
            <div style={{color:"#64748b",fontSize:11}}>Canaux: {t.channels??0}/{t.max_channels??30}</div>
          </Tip>}
        </g>
      );
    }

    const mx=(src.x+dst.x)/2,my=(src.y+dst.y)/2-50;
    const path=`M ${src.x} ${src.y} Q ${mx} ${my} ${dst.x} ${dst.y}`;
    const prog=((tick*0.003+(t.ipbx_id.charCodeAt(0)*0.07))%1);
    const px=(1-prog)*(1-prog)*src.x+2*(1-prog)*prog*mx+prog*prog*dst.x;
    const py=(1-prog)*(1-prog)*src.y+2*(1-prog)*prog*my+prog*prog*dst.y;

    // Find reverse trunk (from dst IPBX back to src)
    const reverseTrunk = trunks.find(rt =>
      rt.ipbx_id === t.remote_ipbx_id && rt.remote_ipbx_id === t.ipbx_id && rt.id !== t.id
    );
    // Skip if reverse was already drawn (avoid duplicate lines)
    const pairKey = [t.ipbx_id, t.remote_ipbx_id].sort().join("--");
    if(reverseTrunk && renderedPairs.has(pairKey)) return null;
    if(reverseTrunk) renderedPairs.add(pairKey);
    // Compute perpendicular offset to place labels on each side of the line
    const dx = dst.x - src.x, dy = dst.y - src.y;
    const len = Math.sqrt(dx*dx+dy*dy)||1;
    const perpX = -dy/len, perpY = dx/len; // perpendicular unit vector
    const offset = 28; // pixels away from the line

    // Label 1 (src trunk): 30% along the curve, left side
    const t1 = 0.3;
    const l1x = (1-t1)*(1-t1)*src.x+2*(1-t1)*t1*mx+t1*t1*dst.x + perpX*offset;
    const l1y = (1-t1)*(1-t1)*src.y+2*(1-t1)*t1*my+t1*t1*dst.y + perpY*offset;
    // Label 2 (dst trunk): 70% along the curve, right side
    const t2 = 0.7;
    const l2x = (1-t2)*(1-t2)*src.x+2*(1-t2)*t2*mx+t2*t2*dst.x - perpX*offset;
    const l2y = (1-t2)*(1-t2)*src.y+2*(1-t2)*t2*my+t2*t2*dst.y - perpY*offset;

    return(
      <g key={t.id} onMouseEnter={()=>setHT(t.id)} onMouseLeave={()=>setHT(null)}>
        {/* Shadow */}
        <path d={path} fill="none" stroke={tc} strokeWidth={6} strokeOpacity={0.08}/>
        {/* Main line */}
        <path d={path} fill="none" stroke={tc} strokeWidth={isH?2.5:1.5} strokeDasharray={isDash?"8,5":"none"} strokeOpacity={0.85}/>
        {/* Packet animation */}
        {t.status==="up"&&<>
          <circle cx={px} cy={py} r={4} fill={tc} opacity={0.9}/>
          <circle cx={px} cy={py} r={7} fill={tc} opacity={0.18}/>
        </>}
        {/* Src trunk name — left side of line */}
        <rect x={l1x-32} y={l1y-9} width={64} height={16} rx={8} fill="hsl(var(--card))" stroke={tc} strokeWidth={0.8}/>
        <text x={l1x} y={l1y+3} fill={tc} fontSize={8.5} textAnchor="middle" fontFamily="Raleway,sans-serif" fontWeight="700">
          {t.name.length>10?t.name.slice(0,10)+"…":t.name}
        </text>
        {/* Dst (reverse) trunk name — right side */}
        {reverseTrunk&&<>
          <rect x={l2x-32} y={l2y-9} width={64} height={16} rx={8} fill="hsl(var(--card))" stroke={tc} strokeWidth={0.8}/>
          <text x={l2x} y={l2y+3} fill={tc} fontSize={8.5} textAnchor="middle" fontFamily="Raleway,sans-serif" fontWeight="700">
            {reverseTrunk.name.length>10?reverseTrunk.name.slice(0,10)+"…":reverseTrunk.name}
          </text>
        </>}
        {/* Latency badge center */}
        <rect x={mx-22} y={my-10} width={44} height={16} rx={8} fill="hsl(var(--card))" stroke={tc} strokeWidth={1}/>
        <text x={mx} y={my+2} fill={tc} fontSize={9} textAnchor="middle" fontFamily="Raleway,sans-serif" fontWeight="700">
          {t.latency?`${t.latency}ms`:"SIP"}
        </text>
        {/* Arrows direction */}
        <defs>
          <marker id={`arr-${t.id}`} viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M1 1L7 4L1 7" fill="none" stroke={tc} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </marker>
        </defs>
        {isH&&<Tip x={mx+14} y={my-18}>
          <div style={{fontWeight:700,color:tc,marginBottom:4,fontSize:13}}>{t.name}</div>
          <div style={{color:"#64748b",fontSize:11}}>Statut: <span style={{color:tc,fontWeight:600}}>{t.status.toUpperCase()}</span></div>
          <div style={{color:"#64748b",fontSize:11}}>Latence: {t.latency?`${t.latency}ms`:"—"}</div>
          <div style={{color:"#64748b",fontSize:11}}>Canaux: {t.channels??0}/{t.max_channels??30}</div>
          {reverseTrunk&&<div style={{color:"#64748b",fontSize:11,marginTop:4,borderTop:"1px solid #f1f5f9",paddingTop:4}}>↩ Retour: {reverseTrunk.name}</div>}
          {t.provider&&<div style={{color:"#64748b",fontSize:11}}>Provider: {t.provider}</div>}
        </Tip>}
      </g>
    );
  });

  const renderNodes=()=>ipbxList.map(ipbx=>{
    const p=pos[ipbx.id];if(!p)return null;
    const nc=nodeColor(ipbx.status);
    const isH=hN===ipbx.id,isDrag=drag===ipbx.id;
    const nodeTrunks=trunks.filter(t=>t.ipbx_id===ipbx.id);
    const ch=nodeTrunks.reduce((a,t)=>a+(t.channels||0),0);

    return(
      <g key={ipbx.id} transform={`translate(${p.x},${p.y})`}
        onMouseDown={e=>onNDown(e,ipbx.id)}
        onMouseEnter={()=>setHN(ipbx.id)} onMouseLeave={()=>setHN(null)}
        style={{cursor:isDrag?"grabbing":"grab"}}>

        {/* Pulse ring for online */}
        {ipbx.status==="online"&&(
          <circle r={38} fill="none" stroke={nc} strokeWidth={1} strokeOpacity={0.15}>
            <animate attributeName="r" values="28;46;28" dur="3s" repeatCount="indefinite"/>
            <animate attributeName="stroke-opacity" values="0.2;0;0.2" dur="3s" repeatCount="indefinite"/>
          </circle>
        )}

        {/* Card shadow */}
        <circle r={26} fill="hsl(var(--muted) / 0.5)"/>

        {/* Main circle */}
        <circle r={24} fill="hsl(var(--card))" stroke={nc} strokeWidth={isDrag||isH?2.5:1.5}/>

        {/* Inner fill */}
        <circle r={20} fill={nc} opacity={0.08}/>

        {/* Icon — server shape */}
        <rect x={-9} y={-11} width={18} height={22} rx={3} fill="none" stroke={nc} strokeWidth={1.5}/>
        <circle cx={0} cy={-3} r={2} fill={nc}/>
        <circle cx={0} cy={4} r={2} fill={nc}/>

        {/* Status dot */}
        <circle cx={16} cy={-16} r={4} fill={nc} stroke="hsl(var(--card))" strokeWidth={1.5}>
          {ipbx.status==="online"&&<animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite"/>}
        </circle>

        {/* Name */}
        <text y={34} textAnchor="middle" fontSize={11} fill={C.text} fontFamily="Raleway,sans-serif" fontWeight="700">{ipbx.name}</text>
        <text y={46} textAnchor="middle" fontSize={8.5} fill={C.muted} fontFamily="Raleway,sans-serif">{ipbx.ip_address||"—"}</text>
        {ipbx.ping_latency&&(
          <text y={56} textAnchor="middle" fontSize={8} fill={nc} fontFamily="Raleway,sans-serif" fontWeight="600">{ipbx.ping_latency}ms</text>
        )}

        {/* Hover card */}
        {isH&&!isDrag&&(
          <Tip x={28} y={-28}>
            <div style={{fontWeight:700,color:nc,fontSize:13,marginBottom:5}}>{ipbx.name}</div>
            <div style={{display:"grid",gridTemplateColumns:"auto 1fr",gap:"3px 12px",fontSize:11}}>
              <span style={{color:"hsl(var(--muted-foreground))"}}>Statut</span><span style={{fontWeight:600,color:nc}}>{ipbx.status}</span>
              <span style={{color:"hsl(var(--muted-foreground))"}}>IP</span><span style={{color:"hsl(var(--foreground))"}}>{ipbx.ip_address||"—"}</span>
              <span style={{color:"hsl(var(--muted-foreground))"}}>Ping</span><span style={{color:"hsl(var(--foreground))"}}>{ipbx.ping_latency?`${ipbx.ping_latency}ms`:"—"}</span>
              <span style={{color:"hsl(var(--muted-foreground))"}}>Trunks</span><span style={{color:"hsl(var(--foreground))"}}>{nodeTrunks.length}</span>
              <span style={{color:"hsl(var(--muted-foreground))"}}>Canaux</span><span style={{color:"hsl(var(--foreground))"}}>{ch}</span>
            </div>
          </Tip>
        )}
      </g>
    );
  });

  const stats=[
    {l:"IPBX Online",  v:online,              c:C.online,  sub:`${ipbxList.length} total`},
    {l:"IPBX Offline", v:offline,             c:C.offline, sub:"à vérifier"},
    {l:"Trunks UP",    v:`${tUp}/${tUp+tDown}`,c:C.up,     sub:"en service"},
    {l:"Latence moy.", v:avgLat?`${avgLat}ms`:"—", c:avgLat&&avgLat>100?C.warn:C.teal, sub:"moyenne réseau"},
    {l:"Canaux actifs",v:activeCh,            c:C.warn,    sub:"en cours"},
  ];

  const containerStyle: React.CSSProperties = full?{
    position:"fixed",inset:0,zIndex:9999,background:"hsl(var(--background))",display:"flex",flexDirection:"column",padding:20,
  }:{};

  return (
    <div style={containerStyle}>
    <div className={full?"":"space-y-4"} style={full?{display:"flex",flexDirection:"column",gap:16,height:"100%"}:{}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700,color:C.text,fontFamily:"Raleway,sans-serif",display:"flex",alignItems:"center",gap:8,margin:0}}>
            <Activity size={18} color={C.teal}/> Network Map
          </h1>
          <p style={{fontSize:12,color:C.muted,fontFamily:"Raleway,sans-serif",margin:0}}>Topologie VoIP en temps réel</p>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          {/* Status pills */}
          {[
            {l:`${online} online`,  bg:"#f0fdf4",c:"#16a34a",border:"#bbf7d0",show:true},
            {l:`${offline} offline`,bg:"#fff1f2",c:"#e11d48",border:"#fecdd3",show:offline>0},
            {l:`${tUp}/${tUp+tDown} trunks`,bg:"#eff6ff",c:"#2563eb",border:"#bfdbfe",show:true},
          ].filter(x=>x.show).map(x=>(
            <div key={x.l} style={{background:x.bg,border:`1px solid ${x.border}`,color:x.c,borderRadius:20,padding:"4px 12px",fontSize:12,fontFamily:"Raleway,sans-serif",fontWeight:600}}>
              {x.l}
            </div>
          ))}
          {/* Controls */}
          {[
            {I:ZoomIn,    a:()=>setZoom(z=>Math.min(4,z+0.25)),tip:"Zoom +"},
            {I:ZoomOut,   a:()=>setZoom(z=>Math.max(0.2,z-0.25)),tip:"Zoom -"},
            {I:RotateCcw, a:resetLayout,tip:"Reset"},
            {I:RefreshCw, a:fetchData,tip:"Refresh"},
            {I:Maximize2, a:()=>setFull(f=>!f),tip:"Plein écran"},
          ].map(({I,a,tip},i)=>(
            <button key={i} onClick={a} title={tip}
              style={{width:34,height:34,borderRadius:8,border:"1px solid hsl(var(--border))",background:"hsl(var(--card))",color:"hsl(var(--muted-foreground))",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",boxShadow:"0 1px 3px rgba(0,0,0,0.08)"}}>
              <I size={14}/>
            </button>
          ))}
        </div>
      </div>

      {/* Map */}
      <div style={{borderRadius:16,overflow:"hidden",border:"1px solid hsl(var(--border))",background:"hsl(var(--background))",boxShadow:"0 1px 8px rgba(0,0,0,0.08)",position:"relative",flex:full?1:undefined}}>
        {/* Dot grid */}
        <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:1}}>
          <defs>
            <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="hsl(var(--border))" opacity="0.8"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dots)"/>
        </svg>

        {loading&&!ipbxList.length?(
          <div style={{height:460,display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
            <div style={{textAlign:"center"}}>
              <div style={{width:36,height:36,border:"2px solid #e2e8f0",borderTop:`2px solid ${C.teal}`,borderRadius:"50%",animation:"nmspin 1s linear infinite",margin:"0 auto 12px"}}/>
              <p style={{color:C.muted,fontSize:13,fontFamily:"Raleway,sans-serif"}}>Chargement de la topologie...</p>
            </div>
          </div>
        ):ipbxList.length===0?(
          <div style={{height:460,display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
            <div style={{textAlign:"center"}}>
              <Server size={32} color="#cbd5e1" style={{margin:"0 auto 12px"}}/>
              <p style={{color:C.muted,fontSize:13,fontFamily:"Raleway,sans-serif"}}>Aucun IPBX configuré</p>
            </div>
          </div>
        ):(
          <svg ref={svgRef} width="100%" height={full?"calc(100vh - 250px)":460}
            viewBox={`0 0 ${W} ${H}`}
            style={{cursor:panning?"grabbing":"default",position:"relative",zIndex:1}}
            onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
            onMouseDown={onSDown} onWheel={onWheel}>
            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {renderTrunks()}{renderNodes()}
            </g>
          </svg>
        )}

        {/* Zoom badge */}
        <div style={{position:"absolute",bottom:10,right:12,zIndex:2,background:"rgba(255,255,255,0.9)",border:"1px solid #e2e8f0",borderRadius:6,padding:"3px 9px",fontSize:11,color:C.muted,fontFamily:"Raleway,sans-serif",backdropFilter:"blur(4px)"}}>
          {Math.round(zoom*100)}%
        </div>
      </div>

      {/* Stats row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10}}>
        {stats.map(s=>(
          <div key={s.l} style={{background:"hsl(var(--card))",border:"1px solid hsl(var(--border))",borderRadius:12,padding:"14px 16px",boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
            <p style={{fontSize:10,color:C.muted,fontFamily:"Raleway,sans-serif",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",margin:"0 0 4px"}}>{s.l}</p>
            <p style={{fontSize:24,fontWeight:800,color:s.c,fontFamily:"Raleway,sans-serif",margin:"0 0 2px",lineHeight:1}}>{s.v}</p>
            <p style={{fontSize:10,color:"hsl(var(--muted-foreground))",fontFamily:"Raleway,sans-serif",margin:0,opacity:0.6}}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{display:"flex",alignItems:"center",gap:20,fontSize:11,color:C.muted,fontFamily:"Raleway,sans-serif",flexWrap:"wrap"}}>
        {[{c:C.online,l:"En ligne"},{c:C.offline,l:"Hors ligne"},{c:C.up,l:"Trunk UP"},{c:C.warn,l:"Latence élevée"}].map(x=>(
          <div key={x.l} style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:16,height:3,background:x.c,borderRadius:2}}/>{x.l}
          </div>
        ))}
        <span style={{marginLeft:"auto",fontSize:10,color:"hsl(var(--muted-foreground))"}}>Glisser nœuds · Molette zoomer · Drag panoramique</span>
      </div>
    </div>
    <style>{`@keyframes nmspin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};
export default NetworkMap;
