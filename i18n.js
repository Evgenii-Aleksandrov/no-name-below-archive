'use strict';
// Browser-only display translations; canonical IDs, mechanics and saved plans stay intact.
window.NNBI18n=(()=>{
  const supported=['en','ru','zh-CN'],query=new URLSearchParams(location.search);
  let saved;try{saved=localStorage.getItem('nnb-archive-language');}catch{}
  const browser=(navigator.languages||[navigator.language]).map(x=>/^en(?:-|$)/i.test(x)?'en':/^ru(?:-|$)/i.test(x)?'ru':/^zh(?:-|$)/i.test(x)?'zh-CN':null).find(Boolean)||'en';
  let locale=supported.includes(query.get('lang'))?query.get('lang'):supported.includes(saved)?saved:browser;
  let ui={},content={};const missing=new Set();
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
    if(locale==='en')return catalog;
    const englishDescriptions=new Map(catalog.records.map(record=>[record.id,record.description]));
    for(const record of catalog.records){record.englishSearch=[record.name,record.description,JSON.stringify(record.data)].join(' ');if(record.category==='talents')record.englishEffects=[record.id.endsWith('_center')?'':record.description,...Object.entries(record.data.passive_effects||{}).map(([key,value])=>(catalog.stat_display[key]?.label||key.replaceAll('_',' '))+': '+JSON.stringify(value)),englishDescriptions.get(record.data.grants_skill_id)||''].join(' ');merge(record,content.records?.[record.id]);record.name=t(record.name);record.description=t(record.description);if(record.data.tier_label)record.data.tier_label=t(record.data.tier_label);}
    for(const [key,display] of Object.entries(catalog.stat_display)){merge(display,content.stat_display?.[key]);display.label=t(display.label);}
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
