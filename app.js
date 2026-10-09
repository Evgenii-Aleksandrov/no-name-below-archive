'use strict';
const t=(text,values)=>window.NNBI18n.t(text,values);
const $=id=>document.getElementById(id);
const rawEsc=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const esc=text=>rawEsc(t(text??''));
const title=text=>t(String(text).replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase()));
// Translate fixed text in generated markup at its render boundary, never observe the live DOM.
const html=(markup,...values)=>String(Array.isArray(markup)?markup.reduce((out,part,i)=>out+part+(i<values.length?values[i]:''),''):markup).replace(/>([^<>]+)</g,(match,source)=>{const core=source.trim(),translated=t(core);return core&&translated!==core?'>'+source.replace(core,esc(translated))+'<':match;}).replace(/(placeholder|aria-label|data-label)="([^"]+)"/g,(match,key,value)=>t(value)===value?match:`${key}="${esc(t(value))}"`);
const roman=['','I','II','III','IV','V','VI','VII','VIII'];
const categories={items:['Equipment & items','THE ARMORY'],orbs:['Currency & orbs','THE CRAFT'],affixes:['Affixes','PREFIXES & SUFFIXES'],skills:['Skills','THE ARTS OF COMBAT'],subclasses:['Subclasses','CHOOSE YOUR PATH'],classes:['Classes','FOUR BEGINNINGS'],talents:['Talents','THE TALENT TREE'],enemies:['Enemies','THE BESTIARY'],dungeons:['Dungeons','THE DESCENT'],enemy_skills:['Enemy abilities','KNOW YOUR ENEMY'],pools:['Affix pools','ITEM CONNECTIONS']};
const chapters={crafting:['Crafting','THE WORK OF CURRENCY'],mechanics:['Mechanics','UNDERSTAND THE DESCENT'],search:['Search the archive','EVERY COLLECTION']};
const descriptions={items:'Eight tiers of equipment. Find your base, then explore its compatible modifiers.',enemies:'Know their strengths, exploit their weaknesses, and find them in the depths.',dungeons:'Follow the descent. Explore each place, its creatures, and its bosses.',classes:'Four beginnings. Compare their starting attributes, signature passives, and specializations.',subclasses:'Choose a specialization. Explore its bonuses, abilities, and Ultimate.',skills:'Compare costs, targeting, and effects. Find the skills that fit your path.',talents:'Explore connected choices in the Talent Atlas, then take them into your build.',orbs:'From the first modifier to the final refinement. Discover what each currency can change.',affixes:'Compare prefixes and suffixes, their ranges, and compatible equipment.',pools:'Find the modifiers available to each equipment type.',enemy_skills:'Study each creature’s attacks, effects, and timing.'};
let catalog,byId,current='items',detailReturn='items',limit=48,activeRoute='',returnFocus=null;
// Only recognize the previous edition's exact fragments; no legacy definitions.
const retiredSetIds=new Set(['set_apprentice_blades','set_arcane_ascendancy','set_gravefrost_vigil','set_iron_bulwark','set_mystic_trappings','set_stormcaller','set_training_guardian','set_void_walker','set_voidweave']);
const readableLabels={damage_mult:'Damage multiplier',is_ultimate:'Ultimate',is_class_default:'Class default',hp:'HP',xp_reward:'XP reward',crit_chance:'Critical chance',crit_multiplier:'Critical multiplier',crit_damage_pct:'Critical multiplier',crit_multiplier_flat:'Critical multiplier',crit_chance_flat:'Critical chance',crit_chance_pct:'Critical chance',phys_damage:'Physical damage',phys_damage_flat:'Physical damage',phys_damage_pct:'Physical damage',magic_damage:'Magic damage',resource_max:'Maximum resource',resource_starting:'Starting resource',resource_regen:'Resource regeneration',str:'Strength',dex:'Dexterity',int:'Intelligence'};
const labelOf=key=>/^tier_\d+$/.test(key)?t('Tier {tier}',{tier:displayNumber(Number(key.slice(5)))}):t(readableLabels[key]||title(key));
const displayNumber=n=>window.NNBI18n.number(n);
const displayRange=(v,format)=>{const shown=v.map(format);return v.length===2&&typeof v[0]==='number'&&shown[0]===shown[1]?shown[0]:shown.join(' – ');};
const mechanicValueLabels={single_attack_burst:'Single-target attack burst',aoe_damage:'Area damage',all_enemies:'All enemies',aoe:'Area of effect',single_enemy:'Single enemy'};
const val=v=>Array.isArray(v)?displayRange(v,val):typeof v==='object'&&v!==null?Object.entries(v).map(([k,x])=>`${labelOf(k)}: ${val(x)}`).join(' · '):typeof v==='number'?displayNumber(v):typeof v==='boolean'?(t(v?'Yes':'No')):typeof v==='string'?(t(mechanicValueLabels[v])||(/^[a-z][a-z_]+$/.test(v)?title(v):v)):String(v??'');
const kind=r=>r.data.item_type||r.data.affix_type||r.data.class_id||r.data.kind||r.data.damage_type||'';
const ultimateLabel=r=>r.data.is_ultimate===true?(t(r.data.is_class_default===true?'Class Ultimate':'Subclass Ultimate')):'';
const primary=r=>r?.art?.primary?.url||r?.image||'';
const referenceLink=id=>{const r=byId.get(id);return r?html`<a href="#entry/${encodeURIComponent(id)}">${esc(r.name)}${r.tier?` <small>· T${r.tier}</small>`:''}</a>`:'';};
function stats(r){const d=r.data,raw=d.specialization_bonuses||d.stat_bonuses||d.passive_effects||d.base_stats||Object.fromEntries(Object.entries(d).filter(([k])=>k.startsWith('base_')));return Array.isArray(raw)?Object.fromEntries(raw.filter(s=>s?.type&&s.value!==undefined).map(s=>[s.type,s.value])):Object.fromEntries(Object.entries(raw).map(([k,v])=>v&&typeof v==='object'&&!Array.isArray(v)&&v.value!==undefined?[v.type||k,v.value]:[k,v]));}
function statText(key,value,talent=false){const display=catalog.stat_display[key],label=t((talent&&catalog.talent_labels?.[key])||readableLabels[key]||display?.label||labelOf(key.replace(/^base_/,'')));const suffix=t(['crit_chance_flat','crit_multiplier_flat'].includes(key)?' percentage points':display?.suffix||'');const format=x=>typeof x==='number'?`${displayNumber(x*(display?.scale||1))}${suffix}`:val(x);return [label,Array.isArray(value)?displayRange(value,format):format(value)];}
function facts(data,formattedStats=false,talent=false){const rows=Object.entries(data||{}).filter(([,v])=>v!==undefined&&v!==null&&v!==''&&!(typeof v==='object'&&!Object.keys(v).length));return rows.length?html`<dl class="facts metric-grid">${rows.map(([k,v])=>{const [label,value]=formattedStats?statText(k,v,talent):[labelOf(k),val(v)];return html`<div class="metric"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;}).join('')}</dl>`:'';}
function bonusText(key,value){const [label,shown]=statText(key,value);return `${value>0?'+':''}${key==='block_chance_pct'?displayNumber(value)+t(' percentage points'):shown} ${label.toLowerCase()}`;}
function playerDescription(r,detail=false){
  if(r.description)return r.description;
  const d=r.data;
  if(r.category==='classes'){const base=stats(r);return t('{class} uses {resource} and {damage} attacks.',{class:title(d.class_id),resource:val(base.resource_type),damage:val(base.attack_damage_type)})+(detail?'':' '+d.class_passive.description);}
  if(r.category==='subclasses'){const focus=Object.keys(d.specialization_bonuses||{}).map(key=>statText(key,0)[0].toLowerCase());return t('{class} specialization focused on {focus}.',{class:title(d.class_id),focus:focus.length>1?focus.slice(0,-1).join(', ')+t(' and ')+focus.at(-1):focus[0]});}
  if(r.category==='pools')return t('Modifiers for {types}. Includes {prefixes} prefixes and {suffixes} suffixes{tier}.',{types:(d.item_types||[]).map(val).join(', '),prefixes:displayNumber((d.prefix_ids||[]).length),suffixes:displayNumber((d.suffix_ids||[]).length),tier:d.max_tier?t(', up to tier {tier}',{tier:displayNumber(d.max_tier)}):''});
  if(r.category==='skills'&&d.is_class_default)return `${val(d.effect)}${typeof d.damage_mult==='number'?t('. Uses {value}× attack input before defenses',{value:displayNumber(d.damage_mult)}):''}.`;
  return '';
}
function referenceCard(id){const r=byId.get(id);if(!r)return '';const d=r.data,metrics=[];
  if(r.tier)metrics.push(t('Tier {tier}',{tier:roman[r.tier]||displayNumber(r.tier)}));
  if(['skills','enemy_skills'].includes(r.category)){if(d.damage_type)metrics.push(title(d.damage_type));if(d.resource_cost)metrics.push(`${d.resource_cost.amount} ${title(d.resource_cost.type)}`);if(typeof d.cooldown_seconds==='number')metrics.push(t('{seconds} s cooldown',{seconds:displayNumber(d.cooldown_seconds)}));else if(typeof d.cooldown_ticks==='number')metrics.push(t('{time} cooldown',{time:logicalTime(d.cooldown_ticks)}));if(d.targeting)metrics.push(val(d.targeting));if(typeof d.params?.damage_multiplier==='number')metrics.push(t('{value}× damage input',{value:displayNumber(d.params.damage_multiplier)}));}
  else if(r.category==='subclasses')metrics.push(...Object.entries(d.specialization_bonuses||{}).map(([k,v])=>bonusText(k,v)));
  else if(r.category==='enemies'){if(stats(r).hp)metrics.push(`${val(stats(r).hp)} ${t('HP')}`);if(d.attack_damage_type)metrics.push(title(d.attack_damage_type));}
  else if(r.category==='classes'){metrics.push(`${displayNumber(stats(r).hp)} ${t('HP')}`,title(stats(r).resource_type));}
  else if(r.category==='dungeons'){metrics.push(t('Tiers {min}–{max}',{min:displayNumber(d.tier_min),max:displayNumber(d.tier_max)}));if(d.layers)metrics.push(t('{count} layers',{count:displayNumber(d.layers)}));}
  else metrics.push(...Object.entries(stats(r)).slice(0,2).map(([k,v])=>statText(k,v).join(' ')));
  return html`<a class="reference-card${primary(r)?'':' text-reference'}" href="#entry/${encodeURIComponent(id)}">${primary(r)?html`<img class="link-art" src="${rawEsc(primary(r))}" alt="" loading="lazy" decoding="async">`:''}<div class="link-copy"><small>${esc(ultimateLabel(r)||categories[r.category]?.[0]||'')}</small><h4>${esc(r.name)}</h4>${playerDescription(r)?html`<p>${esc(playerDescription(r))}</p>`:''}${metrics.length?html`<div class="link-metrics">${metrics.map(x=>html`<span>${esc(x)}</span>`).join('')}</div>`:''}</div></a>`;
}
function art(r){const image=primary(r);return image?html`<div class="card-art">${r.tier?html`<span class="tier-chip">${t('TIER')} ${roman[r.tier]||esc(r.tier)}</span>`:''}<img src="${rawEsc(image)}" alt="" loading="lazy" decoding="async"></div>`:'';}
const logicalTime=ticks=>t('{seconds} s ({ticks} logical ticks)',{seconds:displayNumber(ticks*.5),ticks:displayNumber(ticks)});
function abilityFacts(d){
  const out={};
  if(d.effect_type||d.effect)out.effect=d.effect_type||d.effect;
  for(const key of ['damage_type','targeting','target_mode'])if(d[key]!==undefined)out[key]=d[key];
  if(typeof d.damage_mult==='number')out.damage_multiplier=`${displayNumber(d.damage_mult)}×`;
  if(d.resource_cost)out.resource_cost=`${d.resource_cost.amount} ${title(d.resource_cost.type)}`;
  for(const key of ['cooldown_ticks','initial_cooldown_ticks'])if(typeof d[key]==='number')out[key.replace('_ticks','')]=logicalTime(d[key]);
  if(typeof d.telegraph_ticks==='number')out.telegraph=d.telegraph_clock==='logical'?logicalTime(d.telegraph_ticks):t('{count} meter fills (speed-dependent)',{count:displayNumber(d.telegraph_ticks)});
  for(const [key,value] of Object.entries(d.params||{}))out[key]=key==='duration_ticks'&&typeof value==='number'?logicalTime(value):key.endsWith('_multiplier')&&typeof value==='number'?`${displayNumber(value)}\u00d7`:value;
  if(d.applies_dot)out.damage_over_time={...d.applies_dot,...(typeof d.applies_dot.ticks==='number'?{duration:logicalTime(d.applies_dot.ticks)}:{})};
  if(d.tags?.length)out.tags=d.tags;
  return out;
}
function skillLevelValues(d,level){
  const values={...(d.params||{})};
  if(level>1)for(const [key,step] of Object.entries(d.level_scaling||{}))if(typeof step==='number')values[key]=(Number(values[key])||0)+step*(level-1);
  return values;
}
function skillEffectFacts(values){
  const out={},ratios=new Set(['splash_pct','aoe_splash_pct','dot_damage_pct','secondary_dot_damage_pct','heal_ratio','arc_split_damage_ratio','splash_ratio','chip_damage_pct','self_heal_pct_max_hp']);
  for(const [key,value] of Object.entries(values)){
    if(['unlock_kind','apply_self_buff','apply_debuff','apply_dot','buff_stat','debuff_stat'].includes(key))continue;
    const paired=key==='buff_value'?values.buff_stat:key==='debuff_value'?values.debuff_stat:null;
    let label=paired?statText(paired,value)[0]:labelOf(key.replace(/_pct(?:_per_level)?$/,''));
    let shown=typeof value==='number'&&key.endsWith('_ticks')?logicalTime(value):typeof value==='number'&&key.endsWith('_multiplier')?`${displayNumber(value)}×`:typeof value==='number'&&ratios.has(key)?`${displayNumber(value*100)}%`:typeof value==='number'&&key.includes('_pct')?`${displayNumber(value)}%`:paired?statText(paired,value)[1]:['crit_chance_flat','crit_multiplier_flat'].includes(key)?statText(key,value)[1]:val(value);
    if(paired&&typeof value==='number'&&!catalog.stat_display[paired]&&paired.endsWith('_pct'))shown=`${displayNumber(value)}%`;
    out[label]=shown;
  }
  return facts(out);
}
function skillProgression(r){
  const d=r.data;
  if(d.is_class_default)return block('Skill levels','<p>This class Ultimate has a fixed effect.</p>');
  const max=Number(d.max_level);if(!Number.isInteger(max)||max<1)return '';
  const kindLabels={self_buff_extension:'Self buff',dot_rider:'Damage over time',debuff_on_hit:'On-hit debuff',aoe_or_multi_target:'Area and targets',lifesteal_on_hit:'Life steal',cooldown_reset:'Cooldown',splash:'Splash damage',mark_charge:'Mark effects'};
  const rows=Array.from({length:max},(_,i)=>{
    const level=i+1,values=skillLevelValues(d,level),scaling=Object.keys(d.level_scaling||{});
    const shown=level===1?values:Object.fromEntries(scaling.filter(key=>values[key]!==undefined).map(key=>[key,values[key]]));
    for(const prefix of ['buff','debuff'])if(Object.hasOwn(shown,`${prefix}_value`)&&values[`${prefix}_stat`])shown[`${prefix}_stat`]=values[`${prefix}_stat`];
    const raw=d.rank_unlocks?.[String(level)],unlocks=raw?(Array.isArray(raw)?raw:[raw]):[];
    const bonuses=unlocks.map(feature=>html`<li><strong>${esc(kindLabels[feature.unlock_kind]||'Additional effect')}</strong>${skillEffectFacts(feature)}</li>`).join('');
    return html`<tr data-level="${level}"><th scope="row">${level}</th><td data-label="Effect values">${skillEffectFacts(shown)||'<p>Base effects unchanged.</p>'}</td><td data-label="Bonuses gained">${bonuses?html`<ul class="skill-unlocks">${bonuses}</ul>`:level===1?'<p>Base effects.</p>':'<p>Earlier bonuses retained.</p>'}</td></tr>`;
  }).join('');
  return block('Skill levels',html`<p class="skill-level-note">Values are totals at each level. Earlier bonuses remain active; other base effects stay unchanged.</p><table class="skill-levels"><thead><tr><th scope="col">Level</th><th scope="col">Effect values</th><th scope="col">Bonuses gained</th></tr></thead><tbody>${rows}</tbody></table>`);
}
function abilityPreview(r){const d=r.data,p=d.params||{},parts=[];
  if(d.effect_type||d.effect)parts.push(val(d.effect_type||d.effect));if(d.damage_type)parts.push(title(d.damage_type));
  if(typeof (p.damage_multiplier??d.damage_mult)==='number')parts.push(t('{value}× attack input',{value:displayNumber(p.damage_multiplier??d.damage_mult)}));
  if(d.resource_cost)parts.push(`${d.resource_cost.amount} ${title(d.resource_cost.type)}`);if(typeof d.cooldown_ticks==='number')parts.push(t('Cooldown {time}',{time:logicalTime(d.cooldown_ticks)}));
  if(d.targeting)parts.push(Object.hasOwn(mechanicValueLabels,d.targeting)?val(d.targeting):title(d.targeting));if(typeof p.duration_ticks==='number')parts.push(t('Duration {time}',{time:logicalTime(p.duration_ticks)}));
  for(const [key,value] of Object.entries(p))if(!['damage_multiplier','duration_ticks'].includes(key))parts.push(`${labelOf(key)}: ${typeof value==='number'&&key.endsWith('_multiplier')?displayNumber(value)+'\u00d7':val(value)}`);
  if(d.applies_dot)parts.push(`${t('Damage over time')}: ${val(d.applies_dot)}`);
  return parts.map(esc).join('<br>');
}
function mechanicsFacts(m){
  if(!m.facts)return '';
  if(Array.isArray(m.facts))return html`<div class="table-wrap"><table><thead><tr><th>Rarity</th><th>Prefix cap</th><th>Suffix cap</th><th>Rolled total</th></tr></thead><tbody>${m.facts.map(f=>html`<tr><td>${esc(title(f.rarity))}</td><td>${esc(f.max_prefixes)}</td><td>${esc(f.max_suffixes)}</td><td>${esc(f.guaranteed_total??0)}</td></tr>`).join('')}</tbody></table></div>`;
  const f=m.facts;
  if(m.id==='enhancing')return facts({maximum_level:f.effective_max_level,base_stats_per_level:`+${displayNumber(f.base_stat_pct*100)}%`})+block('Starting gold cost by rarity',facts(f.base_cost_per_rarity))+block('Price growth per enhancement',facts(Object.fromEntries(Object.entries(f.growth_factor_per_level).map(([k,v])=>[k,`${displayNumber(v)}×`]))));
  if(m.id==='reforging')return facts({price_growth_per_locked_affix:`${displayNumber(f.cost_growth_factor)}×`,engraved_forge_discount:`${displayNumber((1-f.engraved_modifier.multiplier)*100)}%`})+block('Base currency cost by equipment tier',facts(Object.fromEntries(Object.entries(f.costs_by_tier).map(([k,v])=>['tier_'+k,val(v)]))));
  if(m.id==='talent_allocation')return block('Talent points to allocate',facts(f.cost_by_kind))+block('Orbs of Regret to refund',facts(f.refund.orb_cost_by_kind));
  if(m.id==='enemy_abilities')return facts({logical_tick:`${displayNumber(f.timing.logical_tick_seconds)} s`,telegraph:'Logical ticks for the marked boss abilities; otherwise speed-dependent action-meter fills.'});
  return '';
}
function plannerHelp(){const entries=catalog.site_help||catalog.mechanics.filter(m=>m.id==='planner_scope');$('planner-help').innerHTML=entries.map(m=>html`<h3>${esc(m.title)}</h3><p>${esc(m.description)}</p>`).join('');}
const orbBreakpoint=matchMedia('(max-width:600px)');
function placeOrb(route){const target=route==='planner'?document.querySelector('.planner-heading'):document.querySelector('.section-title');target?.append($('orb-section-crest'));}
function initOrb(route=activeRoute||location.hash.slice(1).split('?')[0]||'home'){
  placeOrb(route);const mobile=orbBreakpoint.matches;
  try{window.NNBOrbMotion?.init({routeHost:'#orb-route-host',scrollHost:'#orb-scroll-host',contentHost:()=>activeRoute==='home'?'#home':activeRoute==='planner'?'#planner':'#content',initialRoute:route,routeOrder:['home',...Object.keys({...categories,...chapters})],presentation:'section',size:mobile?48:52,routeTravel:mobile?64:80,scrollTravel:mobile?48:64,scrollRange:320,duration:940,routeTextures:{items:primary(byId.get('chaos_orb')),planner:primary(byId.get('orb_of_regret')),talents:primary(byId.get('orb_of_regret')),crafting:primary(byId.get('orb_of_transmutation'))}});}catch(error){console.warn('Orb decoration unavailable:',error.message);}
}
orbBreakpoint.addEventListener('change',()=>{if(catalog)initOrb();});
window.addEventListener('pagehide',()=>window.NNBOrbMotion?.destroy());
window.addEventListener('pageshow',e=>{if(e.persisted&&catalog)initOrb();});
function card(r,gallery=false){const preview=Object.entries(stats(r)).filter(([,v])=>typeof v==='number'?v!==0:Array.isArray(v)?v.some(x=>x!==0):true).slice(0,2).map(([k,v])=>r.category==='subclasses'?bonusText(k,v):statText(k,v,r.category==='talents').join(' ')).join(' · '),ability=['skills','enemy_skills'].includes(r.category);return html`<a class="card" href="#entry/${encodeURIComponent(r.id)}" aria-label="${esc(r.name)}${r.tier?', '+t('Tier {tier}',{tier:displayNumber(r.tier)}):''}">${art(r)}<div class="card-body"><div class="card-meta">${esc([ultimateLabel(r),val(kind(r)),val(r.data.slot)].filter(Boolean).join(' / ')||categories[r.category][0])}${r.category==='enemies'&&r.tier?' · '+t('TIER')+' '+roman[r.tier]:''}</div><h3>${esc(r.name)}</h3>${gallery?'':`${playerDescription(r)?html`<p>${esc(playerDescription(r))}</p>`:''}${ability?html`<div class="stat-preview">${abilityPreview(r)}</div>`:preview?html`<div class="stat-preview">${esc(preview)}</div>`:''}`}</div></a>`;}
function eligibleTypes(r){return [...new Set(r.links.filter(l=>l.relation==='Eligible equipment').map(l=>{const d=byId.get(l.id).data;return title(d.weapon_family||d.armor_class||d.item_type);} ))].sort();}
function filtersForCategory(){$('skill-category-filter').hidden=current!=='skills';const rows=catalog.records.filter(r=>r.category===current);$('tier').innerHTML=html('<option value="">All tiers</option>')+[...new Set(rows.map(r=>r.tier).filter(Boolean))].sort((a,b)=>a-b).map(tier=>html`<option value="${tier}">${t('Tier {tier}',{tier:roman[tier]||displayNumber(tier)})}</option>`).join('');$('kind').innerHTML=html('<option value="">All types</option>')+[...new Set(rows.map(kind).filter(Boolean))].sort().map(k=>html`<option value="${rawEsc(k)}">${esc(title(k))}</option>`).join('');}
function renderCards(){
  if(current==='items'){renderGallery();return;}
  const q=$('search').value.trim().toLowerCase(),tier=$('tier').value,type=$('kind').value,skillCategory=$('skill-category').value;
  const rows=catalog.records.filter(r=>r.category===current&&(!tier||String(r.tier)===tier)&&(!type||kind(r)===type)&&(current!=='skills'||!skillCategory||(r.data.is_ultimate===true)===(skillCategory==='ultimate'))&&(!q||r.search.includes(q)));
  if(current==='dungeons')rows.sort((a,b)=>(a.progression?.ordinal??Infinity)-(b.progression?.ordinal??Infinity));
  $('result-count').textContent=t('{count} entries',{count:displayNumber(rows.length)});const textual=current==='affixes';$('cards').className=`cards ${textual?'text-records':''} category-${current}`;
  $('cards').innerHTML=rows.length?(textual?html`<div class="table-wrap"><table><thead><tr><th>Name</th><th>${current==='enemy_skills'?'Mechanics':'Properties'}</th><th>${current==='affixes'?'Eligible equipment':'Description'}</th></tr></thead><tbody>${rows.slice(0,limit).map(r=>html`<tr><td><div class="ability-name">${current==='enemy_skills'&&primary(r)?html`<img src="${rawEsc(primary(r))}" alt="" width="52" height="52" loading="lazy">`:''}${referenceLink(r.id)}</div><small>${esc(title(kind(r)))}${r.tier?' · '+t('Tier {tier}',{tier:roman[r.tier]}):''}</small></td><td>${current==='enemy_skills'?abilityPreview(r):(Object.entries(stats(r)).map(([k,v])=>esc(statText(k,v).join(': '))).join('<br>')||esc(r.description))}</td><td>${current==='affixes'?eligibleTypes(r).map(esc).join(', ')||'No eligible bases':esc(r.description)}${r.availability?.status?html`<p class="card-availability">${esc(title(r.availability.status))}</p>`:''}</td></tr>`).join('')}</tbody></table></div>`:rows.slice(0,limit).map(r=>card(r)).join('')):html('<p class="empty"><strong>No entries match these filters.</strong>Try another name or reset the filters.</p>');
  $('more').hidden=rows.length<=limit;$('more').textContent=t('Show more · {count} remaining',{count:displayNumber(Math.max(0,rows.length-limit))});
}
function markCollection(key){$('collection-select').value=key;document.querySelectorAll('#categories a').forEach(a=>{const active=a.dataset.category===key;a.classList.toggle('active',active);active?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current');});}
function showCategory(category){
  if(!categories[category])category='items';if(category==='items'){showArmory();return;}const changed=category!==current;current=category;$('library').hidden=false;$('showcase').hidden=true;$('chapter').hidden=true;$('cards').hidden=false;$('collection-tools').hidden=false;markCollection(category);
  $('section-title').textContent=categories[category][0];$('section-kicker').textContent=categories[category][1];$('section-description').textContent=descriptions[category]||'';const feature=catalog.records.find(r=>r.category===category&&primary(r));$('section-art').innerHTML=feature?html`<img src="${rawEsc(primary(feature))}" alt="" decoding="async">`:'';
  document.title=`${categories[category][0]} — No Name Below`;if(changed){$('search').value='';filtersForCategory();limit=48;}renderCards();showBestiaryFeature(category);
}
const combatArt=r=>r?.art?.secondary?.find(a=>a.role==='combat_sheet'&&a.sprite);
function combatSprite(r,className=''){
  const art=combatArt(r);if(!art)return '';
  const {columns,rows,idle_frames:frames,idle_fps:fps}=art.sprite;
  return html`<div class="combat-sprite ${className}" role="img" aria-label="${esc(t('{name} in combat',{name:r.name}))}" style="--sheet-width:${columns*100}%;--sheet-height:${rows*100}%;--idle-shift:${-frames/columns*100}%;--idle-frames:${frames};--idle-duration:${frames/(fps||5)}s"><img class="sprite-strip" src="${rawEsc(art.url)}" alt="" decoding="async"></div>`;
}
function enemyStage(r){
  if(!combatArt(r))return '';
  const habitat=r.links.map(l=>byId.get(l.id)).find(x=>x?.category==='dungeons'&&primary(x));
  return html`<div class="enemy-stage"${habitat?` style="background-image:linear-gradient(0deg,#09100ef0,transparent 70%),url('${rawEsc(primary(habitat))}')"`:''}>${combatSprite(r)}${habitat?html`<a class="enemy-stage-caption" href="#entry/${habitat.id}">${esc(habitat.name)} <span aria-hidden="true">↗</span></a>`:''}</div>`;
}
let spriteObserver=null,lastFeaturedId='';
function watchCombatSprites(){
  spriteObserver?.disconnect();
  document.querySelectorAll('.combat-sprite').forEach(n=>n.classList.remove('is-live'));
  if(sceneReduced.matches||document.hidden)return;
  spriteObserver=new IntersectionObserver(entries=>entries.forEach(e=>e.target.classList.toggle('is-live',e.isIntersecting)),{threshold:.1});
  document.querySelectorAll($('detail').open?'#detail .combat-sprite':'#bestiary-feature .combat-sprite').forEach(n=>spriteObserver.observe(n));
}
document.addEventListener('visibilitychange',watchCombatSprites);
function showBestiaryFeature(category){
  const host=$('bestiary-feature');host.hidden=category!=='enemies';if(host.hidden)return;
  const choices=catalog.records.filter(r=>r.category==='dungeons'&&primary(r)).map(habitat=>({habitat,creature:byId.get(habitat.data.boss_id)})).filter(x=>combatArt(x.creature)&&x.creature.description&&x.creature.id!==lastFeaturedId);
  if(!choices.length){host.hidden=true;return;}
  const {creature,habitat}=choices[Math.floor(Math.random()*choices.length)];lastFeaturedId=creature.id;host.dataset.creature=creature.id;
  host.innerHTML=html`<div class="bestiary-scene" aria-hidden="true" style="background-image:url('${rawEsc(primary(habitat))}')"></div><div class="bestiary-feature-copy"><p class="eyebrow">${t('FIELD NOTES')} / ${esc(habitat.name)}</p><h2 id="bestiary-feature-title">${esc(creature.name)}</h2><p class="feature-lore">${esc(creature.description)}</p><p class="feature-habitat">${t('Boss of')} <a href="#entry/${habitat.id}">${esc(habitat.name)}</a></p><div class="hero-actions"><a class="primary-link" href="#entry/${creature.id}">Study this creature <span aria-hidden="true">→</span></a><a class="text-link" href="#entry/${habitat.id}">Explore its habitat →</a></div></div>${combatSprite(creature,'bestiary-creature')}<span class="feature-mark" aria-hidden="true">THE BESTIARY</span>`;
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
  const hero=!$('home').hidden;
  if(hero){
    animate(document.querySelector('.hero-art'),[{transform:'translateX(26px) scale(1.025)',opacity:.6},{transform:'translateX(0) scale(1)',opacity:1}],{duration:1100,easing:'cubic-bezier(.22,.61,.36,1)'});
    animate(document.querySelector('.intro h1'),[{transform:'translateY(18px)',opacity:.25},{transform:'translateY(0)',opacity:1}],{duration:940,easing:'cubic-bezier(.16,1,.3,1)'});
    animate(document.querySelector('.intro .lede'),[{opacity:.35},{opacity:1}],{duration:780,delay:100,easing:'ease-out'});
  }else{
    const heading=!$('planner').hidden?document.querySelector('.planner-heading'):document.querySelector('.section-title');
    animate(heading,[{transform:'translateY(10px)',opacity:.5},{transform:'translateY(0)',opacity:1}],{duration:440,easing:'cubic-bezier(.16,1,.3,1)'});
  }
  // Scroll accents run once per mounted collection, never intercept scrolling.
  const revealNodes=[...document.querySelectorAll('#cards .card')].slice(0,12);
  if(revealNodes.length){
    const observer=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){observer.unobserve(e.target);animate(e.target,[{transform:'translateY(12px)',opacity:.65},{transform:'translateY(0)',opacity:1}],{duration:420,easing:'ease-out'});}});},{threshold:.15});
    revealNodes.forEach(n=>observer.observe(n));const original=sceneObserver;
    sceneObserver={disconnect(){original?.disconnect();observer.disconnect();}};
  }
}
sceneReduced.addEventListener('change',()=>{if(sceneReduced.matches)clearSceneMotion();watchCombatSprites();});
function block(heading,body){return body?html`<section class="detail-block"><h3>${esc(heading)}</h3>${html(body)}</section>`:'';}
function showEntry(id){
  const r=byId.get(id);if(!r){$('error').textContent=t(retiredSetIds.has(id)?'This legacy item-set entry has been retired. Browse equipment and compatible affixes in the current archive.':'This entry could not be found. Choose a collection to continue.');$('error').hidden=false;return;}
  const d=r.data,image=primary(r);const info=Object.fromEntries(['tier','tier_label','item_type','slot','rarity','armor_class','weapon_family','weapon_type','handedness','affix_type','affix_group','effect','damage_mult','is_ultimate','is_class_default','cooldown_seconds','resource_cost','resource_type','damage_type','attack_damage_type','targeting','max_level','cost','gold_value','max_stack','max_affixes','max_prefixes','max_suffixes','xp_reward','size_class'].filter(k=>d[k]!==undefined).map(k=>[k,d[k]]));if(r.category==='affixes')info.eligible_equipment_types=eligibleTypes(r);if(r.category==='enemy_skills'){Object.keys(info).forEach(k=>delete info[k]);Object.assign(info,abilityFacts(d));}
  const groups={};for(const l of r.links){(groups[l.relation]??=[]);if(!groups[l.relation].includes(l.id))groups[l.relation].push(l.id);}
  if(r.category==='classes'){groups['Class Ultimate']=(groups.Skill||[]).filter(id=>byId.get(id)?.data.is_class_default);groups.Skill=(groups.Skill||[]).filter(id=>!byId.get(id)?.data.is_class_default);}
  const relationLabels={'Ability':'Abilities','Enemy':'Enemies','Boss':'Boss','Dungeon':'Dungeon','Skill':'Skills','Subclass':'Specializations','Class':'Class','Found in dungeon':'Habitats','Used by enemy':'Used by','Starting skill':'Starting skills'},priority={'Starting skill':0,'Class Ultimate':1,Subclass:2,Skill:3};
  const relationships=Object.entries(groups).filter(([,ids])=>ids.length).sort((a,b)=>r.category==='classes'?(priority[a[0]]??4)-(priority[b[0]]??4):0);
  const linkBlocks=relationships.map(([rel,ids])=>{const body=`${rel==='Eligible equipment'||rel==='Can roll'?'<p class="eligibility-note">Common items have no rolled affixes. Rarity, available prefix/suffix slots and existing modifier groups constrain a particular roll.</p><label class="link-filter-label">Filter these results <input class="link-filter" type="search" placeholder="Name or tier…"></label>':''}<div class="reference-list">${ids.map(referenceCard).join('')}</div>`;return r.category==='classes'&&rel==='Skill'?html`<details class="more-related"><summary>${esc(t('All {class} skills ({count})',{class:title(d.class_id),count:displayNumber(ids.length)}))}</summary>${body}</details>`:block(relationLabels[rel]||rel,body);});
  const links=r.category==='classes'?html`<div class="opening-abilities">${linkBlocks.slice(0,2).join('')}</div>${linkBlocks.slice(2).join('')}`:linkBlocks.join('');
  const lore=['enemies','dungeons'].includes(r.category),ability=['skills','enemy_skills'].includes(r.category),flavor=r.explanations?.flavor||d.flavor,description=playerDescription(r,true);$('detail-body').className=`detail-${r.category}`;
  for(const key of ['damage_mult','is_ultimate','is_class_default','affix_group'])delete info[key];
  if(r.category!=='enemy_skills')delete info.effect;
  if(d.resource_cost)info.resource_cost=`${d.resource_cost.amount} ${title(d.resource_cost.type)}`;
  if(r.category==='skills'){delete info.cooldown_seconds;Object.assign(info,abilityFacts(d));}
  if(r.category==='dungeons')for(const key of ['tier_min','tier_max','required_gear_score','recommended_hero_power','layers'])if(d[key]!==undefined)info[key]=d[key];
  const statValues=r.category==='subclasses'?{}:stats(r),resistances=Object.fromEntries(Object.entries(d.resistances||{}).map(([k,v])=>[k,`${displayNumber(v*100)}%`]));
  const sidebar=`${r.category==='enemies'&&combatArt(r)?enemyStage(r):image?html`<img class="detail-portrait" src="${rawEsc(image)}" alt="${esc(r.name)}">`:''}${block('At a glance',facts({...info,...(r.category==='enemies'?{}:statValues)},true,r.category==='talents'))}${block('Resistances',facts(resistances))}${block('Requirements',facts(d.requirements,true))}${block('Implicit bonuses',facts(d.implicit_bonuses,true))}`;
  const bonuses=d.specialization_bonuses?html`<ul class="specialization-bonuses">${Object.entries(d.specialization_bonuses).map(([k,v])=>html`<li>${esc(bonusText(k,v))}</li>`).join('')}</ul>`:'';
  $('detail-body').innerHTML=html`<div class="detail-topline"><a href="#${r.category}">${esc(categories[r.category][0])}</a><span>/</span>${esc(r.name)}</div><div class="detail-layout${sidebar?'':' text-only-detail'}">${sidebar?'<aside class="detail-sidebar">'+sidebar+'</aside>':''}<div class="detail-main"><div class="detail-top text-detail"><div><p class="eyebrow">${esc(categories[r.category][0])}${ultimateLabel(r)?' / '+esc(ultimateLabel(r)):''}${r.tier?' / '+t('TIER')+' '+roman[r.tier]:''}</p><h2 id="detail-title">${esc(r.name)}</h2>${description?`${lore?'<span class="flavor-label">Lore</span>':''}<p${lore?' class="flavor-text"':''}>${esc(description)}</p>`:''}${flavor&&flavor!==description?html`<span class="flavor-label">Flavor text</span><p class="flavor-text">${esc(flavor)}</p>`:''}${r.category==='talents'?html`<a class="primary-link" href="#planner?node=${r.id}">Inspect in Talent Atlas →</a>`:''}</div></div>${r.category==='enemies'?block('Combat properties',facts(statValues,true)):''}${d.class_passive?block(title(d.class_passive.id),html`<p>${esc(d.class_passive.description)}</p>`):''}${block('Specialization bonuses',bonuses)}${r.category==='skills'?skillProgression(r):d.level_scaling?block('Per rank',facts(d.level_scaling,true)):''}${r.progression?block('Along the descent',html`<p>${esc(t('Dungeon {ordinal} of {count}.',{ordinal:displayNumber(r.progression.ordinal),count:displayNumber(catalog.dungeon_sequence?.length||22)}))}</p><nav class="descent-links" aria-label="Dungeon sequence">${r.progression.previous_id?referenceCard(r.progression.previous_id):''}${r.progression.next_id?referenceCard(r.progression.next_id):''}</nav>`):''}${ability?block('Timing and damage','<p>Damage multipliers describe attack inputs; defenses affect final damage. Logical ticks last 0.5 seconds. Action-meter telegraphs depend on enemy speed.</p>'):''}${r.mechanics?block('Crafting operation',html`<p>${esc(r.mechanics.description)}</p>${r.mechanics.limitations?html`<p class="eligibility-note">${esc(r.mechanics.limitations)}</p>`:''}<a class="text-link" href="#crafting">Compare currency operations →</a>`):''}${links}</div></div>`;
  $('detail-body').querySelectorAll('.link-filter').forEach(input=>input.oninput=()=>input.closest('section').querySelectorAll('.reference-list a').forEach(a=>a.hidden=!a.textContent.toLowerCase().includes(input.value.toLowerCase())));document.title=`${r.name} — No Name Below`;if(!$('detail').open){returnFocus=document.activeElement;$('detail').showModal();}$('detail').scrollTop=0;watchCombatSprites();
}
function chapterShell(key,description){current=key;$('library').hidden=false;$('showcase').hidden=true;$('planner').hidden=true;$('collection-tools').hidden=true;$('cards').hidden=true;$('more').hidden=true;$('chapter').hidden=false;$('section-title').textContent=chapters[key][0];$('section-kicker').textContent=chapters[key][1];$('section-description').textContent=t(description);$('section-art').innerHTML='';markCollection(key);document.title=`${chapters[key][0]} — No Name Below`;}
function showChapter(key){
  const crafting=key==='crafting';chapterShell(key,crafting?'Choose an orb to change your equipment or refund a talent. Outcomes depend on compatible modifiers.':'Understand equipment upgrades, talent choices and combat timing.');
  if(crafting){$('section-art').innerHTML=['chaos_orb','divine_orb'].map(id=>html`<img src="${rawEsc(primary(byId.get(id)))}" alt="">`).join('');$('chapter').innerHTML=html`<p class="guide-lead">Start with a base. Follow its compatible affixes. Choose the currency that changes what you need.</p><div class="craft-links"><a href="#items">Find equipment →</a><a href="#affixes">Inspect modifiers →</a><a href="#orbs">All currency →</a></div>${catalog.crafting.operations.map(op=>html`<section class="craft-action"><img src="${rawEsc(primary(byId.get(op.id)))}" alt="" loading="lazy"><div><p class="eyebrow">${op.target==='talent'?'TALENT REFUNDS':op.target_rarity?title(op.target_rarity)+' '+t('EQUIPMENT'):'EQUIPMENT'}</p><h3>${referenceLink(op.id)}</h3><p>${esc(op.description)}</p>${op.limitations?html`<p class="eligibility-note">${esc(op.limitations)}</p>`:''}</div></section>`).join('')}`;}
  else {const descriptions={enhancing:'Spend gold to raise enhancement by one level. Each level adds 5% of the original base stats. Gold prices depend on rarity, tier and enhancement level.',reforging:'Spend currency to lock one random unlocked affix. Reforge does not reroll affixes or let you choose the affix. Each existing lock increases the price; Engraved Forge halves it, rounding upward.',talent_allocation:'Class origins are free. Spend talent points on connected talents. Refunds return the allocated points and require Orbs of Regret. The remaining talents must stay connected; refunded skill grants are unequipped.',enemy_abilities:'Self-buffs strengthen the creature; debuffs weaken the hero. Both also attack. Healing restores the creature without a basic attack. Cooldowns and damage-over-time use logical ticks; ordinary telegraphs use speed-dependent action-meter fills.'};$('chapter').innerHTML=html`<div class="guide-grid">${catalog.mechanics.filter(m=>m.audience!=='site_help'&&m.id!=='planner_scope').map(m=>{const target=m.id.startsWith('talent')?'planner':m.id==='enemy_abilities'?'enemy_skills':['enhancing','reforging'].includes(m.id)?'crafting':'affixes';return html`<section class="guide-block" id="mechanic-${rawEsc(m.id)}"><p class="eyebrow">GAME RULES</p><h3>${esc(m.title)}</h3><p>${esc(descriptions[m.id]||m.description)}</p>${mechanicsFacts(m)}<p><a href="#${target}">${target==='planner'?'Open the Talent Atlas':target==='enemy_skills'?'Study enemy abilities':target==='crafting'?'Explore crafting':'Explore affixes'} &rarr;</a></p></section>`;}).join('')}</div>`;}
}
function showSearch(hash){const query=new URLSearchParams(hash.split('?')[1]||'').get('q')||'';$('global-query').value=query;chapterShell('search',query?t('Results for “{query}” across all game entities.',{query}):'Search a name, property or effect across the archive.');const q=query.trim().toLowerCase(),rows=q?catalog.records.filter(r=>r.search.includes(q)).sort((a,b)=>(b.name.toLowerCase()===q)-(a.name.toLowerCase()===q)||a.name.localeCompare(b.name)):[];$('chapter').innerHTML=html`<p class="aside-note">${t('{count} matching entries',{count:displayNumber(rows.length)})}${rows.length>100?t(' · showing the first 100; refine your search for more'):''}</p><div class="search-results">${rows.slice(0,100).map(r=>html`<a class="search-result" href="#entry/${encodeURIComponent(r.id)}">${primary(r)?html`<img src="${rawEsc(primary(r))}" alt="" loading="lazy">`:''}<div><small>${esc(categories[r.category][0])}${ultimateLabel(r)?' / '+esc(ultimateLabel(r)):''}${r.tier?' · '+t('Tier {tier}',{tier:roman[r.tier]}):''}</small><h3>${esc(r.name)}</h3><p>${esc(r.description)}</p></div></a>`).join('')||'<p class="empty"><strong>No entries found.</strong>Try a shorter name, a stat, or a collection from the menu.</p>'}</div>`;}
function showArmory(){
  const changed=current!=='items';current='items';$('home').hidden=true;$('library').hidden=false;$('showcase').hidden=false;
  $('chapter').hidden=true;$('cards').hidden=true;$('collection-tools').hidden=false;$('more').hidden=true;$('bestiary-feature').hidden=true;
  $('section-title').textContent=t('The Armory');$('section-kicker').textContent=categories.items[1];$('section-description').textContent=descriptions.items;$('section-art').innerHTML='';
  if(changed){$('search').value='';filtersForCategory();}
  markCollection('items');document.title=t('Armory')+' — No Name Below';renderGallery();
}
function renderGallery(){
  const filter=$('kind').value,tier=$('tier').value,q=$('search').value.trim().toLowerCase();
  const gallery=$('tier-gallery'),key=JSON.stringify([filter,tier,q]);
  cancelAnimationFrame(renderGallery.pending);renderGallery.pending=null;
  if(renderGallery.view?.catalog===catalog&&renderGallery.view.key===key&&renderGallery.view.complete){
    $('result-count').textContent=t('{count} pieces',{count:displayNumber(renderGallery.view.count)});return;
  }
  if(renderGallery.cache?.catalog!==catalog)renderGallery.cache={catalog,cards:new Map()};
  const rows=catalog.records.filter(r=>r.category==='items'&&r.data.slot&&r.tier&&primary(r)&&(!filter||kind(r)===filter)&&(!tier||String(r.tier)===tier)&&(!q||r.search.includes(q)));
  $('result-count').textContent=t('{count} pieces',{count:displayNumber(rows.length)});
  const tiers=roman.slice(1).map((name,i)=>{
    const items=rows.filter(r=>r.tier===i+1).sort((a,b)=>kind(a).localeCompare(kind(b))||a.name.localeCompare(b.name));
    return {name,tier:i+1,items};
  }).filter(group=>group.items.length);
  const view=renderGallery.view={catalog,key,count:rows.length,complete:false};
  gallery.replaceChildren();gallery.setAttribute('aria-busy','true');
  if(!tiers.length){gallery.innerHTML=html('<p class="empty"><strong>No equipment matches.</strong>Try another name, tier, or equipment type.</p>');view.complete=true;gallery.removeAttribute('aria-busy');return;}
  let index=0;
  function appendTier(){
    renderGallery.pending=null;
    if(renderGallery.view!==view)return;
    if(activeRoute!=='items'){gallery.removeAttribute('aria-busy');return;}
    const {name,tier,items}=tiers[index++],label=items.find(r=>r.data.tier_label)?.data.tier_label||t('Tier {tier}',{tier:name});
    const cards=items.map(r=>{if(!renderGallery.cache.cards.has(r.id))renderGallery.cache.cards.set(r.id,card(r,true));return renderGallery.cache.cards.get(r.id);}).join('');
    gallery.insertAdjacentHTML('beforeend',html`<section class="tier-section" id="gallery-tier-${tier}"><div class="tier-heading"><span class="roman">${name}</span><div><p class="eyebrow">${t('EQUIPMENT')} / ${t('TIER')} ${name}</p><h2>${esc(label)}</h2><p>${t('{count} pieces in this collection',{count:displayNumber(items.length)})}</p></div></div><div class="gallery-grid">${cards}</div></section>`);
    // Finite tier batches let the first equipment become usable before all
    // 566 cards are parsed; hidden routes never keep rebuilding the gallery.
    if(index<tiers.length)renderGallery.pending=requestAnimationFrame(appendTier);
    else {view.complete=true;gallery.removeAttribute('aria-busy');}
  }
  appendTier();
}
function route(){
  $('error').hidden=true;let hash;try{hash=location.hash.slice(1);decodeURIComponent(hash);}catch{$('error').textContent=t('This link could not be read. Choose a collection to continue.');$('error').hidden=false;return;}
  if(hash==='showcase'){history.replaceState(null,'',location.pathname+location.search+'#items');hash='items';}
  if(hash.startsWith('entry/')){const id=decodeURIComponent(hash.slice(6));if(byId.has(id))window.libraryPlanner.deactivate();if(!activeRoute&&byId.has(id)){activeRoute=byId.get(id).category;detailReturn=activeRoute;$('home').hidden=true;showCategory(activeRoute);}if(!$('planner').hidden)detailReturn='planner?node='+window.libraryPlanner.getState().selected;clearSceneMotion();showEntry(id);return;}
  const previous=activeRoute,returning=$('detail').open&&hash===detailReturn,next=hash.split('?')[0]||'home';
  // Capture the outgoing view before changing its DOM, visibility or scroll.
  if(previous&&previous!==next)window.NNBOrbMotion?.prepare?.();
  activeRoute=next;detailReturn=hash||'home';if($('detail').open){$('detail').close();if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});}
  // Retain the exact search/filter context and focused result when closing a detail.
  if(returning&&previous===activeRoute&&activeRoute!=='planner'){document.title=(activeRoute==='home'?t('THE DESCENT ARCHIVE'):activeRoute==='items'?t('Armory'):categories[activeRoute]?.[0]||chapters[activeRoute]?.[0]||t('THE DESCENT ARCHIVE'))+' — No Name Below';watchCombatSprites();return;}
  clearSceneMotion();window.libraryPlanner.deactivate();$('bestiary-feature').hidden=activeRoute!=='enemies';
  document.querySelectorAll('.masthead nav a').forEach(a=>{const active=a.hash==='#'+activeRoute;a.classList.toggle('active',active);active?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current');});$('main-nav').classList.remove('is-open');$('nav-toggle').setAttribute('aria-expanded','false');$('planner').hidden=activeRoute!=='planner';
  $('home').hidden=activeRoute!=='home';document.body.classList.toggle('at-home',activeRoute==='home');
  if(activeRoute==='home'){$('library').hidden=true;$('showcase').hidden=true;document.title=t('No Name Below — The Descent Archive');}
  else if(activeRoute==='planner'){$('library').hidden=true;$('showcase').hidden=true;document.title=t('Talent Atlas')+' — No Name Below';window.libraryPlanner.open(hash);}
  else if(activeRoute==='items')showArmory();
  else if(activeRoute==='search')showSearch(hash);else if(activeRoute==='crafting'||activeRoute==='mechanics')showChapter(activeRoute);else {showCategory(activeRoute);if(activeRoute==='sets'){$('error').textContent=t('The legacy item-set collection has been retired. Browse equipment and compatible affixes in the current archive.');$('error').hidden=false;}}
  placeOrb(activeRoute);
  if(previous&&previous!==activeRoute){window.scrollTo({top:0,behavior:'instant'});window.NNBOrbMotion?.route(activeRoute);}
  else if(!previous)enterScene();
  watchCombatSprites();
}
// Route shells remain truthful and navigable while the reference payload loads.
let referencePending=true;
const pendingControls=[...document.querySelectorAll('.planner-toolbar button,.planner-toolbar select,.planner-picker input,.planner-picker select,#filters input,#filters select,#filters button,#collection-select')];
pendingControls.forEach(control=>control.disabled=true);
function pendingShell(){
  if(!referencePending)return;
  const key=location.hash.slice(1).split('?')[0]||'home',plannerRoute=key==='planner';
  placeOrb(key);
  $('home').hidden=key!=='home';$('showcase').hidden=!['items','showcase'].includes(key);$('planner').hidden=!plannerRoute;$('library').hidden=plannerRoute||key==='home';document.body.classList.toggle('at-home',key==='home');
  $('planner').setAttribute('aria-busy','true');$('library').setAttribute('aria-busy','true');
  $('plan-count').textContent=t('Loading reference…');$('result-count').textContent=t('Loading game reference…');
  $('atlas-stage').dataset.referenceLoading=String(plannerRoute);
  $('atlas-status').dataset.loading='true';$('atlas-status').textContent=t('Loading game reference. Your build controls will be ready shortly.');
  $('atlas-hint').textContent=t(innerWidth<600?'Drag to pan · Pinch or + / − to zoom · Tap a talent':'Drag to explore · Scroll to zoom · Select to inspect');
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
  await window.NNBI18n.ready;
  for(const group of [categories,chapters])for(const labels of Object.values(group))for(let i=0;i<labels.length;i++)labels[i]=t(labels[i]);
  for(const key of Object.keys(descriptions))descriptions[key]=t(descriptions[key]);
  document.querySelector('.skip').onclick=e=>{e.preventDefault();if(!$('planner').hidden)$('plan-search').focus();else if(!$('home').hidden)document.querySelector('.hero-actions a').focus();else $('content').focus();};
  const response=await fetch('data.json');if(!response.ok)throw Error('Could not load the game library.');catalog=window.NNBI18n.localizeCatalog(await response.json());if(catalog.schema_version!==2)throw Error('The archive data version is not supported.');catalog.records.filter(r=>r.category==='sets').forEach(r=>retiredSetIds.add(r.id));catalog.records=catalog.records.filter(r=>r.category!=='sets');byId=new Map(catalog.records.map(r=>[r.id,r]));catalog.records.forEach(r=>r.search=((r.englishSearch||'')+' '+r.name+' '+r.description+' '+JSON.stringify(r.data)+' '+Object.keys(stats(r)).map(k=>statText(k,0)[0]).join(' ')+' '+r.links.map(l=>byId.get(l.id)?.name||'').join(' ')).toLowerCase());plannerHelp();if(catalog.branding?.studio_logo?.url)[$('studio-logo'),$('home-studio-logo')].forEach(img=>img.src=catalog.branding.studio_logo.url);referenceReady();window.libraryPlanner=setupPlanner(catalog,byId,(key,value)=>statText(key,value,true),esc);
  $('total').textContent=t('{count} linked entries',{count:displayNumber(catalog.records.length)});if($('snapshot-label'))$('snapshot-label').remove();const collections={...categories,crafting:chapters.crafting,mechanics:chapters.mechanics},navigation={Character:['classes','subclasses','skills','talents'],Equipment:['items','orbs','affixes','pools','crafting'],World:['enemies','dungeons','enemy_skills','mechanics']};$('categories').innerHTML=Object.entries(navigation).map(([group,keys])=>html`<div class="nav-group"><p class="nav-group-title">${group}</p>${keys.map(key=>html`<a href="#${key}" data-category="${key}"><span>${esc(collections[key][0])}</span>${catalog.counts[key]?html`<small>${catalog.counts[key]}</small>`:''}</a>`).join('')}</div>`).join('');$('collection-select').innerHTML=Object.entries(collections).map(([key,[label]])=>html`<option value="${key}">${esc(label)}</option>`).join('')+html('<option value="search">Search results</option>');$('collection-select').onchange=()=>location.hash=$('collection-select').value;
  $('global-search').onsubmit=e=>{e.preventDefault();location.hash='search?'+new URLSearchParams({q:$('global-query').value.trim()});};$('nav-toggle').onclick=()=>{const open=$('main-nav').classList.toggle('is-open');$('nav-toggle').setAttribute('aria-expanded',String(open));};filtersForCategory();const query=new URLSearchParams(location.search);if([...$('kind').options].some(o=>o.value===query.get('galleryType')))$('kind').value=query.get('galleryType');$('filters').addEventListener('submit',e=>e.preventDefault());['search','tier','kind','skill-category'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',()=>{limit=48;renderCards();}));$('filters').addEventListener('reset',()=>setTimeout(()=>{limit=48;renderCards();},0));$('more').onclick=()=>{limit+=48;renderCards();};$('close-detail').onclick=()=>location.hash=detailReturn;$('detail').addEventListener('cancel',e=>{e.preventDefault();$('close-detail').click();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('main-nav').classList.remove('is-open');$('nav-toggle').setAttribute('aria-expanded','false');}});
  // Decoration cannot gate navigation, even if its optional module fails to initialize.
  initOrb();
  window.addEventListener('hashchange',route);route();
}
init().catch(error=>{$('error').textContent=t(error.message);$('error').hidden=false;if(referencePending)$('atlas-status').textContent=t('The game reference could not load. Reload this page to retry.');});
