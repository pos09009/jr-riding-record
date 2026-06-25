// ═══════════════════════════════════════════
// DATA — 지역별 파일(data/*.js)을 하나로 합침
// 각 파일이 window.JR_DATA.<지역> 에 배열을 채워둠
// ═══════════════════════════════════════════
const LINES = Object.values(window.JR_DATA || {}).flat();

// 공식 노선기호(영문 코드) + 공식 라인컬러. 로드 시 id 기준으로 적용(단일 출처).
const LINE_META = {
  yamanote:{code:'JY',color:'#9ACD32'},
  chuo:{code:'JC',color:'#F15A22'}, ome:{code:'JC',color:'#F15A22'}, itsukaichi:{code:'JC',color:'#F15A22'},
  sobu:{code:'JB',color:'#FFD400'},
  keihin:{code:'JK',color:'#00B2E5'}, negishi:{code:'JK',color:'#00B2E5'},
  tokaido:{code:'JT',color:'#F68B1E'},
  yokosuka:{code:'JO',color:'#004EA2'}, sobu_rapid:{code:'JO',color:'#004EA2'},
  shonan:{code:'JS',color:'#E4002B'},
  takasaki:{code:'JU',color:'#F68B1E'}, utsunomiya:{code:'JU',color:'#F68B1E'},
  joban:{color:'#0079C2'}, // 조반선(중거리)은 단일 노선코드 없음 — JJ는 별도 조반쾌속선(우에노~토리데)
  saikyo:{code:'JA',color:'#00AC9B'}, kawagoe:{color:'#8C8C8C'}, // 카와고에선: 공식 회색·코드 없음(사이쿄 직통이나 자체색은 회색)
  yokohama:{code:'JH',color:'#80C342'},
  nambu:{code:'JN',color:'#F0C800'}, nambu_hamakawasaki:{code:'JN',color:'#F0C800'},
  keiyo:{code:'JE',color:'#C9252C'}, keiyo_takaya:{code:'JE',color:'#C9252C'}, keiyo_futamata:{code:'JE',color:'#C9252C'},
  musashino:{code:'JM',color:'#ED6D00'},
  hachiko:{color:'#C9B58B'} // 하치코선: 코드 없음, 공식 베이지/탄(올리브 아님)
};
LINES.forEach(l=>{ const m=LINE_META[l.id]; if(m){ l.code=m.code; l.color=m.color; } });

// 환승역 통합: 같은 이름 + 근접(300m 이내) 역들을 한 좌표로 스냅 → 지도에 단일 점.
// 무사시코스기(난부↔요코스카 승강장 ~430m)처럼 일부러 떨어진 건 임계값으로 분리 유지.
// 좌표만 통일하며 구간 기록은 노선ID+인덱스라 영향 없음.
function unifyStations(){
  const MERGE_M=300;
  const byName={};
  LINES.forEach(l=>l.stations.forEach(s=>{ (byName[s.n]=byName[s.n]||[]).push(s); }));
  Object.values(byName).forEach(arr=>{
    if(arr.length<2) return;
    const clusters=[];
    arr.forEach(s=>{
      const c=clusters.find(cl=>Math.hypot((cl.lat-s.lat)*111000,(cl.lng-s.lng)*90000)<MERGE_M);
      if(c) c.members.push(s); else clusters.push({lat:s.lat,lng:s.lng,members:[s]});
    });
    clusters.forEach(cl=>{
      if(cl.members.length<2) return;
      const lat=cl.members.reduce((a,s)=>a+s.lat,0)/cl.members.length;
      const lng=cl.members.reduce((a,s)=>a+s.lng,0)/cl.members.length;
      cl.members.forEach(s=>{ s.lat=lat; s.lng=lng; });
    });
  });
}
unifyStations();

// 역 인덱스: 좌표키 → {name,lat,lng, refs:[{lid,idx}]}. 환승역 판별 + 클릭 팝업용. unify 후 1회.
const STATION_INDEX={};
function stationKey(s){ return Math.round(s.lat*1000)+','+Math.round(s.lng*1000); }
function isInterchange(entry){ return !!entry && new Set(entry.refs.map(r=>r.lid)).size>=2; }
(function buildStationIndex(){
  LINES.forEach(l=>l.stations.forEach((s,i)=>{
    const key=stationKey(s);
    if(!STATION_INDEX[key]) STATION_INDEX[key]={name:s.n,lat:s.lat,lng:s.lng,refs:[]};
    STATION_INDEX[key].refs.push({lid:l.id,idx:i});
  }));
})();

// ═══════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════
let done = {};
let logs = [];
let selLineId = null;
let viewMode = 'all'; // 'all' 전체 | 'sel' 선택 노선만 | 'trans' 선택+환승
let searchQuery = '';
let gpsOn = false;
let watchId = null;
let lastGpsSt = null;
let gpsSessionList = [];

function load(){
  try{
    const s = localStorage.getItem('jrt3');
    if(s){ const d=JSON.parse(s); done=d.done||{}; logs=d.logs||[]; }
  }catch(e){}
}
function save(){
  localStorage.setItem('jrt3', JSON.stringify({done,logs}));
}

function segKey(lid,i){ return lid+'_'+i; }

