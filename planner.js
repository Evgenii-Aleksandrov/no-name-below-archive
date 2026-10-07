'use strict';
// Read-only adaptation of tools/talent_planner.html. Uses current native Atlas
// entry_origin / requires / cross_path rules; never contacts editor endpoints.
function setupPlanner(catalog, byId, statText, esc) {
  const el=id=>document.getElementById(id), canvas=el('atlas'), ctx=canvas.getContext('2d');
  const nodes=catalog.records.filter(r=>r.category==='talents'), map=new Map(nodes.map(r=>[r.id,r]));
  let origin='warrior_center', selected=origin, allocated=new Set([origin]), history=[], zoom=.8, pan={x:0,y:0}, drag=null;
  let pendingShareHash='',opening=false,imageFrame=0,viewWidth=0,viewHeight=0,dpr=1,atlas=null,atlasPromise=null,artwork=null,detailPromise=null,pendingView=null;
  const ART='engine/idle-game-engine/assets/talent_tree/', WEB_ART='assets/';
  const pointers=new Map();let pinch=null;
  const COORDINATE_SHA='1ff03d69817c37e2a04868842733ad28ba3731a9e3d191c51716e1990aba3b4a';
  const ownedFetches=new Set(),events=new AbortController(),ignoredPointers=new Set();
  let active=false,disposed=false,activation=0,coordinatesPromise=null,previewPromise=null,viewIntent={kind:'fit',pending:true};
  function current(ticket){return !disposed&&active&&ticket===activation&&!el('planner').hidden&&!el('detail').open;}
  function statusFor(ticket,text,loading=false){if(!current(ticket))return;const status=el('atlas-status');status.textContent=text;status.dataset.loading=String(loading);}
  async function ownedBytes(src){
    if(disposed)throw new DOMException('Planner disposed','AbortError');
    const controller=new AbortController();ownedFetches.add(controller);
    try{const response=await fetch(src,{signal:controller.signal});if(!response.ok)throw Error('Atlas resource unavailable');return await response.arrayBuffer();}
    finally{ownedFetches.delete(controller);}
  }
  async function loadBitmap(src){
    const bytes=await ownedBytes(src);if(disposed)throw new DOMException('Planner disposed','AbortError');
    const url=URL.createObjectURL(new Blob([bytes],{type:'image/webp'})),image=new Image();image.decoding='async';
    try{image.src=url;await image.decode();if(disposed)throw new DOMException('Planner disposed','AbortError');return image;}
    finally{URL.revokeObjectURL(url);}
  }
  function validateCoordinates(data){
    const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
    const finite=value=>typeof value==='number'&&Number.isFinite(value),inside=value=>finite(value)&&value>=0&&value<=2048;
    if(!object(data)||!object(data.meta)||!object(data.nodes)||!Array.isArray(data.edges)||!Array.isArray(data.clusters))throw Error('Invalid atlas structure');
    const meta=data.meta,ids=Object.keys(data.nodes);
    if(meta.base_scale!==2048||meta.node_count!==nodes.length||ids.length!==nodes.length||nodes.some(n=>!Object.hasOwn(data.nodes,n.id)))throw Error('Atlas node snapshot mismatch');
    if(!Number.isInteger(meta.edge_count)||meta.edge_count!==data.edges.length||!Number.isInteger(meta.bend_count)||!finite(meta.zoom)||meta.zoom<=0||!Array.isArray(meta.pan)||meta.pan.length!==2||!meta.pan.every(finite))throw Error('Invalid atlas metadata');
    for(const id of ids){const n=data.nodes[id];if(!object(n)||!inside(n.x)||!inside(n.y)||!finite(n.r)||n.r<=0||n.r>2048||!['minor','notable','keystone'].includes(n.kind))throw Error('Invalid atlas node geometry');}
    const pairs=new Set();let bends=0;
    for(const edge of data.edges){
      if(!Array.isArray(edge)||edge.length!==3||typeof edge[0]!=='string'||typeof edge[1]!=='string'||!map.has(edge[0])||!map.has(edge[1])||edge[0]===edge[1])throw Error('Invalid atlas edge');
      const pair=[edge[0],edge[1]].sort().join('\u0000');if(pairs.has(pair))throw Error('Duplicate atlas edge');pairs.add(pair);
      if(edge[2]!==null){if(!Array.isArray(edge[2])||edge[2].length!==2||!edge[2].every(inside))throw Error('Invalid atlas bend');bends++;}
    }
    if(bends!==meta.bend_count)throw Error('Atlas bend count mismatch');
  }
  function loadCoordinates(){
    if(atlas)return Promise.resolve(atlas);
    if(!coordinatesPromise)coordinatesPromise=ownedBytes(ART+'talent_tree_coords.json').then(async bytes=>{
      const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));validateCoordinates(data);
      const digest=await crypto.subtle.digest('SHA-256',bytes),hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
      if(hash!==COORDINATE_SHA)throw Error('Stale atlas coordinates');
      if(disposed)throw new DOMException('Planner disposed','AbortError');atlas=data;return data;
    }).finally(()=>{coordinatesPromise=null;});
    return coordinatesPromise;
  }
  function loadDetail(){
    if(artwork?.naturalWidth===4096)return Promise.resolve(true);
    if(!detailPromise)detailPromise=loadBitmap(WEB_ART+'talent-atlas-detail.webp').then(image=>{artwork=image;return true;}).catch(()=>false).finally(()=>{detailPromise=null;});
    return detailPromise;
  }
  function loadPreview(){
    if(artwork)return Promise.resolve();
    if(!previewPromise)previewPromise=loadBitmap(WEB_ART+'talent-atlas-preview.webp').then(image=>{if(!artwork||artwork.naturalWidth<image.naturalWidth)artwork=image;}).catch(async()=>{if(!await loadDetail())throw Error('Atlas images unavailable');}).finally(()=>{previewPromise=null;});
    return previewPromise;
  }
  function loadImages(){
    if(disposed)return Promise.resolve(false);
    const ticket=activation;statusFor(ticket,'Loading the game’s Talent Atlas…',true);
    if(!atlasPromise)atlasPromise=Promise.all([loadCoordinates(),loadPreview()]).then(()=>true).catch(()=>false).finally(()=>{atlasPromise=null;});
    return atlasPromise.then(ok=>{
      if(!current(ticket))return ok;
      if(!ok){statusFor(ticket,'Atlas artwork unavailable. Search and choose talents below to keep planning. Reload to retry.',true);return false;}
      const view=pendingView;
      if(view?.ticket===ticket){pendingView=null;if(view.kind==='fit')fit();else focus(view.id);}
      statusFor(ticket,artwork.naturalWidth<4096?'Preview ready. Loading sharper artwork…':'');draw();
      loadDetail().then(sharp=>{if(!current(ticket))return;statusFor(ticket,sharp?'':'Atlas preview shown. Detail artwork is unavailable; reload to retry.');draw();});
      return true;
    });
  }
  function cancelGesture(){
    const held=[...pointers.keys()];held.forEach(id=>ignoredPointers.add(id));pointers.clear();drag=null;pinch=null;
    for(const id of held)if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
  }
  function deactivate(){
    active=false;activation++;pendingView=null;
    if(imageFrame){cancelAnimationFrame(imageFrame);imageFrame=0;}
    cancelGesture();
  }
  function activate(){
    if(disposed)return false;
    if(!active){active=true;activation++;resize();if(!atlas||viewIntent.pending)pendingView={...viewIntent,ticket:activation};}
    loadImages();draw();return true;
  }
  function dispose(){deactivate();disposed=true;for(const controller of ownedFetches)controller.abort();events.abort();ignoredPointers.clear();atlas=null;artwork=null;}
  function chained(id,set){
    const d=map.get(id)?.data;if(!d)return false;
    if(d.entry_origin&&set.has(d.entry_origin))return true;
    const adj=d.adjacency||[];
    if(!adj.length)return !!d.requires?.length&&d.requires.every(x=>set.has(x));
    return d.cross_path?adj.every(x=>set.has(x)):adj.some(x=>set.has(x));
  }
  function reachable(ids){
    const reached=new Set([origin]);let changed=true;
    while(changed){changed=false;for(const id of ids)if(!reached.has(id)&&chained(id,reached)){reached.add(id);changed=true;}}
    return reached;
  }
  function load(ids){allocated=reachable((ids||[]).filter(id=>map.has(id)));}
  function save(){try{localStorage.setItem('nnb-compendium-plan-'+origin,JSON.stringify([...allocated]));}catch{el('plan-message').textContent='Browser storage is unavailable. Use Copy build link to keep this plan.';}}
  function restore(){try{const ids=JSON.parse(localStorage.getItem('nnb-compendium-plan-'+origin)||'[]');if(!Array.isArray(ids)||ids.length>nodes.length||ids.some(id=>typeof id!=='string'))throw Error();load(ids);}catch{allocated=new Set([origin]);}}
  function spent(){return [...allocated].reduce((sum,id)=>sum+(id===origin?0:Number(map.get(id).data.cost??1)),0);}
  function remember(){history.push([...allocated]);if(history.length>50)history.shift();}
  function toggle(id){
    if(!map.has(id)||id===origin)return false;
    if(allocated.has(id)){
      const remaining=[...allocated].filter(x=>x!==id);
      if(reachable(remaining).size!==remaining.length){el('plan-message').textContent='Remove the end of this path first. Other choices depend on this talent.';return false;}
      remember();allocated.delete(id);
    }else{
      if(!chained(id,allocated)){el('plan-message').textContent='Connect this talent to your class origin first.';return false;}
      remember();allocated.add(id);
    }
    save();update();return true;
  }
  // Native bake coordinates are in a 2048-pixel base; artwork is 4096 square.
  // One CSS-pixel transform is shared by the bitmap, rings, curves and hit test.
  function point(p){return {x:viewWidth/2+pan.x+p.x*2*zoom,y:viewHeight/2+pan.y+p.y*2*zoom};}
  function xy(r){const p=atlas?.nodes[r.id];return p?point(p):null;}
  function radius(id){return (atlas?.nodes[id]?.r||0)*2*zoom;}
  function hitRadius(id){return Math.max(viewWidth<600?22:12,radius(id)+2);}
  function draw(){const ticket=activation;if(current(ticket)&&!imageFrame)imageFrame=requestAnimationFrame(()=>{imageFrame=0;if(current(ticket))paint();});}
  function bezier(a,c,b,t){const u=1-t;return {x:u*u*a.x+2*u*t*c.x+t*t*b.x,y:u*u*a.y+2*u*t*c.y+t*t*b.y};}
  function trimCurve(a,c,b,ra,rb){
    // Exact subcurve: moving endpoints toward the control point changes the bend.
    let lo=0,hi=1;for(let i=0;i<14;i++){const t=(lo+hi)/2,p=bezier(a,c,b,t);if(Math.hypot(p.x-a.x,p.y-a.y)<ra)lo=t;else hi=t;}const t0=(lo+hi)/2;
    lo=0;hi=1;for(let i=0;i<14;i++){const t=(lo+hi)/2,p=bezier(a,c,b,t);if(Math.hypot(p.x-b.x,p.y-b.y)>rb)lo=t;else hi=t;}const t1=(lo+hi)/2;
    if(t0>=t1)return null;
    const start=bezier(a,c,b,t0),end=bezier(a,c,b,t1),u=1-t0;
    return [start,{x:start.x+(t1-t0)*(u*(c.x-a.x)+t0*(b.x-c.x)),y:start.y+(t1-t0)*(u*(c.y-a.y)+t0*(b.y-c.y))},end];
  }
  function paint(){
    if(!current(activation)||!viewWidth)return;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,viewWidth,viewHeight);
    if(!atlas||!artwork?.complete||!artwork.naturalWidth)return;
    ctx.drawImage(artwork,viewWidth/2+pan.x,viewHeight/2+pan.y,4096*zoom,4096*zoom);
    ctx.lineWidth=2;ctx.strokeStyle='#efd48d';
    for(const [aId,bId,bend] of atlas.edges){
      if(!allocated.has(aId)||!allocated.has(bId))continue;
      const a=xy(map.get(aId)),b=xy(map.get(bId)),ra=radius(aId)+2,rb=radius(bId)+2;
      ctx.beginPath();
      if(bend){const c=point({x:bend[0],y:bend[1]}),curve=trimCurve(a,c,b,ra,rb);if(!curve)continue;ctx.moveTo(curve[0].x,curve[0].y);ctx.quadraticCurveTo(curve[1].x,curve[1].y,curve[2].x,curve[2].y);}
      else{const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<=ra+rb)continue;ctx.moveTo(a.x+dx*ra/len,a.y+dy*ra/len);ctx.lineTo(b.x-dx*rb/len,b.y-dy*rb/len);}
      ctx.stroke();
    }
    const filter=el('plan-search').value.trim().toLowerCase();
    for(const n of nodes){
      const active=allocated.has(n.id),available=chained(n.id,allocated),match=filter&&n.search.includes(filter);
      if(n.id!==selected&&!active&&!available&&!match)continue;
      const p=xy(n),r=radius(n.id);
      if(p.x+r<0||p.y+r<0||p.x-r>viewWidth||p.y-r>viewHeight)continue;
      ctx.lineWidth=n.id===selected?2.5:active?2:1;
      ctx.strokeStyle=n.id===selected?'#fff4ce':active?'#e3b761':match?'#e9d19c':'#c8cfad';
      ctx.beginPath();ctx.arc(p.x,p.y,r+2,0,Math.PI*2);ctx.stroke();
      if(n.id===selected){ctx.strokeStyle='#e5bb6855';ctx.lineWidth=1;ctx.beginPath();ctx.arc(p.x,p.y,r+7,0,Math.PI*2);ctx.stroke();}
      if(active&&n.id!==origin){ctx.fillStyle='#edcf87';ctx.beginPath();ctx.arc(p.x+r*.75,p.y-r*.75,3,0,Math.PI*2);ctx.fill();}
    }
  }
  function resize(){if(!current(activation))return;const box=canvas.parentElement.getBoundingClientRect();viewWidth=Math.round(box.width);viewHeight=Math.round(box.height);dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(viewWidth*dpr);canvas.height=Math.round(viewHeight*dpr);el('plan-node').size=viewWidth<600?1:4;el('atlas-hint').textContent=viewWidth<600||matchMedia('(pointer: coarse)').matches?'Drag to pan · Pinch or + / − to zoom · Tap a talent':'Drag to explore · Scroll to zoom · Select to inspect';draw();}
  function fit(){
    if(!current(activation))return;viewIntent={kind:'fit'};resize();if(!atlas){viewIntent.pending=true;pendingView={...viewIntent,ticket:activation};loadImages();return;}pendingView=null;
    const ps=Object.values(atlas.nodes),minX=Math.min(...ps.map(p=>p.x-p.r)),maxX=Math.max(...ps.map(p=>p.x+p.r)),minY=Math.min(...ps.map(p=>p.y-p.r)),maxY=Math.max(...ps.map(p=>p.y+p.r));
    zoom=Math.min((viewWidth-30)/((maxX-minX)*2),(viewHeight-30)/((maxY-minY)*2));pan={x:-(maxX+minX)*zoom,y:-(maxY+minY)*zoom};draw();
  }
  function focus(id){
    if(!current(activation))return;viewIntent={kind:'focus',id};if(!atlas){viewIntent.pending=true;pendingView={...viewIntent,ticket:activation};loadImages();return;}pendingView=null;
    const p=atlas.nodes[id];if(!p)return;zoom=viewWidth<600?(id===origin?1.1:Math.max(zoom,1.5)):Math.max(zoom,.8);pan={x:-p.x*2*zoom,y:-p.y*2*zoom};draw();
  }

  function choose(id,{reveal=false}={}){if(!map.has(id))return;selected=id;update();if(reveal&&viewWidth<600)el('plan-selection').scrollIntoView({block:'nearest',behavior:'instant'});}
  function update(){
    const r=map.get(selected)||map.get(origin),d=r.data, active=allocated.has(r.id),available=chained(r.id,allocated);
    el('plan-count').textContent=`${allocated.size-1} talent${allocated.size===2?'':'s'} · ${spent()} point${spent()===1?'':'s'}`;
    el('plan-selection').innerHTML=`<img src="${esc(r.image)}" alt=""><p class="eyebrow">${esc(d.kind)} · ${d.cost??1} point${(d.cost??1)===1?'':'s'}</p><h2>${esc(r.name)}</h2><p>${esc(r.description)}</p><div class="plan-stats">${Object.entries(d.passive_effects||{}).map(([k,v])=>`<p>${esc(statText(k,v).join(': '))}</p>`).join('')}</div>${d.grants_skill_id?`<p>Grants <a href="#entry/${d.grants_skill_id}">${esc(byId.get(d.grants_skill_id)?.name||d.grants_skill_id)}</a></p>`:''}<button id="plan-allocate" ${r.id===origin||(!active&&!available)?'disabled':''}>${r.id===origin?'Class origin':active?'Remove talent':'Allocate talent'}</button><button id="plan-locate">Locate</button><a href="#entry/${r.id}">Full details →</a>`;
    el('plan-allocate').onclick=()=>toggle(r.id);el('plan-locate').onclick=()=>focus(r.id);
    el('plan-message').textContent=r.id===origin?'Your class origin is free. Choose one of its four entry paths.':active?'Allocated. Remove outer choices before removing a connecting talent.':available?'Connected to your build. Ready to allocate.':'Connect a path to this talent first.';
    const totals={};for(const id of allocated)for(const [k,v] of Object.entries(map.get(id).data.passive_effects||{}))if(typeof v==='number')totals[k]=(totals[k]||0)+v;
    el('plan-summary').innerHTML=`<p class="muted">Unlimited build planning. Points shown are spent costs, not earned points. Bonuses are additive inputs, not final combat stats; equipment and resonance are excluded.</p>${Object.entries(totals).map(([k,v])=>{const [label,value]=statText(k,v);return `<div class="summary-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;}).join('')||'<p>Allocate a talent to begin your build.</p>'}`;
    el('plan-undo').disabled=!history.length;options();draw();
  }
  function options(){
    const q=el('plan-search').value.trim().toLowerCase(),view=el('plan-view').value;
    const filtered=nodes.filter(r=>r.id===selected||((!q||r.search.includes(q))&&(q||view==='all'||allocated.has(r.id)||(view==='available'&&chained(r.id,allocated)))));
    const groups=[['Available now',filtered.filter(r=>!allocated.has(r.id)&&chained(r.id,allocated))],['Your build',filtered.filter(r=>allocated.has(r.id))],['Other talents',filtered.filter(r=>!allocated.has(r.id)&&!chained(r.id,allocated))]];
    el('plan-node').innerHTML=groups.filter(([,rows])=>rows.length).map(([name,rows])=>`<optgroup label="${name}">${rows.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')}</optgroup>`).join('');
    el('plan-node').value=selected;draw();
  }
  function gesture(){const [a,b]=[...pointers.values()],rect=canvas.getBoundingClientRect();return {distance:Math.hypot(b.x-a.x,b.y-a.y),x:(a.x+b.x)/2-rect.left-viewWidth/2,y:(a.y+b.y)/2-rect.top-viewHeight/2};}
  canvas.addEventListener('pointerdown',e=>{
    if(!current(activation))return;
    if(ignoredPointers.size){if(!e.isPrimary){ignoredPointers.add(e.pointerId);return;}ignoredPointers.clear();}
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);
    if(pointers.size>2){cancelGesture();return;}
    if(pointers.size===1)drag={id:e.pointerId,x:e.clientX,y:e.clientY,px:pan.x,py:pan.y,moved:false};
    else if(pointers.size===2){const g=gesture();pinch={...g,zoom,pan:{...pan}};if(drag)drag.moved=true;}
  },{signal:events.signal});
  canvas.addEventListener('pointermove',e=>{
    if(!current(activation)||!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pinch&&pointers.size===2){const g=gesture(),next=Math.max(.035,Math.min(2.5,pinch.zoom*g.distance/Math.max(1,pinch.distance))),f=next/pinch.zoom;pan={x:g.x-(pinch.x-pinch.pan.x)*f,y:g.y-(pinch.y-pinch.pan.y)*f};zoom=next;draw();return;}
    if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.moved||=Math.hypot(dx,dy)>5;pan={x:drag.px+dx,y:drag.py+dy};draw();
  },{signal:events.signal});
  canvas.addEventListener('pointerup',e=>{
    if(!current(activation)||!pointers.has(e.pointerId)){ignoredPointers.delete(e.pointerId);return;}
    if(drag?.id===e.pointerId&&!drag.moved&&!pinch&&artwork?.naturalWidth){const rect=canvas.getBoundingClientRect(),p={x:e.clientX-rect.left,y:e.clientY-rect.top};const nearest=atlas&&nodes.map(r=>({r,d:Math.hypot(xy(r).x-p.x,xy(r).y-p.y)})).sort((a,b)=>a.d-b.d)[0];if(nearest&&nearest.d<=hitRadius(nearest.r.id))choose(nearest.r.id,{reveal:true});}
    pointers.delete(e.pointerId);pinch=null;
    if(pointers.size===1){const [id,p]=[...pointers.entries()][0];drag={id,x:p.x,y:p.y,px:pan.x,py:pan.y,moved:true};}else drag=null;
  },{signal:events.signal});
  canvas.addEventListener('pointercancel',e=>{if(pointers.has(e.pointerId))cancelGesture();ignoredPointers.delete(e.pointerId);},{signal:events.signal});
  canvas.addEventListener('lostpointercapture',e=>{if(pointers.has(e.pointerId)){deactivate();if(!el('planner').hidden&&!el('detail').open)activate();}},{signal:events.signal});
  for(const type of ['pointerup','pointercancel'])window.addEventListener(type,e=>ignoredPointers.delete(e.pointerId),{capture:true,signal:events.signal});
  canvas.addEventListener('wheel',e=>{if(!current(activation))return;e.preventDefault();const factor=e.deltaY<0?1.15:1/1.15;const next=Math.max(.035,Math.min(2.5,zoom*factor)),f=next/zoom;const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left-viewWidth/2,y=e.clientY-rect.top-viewHeight/2;pan={x:x-(x-pan.x)*f,y:y-(y-pan.y)*f};zoom=next;draw();},{passive:false,signal:events.signal});
  el('plan-class').onchange=()=>{save();origin=el('plan-class').value;selected=origin;history=[];restore();focus(origin);update();options();};
  el('plan-search').oninput=options;el('plan-node').onchange=()=>choose(el('plan-node').value,{reveal:true});
  el('plan-view').onchange=options;
  el('plan-fit').onclick=fit;el('plan-focus').onclick=()=>{choose(origin);focus(origin);};
  el('plan-zoom-in').onclick=()=>{const f=Math.min(1.35,2.5/zoom);zoom*=f;pan.x*=f;pan.y*=f;draw();};
  el('plan-zoom-out').onclick=()=>{const f=Math.max(1/1.35,.035/zoom);zoom*=f;pan.x*=f;pan.y*=f;draw();};
  el('plan-reset').onclick=()=>{remember();allocated=new Set([origin]);save();update();};
  el('plan-undo').onclick=()=>{if(history.length){load(history.pop());save();update();}};
  function buildHash(){return 'planner?'+new URLSearchParams({v:'1',class:origin,nodes:[...allocated].filter(x=>x!==origin).sort().join(',')});}
  el('plan-share').onclick=async()=>{const url=new URL(location.href);url.hash=buildHash();try{await navigator.clipboard.writeText(url.href);el('plan-import-message').textContent='Build link copied.';}catch{if(location.hash!==url.hash){pendingShareHash=url.hash.slice(1);location.hash=url.hash;}el('plan-import-message').textContent='Your build is in the address bar. Copy the URL to keep it.';}};
  window.addEventListener('resize',resize,{signal:events.signal});
  window.addEventListener('blur',deactivate,{signal:events.signal});
  window.addEventListener('focus',()=>{if(!el('planner').hidden&&!el('detail').open)activate();},{signal:events.signal});
  window.addEventListener('pagehide',e=>e.persisted?deactivate():dispose(),{signal:events.signal});
  window.addEventListener('pageshow',e=>{if(e.persisted){ignoredPointers.clear();if(!el('planner').hidden&&!el('detail').open)activate();}},{signal:events.signal});
  restore();
  return {open(hash){
    if(!activate())return;
    if(hash===pendingShareHash){pendingShareHash='';el('plan-import-message').textContent='Your build is in the address bar. Copy the URL to keep it.';return;}
    opening=true;const params=new URLSearchParams(hash.split('?')[1]||''),classes=['warrior_center','mage_center','rogue_center','cleric_center'];
    const ids=params.has('nodes')?(params.get('nodes')?params.get('nodes').split(','):[]):null;
    let error='';
    if(hash.length>65536)error='This build link is too large.';
    else if(params.has('v')&&params.get('v')!=='1')error='This build link uses an unsupported version.';
    else if(params.has('class')&&!classes.includes(params.get('class')))error='This build link has an unknown class origin.';
    else if(ids&&ids.length>nodes.length)error='This build link contains too many talents.';
    else if([...params.keys()].some(key=>params.getAll(key).length>1))error='This build link contains duplicate fields.';
    if(error){el('plan-import-message').textContent=error+' Your saved plan was kept.';el('plan-class').value=origin;selected=map.has(selected)?selected:origin;resize();focus(selected);opening=false;update();return;}
    el('plan-import-message').textContent='';
    if(ids||(params.has('class')&&params.get('class')!==origin))history=[];
    if(params.has('class'))origin=params.get('class');
    else if(params.has('node')&&!activeNodeAllocated(params.get('node'))){const target=map.get(params.get('node')),inferred=classes.includes(target?.id)?target.id:target?.data.entry_origin;if(classes.includes(inferred)&&inferred!==origin){origin=inferred;history=[];}}
    el('plan-class').value=origin;
    if(ids){load(ids);save();const dropped=[...new Set(ids)].filter(id=>!allocated.has(id));if(dropped.length)el('plan-import-message').textContent=`Ignored ${dropped.length} unknown or disconnected talent${dropped.length===1?'':'s'}. Only connected choices were imported.`;}else restore();
    resize();selected=map.has(params.get('node'))?params.get('node'):viewWidth<600?[...allocated].filter(id=>id!==origin).at(-1)||origin:origin;options();fit();if(viewWidth<600||params.has('node')||allocated.size===1)focus(selected);opening=false;update();
  },activate,deactivate,dispose,chained,reachable,toggle,choose,buildHash,ready:loadImages,nodeGeometry:id=>map.has(id)?{center:xy(map.get(id)),radius:radius(id),hitRadius:hitRadius(id)}:null,projectNode:id=>map.has(id)?xy(map.get(id)):null,getState:()=>({origin,selected,allocated:[...allocated],spent:spent(),view:{zoom,pan:{...pan},width:viewWidth,height:viewHeight,dpr,bakeScale:2},artworkReady:!!artwork?.naturalWidth,artworkResolution:artwork?.naturalWidth||0})};
  function activeNodeAllocated(id){return allocated.has(id);}
}
