'use strict';
// Browser-only display translations; canonical IDs, mechanics and saved plans stay intact.
window.NNBI18n=(()=>{
  const supported=['en','ru','zh-CN'],query=new URLSearchParams(location.search);
  let saved;try{saved=localStorage.getItem('nnb-archive-language');}catch{}
  const browser=(navigator.languages||[navigator.language]).map(x=>/^en(?:-|$)/i.test(x)?'en':/^ru(?:-|$)/i.test(x)?'ru':/^zh(?:-|$)/i.test(x)?'zh-CN':null).find(Boolean)||'en';
  let locale=supported.includes(query.get('lang'))?query.get('lang'):supported.includes(saved)?saved:browser;
  let ui={},content={};const missing=new Set();
  // English labels that differ from the archived catalogue. The localized
  // stat_display overlays use the same native stat keys.
  const statLabels={
    all_resist_pct: "All Resistance",
    aoe_damage_pct: "Area of Effect Damage",
    armor_and_es_pct: "Armor And Energy Shield",
    cast_speed_pct: "Skill Cooldown Recovery",
    skill_cooldown_recovery_pct: "Skill Cooldown Recovery",
    crit_chance_pct: "Global Crit Chance",
    crit_chance_with_attacks_pct: "Attack Skill Crit Chance",
    crit_chance_with_spells_pct: "Spell Crit Chance",
    crit_damage_pct: "Crit Multiplier",
    crit_damage_with_spells_pct: "Critical Damage With Spells",
    dagger_crit_chance_pct: "Dagger Critical Chance",
    dagger_crit_damage_pct: "Dagger Critical Damage",
    dark_resist_pct: "Dark Resistance",
    dex_flat: "Dexterity",
    dot_damage_pct: "Damage over Time",
    dot_duration_pct: "Damage over Time Duration",
    elemental_resist_pct: "Elemental Resistance",
    es_recharge_delay_reduction_pct: "Energy Shield Recharge Delay Reduction",
    es_recharge_rate_pct: "Energy Shield Recharge Rate",
    evasion_and_es_pct: "Evasion And Energy Shield",
    fire_resist_pct: "Fire Resistance",
    holy_penetration: "Holy Resistance Penetration",
    holy_resist_pct: "Holy Resistance",
    hp_flat: "Life",
    hp_pct: "Life",
    hp_regen_pct: "Max Health Restored per Second",
    int_flat: "Intelligence",
    life_on_hit_flat: "Health per Basic Attack Hit",
    life_on_kill_flat: "Health per Basic Attack Kill",
    lifesteal_pct: "Basic Attack Life Leech",
    lightning_resist_pct: "Lightning Resistance",
    mace_stun_buildup_pct: "Duration of Stuns with a Mace",
    magic_damage_pct: "Arcane Damage",
    mana_leech_pct: "Basic Attack Mana Leech",
    mana_regen_flat: "Mana Restored per 0.5 s in Combat",
    mana_regen_pct: "Mana Regeneration",
    max_all_resist_pct: "Max All Resistance",
    max_fire_resist_pct: "Max Fire Resistance",
    max_frost_resist_pct: "Max Frost Resistance",
    max_lightning_resist_pct: "Max Lightning Resistance",
    phys_damage_pct: "Physical Damage",
    phys_penetration: "Physical Penetration",
    spell_block_chance_pct: "Non-Physical Hit Block Chance",
    staff_cast_speed_pct: "Skill Cooldown Recovery with a Staff",
    staff_spell_damage_pct: "Arcane Damage with a Staff",
    str_flat: "Strength",
    stun_buildup_pct: "Duration of Stuns You Inflict",
    stun_threshold_pct: "Stun Recovery Speed",
    sword_crit_chance_pct: "Sword Critical Chance",
    thorns_damage_pct: "Incoming Hit Damage Reflected",
    wand_cast_speed_pct: "Skill Cooldown Recovery with a Wand",
    wand_spell_damage_pct: "Arcane Damage with a Wand",
    xp_gain_pct: "Experience Gain",
  };
  const number=n=>new Intl.NumberFormat(locale,{maximumFractionDigits:Math.abs(n)>=10?1:2}).format(n);
  function t(source,values={}){if(source===undefined||source===null)return '';const translated=ui[source]??content.strings?.[source]??source;if(locale!=='en'&&typeof source==='string'&&translated===source&&/[A-Za-z]{3}/.test(source)&&!/^No Name Below|^NO NAME BELOW$|^ElseGate Studio$/.test(source)&&!/^\S*[_/.#:]+\S*$/.test(source)&&!/^&[A-Za-z]+;$/.test(source)&&!(source.match(/[A-Za-z]+/g)||[]).every(word=>/^[IVX]+$/.test(word)))missing.add(source);return String(translated).replace(/\{([\w]+)\}/g,(match,key)=>Object.hasOwn(values,key)?String(values[key]):match);}
  function text(source){const core=source.trim();return core?source.replace(core,t(core)):source;}
  function staticDOM(){
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement.closest('script,style,#site-language')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
    while(walker.nextNode())walker.currentNode.nodeValue=text(walker.currentNode.nodeValue);
    document.querySelectorAll('[aria-label],[placeholder],[data-label]').forEach(node=>{for(const key of ['aria-label','placeholder','data-label'])if(node.hasAttribute(key))node.setAttribute(key,t(node.getAttribute(key)));});
    const description=document.querySelector('meta[name="description"]');description.content=t(description.content);
    document.title=t(document.title);document.documentElement.lang=locale==='zh-CN'?'zh-Hans':locale;document.body.dataset.locale=locale;
    const selector=document.getElementById('site-language');selector.value=locale;
    selector.onchange=()=>{const next=selector.value;if(!supported.includes(next))return;try{localStorage.setItem('nnb-archive-language',next);}catch{}const url=new URL(location.href);url.searchParams.set('lang',next);window.libraryPlanner?.deactivate(true);location.assign(url.href);};
  }
  // Merge display leaves only. Source patches never introduce keys or alter numeric rules.
  function merge(base,patch){for(const [key,value] of Object.entries(patch||{})){if(!Object.hasOwn(base,key))continue;if(typeof base[key]==='string'&&typeof value==='string')base[key]=value;else if(base[key]&&value&&typeof base[key]==='object'&&typeof value==='object')merge(base[key],value);}}
  function localizeCatalog(catalog){
    for(const [key,label] of Object.entries(statLabels))if(catalog.stat_display[key])catalog.stat_display[key].label=label;
    if(locale==='en')return catalog;
    const englishDescriptions=new Map(catalog.records.map(record=>[record.id,record.description]));
    for(const record of catalog.records){record.englishSearch=[record.name,record.description,JSON.stringify(record.data)].join(' ');if(record.category==='talents')record.englishEffects=[record.id.endsWith('_center')?'':record.description,...Object.entries(record.data.passive_effects||{}).map(([key,value])=>(catalog.stat_display[key]?.label||key.replaceAll('_',' '))+': '+JSON.stringify(value)),englishDescriptions.get(record.data.grants_skill_id)||''].join(' ');merge(record,content.records?.[record.id]);record.name=t(record.name);record.description=t(record.description);if(record.data.tier_label)record.data.tier_label=t(record.data.tier_label);}
    for(const [key,display] of Object.entries(catalog.stat_display)){merge(display,content.stat_display?.[key]);display.label=t(display.label);}
    for(const [key,display] of Object.entries(catalog.stat_display))if(key.startsWith('global_')&&catalog.stat_display[key.slice(7)])display.label=catalog.stat_display[key.slice(7)].label;
    if(catalog.stat_display.skill_cooldown_recovery_pct&&catalog.stat_display.cast_speed_pct)catalog.stat_display.skill_cooldown_recovery_pct.label=catalog.stat_display.cast_speed_pct.label;
    for(const entry of [...(catalog.crafting?.operations||[]),...(catalog.mechanics||[]),...(catalog.site_help||[])])for(const field of ['title','description','limitations'])if(entry[field])entry[field]=t(entry[field]);
    return catalog;
  }
  const ready=(async()=>{
    let unavailable=false;
    if(locale!=='en'){
      const load=async file=>{const response=await fetch('locales/'+file);if(!response.ok)throw Error('Locale resource unavailable: '+file);return response.json();};
      try{[ui,content]=await Promise.all([load(locale+'-ui.json'),load(locale+'-content.json')]);}
      catch{locale='en';ui={};content={};unavailable=true;}
    }
    missing.clear();
    staticDOM();
    if(unavailable){const notice=document.createElement('p');notice.className='locale-notice';notice.setAttribute('role','status');notice.textContent='This language could not load. The archive is available in English.';document.querySelector('.masthead').after(notice);}
  })();
  return {get locale(){return locale;},t,ready,localizeCatalog,number,missing};
})();