function totalSegs(){
  return LINES.reduce((s,l)=>s+l.stations.length-1+(l.loop?1:0),0);
}
function doneSegs(){
  return Object.values(done).filter(Boolean).length;
}
function lineDone(l){
  const tot=l.stations.length-1+(l.loop?1:0);
  let d=0;
  for(let i=0;i<tot;i++) if(done[segKey(l.id,i)]) d++;
  return {d,tot};
}
function doneLines(){
  return LINES.filter(l=>{ const {d,tot}=lineDone(l); return d===tot; }).length;
}

function loopIncIsCCW(line){
  // 인덱스 증가 방향이 지도상 반시계(CCW)인지 좌표로 판정(신발끈 공식). x=lng, y=lat.
  let area=0, n=line.stations.length;
  for(let i=0;i<n;i++){ const p=line.stations[i], q=line.stations[(i+1)%n]; area+=p.lng*q.lat-q.lng*p.lat; }
  return area>0;
}
function rangeSegs(line,a,b,dir){
  // a역→b역 사이 구간 인덱스 배열.
  // 비순환선: min→max. 순환선: dir 'cw'/'ccw'면 그 방향, 아니면 더 짧은 호(arc).
  if(!line.loop){
    const s=Math.min(a,b),e=Math.max(a,b),out=[];
    for(let i=s;i<e;i++) out.push(i);
    return out;
  }
  const n=line.stations.length;
  const fwd=(from,to)=>{ const o=[]; for(let i=from;i!==to;i=(i+1)%n) o.push(i); return o; };
  const inc=fwd(a,b), dec=fwd(b,a);
  if(dir==='cw'||dir==='ccw'){
    // 인덱스 증가가 ccw면 ccw요청=inc, cw요청=dec / 인덱스 증가가 cw면 반대
    return ((dir==='ccw')===loopIncIsCCW(line))?inc:dec;
  }
  return inc.length<=dec.length?inc:dec; // auto: 짧은 쪽
}
function completeRange(lid,a,b,dir){
  const line=LINES.find(l=>l.id===lid);
  if(!line) return 0;
  let cnt=0;
  rangeSegs(line,a,b,dir).forEach(i=>{ const k=segKey(lid,i); if(!done[k]){ done[k]=true; cnt++; } });
  return cnt;
}
function undoRange(lid,a,b,dir){
  const line=LINES.find(l=>l.id===lid);
  if(!line) return;
  rangeSegs(line,a,b,dir).forEach(i=>{ done[segKey(lid,i)]=false; });
}

// ═══════════════════════════════════════════
// UI UPDATE
// ═══════════════════════════════════════════
function updateAll(){
  const tot=totalSegs(), d=doneSegs();
  const pct=tot>0?(d/tot*100).toFixed(1):'0.0';
  document.getElementById('hv-pct').textContent=pct+'%';
  document.getElementById('hv-done').textContent=d;
  document.getElementById('hv-total').textContent=tot;
  document.getElementById('hv-lines').textContent=doneLines();
  document.getElementById('pbar').style.width=pct+'%';
  document.getElementById('pbar-lbl').textContent=pct+'%';
  renderLinesList();
  drawMap();
  save();
}

function lineCard(l){
  const {d,tot}=lineDone(l);
  const pct=tot>0?Math.round(d/tot*100):0;
  const div=document.createElement('div');
  div.className='lcard'+(selLineId===l.id?' sel':'');
  div.style.setProperty('--lc',l.color);
  const badge=l.code?`<span class="lc-code" style="border-color:${l.color}">${l.code}</span>`:'';
  div.innerHTML=`
    <div class="lc-top">
      <div class="lc-name">${badge}${l.name}</div>
      <div class="lc-pct">${pct}%</div>
    </div>
    <div class="lc-bar"><div class="lc-bar-f" style="width:${pct}%;background:${l.color}"></div></div>
    <div class="lc-meta">${d}/${tot} 구간 · ${l.stations.length}역</div>
  `;
  div.onclick=()=>selectLine(l.id);
  return div;
}

function renderLinesList(){
  const el=document.getElementById('lines-list');
  el.innerHTML='';
  const q=searchQuery;

  // 검색어 없음 → 전체 노선 카드
  if(!q){
    LINES.forEach(l=>el.appendChild(lineCard(l)));
    return;
  }

  // ── 역 검색 결과 ──
  const stMatches=[];
  LINES.forEach(l=>l.stations.forEach((s,i)=>{
    if(s.n.toLowerCase().includes(q)) stMatches.push({l,s,i});
  }));
  if(stMatches.length){
    const title=document.createElement('div');
    title.className='sresults-title';
    title.textContent=`역 검색 결과 (${stMatches.length})`;
    el.appendChild(title);
    stMatches.slice(0,40).forEach(m=>{
      const ok=isStDone(m.l,m.i);
      const row=document.createElement('div');
      row.className='sresult';
      row.style.setProperty('--lc',m.l.color);
      row.innerHTML=`
        <div>
          <div class="sresult-st">${m.s.n}
            <span style="color:${ok?'var(--accent3)':'var(--muted)'};font-size:10px;"> ${ok?'✓':'○'}</span>
          </div>
          <div class="sresult-ln">${m.l.name}</div>
        </div>`;
      row.onclick=()=>gotoStation(m.l.id,m.i);
      el.appendChild(row);
    });
  }

  // ── 노선 검색 결과 ──
  const lnMatches=LINES.filter(l=>l.name.toLowerCase().includes(q));
  if(lnMatches.length){
    const title=document.createElement('div');
    title.className='sresults-title';
    title.style.marginTop=stMatches.length?'14px':'0';
    title.textContent=`노선 검색 결과 (${lnMatches.length})`;
    el.appendChild(title);
    lnMatches.forEach(l=>el.appendChild(lineCard(l)));
  }

  // ── 결과 없음 ──
  if(!stMatches.length && !lnMatches.length){
    const none=document.createElement('div');
    none.className='no-result';
    none.textContent=`"${searchQuery}" 검색 결과가 없습니다.`;
    none.appendChild(document.createElement('br'));
    none.appendChild(document.createTextNode('역 이름 또는 노선 이름으로 검색해보세요.'));
    el.appendChild(none);
  }
}

