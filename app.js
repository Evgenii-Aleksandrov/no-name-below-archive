'use strict';
const $=id=>document.getElementById(id);
const esc=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const title=text=>String(text).replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const roman=['','I','II','III','IV','V','VI','VII','VIII'];
const categories={items:['Equipment & items','THE ARMORY'],orbs:['Currency & orbs','THE CRAFT'],affixes:['Affixes','PREFIXES & SUFFIXES'],skills:['Skills','THE ARTS OF COMBAT'],subclasses:['Subclasses','CHOOSE YOUR PATH'],classes:['Classes','FOUR BEGINNINGS'],talents:['Talents','THE TALENT TREE'],enemies:['Enemies','THE BESTIARY'],dungeons:['Dungeons','THE DESCENT'],enemy_skills:['Enemy abilities','KNOW YOUR ENEMY'],pools:['Affix pools','ITEM CONNECTIONS']};
const chapters={crafting:['Crafting','THE WORK OF CURRENCY'],mechanics:['Mechanics','UNDERSTAND THE DESCENT'],search:['Search the archive','EVERY COLLECTION']};
const descriptions={items:'The eight tiers of equipment. Inspect a base, then follow its compatible modifiers.',enemies:'Portraits from the depths, their authored lore, combat properties and known habitats.',dungeons:'Places along the descent. Follow their creatures, bosses and connections.',classes:'Four class origins. Compare starting stats, signature passives and connected paths.',subclasses:'Specialized paths linked to their parent class and granted skills.',skills:'Combat skills, their costs, targeting and effects. Follow the talents that grant them.',talents:'Connected choices across the Talent Atlas. Inspect a talent or take it into your build.',orbs:'The currencies of No Name Below, with verified operations and separate flavor text.',affixes:'Prefixes and suffixes, their numeric ranges and compatible equipment.',pools:'Modifier pools and the bases that use them.',enemy_skills:'The attacks and effects linked to each creature.'};
let catalog,byId,current='items',detailReturn='items',limit=48,activeRoute='',returnFocus=null,scrollFrame=0,lastScrollTime=0,scrollPosition=0;
// Only recognize the previous edition's exact fragments; no legacy definitions.
const retiredSetIds=new Set(['set_apprentice_blades','set_arcane_ascendancy','set_gravefrost_vigil','set_iron_bulwark','set_mystic_trappings','set_stormcaller','set_training_guardian','set_void_walker','set_voidweave']);
const readableLabels={damage_mult:'Damage multiplier',is_ultimate:'Ultimate',is_class_default:'Class default',hp:'HP',xp_reward:'XP reward',crit_chance:'Critical chance',crit_multiplier:'Critical multiplier',crit_damage_pct:'Critical multiplier',crit_multiplier_flat:'Critical multiplier',crit_chance_flat:'Critical chance',crit_chance_pct:'Critical chance',phys_damage:'Physical damage',phys_damage_flat:'Physical damage',phys_damage_pct:'Physical damage',magic_damage:'Magic damage',resource_max:'Maximum resource',resource_starting:'Starting resource',resource_regen:'Resource regeneration',str:'Strength',dex:'Dexterity',int:'Intelligence'};
const labelOf=key=>readableLabels[key]||title(key);
const displayNumber=n=>new Intl.NumberFormat('en',{maximumFractionDigits:Math.abs(n)>=10?1:2}).format(n);
const displayRange=(v,format)=>{const shown=v.map(format);return v.length===2&&typeof v[0]==='number'&&shown[0]===shown[1]?shown[0]:shown.join(' – ');};
const mechanicValueLabels={single_attack_burst:'Single-target attack burst',aoe_damage:'Area damage',all_enemies:'All enemies',aoe:'Area of effect',single_enemy:'Single enemy'};
const val=v=>Array.isArray(v)?displayRange(v,val):typeof v==='object'&&v!==null?Object.entries(v).map(([k,x])=>`${labelOf(k)}: ${val(x)}`).join(' · '):typeof v==='number'?displayNumber(v):typeof v==='boolean'?(v?'Yes':'No'):typeof v==='string'&&Object.hasOwn(mechanicValueLabels,v)?mechanicValueLabels[v]:String(v??'—');
const kind=r=>r.data.item_type||r.data.affix_type||r.data.class_id||r.data.kind||r.data.damage_type||'';
const ultimateLabel=r=>r.data.is_ultimate===true?(r.data.is_class_default===true?'Class Ultimate':'Subclass Ultimate'):'';
const primary=r=>r?.art?.primary?.url||r?.image||'';
const referenceLink=id=>{const r=byId.get(id);return r?`<a href="#entry/${encodeURIComponent(id)}">${esc(r.name)}${r.tier?` <small>· T${r.tier}</small>`:''}</a>`:'';};
function stats(r){const d=r.data;return d.stat_bonuses||d.passive_effects||d.base_stats||Object.fromEntries(Object.entries(d).filter(([k])=>k.startsWith('base_')));}
function statText(key,value){const display=catalog.stat_display[key],label=readableLabels[key]||display?.label||labelOf(key.replace(/^base_/,''));const format=x=>typeof x==='number'?`${displayNumber(x*(display?.scale||1))}${display?.suffix||''}`:val(x);return [label,Array.isArray(value)?displayRange(value,format):format(value)];}
function facts(data,formattedStats=false){return `<dl class="facts">${Object.entries(data).filter(([,v])=>v!==null&&v!==''&&!(Array.isArray(v)&&!v.length)).map(([k,v])=>{const [label,value]=formattedStats?statText(k,v):[labelOf(k),val(v)];return `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`;}).join('')}</dl>`;}
function art(r){const image=primary(r);return image?`<div class="card-art">${r.tier?`<span class="tier-chip">TIER ${roman[r.tier]||esc(r.tier)}</span>`:''}<img src="${esc(image)}" alt="" loading="lazy" decoding="async"></div>`:'';}
const logicalTime=ticks=>`${displayNumber(ticks*.5)} s (${displayNumber(ticks)} logical ticks)`;
function abilityFacts(d){
  const out={};
  for(const key of ['effect_type','damage_type','targeting','target_mode','resource_cost'])if(d[key]!==undefined)out[key]=d[key];
  for(const key of ['cooldown_ticks','initial_cooldown_ticks'])if(typeof d[key]==='number')out[key.replace('_ticks','')]=logicalTime(d[key]);
  if(typeof d.telegraph_ticks==='number')out.telegraph=d.telegraph_clock==='logical'?logicalTime(d.telegraph_ticks):`${displayNumber(d.telegraph_ticks)} meter fills (speed-dependent)`;
  for(const [key,value] of Object.entries(d.params||{}))out[key]=key==='duration_ticks'&&typeof value==='number'?logicalTime(value):key.endsWith('_multiplier')&&typeof value==='number'?`${displayNumber(value)}\u00d7`:value;
  if(d.applies_dot)out.damage_over_time={...d.applies_dot,...(typeof d.applies_dot.ticks==='number'?{duration:logicalTime(d.applies_dot.ticks)}:{})};
  if(d.tags?.length)out.tags=d.tags;
  return out;
}
function abilityPreview(r){const d=r.data,p=d.params||{},parts=[];
  if(d.effect_type)parts.push(Object.hasOwn(mechanicValueLabels,d.effect_type)?val(d.effect_type):title(d.effect_type));if(d.damage_type)parts.push(title(d.damage_type));
  if(typeof p.damage_multiplier==='number')parts.push(`${displayNumber(p.damage_multiplier)}\u00d7 attack input`);
  if(d.resource_cost)parts.push(val(d.resource_cost));if(typeof d.cooldown_ticks==='number')parts.push(`Cooldown ${logicalTime(d.cooldown_ticks)}`);
  if(d.targeting)parts.push(Object.hasOwn(mechanicValueLabels,d.targeting)?val(d.targeting):title(d.targeting));if(typeof p.duration_ticks==='number')parts.push(`Duration ${logicalTime(p.duration_ticks)}`);
  for(const [key,value] of Object.entries(p))if(!['damage_multiplier','duration_ticks'].includes(key))parts.push(`${labelOf(key)}: ${typeof value==='number'&&key.endsWith('_multiplier')?displayNumber(value)+'\u00d7':val(value)}`);
  if(d.applies_dot)parts.push(`DoT: ${val(d.applies_dot)}`);
  return parts.map(esc).join('<br>');
}
function mechanicsFacts(m){
  if(!m.facts)return '';
  if(Array.isArray(m.facts))return `<div class="table-wrap"><table><thead><tr><th>Rarity</th><th>Prefix cap</th><th>Suffix cap</th><th>Rolled total</th></tr></thead><tbody>${m.facts.map(f=>`<tr><td>${esc(title(f.rarity))}</td><td>${esc(f.max_prefixes)}</td><td>${esc(f.max_suffixes)}</td><td>${esc(f.guaranteed_total??0)}</td></tr>`).join('')}</tbody></table></div>`;
  const human=value=>typeof value==='string'&&/^[a-z][a-z_]+$/.test(value)?title(value):val(value);
  const rows=object=>`<dl class="mechanic-facts">${Object.entries(object).map(([key,value])=>`<dt>${esc(key==='base_stat_pct'?'Base stats per level':labelOf(key))}</dt><dd>${value&&typeof value==='object'&&!Array.isArray(value)?rows(value):key.endsWith('_formula')?`<code>${esc(val(value))}</code>`:esc(key==='base_stat_pct'&&typeof value==='number'?displayNumber(value*100)+'%':Array.isArray(value)?value.map(human).join(' / '):human(value))}</dd>`).join('')}</dl>`;
  const priority={enhancing:['currency','base_cost_per_rarity','growth_factor_per_level','base_stat_pct','effective_max_level','cost_formula','stat_formula'],reforging:['operation','costs_by_tier','cost_growth_factor','cost_count_field','engraved_modifier'],talent_allocation:['cost_by_kind','point_balance','refund'],enemy_abilities:['timing']}[m.id];
  if(!priority)return rows(m.facts);
  const lead=Object.fromEntries(priority.filter(key=>m.facts[key]!==undefined).map(key=>[key,m.facts[key]])),rest=Object.fromEntries(Object.entries(m.facts).filter(([key])=>!priority.includes(key)));
  return rows(lead)+(Object.keys(rest).length?`<details class="mechanics-deep"><summary>Detailed rule parameters</summary>${rows(rest)}</details>`:'');
}
function plannerHelp(){const entries=catalog.site_help||catalog.mechanics.filter(m=>m.id==='planner_scope');$('planner-help').innerHTML=entries.map(m=>`<h3>${esc(m.title)}</h3><p>${esc(m.description)}</p>`).join('');}
const orbBreakpoint=matchMedia('(max-width:600px)');
function placeOrb(route){const target=route==='planner'?document.querySelector('.planner-heading'):route==='showcase'?document.querySelector('.gallery-heading'):document.querySelector('.section-title');target?.append($('orb-section-crest'));}
function initOrb(route=activeRoute||location.hash.slice(1).split('?')[0]||'items'){
  placeOrb(route);const mobile=orbBreakpoint.matches;
  try{window.NNBOrbMotion?.init({routeHost:'#orb-route-host',scrollHost:'#orb-scroll-host',initialRoute:route,routeOrder:Object.keys({...categories,...chapters,showcase:[]}),presentation:'section',size:mobile?72:88,routeTravel:mobile?112:132,scrollTravel:mobile?48:64,scrollRange:320,duration:680,routeTextures:{items:primary(byId.get('chaos_orb')),planner:primary(byId.get('orb_of_regret')),talents:primary(byId.get('orb_of_regret')),crafting:primary(byId.get('orb_of_transmutation'))}});}catch(error){console.warn('Orb decoration unavailable:',error.message);}
}
orbBreakpoint.addEventListener('change',()=>{if(catalog)initOrb();});
window.addEventListener('pagehide',()=>window.NNBOrbMotion?.destroy());
window.addEventListener('pageshow',e=>{if(e.persisted&&catalog)initOrb();});
function card(r,gallery=false){const preview=Object.entries(stats(r)).filter(([,v])=>typeof v==='number'?v!==0:Array.isArray(v)?v.some(x=>x!==0):true).slice(0,2).map(([k,v])=>statText(k,v).join(' ')).join(' · ');return `<a class="card" href="#entry/${encodeURIComponent(r.id)}" aria-label="${esc(r.name)}${r.tier?', tier '+r.tier:''}">${art(r)}<div class="card-body"><div class="card-meta">${esc([ultimateLabel(r),kind(r),r.data.slot].filter(Boolean).join(' / ')||categories[r.category][0])}${r.category==='enemies'&&r.tier?' · TIER '+roman[r.tier]:''}</div><h3>${esc(r.name)}</h3>${gallery?'':`<p>${esc(r.description)}</p>${preview?`<div class="stat-preview">${esc(preview)}</div>`:''}${r.availability?.primary_art==='missing'?'<span class="card-availability">No authored artwork available</span>':''}`}</div></a>`;}
function eligibleTypes(r){return [...new Set(r.links.filter(l=>l.relation==='Eligible equipment').map(l=>{const d=byId.get(l.id).data;return title(d.weapon_family||d.armor_class||d.item_type);} ))].sort();}
function filtersForCategory(){$('skill-category-filter').hidden=current!=='skills';const rows=catalog.records.filter(r=>r.category===current);$('tier').innerHTML='<option value="">All tiers</option>'+[...new Set(rows.map(r=>r.tier).filter(Boolean))].sort((a,b)=>a-b).map(t=>`<option value="${t}">Tier ${roman[t]||t}</option>`).join('');$('kind').innerHTML='<option value="">All types</option>'+[...new Set(rows.map(kind).filter(Boolean))].sort().map(k=>`<option value="${esc(k)}">${esc(title(k))}</option>`).join('');}
function renderCards(){
  const q=$('search').value.trim().toLowerCase(),tier=$('tier').value,type=$('kind').value,skillCategory=$('skill-category').value;
  const rows=catalog.records.filter(r=>r.category===current&&(!tier||String(r.tier)===tier)&&(!type||kind(r)===type)&&(current!=='skills'||!skillCategory||(r.data.is_ultimate===true)===(skillCategory==='ultimate'))&&(!q||r.search.includes(q)));
  if(current==='dungeons')rows.sort((a,b)=>(a.progression?.ordinal??Infinity)-(b.progression?.ordinal??Infinity));
  $('result-count').textContent=`${rows.length.toLocaleString()} entries`;const textual=['affixes','pools','enemy_skills'].includes(current);$('cards').className=`cards ${textual?'text-records':''} category-${current}`;
  $('cards').innerHTML=rows.length?(textual?`<div class="table-wrap"><table><thead><tr><th>Name</th><th>${current==='enemy_skills'?'Mechanics':'Properties'}</th><th>${current==='affixes'?'Eligible equipment':'Description'}</th></tr></thead><tbody>${rows.slice(0,limit).map(r=>`<tr><td><div class="ability-name">${current==='enemy_skills'&&primary(r)?`<img src="${esc(primary(r))}" alt="" width="52" height="52" loading="lazy">`:''}${referenceLink(r.id)}</div><small>${esc(title(kind(r)))}${r.tier?' · Tier '+roman[r.tier]:''}</small></td><td>${current==='enemy_skills'?abilityPreview(r):(Object.entries(stats(r)).map(([k,v])=>esc(statText(k,v).join(': '))).join('<br>')||esc(r.description))}</td><td>${current==='affixes'?eligibleTypes(r).map(esc).join(', ')||'No eligible bases':esc(r.description)}${r.availability?.status?`<p class="card-availability">${esc(title(r.availability.status))}</p>`:''}</td></tr>`).join('')}</tbody></table></div>`:rows.slice(0,limit).map(r=>card(r)).join('')):'<p class="empty"><strong>No entries match these filters.</strong>Try another name or reset the filters.</p>';
  $('more').hidden=rows.length<=limit;$('more').textContent=`Show more · ${Math.max(0,rows.length-limit)} remaining`;
}
function markCollection(key){$('collection-select').value=key;document.querySelectorAll('#categories a').forEach(a=>{const active=a.dataset.category===key;a.classList.toggle('active',active);active?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current');});}
function showCategory(category){
  if(!categories[category])category='items';const changed=category!==current;current=category;document.querySelector('.intro').hidden=category!=='items';$('library').hidden=false;$('showcase').hidden=true;$('chapter').hidden=true;$('cards').hidden=false;$('collection-tools').hidden=false;document.body.classList.remove('clean');stopScroll();markCollection(category);
  $('section-title').textContent=categories[category][0];$('section-kicker').textContent=categories[category][1];$('section-description').textContent=descriptions[category]||'';const feature=catalog.records.find(r=>r.category===category&&primary(r));$('section-art').innerHTML=feature?`<img src="${esc(primary(feature))}" alt="" decoding="async">`:'';
  document.title=`${categories[category][0]} — No Name Below`;if(changed){$('search').value='';filtersForCategory();limit=48;}renderCards();showBestiaryFeature(category);
}
function showBestiaryFeature(category){
  const host=$('bestiary-feature');host.hidden=category!=='enemies';if(host.hidden)return;
  const creature=byId.get('hall_sentinel'),habitat=byId.get('dungeon_bone_cathedral');
  const art=creature?.art?.secondary?.find(a=>a.role==='map_cutout');
  if(!creature||!habitat||!art){host.hidden=true;return;}
  host.innerHTML=`<div class="bestiary-scene" aria-hidden="true" style="background-image:url('${esc(primary(habitat))}')"></div><div class="bestiary-feature-copy"><p class="eyebrow">FIELD NOTES / ${esc(habitat.name)}</p><h2 id="bestiary-feature-title">${esc(creature.name)}</h2><span class="flavor-label">LORE · AUTHORED GAME TEXT</span><p class="feature-lore">${esc(creature.description)}</p><p class="feature-habitat">Boss of <a href="#entry/${habitat.id}">${esc(habitat.name)}</a></p><div class="hero-actions"><a class="primary-link" href="#entry/${creature.id}">Study this creature <span aria-hidden="true">→</span></a><a class="text-link" href="#entry/${habitat.id}">Explore its habitat →</a></div></div><img class="bestiary-creature" src="${esc(art.url)}" alt="${esc(creature.name)}" decoding="async"><span class="feature-mark" aria-hidden="true">THE BESTIARY</span>`;
}

// Live-site adaptation of the approved HyperFrames choreography: art first,
// short overlapping entrances, then still readable content. Routing never waits.
let sceneAnimations=[],sceneObserver=null;
const sceneReduced=matchMedia('(prefers-reduced-motion: reduce)');
function clearSceneMotion(){
  sceneAnimations.forEach(a=>a.cancel());sceneAnimations=[];sceneObserver?.disconnect();sceneObserver=null;
}
function enterScene(){
  clearSceneMotion();
  $('bestiary-feature').hidden=current!=='enemies'||!$('planner').hidden||$('library').hidden;
  if(sceneReduced.matches)return;
  const animate=(node,frames,options)=>{if(node)sceneAnimations.push(node.animate(frames,{fill:'none',...options}));};
  const hero=!document.querySelector('.intro').hidden&&!$('library').hidden;
  if(hero){
    animate(document.querySelector('.hero-art'),[{transform:'translateX(26px) scale(1.025)',opacity:.6},{transform:'translateX(0) scale(1)',opacity:1}],{duration:1100,easing:'cubic-bezier(.22,.61,.36,1)'});
    animate(document.querySelector('.intro h1'),[{transform:'translateY(18px)',opacity:.25},{transform:'translateY(0)',opacity:1}],{duration:680,easing:'cubic-bezier(.16,1,.3,1)'});
    animate(document.querySelector('.intro .lede'),[{opacity:.35},{opacity:1}],{duration:780,delay:100,easing:'ease-out'});
  }else{
    const heading=!$('planner').hidden?document.querySelector('.planner-heading'):document.querySelector('.section-title');
    animate(heading,[{transform:'translateY(10px)',opacity:.5},{transform:'translateY(0)',opacity:1}],{duration:440,easing:'cubic-bezier(.16,1,.3,1)'});
  }
  const feature=$('bestiary-feature');
  if(!feature.hidden){
    const featureObserver=new IntersectionObserver(entries=>{
      if(!entries.some(e=>e.isIntersecting))return;featureObserver.disconnect();
      animate(feature.querySelector('.bestiary-scene'),[{transform:'scale(1.06)',opacity:.5},{transform:'scale(1)',opacity:1}],{duration:1200,easing:'ease-out'});
      animate(feature.querySelector('.bestiary-creature'),[{transform:'translateX(30px)',opacity:.3},{transform:'translateX(0)',opacity:1}],{duration:880,delay:100,easing:'cubic-bezier(.22,.61,.36,1)'});
      animate(feature.querySelector('.bestiary-feature-copy'),[{transform:'translateY(16px)',opacity:.4},{transform:'translateY(0)',opacity:1}],{duration:620,delay:80,easing:'cubic-bezier(.16,1,.3,1)'});
    },{threshold:.18});featureObserver.observe(feature);sceneObserver=featureObserver;
  }
  // Scroll accents run once per mounted collection, never intercept scrolling.
  const revealNodes=[...document.querySelectorAll('#cards .card')].slice(0,12);
  if(revealNodes.length){
    const observer=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){observer.unobserve(e.target);animate(e.target,[{transform:'translateY(12px)',opacity:.65},{transform:'translateY(0)',opacity:1}],{duration:420,easing:'ease-out'});}});},{threshold:.15});
    revealNodes.forEach(n=>observer.observe(n));const original=sceneObserver;
    sceneObserver={disconnect(){original?.disconnect();observer.disconnect();}};
  }
}
sceneReduced.addEventListener('change',()=>{if(sceneReduced.matches)clearSceneMotion();});
function block(heading,body){return body?`<section class="detail-block"><h3>${esc(heading)}</h3>${body}</section>`:'';}
function showEntry(id){
  const r=byId.get(id);if(!r){$('error').textContent=retiredSetIds.has(id)?'This legacy item-set entry has been retired. Browse equipment and compatible affixes in the current archive.':'This entry could not be found. Choose a collection to continue.';$('error').hidden=false;return;}
  const d=r.data,image=primary(r),mapArt=r.art?.secondary?.find(a=>a.role==='map_cutout');const info=Object.fromEntries(['tier','tier_label','item_type','slot','rarity','armor_class','weapon_family','weapon_type','handedness','affix_type','affix_group','effect','damage_mult','is_ultimate','is_class_default','cooldown_seconds','resource_cost','resource_type','damage_type','attack_damage_type','targeting','max_level','cost','gold_value','max_stack','max_affixes','max_prefixes','max_suffixes','xp_reward','size_class'].filter(k=>d[k]!==undefined).map(k=>[k,d[k]]));if(r.category==='affixes')info.eligible_equipment_types=eligibleTypes(r);if(r.category==='enemy_skills'){Object.keys(info).forEach(k=>delete info[k]);Object.assign(info,abilityFacts(d));}
  const groups={};for(const l of r.links){(groups[l.relation]??=[]);if(!groups[l.relation].includes(l.id))groups[l.relation].push(l.id);}
  const links=Object.entries(groups).map(([rel,ids])=>block(rel,`${rel==='Eligible equipment'||rel==='Can roll'?'<p class="eligibility-note">Compatible bases and affixes after item type, tier, pool and local-stat restrictions. Common items have no rolled affixes. Rarity, available prefix/suffix slots and existing modifier groups still constrain a particular roll.</p><label class="link-filter-label">Filter these results <input class="link-filter" type="search" placeholder="Name or tier…"></label>':''}<div class="reference-list">${ids.map(referenceLink).join('')}</div>`)).join('');
  const lore=['enemies','dungeons'].includes(r.category),ability=r.category==='enemy_skills',flavor=ability?'':r.explanations?.flavor||d.flavor,availability=r.availability?.status||r.availability?.membership;$('detail-body').className=`detail-${r.category}`;
  $('detail-body').innerHTML=`<div class="detail-topline"><a href="#${r.category}">${esc(categories[r.category][0])}</a><span>/</span>${esc(r.name)}</div><div class="detail-top ${!image?'text-detail':''}">${image?`<img src="${esc(image)}" alt="${esc(r.name)}">`:''}<div><p class="eyebrow">${esc(categories[r.category][0])}${ultimateLabel(r)?' / '+esc(ultimateLabel(r)):''}${r.tier?' / TIER '+roman[r.tier]:''}</p><h2 id="detail-title">${esc(r.name)}</h2>${r.description?`${lore?'<span class="flavor-label">Lore</span>':ability?'<span class="flavor-label">Description</span>':''}<p${lore?' class="flavor-text"':''}>${esc(r.description)}</p>`:''}${flavor?`<span class="flavor-label">FLAVOR TEXT</span><p class="flavor-text">${esc(flavor)}</p>`:''}${r.category==='talents'?`<a class="primary-link" href="#planner?node=${r.id}">Inspect in Talent Atlas →</a>`:''}${r.availability?.authored_description===false&&['classes','subclasses'].includes(r.category)?'<p class="card-availability">No authored introduction is available. Properties and linked abilities below come from the game data.</p>':''}${availability?`<p class="chapter-note">${esc(title(availability))}. Membership is not a complete equipment checklist.</p>`:''}</div></div><div class="details-grid">${block(ability?'Mechanics':'Properties',facts(info))}${Object.keys(stats(r)).length?block(lore?'Combat properties':'Stats',facts(stats(r),true)):''}${d.class_passive?block('Class passive',facts(d.class_passive)):''}${d.requirements?block('Requirements',facts(d.requirements)):''}${d.params&&!ability?block('Effects',facts(d.params)):''}${d.level_scaling?block('Per rank',facts(d.level_scaling)):''}${d.resistances&&Object.keys(d.resistances).length?block('Resistances',facts(d.resistances)):''}</div>${r.progression?block('Along the descent',`<p>Authored position ${esc(r.progression.ordinal)} of ${catalog.dungeon_sequence?.length||22}.</p><nav class="descent-links" aria-label="Dungeon sequence">${r.progression.previous_id?`<span>Previous ${referenceLink(r.progression.previous_id)}</span>`:''}${r.progression.next_id?`<span>Next ${referenceLink(r.progression.next_id)}</span>`:''}</nav>`):''}${ability?block('How to read this ability','<p>Coefficients describe attack inputs, not final damage. Logical ticks are 0.5 seconds; meter fills depend on enemy speed.</p><a href="#mechanics">Read the combat rules &rarr;</a>'):''}${r.mechanics?block('Source-checked operation',`<p>${esc(r.mechanics.description)}</p><p class="eligibility-note">${esc(r.mechanics.limitations)}</p><a class="text-link" href="#crafting">Compare currency operations →</a>`):''}${mapArt?`<section class="encounter-panel"><img src="${esc(mapArt.url)}" alt="${esc(r.name)} in the dungeon"><div><h3>Within the dungeon</h3><p>The game's map artwork. Find this creature in the linked habitats below.</p></div></section>`:''}${links}<details class="detail-source"><summary>Source & snapshot</summary><p>${esc(r.source)} · ${esc(r.id)}</p><p>${esc(r.provenance?.text_kind==='source_contract_editorial'?'Mechanics checked against the recorded runtime source.':'Authored game data.')} Development snapshot ${esc(catalog.snapshot?.id?.slice(0,12)||'unversioned')}.</p><p>Source SHA-256: ${esc(r.provenance?.sha256||catalog.sources[r.source]||'unavailable')}</p><pre>${esc(JSON.stringify(d,null,2))}</pre></details>`;
  $('detail-body').querySelectorAll('.link-filter').forEach(input=>input.oninput=()=>input.closest('section').querySelectorAll('.reference-list a').forEach(a=>a.hidden=!a.textContent.toLowerCase().includes(input.value.toLowerCase())));document.title=`${r.name} — No Name Below`;if(!$('detail').open){returnFocus=document.activeElement;$('detail').showModal();}$('detail').scrollTop=0;
}
function chapterShell(key,description){current=key;$('library').hidden=false;$('showcase').hidden=true;$('planner').hidden=true;document.querySelector('.intro').hidden=true;document.body.classList.remove('clean');stopScroll();$('collection-tools').hidden=true;$('cards').hidden=true;$('more').hidden=true;$('chapter').hidden=false;$('section-title').textContent=chapters[key][0];$('section-kicker').textContent=chapters[key][1];$('section-description').textContent=description;$('section-art').innerHTML='';markCollection(key);document.title=`${chapters[key][0]} — No Name Below`;}
function showChapter(key){
  const crafting=key==='crafting';chapterShell(key,crafting?catalog.crafting.description:'The rules behind equipment and talent choices, checked against this development snapshot.');
  if(crafting){$('section-art').innerHTML=['chaos_orb','divine_orb'].map(id=>`<img src="${esc(primary(byId.get(id)))}" alt="">`).join('');$('chapter').innerHTML=`<p class="guide-lead">Start with a base. Follow its compatible affixes. Choose the currency that changes what you need.</p><div class="craft-links"><a href="#items">Find equipment →</a><a href="#affixes">Inspect modifiers →</a><a href="#orbs">All currency →</a></div>${catalog.crafting.operations.map(op=>`<section class="craft-action"><img src="${esc(primary(byId.get(op.id)))}" alt="" loading="lazy"><div><p class="eyebrow">${op.target==='talent'?'TALENT REFUNDS':op.target_rarity?title(op.target_rarity)+' EQUIPMENT':'EQUIPMENT'}</p><h3>${referenceLink(op.id)}</h3><p>${esc(op.description)}</p><p class="eligibility-note">${esc(op.limitations)}</p></div></section>`).join('')}<aside class="chapter-note"><strong>Recipe availability</strong><p>${esc(catalog.crafting.recipes.description)}</p></aside>`;}
  else $('chapter').innerHTML=`<div class="guide-grid">${catalog.mechanics.filter(m=>m.audience!=='site_help'&&m.id!=='planner_scope').map(m=>{const target=m.id.startsWith('talent')?'planner':m.id==='enemy_abilities'?'enemy_skills':['enhancing','reforging'].includes(m.id)?'crafting':'affixes';return `<section class="guide-block" id="mechanic-${esc(m.id)}"><p class="eyebrow">SOURCE-CHECKED GAME RULES</p><h3>${esc(m.title)}</h3><p>${esc(m.description)}</p>${mechanicsFacts(m)}<p><a href="#${target}">${target==='planner'?'Open the Talent Atlas':target==='enemy_skills'?'Study enemy abilities':target==='crafting'?'Explore crafting':'Explore affixes'} &rarr;</a></p>${m.sources?.length?`<details class="mechanics-source"><summary>Recorded sources</summary>${m.sources.map(source=>`<p>${esc(source.source)}<br><code>${esc(source.sha256)}</code></p>`).join('')}</details>`:''}</section>`;}).join('')}</div><aside class="chapter-note">Development reference &middot; source snapshot ${esc(catalog.snapshot.id.slice(0,12))}. Reviewed source contracts, rather than native execution. These rules are tied to the recorded sources; they are not a released build number.</aside>`;
}
function showSearch(hash){const query=new URLSearchParams(hash.split('?')[1]||'').get('q')||'';$('global-query').value=query;chapterShell('search',query?`Results for “${query}” across all game entities.`:'Search a name, property or effect across the archive.');const q=query.trim().toLowerCase(),rows=q?catalog.records.filter(r=>r.search.includes(q)).sort((a,b)=>(b.name.toLowerCase()===q)-(a.name.toLowerCase()===q)||a.name.localeCompare(b.name)):[];$('chapter').innerHTML=`<p class="aside-note">${rows.length.toLocaleString()} matching entries${rows.length>100?' · showing the first 100; refine your search for more':''}</p><div class="search-results">${rows.slice(0,100).map(r=>`<a class="search-result" href="#entry/${encodeURIComponent(r.id)}">${primary(r)?`<img src="${esc(primary(r))}" alt="" loading="lazy">`:''}<div><small>${esc(categories[r.category][0])}${ultimateLabel(r)?' / '+esc(ultimateLabel(r)):''}${r.tier?' · Tier '+roman[r.tier]:''}</small><h3>${esc(r.name)}</h3><p>${esc(r.description)}</p></div></a>`).join('')||'<p class="empty"><strong>No entries found.</strong>Try a shorter name, a stat, or a collection from the menu.</p>'}</div>`;}
function renderGallery(){const filter=$('gallery-kind').value,rows=catalog.records.filter(r=>r.category==='items'&&r.data.slot&&r.tier&&primary(r)&&(!filter||kind(r)===filter));$('tier-gallery').innerHTML=roman.slice(1).map((name,i)=>{const items=rows.filter(r=>r.tier===i+1).sort((a,b)=>kind(a).localeCompare(kind(b))||a.name.localeCompare(b.name));const label=items.find(r=>r.data.tier_label)?.data.tier_label||`Tier ${name}`;return `<section class="tier-section" id="gallery-tier-${i+1}"><div class="tier-heading"><span class="roman">${name}</span><div><p class="eyebrow">EQUIPMENT / TIER ${name}</p><h2>${esc(label)}</h2><p>${items.length} pieces in this collection</p></div></div><div class="gallery-grid">${items.length?items.map(r=>card(r,true)).join(''):'<p class="empty">No equipment of this type at this tier.</p>'}</div></section>`;}).join('');}
function stopScroll(){cancelAnimationFrame(scrollFrame);scrollFrame=0;lastScrollTime=0;$('scroll-toggle').textContent='Start slow scroll';}
function stepScroll(time){if(lastScrollTime)scrollPosition+=(time-lastScrollTime)*.026;lastScrollTime=time;window.scrollTo({top:scrollPosition,behavior:'instant'});if(scrollPosition>=document.documentElement.scrollHeight-innerHeight){stopScroll();return;}scrollFrame=requestAnimationFrame(stepScroll);}
function route(){
  $('error').hidden=true;let hash;try{hash=location.hash.slice(1);decodeURIComponent(hash);}catch{$('error').textContent='This link could not be read. Choose a collection to continue.';$('error').hidden=false;return;}
  if(hash.startsWith('entry/')){const id=decodeURIComponent(hash.slice(6));if(byId.has(id))window.libraryPlanner.deactivate();if(!activeRoute&&byId.has(id)){activeRoute=byId.get(id).category;detailReturn=activeRoute;showCategory(activeRoute);}if(!$('planner').hidden)detailReturn='planner?node='+window.libraryPlanner.getState().selected;stopScroll();showEntry(id);return;}
  const previous=activeRoute,returning=$('detail').open&&hash===detailReturn;activeRoute=hash.split('?')[0]||'items';detailReturn=hash||'items';if($('detail').open){$('detail').close();if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});}
  // Retain the exact search/filter context and focused result when closing a detail.
  if(returning&&previous===activeRoute&&activeRoute!=='planner')return;
  window.libraryPlanner.deactivate();
  document.querySelectorAll('.masthead nav a').forEach(a=>{const active=a.hash==='#'+activeRoute;a.classList.toggle('active',active);active?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current');});$('main-nav').classList.remove('is-open');$('nav-toggle').setAttribute('aria-expanded','false');$('planner').hidden=activeRoute!=='planner';
  if(activeRoute==='planner'){$('library').hidden=true;$('showcase').hidden=true;document.body.classList.remove('clean');stopScroll();document.title='Talent Atlas — No Name Below';window.libraryPlanner.open(hash);}
  else if(activeRoute==='showcase'){$('library').hidden=true;$('showcase').hidden=false;document.title='Equipment gallery — No Name Below';renderGallery();}
  else if(activeRoute==='search')showSearch(hash);else if(activeRoute==='crafting'||activeRoute==='mechanics')showChapter(activeRoute);else {showCategory(activeRoute);if(activeRoute==='sets'){$('error').textContent='The legacy item-set collection has been retired. Browse equipment and compatible affixes in the current archive.';$('error').hidden=false;}}
  placeOrb(activeRoute);
  if(previous&&previous!==activeRoute){window.scrollTo({top:0,behavior:'instant'});window.NNBOrbMotion?.route(activeRoute);}
  enterScene();
}
// Route shells remain truthful and navigable while the reference payload loads.
let referencePending=true;
const pendingControls=[...document.querySelectorAll('.planner-toolbar button,.planner-toolbar select,.planner-picker input,.planner-picker select,#filters input,#filters select,#filters button,#collection-select')];
pendingControls.forEach(control=>control.disabled=true);
function pendingShell(){
  if(!referencePending)return;
  const key=location.hash.slice(1).split('?')[0]||'items',plannerRoute=key==='planner';
  placeOrb(key);
  $('planner').hidden=!plannerRoute;$('library').hidden=plannerRoute;
  $('planner').setAttribute('aria-busy','true');$('library').setAttribute('aria-busy','true');
  document.querySelector('.intro').hidden=key!=='items';
  $('plan-count').textContent='Loading reference…';$('result-count').textContent='Loading game reference…';
  $('atlas-stage').dataset.referenceLoading=String(plannerRoute);
  $('atlas-status').dataset.loading='true';$('atlas-status').textContent='Loading game reference. Your build controls will be ready shortly.';
  $('atlas-hint').textContent=innerWidth<600?'Drag to pan · Pinch or + / − to zoom · Tap a talent':'Drag to explore · Scroll to zoom · Select to inspect';
  if(categories[key]){$('section-title').textContent=categories[key][0];$('section-kicker').textContent=categories[key][1];}
  else if(chapters[key]){$('section-title').textContent=chapters[key][0];$('section-kicker').textContent=chapters[key][1];}
}
$('nav-toggle').onclick=()=>{const open=$('main-nav').classList.toggle('is-open');$('nav-toggle').setAttribute('aria-expanded',String(open));};
$('global-search').onsubmit=e=>{e.preventDefault();location.hash='search?'+new URLSearchParams({q:$('global-query').value.trim()});};
window.addEventListener('hashchange',pendingShell);pendingShell();
function referenceReady(){
  referencePending=false;window.removeEventListener('hashchange',pendingShell);pendingControls.forEach(control=>control.disabled=false);
  $('planner').removeAttribute('aria-busy');$('library').removeAttribute('aria-busy');delete $('atlas-stage').dataset.referenceLoading;
}


async function init(){
  document.querySelector('.skip').onclick=e=>{e.preventDefault();if(!$('planner').hidden)$('plan-search').focus();else if(!$('showcase').hidden)$('gallery-kind').focus();else $('content').focus();};
  const response=await fetch('data.json');if(!response.ok)throw Error('Could not load the game library.');catalog=await response.json();if(catalog.schema_version!==2)throw Error('The archive data version is not supported.');catalog.records.filter(r=>r.category==='sets').forEach(r=>retiredSetIds.add(r.id));catalog.records=catalog.records.filter(r=>r.category!=='sets');byId=new Map(catalog.records.map(r=>[r.id,r]));catalog.records.forEach(r=>r.search=(r.name+' '+r.description+' '+JSON.stringify(r.data)+' '+r.links.map(l=>byId.get(l.id)?.name||'').join(' ')).toLowerCase());plannerHelp();if(catalog.branding?.studio_logo?.url)$('studio-logo').src=catalog.branding.studio_logo.url;referenceReady();window.libraryPlanner=setupPlanner(catalog,byId,statText,esc);
  $('total').textContent=catalog.records.length.toLocaleString()+' linked entries';$('snapshot-label').textContent='Development · '+catalog.snapshot.id.slice(0,12);const collections={...categories,crafting:chapters.crafting,mechanics:chapters.mechanics};$('categories').innerHTML=Object.entries(collections).map(([key,[label]])=>`<a href="#${key}" data-category="${key}"><span>${esc(label)}</span>${catalog.counts[key]?`<small>${catalog.counts[key]}</small>`:''}</a>`).join('');$('collection-select').innerHTML=Object.entries(collections).map(([key,[label]])=>`<option value="${key}">${esc(label)}</option>`).join('')+'<option value="search">Search results</option>';$('collection-select').onchange=()=>location.hash=$('collection-select').value;
  $('global-search').onsubmit=e=>{e.preventDefault();location.hash='search?'+new URLSearchParams({q:$('global-query').value.trim()});};$('nav-toggle').onclick=()=>{const open=$('main-nav').classList.toggle('is-open');$('nav-toggle').setAttribute('aria-expanded',String(open));};filtersForCategory();$('gallery-kind').innerHTML+=[...new Set(catalog.records.filter(r=>r.category==='items'&&r.data.slot).map(kind))].sort().map(k=>`<option value="${esc(k)}">${esc(title(k))}</option>`).join('');
  const query=new URLSearchParams(location.search);if([...$('gallery-kind').options].some(o=>o.value===query.get('galleryType')))$('gallery-kind').value=query.get('galleryType');if(query.get('clean')==='1'&&location.hash==='#showcase')document.body.classList.add('clean');$('filters').addEventListener('submit',e=>e.preventDefault());['search','tier','kind','skill-category'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',()=>{limit=48;renderCards();}));$('filters').addEventListener('reset',()=>setTimeout(()=>{limit=48;renderCards();},0));$('more').onclick=()=>{limit+=48;renderCards();};$('close-detail').onclick=()=>location.hash=detailReturn;$('detail').addEventListener('cancel',e=>{e.preventDefault();$('close-detail').click();});
  $('gallery-kind').onchange=()=>{stopScroll();renderGallery();};$('scroll-toggle').onclick=()=>{if(scrollFrame){stopScroll();return;}scrollPosition=scrollY;$('scroll-toggle').textContent='Pause scroll';scrollFrame=requestAnimationFrame(stepScroll);};$('clean-toggle').onclick=()=>{document.body.classList.toggle('clean');$('clean-toggle').textContent=document.body.classList.contains('clean')?'Restore controls':'Clean presentation';};document.addEventListener('keydown',e=>{if(e.key==='Escape'){stopScroll();document.body.classList.remove('clean');$('clean-toggle').textContent='Clean presentation';$('main-nav').classList.remove('is-open');$('nav-toggle').setAttribute('aria-expanded','false');}});window.addEventListener('wheel',stopScroll,{passive:true});window.addEventListener('touchstart',stopScroll,{passive:true});
  // Decoration cannot gate navigation, even if its optional module fails to initialize.
  initOrb();
  window.addEventListener('hashchange',route);route();
}
init().catch(error=>{$('error').textContent=error.message;$('error').hidden=false;if(referencePending)$('atlas-status').textContent='The game reference could not load. Reload this page to retry.';});
