/* Cage Connection Board QC: read-only diagnostics, no DB writes or scoring changes. */
(function () {
  'use strict';
  const menu = document.querySelector('.tools-menu-panel');
  if (!menu || document.getElementById('ccBoardQcOpen')) return;
  const btn = document.createElement('button');
  btn.id = 'ccBoardQcOpen';
  btn.type = 'button';
  btn.textContent = '✓ Board QC (read only)';
  const separator = menu.querySelector('.tools-submenu-divider');
  if (separator) menu.insertBefore(btn, separator);
  else menu.prepend(btn);

  const css = document.createElement('style');
  css.textContent = [
    '#ccBoardQcOverlay{position:fixed;inset:0;z-index:30000;background:rgba(0,0,0,.78);display:flex;justify-content:center;align-items:center;padding:16px}',
    '#ccBoardQcDialog{width:min(680px,100%);max-height:min(84vh,840px);overflow:auto;color:#fff5e8;background:linear-gradient(130deg,#3b2919,#120e0a 82%);border:1px solid #cba355;border-radius:12px;padding:20px;box-shadow:0 15px 60px #000c;font:14px/1.5 system-ui,sans-serif}',
    '#ccBoardQcDialog h2{font:bold 22px Georgia,serif;letter-spacing:.03em;color:#eac06e;margin:0}',
    '#ccBoardQcDialog h3{font:600 15px Georgia,serif;color:#f0c776;margin:12px 0 5px}',
    '#ccBoardQcDialog p,#ccBoardQcDialog li{color:#fff3df;margin:6px 0}',
    '#ccBoardQcDialog .ccqc-top{display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid #997744;padding-bottom:12px}',
    '#ccBoardQcDialog button{background:#302116;border:1px solid #cba355;color:#fff;border-radius:5px;padding:7px 10px;cursor:pointer;text-align:left}',
    '#ccBoardQcDialog button:hover{background:#58402b}',
    '#ccBoardQcDialog button:focus-visible{outline:2px solid #ffe5a8}',
    '#ccBoardQcDialog .ccqc-stats{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0}',
    '#ccBoardQcDialog .ccqc-stat{flex:1 1 100px;border:1px solid #795d38;border-radius:7px;text-align:center;padding:8px}',
    '#ccBoardQcDialog .ccqc-stat strong{display:block;color:#f0c776;font-size:24px}',
    '#ccBoardQcDialog .ccqc-issue{background:#1c150f;border:1px solid #695236;border-radius:6px;padding:10px;margin:7px 0}',
    '#ccBoardQcDialog .ccqc-issue button{font-size:12px;margin:6px 5px 0 0}',
    '#ccBoardQcDialog .ccqc-muted{font-size:12px;color:#c7b596}',
    '#ccBoardQcDialog .ccqc-ok{color:#a9dc9e}',
    '#ccBoardQcDialog .ccqc-warning{color:#f3ce7e}',
    '@media(max-width:600px){#ccBoardQcDialog{padding:13px}#ccBoardQcDialog h2{font-size:19px}}'
  ].join('\n');
  document.head.appendChild(css);

  const norm = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function dist(a,b,max) {
    if (Math.abs(a.length-b.length)>max) return max+1;
    let prev=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++){
      let curr=[i],rowMin=i;
      for(let j=1;j<=b.length;j++){
        curr[j]=Math.min(curr[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
        rowMin=Math.min(rowMin,curr[j]);
      }
      if(rowMin>max)return max+1;
      prev=curr;
    }
    return prev[b.length];
  }
  function scan() {
    const board=typeof getBoardData==='function' ? getBoardData() : {nodes:[],connections:[]};
    const movies=Array.isArray(board.nodes)?board.nodes:[];
    const links=Array.isArray(board.connections)?board.connections:[];
    const byId=new Map(movies.map(n=>[String(n.id),n]));
    const issues=[], warnings=[], appearances=new Map(), ids=new Map(), pairs=new Map(), endpointsByLink=new Map();
    const degrees=new Map(movies.map(n=>[String(n.id),0]));
    const neighbor=new Map(movies.map(n=>[String(n.id),[]]));
    const addIssue=(title,detail,targets)=>issues.push({title,detail,targets:targets||[]});
    function recordActor(production,actor,linkId) {
      if(!production || !String(actor||'').trim()) return;
      const p=norm(production),a=norm(actor),key=p+'|'+a;
      if(!appearances.has(key))appearances.set(key,{production,actor,links:new Set()});
      appearances.get(key).links.add(linkId);
    }
    links.forEach((c,i)=>{
      const lid=String(c.id||'');
      const a=byId.get(String(c.aId)),b=byId.get(String(c.bId));
      if (!lid) addIssue('Missing stored connection ID','Connection #'+(i+1)+' has no stable ID.',[a?.name,b?.name]);
      else if(ids.has(lid))addIssue('Duplicate stored connection ID','Connections #'+(ids.get(lid)+1)+' and #'+(i+1)+' share an ID.',[a?.name,b?.name]);
      else ids.set(lid,i);
      if(!a||!b){addIssue('Connection references a missing movie','Connection #'+(i+1)+' has a missing endpoint.',[a?.name,b?.name]);return;}
      if(String(a.id)===String(b.id))addIssue('Self-connection',a.name+' connects to itself.',[a.name]);
      const key=[String(a.id),String(b.id)].sort().join('|');
      if(pairs.has(key))addIssue('Duplicate movie pair',a.name+' ↔ '+b.name+' is stored more than once.',[a.name,b.name]);
      else pairs.set(key,i);
      degrees.set(String(a.id),(degrees.get(String(a.id))||0)+1);
      degrees.set(String(b.id),(degrees.get(String(b.id))||0)+1);
      neighbor.get(String(a.id)).push(String(b.id));
      neighbor.get(String(b.id)).push(String(a.id));
      const linkKey=lid||'#'+i;
      endpointsByLink.set(linkKey,[a.name,b.name]);
      if(c.type==='shared'){
        recordActor(a.name,c.sharedActor,linkKey);recordActor(b.name,c.sharedActor,linkKey);
        if(!norm(c.sharedActor))addIssue('Missing shared actor',a.name+' ↔ '+b.name+' has an empty actor field.',[a.name,b.name]);
      }else{
        if(!norm(c.bridgeTitle)||!norm(c.leftActor)||!norm(c.rightActor))
          addIssue('Incomplete bridge',a.name+' ↔ '+b.name+' is missing a bridge title or actor.',[a.name,b.name]);
        recordActor(a.name,c.leftActor,linkKey);
        recordActor(c.bridgeTitle,c.leftActor,linkKey);
        recordActor(c.bridgeTitle,c.rightActor,linkKey);
        recordActor(b.name,c.rightActor,linkKey);
      }
    });
    const repeated=[];
    for (const v of appearances.values())if(v.links.size>1){
      repeated.push(v);addIssue('Actor reused from one production',v.actor+' appears in '+v.production+' on '+v.links.size+' connections.',[...v.links].flatMap(id=>endpointsByLink.get(id)||[]));
    }
    const groups=new Map();
    for (const v of appearances.values()){
      const p=norm(v.production);if(!groups.has(p))groups.set(p,[]);
      groups.get(p).push(v);
    }
    const warned=new Set();
    for(const g of groups.values())for(let i=0;i<g.length;i++)for(let j=i+1;j<g.length;j++){
      const a=norm(g[i].actor),b=norm(g[j].actor);
      if(a===b||a.length<7||b.length<7)continue;
      const as=a.split(' '),bs=b.split(' ');
      if(as.length<2||bs.length<2||as[0]!==bs[0]||dist(a,b,2)>2)continue;
      const key=[a,b].sort().join('|')+'|'+norm(g[i].production);
      if(warned.has(key))continue;
      warned.add(key);
      warnings.push({title:'Possible spelling variant',detail:g[i].production+': '+g[i].actor+' / '+g[j].actor+'. Check whether these are the same person.',targets:[...g[i].links,...g[j].links].flatMap(id=>endpointsByLink.get(id)||[])});
    }
    const isolated=movies.filter(n=>!degrees.get(String(n.id)));
    const branches=movies.filter(n=>(degrees.get(String(n.id))||0)>2);
    if(branches.length)addIssue('Branching movies',branches.map(n=>n.name+' ('+degrees.get(String(n.id))+' links)').join('; '),branches.map(n=>n.name));
    const visited=new Set(), components=[];
    for(const movie of movies){
      const id=String(movie.id);if(visited.has(id))continue;
      const pending=[id],part=[];visited.add(id);
      while(pending.length){
        const current=pending.pop();part.push(current);
        for(const other of neighbor.get(current)||[])if(!visited.has(other)){visited.add(other);pending.push(other);}
      }
      components.push(part);
    }
    const cyclic=[];
    for(const part of components){
      const edgeCount=part.reduce((sum,id)=>sum+(degrees.get(id)||0),0)/2;
      if(edgeCount>=part.length && part.length>0)cyclic.push(part);
    }
    if(cyclic.length)addIssue('Circular connection(s)',cyclic.length+' component(s) contain a loop. This is a layout warning, not necessarily an invalid play.',cyclic.flatMap(part=>part.slice(0,2).map(id=>byId.get(id)?.name)));
    if(isolated.length)warnings.push({title:'Unconnected movies',detail:isolated.length+' board movie(s) have no links.',targets:isolated.slice(0,10).map(n=>n.name)});
    const connectedParts=components.filter(part=>part.some(id=>(degrees.get(id)||0)>0));
    if(connectedParts.length>1)warnings.push({title:'Separate movie chains',detail:connectedParts.length+' independent connected chains are present. This is informational, not an error.',targets:connectedParts.map(part=>byId.get(part[0])?.name)});
    const ends=movies.filter(n=>degrees.get(String(n.id))===1);
    return {movies,links,components,ends,issues,warnings,repeated};
  }
  // Cast checks use the same in-game combined cast lookup as Cage Check.
  // Missing records are UNVERIFIED; absent actors in a list are REVIEW, not
  // conclusive proof of an invalid play (credits can be incomplete).
  function verifyConnections() {
    const board=typeof getBoardData==='function' ? getBoardData() : {nodes:[],connections:[]};
    const movies=Array.isArray(board.nodes)?board.nodes:[];
    const links=Array.isArray(board.connections)?board.connections:[];
    const byId=new Map(movies.map(n=>[String(n.id),n]));
    const castLookup=typeof getCombinedCast==='function' ? getCombinedCast : null;
    const results=[];
    function appearance(movie,actor) {
      if(!String(movie||'').trim()||!String(actor||'').trim())
        return {status:'unverified',detail:'Missing production title or actor'};
      if(!castLookup)return {status:'unverified',detail:'Cast records unavailable in this test'};
      let cast;
      try { cast=castLookup(movie); }
      catch(e){return {status:'unverified',detail:'Cast lookup failed'};}
      if(!Array.isArray(cast)||!cast.length)
        return {status:'unverified',detail:'No cast listing available'};
      const found=cast.some(name=>norm(name)===norm(actor));
      return {status:found?'matched':'review',detail:found?'Actor listed in cast data':'Actor not found in available cast list'};
    }
    links.forEach((c,index)=>{
      const a=byId.get(String(c.aId))?.name,b=byId.get(String(c.bId))?.name;
      const label=[a||'(missing movie)',c.type==='shared'?null:c.bridgeTitle,b||'(missing movie)'].filter(Boolean).join(' → ');
      const checks=c.type==='shared'?
        [{production:a,actor:c.sharedActor},{production:b,actor:c.sharedActor}]:
        [{production:a,actor:c.leftActor},{production:c.bridgeTitle,actor:c.leftActor},
         {production:c.bridgeTitle,actor:c.rightActor},{production:b,actor:c.rightActor}];
      const inspected=checks.map(x=>({...x,...appearance(x.production,x.actor)}));
      if(inspected.some(x=>norm(x.actor)==='nicolas cage'))
        inspected.push({production:'Game rule',actor:'Nicolas Cage',status:'review',detail:'Cage cannot be used as the connector actor'});
      const status=inspected.some(x=>x.status==='review')?'review':
        inspected.some(x=>x.status==='unverified')?'unverified':'matched';
      results.push({id:c.id||String(index),label,status,checks:inspected,targets:[a,b].filter(Boolean)});
    });
    return {
      results,
      matched:results.filter(x=>x.status==='matched').length,
      review:results.filter(x=>x.status==='review').length,
      unverified:results.filter(x=>x.status==='unverified').length
    };
  }
  let overlay=null;
  function issueHtml(issue,level){
    return '<div class="ccqc-issue"><strong class="'+(level==='warn'?'ccqc-warning':'')+'">'+esc(issue.title)+'</strong><p>'+esc(issue.detail)+'</p>'+
      [...new Set(issue.targets||[])].filter(Boolean).slice(0,5).map(t=>'<button type="button" data-qc-find="'+esc(t)+'">Find '+esc(t)+'</button>').join('')+'</div>';
  }
  function show(){
    const r=scan();
    const v=verifyConnections();
    if(overlay)overlay.remove();
    overlay=document.createElement('div');overlay.id='ccBoardQcOverlay';
    overlay.innerHTML='<section id="ccBoardQcDialog" role="dialog" aria-modal="true" aria-label="Board quality check">'+
    '<div class="ccqc-top"><h2>✓ BOARD QUALITY CHECK</h2><button type="button" data-qc-close>Close</button></div>'+
    '<div class="ccqc-stats">'+[['Connections',r.links.length],['Board movies',r.movies.length],['Chains / components',r.components.length],['Endpoints',r.ends.length]].map(a=>'<div class="ccqc-stat"><strong>'+a[1]+'</strong>'+a[0]+'</div>').join('')+'</div>'+
    '<p class="ccqc-muted">Read-only scan of the current board. No connections, turns, scores, or cast records are changed.</p>'+
    '<h3>Cast verification (game cast records)</h3>'+
    '<p class="ccqc-muted">Checks each saved actor against both relevant productions (four cast appearances for bridge connections). This is an in-game cast-data check, not independent external research. Missing/incomplete credits require human review.</p>'+
    '<div class="ccqc-stats">'+[['Cast data matches',v.matched],['Needs review',v.review],['Unverified',v.unverified]].map(a=>'<div class="ccqc-stat"><strong>'+a[1]+'</strong>'+esc(a[0])+'</div>').join('')+'</div>'+
    (v.results.length?v.results.filter(x=>x.status!=='matched').map(x=>issueHtml({title:(x.status==='review'?'Review cast: ':'Unverified cast: ')+x.label,detail:x.checks.filter(c=>c.status!=='matched').map(c=>c.production+' / '+c.actor+': '+c.detail).join('; '),targets:x.targets},x.status==='unverified'?'warn':'issue')).join('') || '<p class="ccqc-ok">All saved actor appearances match available cast records.</p>':'<p>No saved connections to check.</p>')+
    '<div class="ccqc-issue"><strong>Independent online cast lookup</strong><p>When the local cast list is missing a credit, check the public Wikipedia cast section. A positive match includes a source link; absent names remain unverified and are never treated as proof of a false connection.</p><button type="button" id="ccQcInternetButton">Check unresolved credits online</button><div id="ccQcInternetResults" aria-live="polite"></div></div>'+
    '<h3>Findings ('+r.issues.length+')</h3>'+(r.issues.length?r.issues.map(x=>issueHtml(x,'issue')).join(''):'<p class="ccqc-ok">✓ No structural or exact-actor reuse problems detected.</p>')+
    '<h3>Review warnings ('+r.warnings.length+')</h3>'+(r.warnings.length?r.warnings.map(x=>issueHtml(x,'warn')).join(''):'<p class="ccqc-ok">✓ No additional review warnings.</p>')+
    '<p class="ccqc-muted">Actor reuse is checked against stored text, including bridge productions. Similar spellings are flagged only when plausible. Cast verification uses the game's existing cast records. The optional online check queries public Wikipedia cast sections for missing or questionable credits; it cannot certify every film credit. No connection is changed. Multiple chains or a loop can be legitimate; they are reported for awareness.</p>'+
    '<div style="text-align:right;margin-top:12px"><button type="button" data-qc-close>Close QC Review</button></div></section>';
    document.body.appendChild(overlay);
    overlay.querySelector('[data-qc-close]').focus();
  }
  function findTitle(title){
    if(!title)return;
    const n=(typeof nodes!=='undefined'?nodes:[]).find(x=>norm(x.name)===norm(title));
    if(!n){show();return;}
    if(typeof clearMovieSearchHighlight==='function')clearMovieSearchHighlight();
    if(n.el){n.el.classList.add('cc-search-match','cc-search-pulse');setTimeout(()=>n.el?.classList.remove('cc-search-pulse'),1400);}
    if(typeof centerOnNode==='function')centerOnNode(n);
    if(typeof setStatus==='function')setStatus('QC found: '+n.name);
  }
  btn.addEventListener('click',()=>{menu.closest('details.tools-menu')?.removeAttribute('open');show();});
  document.addEventListener('click',e=>{
    if(!overlay)return;
    const x=e.target.closest('[data-qc-close]'),f=e.target.closest('[data-qc-find]');
    if(x||e.target===overlay){overlay.remove();overlay=null;return;}
    if(f){const title=f.getAttribute('data-qc-find');overlay.remove();overlay=null;findTitle(title);}
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay){overlay.remove();overlay=null;}});
  window.ccBoardQcScan=scan; // Pure diagnostic helper for regression testing.
  window.ccBoardQcVerifyConnections=verifyConnections; // Diagnostic helper; no writes.
})();