function onSearch(){
  searchQuery=document.getElementById('search-box').value.trim().toLowerCase();
  renderLinesList();
}

// 특정 역(좌표)을 화면 중앙에 두고 확대
function focusStation(lat,lng,scale){
  const wrap=document.getElementById('map-wrap');
  const W=wrap.clientWidth,H=wrap.clientHeight;
  vscale=scale;
  const p=geo2px(lat,lng);
  vx+=W/2-p.x; vy+=H/2-p.y;
  drawMap();
}

// 검색 결과 역 클릭 → 해당 역으로 지도 확대 + 구간 체크 팝업
function gotoStation(lid,idx){
  selLineId=lid;
  const l=LINES.find(x=>x.id===lid);
  fillManualSelects(lid);
  const s=l.stations[idx];
  focusStation(s.lat,s.lng,18);
  const st=STATION_INDEX[stationKey(s)];
  if(st) showStationPopup(st);
}

// ═══════════════════════════════════════════
// CANVAS MAP
// ═══════════════════════════════════════════
const canvas=document.getElementById('map-canvas');
const ctx=canvas.getContext('2d');

// hex → rgba (연하게 표시용)
function hexA(hex,a){
  const h=hex.replace('#','');
  const r=parseInt(h.substring(0,2),16);
  const g=parseInt(h.substring(2,4),16);
  const b=parseInt(h.substring(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
}

// view state
let vx=0,vy=0,vscale=1; // offset & scale
let pairGroups={}; // 평행 구간 그룹: "좌표키A|좌표키B" → [노선id...]. drawMap에서 매 프레임 갱신
let dragging=false,dragSx=0,dragSy=0,dragVx=0,dragVy=0;

// geographic bounds of all stations
let minLat,maxLat,minLng,maxLng;
function calcBounds(){
  minLat=Infinity;maxLat=-Infinity;minLng=Infinity;maxLng=-Infinity;
  LINES.forEach(l=>l.stations.forEach(s=>{
    minLat=Math.min(minLat,s.lat);maxLat=Math.max(maxLat,s.lat);
    minLng=Math.min(minLng,s.lng);maxLng=Math.max(maxLng,s.lng);
  }));
  // padding
  const padLat=(maxLat-minLat)*.1, padLng=(maxLng-minLng)*.1;
  minLat-=padLat;maxLat+=padLat;minLng-=padLng;maxLng+=padLng;
}

function geo2px(lat,lng){
  const wrap=document.getElementById('map-wrap');
  const W=wrap.clientWidth, H=wrap.clientHeight;
  const bw=maxLng-minLng, bh=maxLat-minLat;
  const baseScale=Math.min(W/bw,H/bh);
  const cx=(minLng+maxLng)/2, cy=(minLat+maxLat)/2;
  const x=((lng-cx)*baseScale)*vscale + W/2 + vx;
  const y=(-(lat-cy)*baseScale)*vscale + H/2 + vy;
  return {x,y};
}

function px2geo(x,y){
  const wrap=document.getElementById('map-wrap');
  const W=wrap.clientWidth,H=wrap.clientHeight;
  const bw=maxLng-minLng,bh=maxLat-minLat;
  const baseScale=Math.min(W/bw,H/bh);
  const cx=(minLng+maxLng)/2,cy=(minLat+maxLat)/2;
  const lng=(x-W/2-vx)/(baseScale*vscale)+cx;
  const lat=-(y-H/2-vy)/(baseScale*vscale)+cy;
  return {lat,lng};
}

function resizeCanvas(){
  const wrap=document.getElementById('map-wrap');
  canvas.width=wrap.clientWidth;
  canvas.height=wrap.clientHeight;
}

function drawMap(){
  const W=canvas.width,H=canvas.height;
  ctx.clearRect(0,0,W,H);

  // dark bg
  ctx.fillStyle='#06090f';
  ctx.fillRect(0,0,W,H);

  // grid lines (subtle)
  ctx.strokeStyle='#0e1520';
  ctx.lineWidth=1;
  for(let i=0;i<W;i+=40){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,H);ctx.stroke();}
  for(let i=0;i<H;i+=40){ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(W,i);ctx.stroke();}

  // 뷰 모드 반영: 표시할 노선만 추림(전체/선택/+환승)
  const vis=visibleLineSet();
  const drawLines = vis ? LINES.filter(l=>vis.has(l.id)) : LINES;

  // 평행 구간 그룹화: 같은 두 역(좌표키 쌍)을 잇는 노선들 → drawLineSegs에서 나란히 offset
  pairGroups={};
  drawLines.forEach(l=>{
    const tot=l.stations.length-1+(l.loop?1:0);
    for(let i=0;i<tot;i++){
      const a=l.stations[i], b=l.stations[(i+1)%l.stations.length];
      const ka=stationKey(a), kb=stationKey(b);
      const pk = ka<kb ? ka+'|'+kb : kb+'|'+ka;
      if(!pairGroups[pk]) pairGroups[pk]=[];
      if(!pairGroups[pk].includes(l.id)) pairGroups[pk].push(l.id);
    }
  });
  Object.values(pairGroups).forEach(g=>g.sort());

  // draw lines (undone first, then done on top)
  drawLines.forEach(l=>drawLineSegs(l,false));
  drawLines.forEach(l=>drawLineSegs(l,true));

  // ── 역 마커 그리기 (중복 좌표는 한 점으로) ──
  const stationPts={}; // "x,y" → {x,y,color,isDone,name}
  drawLines.forEach(l=>l.stations.forEach((s,i)=>{
    const isDone=isStDone(l,i);
    const {x,y}=geo2px(s.lat,s.lng);
    const key=Math.round(s.lat*1000)+','+Math.round(s.lng*1000);
    if(!stationPts[key]) stationPts[key]={x,y,color:l.color,isDone,name:s.n,xfer:isInterchange(STATION_INDEX[key])};
    // 완료된 노선의 색을 우선 표시
    if(isDone){ stationPts[key].isDone=true; stationPts[key].color=l.color; }
  }));

  const pts=Object.values(stationPts);

  // 마커
  pts.forEach(p=>{
    if(p.xfer){
      // 환승역: 흰 원 + 진한 테두리 (노선도 환승 표기 스타일)
      const r=p.isDone?5.5:4.5;
      ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);
      ctx.fillStyle='#ffffff';ctx.fill();
      ctx.lineWidth=2;ctx.strokeStyle='#11151c';ctx.stroke();
      return;
    }
    const r=p.isDone?4.5:3;
    ctx.beginPath();
    ctx.arc(p.x,p.y,r,0,Math.PI*2);
    ctx.fillStyle=p.isDone?p.color:hexA(p.color,0.5);
    ctx.fill();
    ctx.strokeStyle=p.isDone?'rgba(255,255,255,.8)':hexA(p.color,0.7);
    ctx.lineWidth=p.isDone?1.5:1;
    ctx.stroke();
    if(p.isDone){
      ctx.shadowColor=p.color;ctx.shadowBlur=6;
      ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    }
  });

  // ── 라벨 (충돌 회피) — 줌 1.4 이상, 또는 선택/환승 모드일 땐 항상 ──
  if(vscale>=1.4 || vis){
    const fontSize=Math.max(9,Math.min(14,8+vscale*0.7));
    ctx.font=`${fontSize}px 'Noto Sans KR',sans-serif`;
    ctx.textBaseline='middle';
    const placed=[]; // 이미 배치된 라벨의 박스들

    // 완료된 역 라벨 먼저 (우선순위), 그다음 미완료
    const sorted=pts.slice().sort((a,b)=>(b.isDone?1:0)-(a.isDone?1:0));

    sorted.forEach(p=>{
      const txt=p.name;
      const tw=ctx.measureText(txt).width;
      const th=fontSize+2;
      // 후보 위치: 오른쪽, 왼쪽, 위, 아래
      const cands=[
        {tx:p.x+7, ty:p.y, align:'left'},
        {tx:p.x-7, ty:p.y, align:'right'},
        {tx:p.x, ty:p.y-9, align:'center'},
        {tx:p.x, ty:p.y+9, align:'center'},
      ];
      let chosen=null;
      for(const c of cands){
        let bx;
        if(c.align==='left') bx=c.tx;
        else if(c.align==='right') bx=c.tx-tw;
        else bx=c.tx-tw/2;
        const box={x:bx-2,y:c.ty-th/2,w:tw+4,h:th};
        const hit=placed.some(pl=>!(box.x+box.w<pl.x||box.x>pl.x+pl.w||box.y+box.h<pl.y||box.y>pl.y+pl.h));
        if(!hit){ chosen={...c,box}; break; }
      }
      // 다 막히면 미완료 역은 생략, 완료 역은 강제 표시
      if(!chosen){
        if(!p.isDone) return;
        chosen={...cands[0],box:{x:cands[0].tx-2,y:cands[0].ty-th/2,w:tw+4,h:th}};
      }
      placed.push(chosen.box);

      ctx.textAlign=chosen.align;
      // 텍스트 배경 (가독성)
      ctx.fillStyle='rgba(6,9,15,0.78)';
      const padX=2;
      let rx;
      if(chosen.align==='left') rx=chosen.tx-padX;
      else if(chosen.align==='right') rx=chosen.tx-tw-padX;
      else rx=chosen.tx-tw/2-padX;
      ctx.fillRect(rx, chosen.ty-th/2, tw+padX*2, th);
      // 텍스트
      ctx.fillStyle=p.isDone?'#ffffff':hexA(p.color,0.85);
      ctx.fillText(txt,chosen.tx,chosen.ty);
    });
    ctx.textAlign='left';
  }
}

