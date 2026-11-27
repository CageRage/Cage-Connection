/* On-demand internet follow-up for unresolved Board QC cast credits.
   Reads public Wikipedia pages only. Never edits game, turns, scoring or room state. */
(function () {
  'use strict';
  const api='https://en.wikipedia.org/w/api.php';
  const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const pageLink=title=>'https://en.wikipedia.org/wiki/'+encodeURIComponent(title.replace(/ /g,'_'));
  async function request(params){
    const q=new URLSearchParams({action:'parse',format:'json',formatversion:'2',origin:'*',...params});
    const response=await fetch(api+'?'+q.toString(),{credentials:'omit',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('Wikipedia HTTP '+response.status);
    const result=await response.json();
    if(result.error)throw Error(result.error.info||result.error.code);
    return result.parse;
  }
  async function searchPages(movie) {
    const q=new URLSearchParams({action:'query',list:'search',srsearch:'intitle:"'+movie+'" film',srlimit:'6',format:'json',origin:'*'});
    const response=await fetch(api+'?'+q.toString(),{credentials:'omit',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('Wikipedia HTTP '+response.status);
    const result=await response.json();
    return result.query?.search?.map(x=>x.title)||[];
  }
  const cached=new Map();
  function titleMatches(movie, page){
    const m=norm(movie).replace(/^(the|a|an) /,'');
    const title=String(page||'').replace(/\s*\((?:\d{4}\s+)?(?:[\w-]+\s+)*(?:film|movie)\)\s*$/i,'');
    const p=norm(title).replace(/^(the|a|an) /,'');
    return m===p;
  }
  async function sourceFor(movie) {
    const key=norm(movie);
    if(cached.has(key))return cached.get(key);
    const work=(async()=>{
      const url=typeof WIKI_URLS!=='undefined'?Object.entries(WIKI_URLS).find(([name])=>norm(name)===key)?.[1]:null;
      const knownTitle=url&&/^https:\/\/en\.wikipedia\.org\/wiki\//.test(url)
        ? decodeURIComponent(new URL(url).pathname.split('/wiki/')[1]).replace(/_/g,' ')
        :null;
      const matching=knownTitle?[knownTitle]:[...new Set(await searchPages(movie))].filter(t=>titleMatches(movie,t));
      // Never silently choose between distinct similarly named films.
      if(matching.length!==1)return {status:'unverified',reason:matching.length?'Ambiguous movie title':'No confidently matching Wikipedia film article'};
      const title=matching[0], meta=await request({page:title,prop:'sections'});
      const sections=(meta?.sections||[]).filter(s=>/^(cast|voice cast|cast and characters|cast members)$/i.test(String(s.line||'').replace(/<[^>]+>/g,'').trim()));
      if(!sections.length)return {status:'unverified',reason:'No dedicated cast section on the page',title,url:pageLink(title)};
      let portions=[];
      for(const section of sections.slice(0,2)){
        const data=await request({page:title,prop:'wikitext',section:String(section.index)});
        const w=typeof data?.wikitext==='string'?data.wikitext:(data?.wikitext?.['*']||'');
        if(w)portions.push(w);
      }
      if(!portions.length)return {status:'unverified',reason:'Cast section could not be read',title,url:pageLink(title)};
      return {status:'source',title,url:pageLink(title),cast:portions.join('\n')};
    })().catch(err=>({status:'unverified',reason:err.message||'Online lookup failed'}));
    cached.set(key,work);return work;
  }
  function hasCastCredit(source,actor){
    const name=norm(actor);
    if(!name)return false;
    // Require an explicit actor-to-role entry. Prose mentions and ambiguous
    // formats remain for review, even within a dedicated Cast section.
    return source.split(/\r?\n/).some(line=>{
      const entry=line.match(/^\s*[*#]+\s*(.*?)\s+as\s+(\S.*)$/i);
      if(!entry)return false;
      const credited=entry[1].replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g,'$1').replace(/'{2,}/g,'');
      return norm(credited)===name;
    });
  }
  let activeHolder=null;
  async function runOnline(button){
    if(typeof window.ccBoardQcVerifyConnections!=='function')return;
    const holder=document.getElementById('ccQcInternetResults');
    if(!holder||activeHolder===holder)return;
    const checks=window.ccBoardQcVerifyConnections().results
      .flatMap(r=>r.checks.filter(x=>['review','unverified'].includes(x.status)&&x.production!=='Game rule')
        .map(x=>({connection:r.label,production:x.production,actor:x.actor})));
    const unique=[...new Map(checks.map(x=>[norm(x.production)+'|'+norm(x.actor),x])).values()];
    if(!unique.length){holder.textContent='No unresolved cast appearances need online research.';return;}
    activeHolder=holder;button.disabled=true;
    let verified=0,open=0;
    // Small batches protect the public API from bursts and avoid hitting rate limits.
    const batches=[];
    for(let i=0;i<unique.length;i+=8)batches.push(unique.slice(i,i+8));
    holder.replaceChildren();
    const summary=document.createElement('p');holder.appendChild(summary);
    const results=document.createElement('div');holder.appendChild(results);
    try{
      for(let bi=0;bi<batches.length;bi++){
        for(const item of batches[bi]){
          if(!holder.isConnected||activeHolder!==holder)return;
          summary.textContent='Checking Wikipedia cast sections: '+(verified+open)+' of '+unique.length+' completed…';
          const source=await sourceFor(item.production);
          if(!holder.isConnected||activeHolder!==holder)return;
          const positive=source.status==='source'&&hasCastCredit(source.cast,item.actor);
          const entry=document.createElement('p');
          const marker=document.createElement('strong');
          marker.textContent=positive?'Source match: ':'Still needs review: ';
          marker.className=positive?'ccqc-ok':'ccqc-warning';
          entry.appendChild(marker);
          entry.appendChild(document.createTextNode(item.actor+' — '+item.production+'. '));
          if(source.url){
            const a=document.createElement('a');a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Wikipedia source';a.style.color='#f0c776';entry.appendChild(a);
          }
          if(!positive){
            const note=source.status==='source'?'No explicit actor-to-role entry matched; the credit may still be valid.':(source.reason||'No matching source');
            entry.appendChild(document.createTextNode(' ('+note+')'));open++;
          }else verified++;
          results.appendChild(entry);
        }
        if(bi<batches.length-1)await new Promise(resolve=>setTimeout(resolve,550));
      }
      summary.textContent='Online research complete: '+verified+' source matches, '+open+' still requiring review. These are individual actor appearances, not verified entire connections.';
    }finally{if(activeHolder===holder)activeHolder=null;button.disabled=false;}
  }
  document.addEventListener('click',e=>{
    const button=e.target.closest?.('#ccQcInternetButton');
    if(button)runOnline(button).catch(err=>{
      const target=document.getElementById('ccQcInternetResults');
      if(target&&button.isConnected)target.textContent='Online lookup stopped: '+(err.message||err)+'. Try again.';
      button.disabled=false;
    });
  });
})();