function drawLineSegs(l,doneOnly){
  const tot=l.stations.length-1+(l.loop?1:0);
  for(let i=0;i<tot;i++){
    const isDone=!!done[segKey(l.id,i)];
    if(doneOnly!==isDone) continue;
    const a=l.stations[i];
    const b=l.stations[(i+1)%l.stations.length];
    const p1=geo2px(a.lat,a.lng);
    const p2=geo2px(b.lat,b.lng);
    // 평행 노선 분리: 같은 두 역을 잇는 노선이 여럿이면 직교 방향으로 나란히 띄움.
    // 직교 방향은 정준 순서(작은 좌표키→큰 좌표키)로 고정 → 노선별 진행방향이 반대여도 상쇄되지 않고 같은 쪽 기준으로 분리.
    let ox=0,oy=0;
    const ka=stationKey(a), kb=stationKey(b);
    const grp=pairGroups[ka<kb?ka+'|'+kb:kb+'|'+ka];
    if(grp&&grp.length>1){
      const GAP=5, off=(grp.indexOf(l.id)-(grp.length-1)/2)*GAP;
      const cp1 = ka<kb ? p1 : p2, cp2 = ka<kb ? p2 : p1; // 정준 방향 픽셀
      const dx=cp2.x-cp1.x, dy=cp2.y-cp1.y, len=Math.hypot(dx,dy)||1;
      ox=-dy/len*off; oy=dx/len*off;
    }
    ctx.beginPath();
    ctx.moveTo(p1.x+ox,p1.y+oy);
    ctx.lineTo(p2.x+ox,p2.y+oy);
    if(isDone){
      // 완료: 노선 색 진하게 + 글로우
      ctx.strokeStyle=l.color;
      ctx.lineWidth=4;
      ctx.globalAlpha=1;
      ctx.shadowColor=l.color;
      ctx.shadowBlur=8;
    }else{
      // 미완료: 노선 고유색을 연하게 (지하철 노선도처럼 구분 가능)
      ctx.strokeStyle=hexA(l.color,0.28);
      ctx.lineWidth=2;
      ctx.globalAlpha=1;
      ctx.shadowBlur=0;
    }
    ctx.lineCap='round';
    ctx.stroke();
    ctx.globalAlpha=1;
    ctx.shadowBlur=0;
  }
}

function isStDone(l,i){
  if(i>0&&done[segKey(l.id,i-1)]) return true;
  if(done[segKey(l.id,i)]) return true;
  return false;
}

function resetView(){
  vx=0;vy=0;vscale=1;
  drawMap();
}
// 특정 화면 좌표(px,py)를 고정점으로 줌
function zoomAt(f,px,py){
  const wrap=document.getElementById('map-wrap');
  const W=wrap.clientWidth, H=wrap.clientHeight;
  const ns=Math.max(0.5,Math.min(80,vscale*f));
  // 고정점이 줌 후에도 같은 화면 위치에 오도록 offset 보정
  vx = px - W/2 - (px - W/2 - vx)*ns/vscale;
  vy = py - H/2 - (py - H/2 - vy)*ns/vscale;
  vscale=ns;
  drawMap();
}
// +/- 버튼: 화면 중앙 기준
function zoom(f){
  const wrap=document.getElementById('map-wrap');
  zoomAt(f, wrap.clientWidth/2, wrap.clientHeight/2);
}

// drag
canvas.addEventListener('mousedown',e=>{
  dragging=true;dragSx=e.clientX;dragSy=e.clientY;dragVx=vx;dragVy=vy;
});
canvas.addEventListener('mousemove',e=>{
  if(!dragging) return;
  const rect=canvas.getBoundingClientRect();
  const sx=canvas.width/rect.width, sy=canvas.height/rect.height;
  vx=dragVx+(e.clientX-dragSx)*sx;
  vy=dragVy+(e.clientY-dragSy)*sy;
  drawMap();
});
canvas.addEventListener('mouseup',e=>{
  const dx=Math.abs(e.clientX-dragSx),dy=Math.abs(e.clientY-dragSy);
  dragging=false;
  if(dx<4&&dy<4) handleMapClick(e.clientX,e.clientY);
});
canvas.addEventListener('mouseleave',()=>{ dragging=false; });

// touch
let t0=null;
canvas.addEventListener('touchstart',e=>{
  if(e.touches.length===1){
    dragging=true;
    dragSx=e.touches[0].clientX;dragSy=e.touches[0].clientY;
    dragVx=vx;dragVy=vy;
    t0={x:e.touches[0].clientX,y:e.touches[0].clientY};
  }
},{passive:true});
canvas.addEventListener('touchmove',e=>{
  if(e.touches.length===1&&dragging){
    const rect=canvas.getBoundingClientRect();
    const sx=canvas.width/rect.width, sy=canvas.height/rect.height;
    vx=dragVx+(e.touches[0].clientX-dragSx)*sx;
    vy=dragVy+(e.touches[0].clientY-dragSy)*sy;
    drawMap();
  }
},{passive:true});
canvas.addEventListener('touchend',e=>{
  dragging=false;
  if(t0){
    const dx=Math.abs(e.changedTouches[0].clientX-t0.x);
    const dy=Math.abs(e.changedTouches[0].clientY-t0.y);
    if(dx<8&&dy<8) handleMapClick(t0.x,t0.y);
  }
  t0=null;
});

// pinch zoom — 두 손가락 중간점 기준
let lastPinchDist=null;
canvas.addEventListener('touchmove',e=>{
  if(e.touches.length===2){
    const rect=canvas.getBoundingClientRect();
    const sx=canvas.width/rect.width, sy=canvas.height/rect.height;
    const midX=((e.touches[0].clientX+e.touches[1].clientX)/2-rect.left)*sx;
    const midY=((e.touches[0].clientY+e.touches[1].clientY)/2-rect.top)*sy;
    const d=Math.hypot(
      e.touches[0].clientX-e.touches[1].clientX,
      e.touches[0].clientY-e.touches[1].clientY
    );
    if(lastPinchDist) zoomAt(d/lastPinchDist, midX, midY);
    lastPinchDist=d;
  }
},{passive:true});
canvas.addEventListener('touchend',()=>{ lastPinchDist=null; });

// wheel zoom — 커서 위치 기준
canvas.addEventListener('wheel',e=>{
  e.preventDefault();
  const rect=canvas.getBoundingClientRect();
  // 캔버스 표시크기와 실제 픽셀크기 차이 보정
  const sx=canvas.width/rect.width;
  const sy=canvas.height/rect.height;
  const px=(e.clientX-rect.left)*sx;
  const py=(e.clientY-rect.top)*sy;
  zoomAt(e.deltaY<0?1.15:0.87, px, py);
},{passive:false});

function handleMapClick(clientX,clientY){
  // 화면 절대좌표 → 캔버스 내부좌표 변환
  const rect=canvas.getBoundingClientRect();
  const sx=canvas.width/rect.width, sy=canvas.height/rect.height;
  const cx=(clientX-rect.left)*sx;
  const cy=(clientY-rect.top)*sy;
  // 가장 가까운 역(좌표키 기준) — 뷰모드에 보이는 노선만 대상
  const vis=visibleLineSet();
  let best=null,bestD=Infinity;
  Object.values(STATION_INDEX).forEach(st=>{
    if(vis && !st.refs.some(r=>vis.has(r.lid))) return;
    const p=geo2px(st.lat,st.lng);
    const d=Math.hypot(p.x-cx,p.y-cy);
    if(d<bestD){bestD=d;best=st;}
  });
  if(best&&bestD<Math.max(18,12*Math.min(vscale,2))) showStationPopup(best);
}

function fitLine(l){
  const lats=l.stations.map(s=>s.lat);
  const lngs=l.stations.map(s=>s.lng);
  const mxLat=Math.max(...lats),mnLat=Math.min(...lats);
  const mxLng=Math.max(...lngs),mnLng=Math.min(...lngs);
  const wrap=document.getElementById('map-wrap');
  const W=wrap.clientWidth,H=wrap.clientHeight;
  const bw=maxLng-minLng,bh=maxLat-minLat;
  const baseScale=Math.min(W/bw,H/bh);
  const span=Math.max((mxLat-mnLat)*baseScale,(mxLng-mnLng)*baseScale)||1;
  vscale=Math.min(8,Math.min(W,H)*0.7/span);
  const cx=(mnLng+mxLng)/2,cy=(mnLat+mxLat)/2;
  const p=geo2px(cy,cx);
  vx+=W/2-p.x; vy+=H/2-p.y;
  drawMap();
}

// ═══════════════════════════════════════════
// INTERACTIONS
// ═══════════════════════════════════════════
function visibleLineSet(){
  // null = 전부 표시. Set = 그 노선들만 표시.
  if(viewMode==='all' || !selLineId) return null;
  const set=new Set([selLineId]);
  if(viewMode==='trans'){
    const sel=LINES.find(l=>l.id===selLineId);
    if(sel){
      const names=new Set(sel.stations.map(s=>s.n));
      LINES.forEach(l=>{ if(l.stations.some(s=>names.has(s.n))) set.add(l.id); });
    }
  }
  return set;
}
function setViewMode(m){
  if((m==='sel'||m==='trans') && !selLineId){ toast('지도에서 볼 노선을 먼저 선택하세요','warn'); return; }
  viewMode=m;
  document.querySelectorAll('.mm-btn').forEach(b=>b.classList.toggle('on', b.dataset.m===m));
  drawMap();
}
function selectLine(lid){
  selLineId=lid;
  const l=LINES.find(x=>x.id===lid);
  renderLinesList();
  fillManualSelects(lid);
  tab('manual');
  fitLine(l);
}

function tab(name){
  document.querySelectorAll('.tb').forEach((b,i)=>{
    b.classList.toggle('on',['lines','manual','gps','log'][i]===name);
  });
  document.querySelectorAll('.tc').forEach(el=>el.classList.remove('on'));
  document.getElementById('tc-'+name).classList.add('on');
}

function fillLineSelect(){
  const s=document.getElementById('s-line');
  s.innerHTML='<option value="">-- 노선 선택 --</option>';
  LINES.forEach(l=>{ s.innerHTML+=`<option value="${l.id}">${l.name}</option>`; });
}

function onLineSel(){
  const lid=document.getElementById('s-line').value;
  if(lid) selectLine(lid);          // 카드 선택과 동일하게 해당 노선으로 클로즈업
  else fillManualSelects('');
}

function fillManualSelects(lid){
  const l=LINES.find(x=>x.id===lid);
  const fs=document.getElementById('s-from');
  const ts=document.getElementById('s-to');
  const dirRow=document.getElementById('s-dir-row');
  fs.innerHTML='<option value="">-- 출발역 --</option>';
  ts.innerHTML='<option value="">-- 도착역 --</option>';
  if(dirRow){ dirRow.style.display=(l&&l.loop)?'':'none'; if(l&&l.loop) document.getElementById('s-dir').value='auto'; }
  if(!l) return;
  document.getElementById('s-line').value=lid;
  l.stations.forEach((s,i)=>{
    fs.innerHTML+=`<option value="${i}">${s.n}</option>`;
    ts.innerHTML+=`<option value="${i}">${s.n}</option>`;
  });
}

function doComplete(){
  const lid=document.getElementById('s-line').value;
  const fi=parseInt(document.getElementById('s-from').value);
  const ti=parseInt(document.getElementById('s-to').value);
  if(!lid||isNaN(fi)||isNaN(ti)){toast('노선·출발역·도착역을 선택하세요','warn');return;}
  if(fi===ti){toast('출발역과 도착역이 같습니다','warn');return;}
  const l=LINES.find(x=>x.id===lid);
  const dir=l.loop?document.getElementById('s-dir').value:undefined;
  const cnt=completeRange(lid,fi,ti,dir);
  addLog(`[수동] ${l.name} — ${l.stations[fi].n}→${l.stations[ti].n} (${cnt}구간)`);
  toast(`✓ ${l.stations[fi].n}→${l.stations[ti].n} ${cnt}구간 완료!`);
  updateAll();
}

function doUndo(){
  const lid=document.getElementById('s-line').value;
  const fi=parseInt(document.getElementById('s-from').value);
  const ti=parseInt(document.getElementById('s-to').value);
  if(!lid||isNaN(fi)||isNaN(ti)){toast('노선·출발역·도착역을 선택하세요','warn');return;}
  const l=LINES.find(x=>x.id===lid);
  const dir=l.loop?document.getElementById('s-dir').value:undefined;
  undoRange(lid,fi,ti,dir);
  addLog(`[취소] ${l.name} — ${l.stations[fi].n}→${l.stations[ti].n}`);
  toast('구간 취소 완료','warn');
  updateAll();
}

function doReset(){
  if(!confirm('정말 전체 초기화할까요?')) return;
  done={};logs=[];
  document.getElementById('log-list').innerHTML='';
  toast('초기화 완료','warn');
  updateAll();
}

// ═══════════════════════════════════════════
// BACKUP (내보내기 / 가져오기)
// ═══════════════════════════════════════════
function doExport(){
  const payload={ version:1, exportedAt:new Date().toISOString(), done, logs };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  const stamp=new Date().toISOString().slice(0,10);
  a.href=url; a.download=`jr-record-${stamp}.json`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  toast('✓ 기록을 파일로 내보냈습니다');
}
function doImport(e){
  const file=e.target.files&&e.target.files[0];
  e.target.value=''; // 같은 파일 다시 선택 가능하게 초기화
  if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const d=JSON.parse(reader.result);
      if(typeof d.done!=='object'||!Array.isArray(d.logs)) throw new Error('형식 오류');
      if(!confirm('현재 기록을 덮어씁니다. 계속할까요?\n(필요하면 먼저 내보내기로 백업하세요)')) return;
      done=d.done||{}; logs=d.logs||[];
      renderLog();
      updateAll();
      toast('✓ 기록을 가져왔습니다');
    }catch(err){
      toast('가져오기 실패: 올바른 백업 파일이 아닙니다','warn');
    }
  };
  reader.readAsText(file);
}

// ═══════════════════════════════════════════
// GPS
// ═══════════════════════════════════════════
function toggleGPS(){
  gpsOn?stopGPS():startGPS();
}
function startGPS(){
  if(!navigator.geolocation){toast('GPS 미지원 브라우저','warn');return;}
  gpsOn=true; gpsSessionList=[]; lastGpsSt=null;
  document.getElementById('gbtn').textContent='🛑 하차 (GPS 종료)';
  document.getElementById('gbtn').classList.add('on');
  document.getElementById('gdot').classList.add('on');
  document.getElementById('gstat').textContent='GPS 활성 — 역 감지 중...';
  document.getElementById('gslog-list').innerHTML='';
  watchId=navigator.geolocation.watchPosition(onGps,onGpsErr,{enableHighAccuracy:true,maximumAge:5000,timeout:10000});
}
function stopGPS(){
  if(watchId) navigator.geolocation.clearWatch(watchId);
  gpsOn=false;
  document.getElementById('gbtn').textContent='🚃 열차 탑승 시작';
  document.getElementById('gbtn').classList.remove('on');
  document.getElementById('gdot').classList.remove('on');
  document.getElementById('gstat').textContent='GPS 비활성';
  document.getElementById('gcoord').textContent='—';
  if(gpsSessionList.length>=2){
    toast(`탑승 종료 — ${gpsSessionList.length}역 통과`);
    addLog(`[GPS] 탑승 종료: ${gpsSessionList.join('→')}`);
  }
}
function onGps(pos){
  const lat=pos.coords.latitude,lng=pos.coords.longitude;
  document.getElementById('gcoord').textContent=`${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  let best=null,bestD=Infinity;
  LINES.forEach(l=>l.stations.forEach((s,i)=>{
    const d=dist(lat,lng,s.lat,s.lng);
    if(d<bestD){bestD=d;best={l,i,s};}
  }));
  if(best&&bestD<300){
    const nm=best.s.n;
    if(!lastGpsSt||lastGpsSt.n!==nm){
      if(lastGpsSt&&lastGpsSt.lid===best.l.id){
        const cnt=completeRange(best.l.id,lastGpsSt.i,best.i);
        if(cnt>0){
          const msg=`${lastGpsSt.n}→${nm} (${cnt}구간)`;
          document.getElementById('gslog-list').innerHTML=
            `<div class="gslog-item">✓ ${msg}</div>`+document.getElementById('gslog-list').innerHTML;
          addLog(`[GPS] ${best.l.name} — ${msg}`);
          toast(`📍 ${nm} 도착 — ${cnt}구간 완료`);
          updateAll();
        }
      }
      gpsSessionList.push(nm);
      lastGpsSt={n:nm,lid:best.l.id,i:best.i};
      document.getElementById('gstat').textContent=`📍 ${nm} 근처`;
    }
  }
}
function onGpsErr(e){ document.getElementById('gstat').textContent='GPS 오류: '+e.message; }
function dist(a1,o1,a2,o2){
  const R=6371000,dr=(a2-a1)*Math.PI/180,do_=(o2-o1)*Math.PI/180;
  const a=Math.sin(dr/2)**2+Math.cos(a1*Math.PI/180)*Math.cos(a2*Math.PI/180)*Math.sin(do_/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

// ═══════════════════════════════════════════
// POPUP
// ═══════════════════════════════════════════
function showStationPopup(st){
  document.getElementById('pop-title').textContent=st.name+'역';
  const lids=[...new Set(st.refs.map(r=>r.lid))];
  document.getElementById('pop-sub').textContent =
    lids.length>1 ? `${lids.length}개 노선 환승역` : ((LINES.find(l=>l.id===lids[0])||{}).name||'');
  const el=document.getElementById('pop-segs');
  el.innerHTML='';
  // 이 역을 지나는 모든 노선을, 각 노선의 인접 구간 토글과 함께 표시
  st.refs.forEach(ref=>{
    const l=LINES.find(x=>x.id===ref.lid); if(!l) return;
    const si=ref.idx;
    const segs=[];
    if(si>0) segs.push({i:si-1,from:l.stations[si-1].n,to:l.stations[si].n});
    if(si<l.stations.length-1) segs.push({i:si,from:l.stations[si].n,to:l.stations[si+1].n});
    if(l.loop&&si===0) segs.push({i:l.stations.length-1,from:l.stations[l.stations.length-1].n,to:l.stations[0].n});
    const head=document.createElement('div');
    head.className='pop-line';
    const badge = l.code ? `<span class="lc-code" style="border-color:${l.color}">${l.code}</span>`
                         : `<span class="pop-line-dot" style="background:${l.color}"></span>`;
    head.innerHTML = badge + `<span>${l.name}</span>`;
    el.appendChild(head);
    segs.forEach(sg=>{
      const ok=!!done[segKey(l.id,sg.i)];
      const row=document.createElement('div');
      row.className='pop-seg';
      row.innerHTML=`<span class="${ok?'seg-ok':'seg-no'}">${ok?'✓':'○'} ${sg.from}→${sg.to}</span><button class="seg-btn${ok?' ok':''}" onclick="toggleSeg('${l.id}',${sg.i},this,event)">${ok?'취소':'완료'}</button>`;
      el.appendChild(row);
    });
  });
  document.getElementById('pop-bg').classList.add('on');
  document.getElementById('popup').classList.add('on');
}
function toggleSeg(lid,si,btn,e){
  e.stopPropagation();
  const k=segKey(lid,si);
  done[k]=!done[k];
  const ok=done[k];
  btn.textContent=ok?'취소':'완료';
  btn.className='seg-btn'+(ok?' ok':'');
  const sp=btn.previousElementSibling;
  const l=LINES.find(x=>x.id===lid);
  const from=l.stations[si].n, to=l.stations[(si+1)%l.stations.length].n;
  sp.className=ok?'seg-ok':'seg-no';
  sp.textContent=(ok?'✓ ':'○ ')+from+'→'+to;
  addLog(`[단일] ${l.name} — ${from}→${to} ${ok?'완료':'취소'}`);
  toast(ok?`✓ ${from}→${to} 완료`:`${from}→${to} 취소`);
  updateAll();
}
function closePop(){
  document.getElementById('pop-bg').classList.remove('on');
  document.getElementById('popup').classList.remove('on');
}

// ═══════════════════════════════════════════
// LOG
// ═══════════════════════════════════════════
function addLog(txt){
  const t=new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
  logs.unshift({t,txt});
  if(logs.length>200) logs.pop();
  renderLog();
}
function renderLog(){
  const el=document.getElementById('log-list');
  el.innerHTML='';
  if(!logs.length){
    const d=document.createElement('div');
    d.className='log-empty';
    d.textContent='아직 기록이 없습니다.';
    el.appendChild(d);
    return;
  }
  logs.forEach(e=>{
    const item=document.createElement('div'); item.className='log-item';
    const t=document.createElement('div'); t.className='log-t'; t.textContent=e.t;
    const m=document.createElement('div'); m.className='log-m'; m.textContent=e.txt;
    item.appendChild(t); item.appendChild(m);
    el.appendChild(item);
  });
}

// ═══════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════
let toastTm;
function toast(msg,type){
  const el=document.getElementById('toast');
  el.textContent=msg;
  el.className='on'+(type==='warn'?' warn':'');
  clearTimeout(toastTm);
  toastTm=setTimeout(()=>el.className='',3000);
}

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
window.addEventListener('resize',()=>{resizeCanvas();drawMap();});

load();
calcBounds();
resizeCanvas();
fillLineSelect();
renderLog();
updateAll();
