/* Cage Connection Board QC: read-only diagnostics, no DB writes or scoring changes. */
(function () {
  'use strict';
  const menu = document.querySelector('.tools-menu-panel');
  if (!menu || document.getElementById('ccBoardQcOpen')) return;
  const btn = document.createElement('button');
  btn.id = 'ccBoardQcOpen';
  btn.type = 'button';
  btn.textContent = 'Verify the Entire Board';
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
    '#ccBoardQcDialog .ccqc-credit{border-top:1px solid #695236;margin-top:8px;padding-top:8px;overflow-wrap:anywhere}',
    '#ccBoardQcDialog .ccqc-credit a{color:#ffe5a8}',
    '#ccBoardQcDialog .ccqc-credit summary{cursor:pointer}',
    '#ccBoardQcDialog .ccqc-credit input{box-sizing:border-box;display:block;width:100%;max-width:28rem;margin:4px 0;padding:6px}',
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
    // Cage-film reuse is prohibited; non-Cage production reuse is etiquette only.
    // Count a board node once even when several connections meet there.
    const cageTitles=new Set((typeof BUILT_IN_TITLES!=='undefined'?BUILT_IN_TITLES:[])
      .concat(typeof extraKnownMovieTitles!=='undefined'?extraKnownMovieTitles:[])
      .map(norm));
    const boardTitles=new Set(movies.map(n=>norm(n.name)).filter(Boolean));
    const usesByTitle=new Map();
    function recordUse(title,kind,connectionId,productionId) {
      const key=norm(title);
      if(!key)return;
      if(!usesByTitle.has(key))usesByTitle.set(key,{title,uses:[]});
      usesByTitle.get(key).uses.push({kind,connectionId,productionId:productionId||''});
    }
    for(const movie of movies)recordUse(movie.name,'board',String(movie.id),'');
    for(const link of links)if(link.type==='bridge') {
      // One bridge production per link, regardless of its two actors.
      const identity=[link.bridgeProductionId,link.bridgeMediaType,link.bridgeYear]
        .map(x=>String(x||'').trim()).filter(Boolean).join('|');
      recordUse(link.bridgeTitle,'bridge',String(link.id||''),identity);
    }
    for(const item of usesByTitle.values()) {
      const total=item.uses.length;
      if(total<2)continue;
      const bridges=item.uses.filter(x=>x.kind==='bridge');
      const boards=item.uses.filter(x=>x.kind==='board');
      const cageFilm=cageTitles.has(norm(item.title))||boardTitles.has(norm(item.title));
      // Titles alone are not enough to distinguish, for example, the
      // Entourage television series from the 2015 theatrical film.
      const distinctIds=new Set(item.uses.map(x=>x.productionId).filter(Boolean));
      const ambiguous=distinctIds.size>1 || (distinctIds.size>0&&item.uses.some(x=>!x.productionId));
      if(ambiguous) {
        warnings.push({title:'Production identity needs review',detail:item.title+
          ' appears '+total+' times under a shared title, but production identifiers differ or are missing. Confirm whether these refer to the same film or television program.',targets:[item.title]});
        continue;
      }
      if(cageFilm) {
        addIssue('Prohibited Cage movie reuse',item.title+' appears '+total+
          ' times as a board movie or bridge. A Nicolas Cage movie may be used only once.',[item.title]);
      } else if(bridges.length>1) {
        warnings.push({title:'Questionable Etiquette — repeated production',
          detail:item.title+' has been used '+bridges.length+
          ' times. Perfectly legal, of course. One does wonder whether you have seen any other films.'+
          (!distinctIds.size?' Confirm that these refer to the same production, not different works sharing a title.':''),
          targets:[item.title]});
      }
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
    if(connectedParts.length>1){
      const chains=connectedParts.map((part,index)=>{
        const endpoints=part.filter(id=>degrees.get(id)===1)
          .map(id=>byId.get(id)?.name).filter(Boolean).sort((a,b)=>a.localeCompare(b));
        return {number:index+1,size:part.length,endpoints};
      });
      warnings.push({
        title:'Separate movie chains',
        detail:connectedParts.length+' independent connected chains are present. The movies listed below are actual endpoints (not arbitrary representatives). This is informational, not an error.',
        chains,
        targets:chains.flatMap(chain=>chain.endpoints)
      });
    }
    const ends=movies.filter(n=>degrees.get(String(n.id))===1);
    return {movies,links,components,ends,issues,warnings,repeated};
  }
  // Cast checks use the same in-game combined cast lookup as Cage Check.
  // Missing records are UNVERIFIED; absent actors in a list are REVIEW, not
  // conclusive proof of an invalid play (credits can be incomplete).
  const confirmationStorageKey='cage-connection-qc-credit-confirmations-v1';
  function readConfirmations() {
    try {
      return new Map(JSON.parse(localStorage.getItem(confirmationStorageKey)||'[]'));
    } catch {
      return new Map();
    }
  }
  function creditSource(value) {
    try {
      const url=new URL(value);
      if(['https:','http:'].includes(url.protocol)&&!url.username&&!url.password)return url.href;
    } catch {
      // The form describes the accepted URL formats.
    }
    return '';
  }
  function confirmationRoom() {
    if(typeof remoteRoomRef==='undefined'||!remoteRoomRef||typeof firebase==='undefined')return null;
    const uid=firebase.auth().currentUser?.uid;
    return uid ? {ref:remoteRoomRef,uid} : null;
  }
  let sharedRoom=null,sharedCredits=new Map(),openRequest=0,sharedStatus='';
  function sharedFor(key) {
    const room=confirmationRoom();
    return room?.ref===sharedRoom?.ref ? sharedCredits.get(key) : null;
  }
  async function loadSharedCredits(room) {
    const snapshot=await withFirebaseTimeout(room.ref.child('qcCreditConfirmations').once('value'));
    const credits=new Map();
    for(const [uid,records] of Object.entries(snapshot.val()||{})){
      for(const [entryId,record] of Object.entries(records||{})){
        const source=creditSource(record?.source);
        if(typeof record?.key!=='string'||!source)continue;
        const own=uid===room.uid;
        if(own||!credits.has(record.key))credits.set(record.key,{source,entryId,own});
      }
    }
    return credits;
  }
  async function openQc() {
    const request=++openRequest,room=confirmationRoom();
    let credits=new Map(),status='';
    if(room){
      try { credits=await loadSharedCredits(room); }
      catch { status='Room confirmations could not be loaded. Reopen Verify the Entire Board to try again.'; }
    }
    if(request!==openRequest||(room?.ref!==confirmationRoom()?.ref))return;
    sharedRoom=room;
    sharedCredits=credits;
    sharedStatus=status;
    show();
  }
  // Title-specific evidence from distributors and film archives.
  const publishedCastEvidence = [
    { title:'The Catcher Was a Spy', year:2018, actors:['Giancarlo Giannini','Guy Pearce'],
      source:'https://www.paramount.com/movies/the-catcher-was-a-spy' },
    { title:'Little Bone Lodge', year:2023, actors:['Sadie Soverall','Joely Richardson'],
      source:'https://scfilmsinternational.com/current-films-live-action-titles/little-bone-lodge/' },
    { title:'Longlegs', year:2024, actors:['Maika Monroe'],
      source:'https://www.neonrated.com/film/longlegs' },
    { title:'Between Worlds', year:2018, actors:['Penelope Mitchell','Franka Potente'],
      source:'https://watch.afi.com/movie/between-worlds-1' },
    { title:'R.I.P.D. 2: Rise of the Damned', year:2022, actors:['Penelope Mitchell','Richard Brake'],
      source:'https://www.universalpicturesathome.com/movies/ripd-2-rise-of-the-damned' },
    { title:'Never on Tuesday', year:1989, actors:['Emilio Estevez','Charlie Sheen','Judd Nelson'],
      source:'https://fest.afi.com/1989/u-s-independent-cinema-1989/never-on-tuesday/' },
    { title:'Wild at Heart', year:1990, actors:['Laura Dern','Sherilyn Fenn','Willem Dafoe','J. E. Freeman'],
      source:'https://www.criterion.com/films/35257-wild-at-heart' },
    { title:'Windtalkers', year:2002, actors:['Mark Ruffalo'],
      source:'https://catalog.afi.com/Film/62640-WINDTALKERS' },
    { title:'Brawl in Cell Block 99', year:2017, actors:['Jennifer Carpenter','Marc Blucas'],
      source:'https://www.netflix.com/title/80208328' },
    { title:'Avatar: The Way of Water', year:2022, actors:['Kate Winslet'],
      source:'https://www.avatar.com/movies/avatar-the-way-of-water' }
  ];

  function publishedCreditSource(title, actor, year, mediaType) {
    if (mediaType && !['film','movie'].includes(String(mediaType).toLowerCase())) return null;
    const production = publishedCastEvidence.find(item => norm(item.title) === norm(title));
    if (!production || (year && Number(year) !== production.year)) return null;
    return production.actors.some(name => norm(name) === norm(actor)) ? production.source : null;
  }

  window.ccPublishedCreditSource = publishedCreditSource;

  const documentedBridgeFindings = [
    { title:'The Godfather', year:1972, actor:'Tilda Swinton', counterpart:'James Caan',
      status:'incorrect', detail:'Tilda Swinton’s first film role was in Caravaggio (1986), fourteen years after The Godfather.',
      source:'https://www.eyefilm.nl/en/whats-on/caravaggio/1468204' },
    { title:'Titanic', year:1997, actor:'Suzanne Somers', alias:'Suzanne Sommers', counterpart:'Kate Winslet',
      status:'review', detail:'The full Titanic (1997) cast listing does not identify Suzanne Somers. An acting appearance still needs evidence.',
      source:'https://www.imdb.com/title/tt0120338/fullcredits/cast' },
    { title:'The Truman Show', year:1998, actor:'Chris Cooper', counterpart:'Matthew Modine',
      affectedActors:['Chris Cooper','Matthew Modine'], status:'incorrect',
      detail:'The full cast credits for The Truman Show (1998) list neither Chris Cooper nor Matthew Modine.',
      source:'https://www.imdb.com/title/tt0120382/fullcredits/cast' }
  ];

  function matchesDocumentedActor(finding, actor) {
    return (finding.affectedActors || [finding.actor,finding.alias])
      .some(name => name && norm(name) === norm(actor));
  }

  function documentedBridgeFinding(link) {
    if (link.type !== 'bridge' || (link.bridgeMediaType &&
        !['film','movie'].includes(String(link.bridgeMediaType).toLowerCase()))) return null;
    const actors = [norm(link.leftActor),norm(link.rightActor)];
    return documentedBridgeFindings.find(finding =>
      norm(finding.title) === norm(link.bridgeTitle) &&
      (link.bridgeYear ? Number(link.bridgeYear) === finding.year : actors.includes(norm(finding.counterpart))) &&
      actors.some(actor => matchesDocumentedActor(finding,actor))) || null;
  }
  window.ccDocumentedBridgeFinding = documentedBridgeFinding;

  function verifyConnections() {
    const board=typeof getBoardData==='function' ? getBoardData() : {nodes:[],connections:[]};
    const movies=Array.isArray(board.nodes)?board.nodes:[];
    const links=Array.isArray(board.connections)?board.connections:[];
    const byId=new Map(movies.map(n=>[String(n.id),n]));
    const castLookup=typeof getCombinedCast==='function' ? getCombinedCast : null;
    const results=[];
    const confirmations=readConfirmations();
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
      const documented = documentedBridgeFinding(c);
      const inspected=checks.map((x,slot)=>{
        const isBridgeCredit=c.type!=='shared'&&(slot===1||slot===2);
        const qualifiers=isBridgeCredit?[c.bridgeMediaType,c.bridgeYear].filter(Boolean):[];
        const result={...x,qualifiers,...appearance(x.production,x.actor)};
        if (isBridgeCredit && documented && matchesDocumentedActor(documented,x.actor)) {
          return {...result,status:'review',source:documented.source,detail:documented.detail,documented:true};
        }
        if(!c.id||!norm(x.production)||!norm(x.actor)||norm(x.actor)==='nicolas cage')return result;
        // Legacy links can lack a year or media type. Keep each attestation tied
        // to its exact saved appearance so ambiguous titles cannot share one.
        const key=JSON.stringify([c.id,c.aId,c.bId,a,b,c.type,c.editVersion??0,slot,
          x.production,x.actor,c.bridgeProductionId??null,c.bridgeMediaType??null,c.bridgeYear??null]);
        const publishedSource = publishedCreditSource(x.production,x.actor,
          isBridgeCredit ? c.bridgeYear : byId.get(String(slot === 0 ? c.aId : c.bId))?.year,
          isBridgeCredit ? c.bridgeMediaType : null);
        if (publishedSource) return {...result,status:'confirmed',source:publishedSource,
          published:true,detail:'Confirmed by a published cast source'};
        const live = window.ccRefereeLiveCredit?.(c,slot,x.production,x.actor);
        if (live?.source) return {...result,status:'confirmed',source:live.source,
          published:true,detail:'Matched by the referee’s live cast lookup'};
        if (live && result.status !== 'matched') {
          result.detail += ' · The live lookup could not confirm this credit.';
        }
        const shared=sharedFor(key);
        const source=shared?.source||creditSource(confirmations.get(key));
        return source ? {...result,key,source,shared,status:'confirmed',
          detail:shared?'Manually confirmed · Shared in this room':'Manually confirmed · This browser'} : {...result,key};
      });
      if(inspected.some(x=>norm(x.actor)==='nicolas cage'))
        inspected.push({production:'Game rule',actor:'Nicolas Cage',status:'review',detail:'Cage cannot be used as the connector actor'});
      const status=inspected.some(x=>x.status==='review')?'review':
        inspected.some(x=>x.status==='unverified')?'unverified':
        inspected.some(x=>x.status==='confirmed')?'confirmed':'matched';
      results.push({id:c.id||String(index),label,status,checks:inspected,targets:[a,b].filter(Boolean)});
    });
    return {
      results,
      matched:results.filter(x=>x.status==='matched').length,
      confirmed:results.filter(x=>x.status==='confirmed').length,
      review:results.filter(x=>x.status==='review').length,
      unverified:results.filter(x=>x.status==='unverified').length
    };
  }
  let overlay=null;
  function issueHtml(issue,level){
    const chainRows=Array.isArray(issue.chains)
      ? issue.chains.map(chain=>{
          const endpoints=chain.endpoints||[];
          const label=endpoints.length ? endpoints.map(esc).join(' ↔ ') : 'No endpoints (loop)';
          return '<div class="ccqc-chain"><strong>Chain '+chain.number+' — '+chain.size+' movies</strong><p>'+label+'</p>'+
            endpoints.map(t=>'<button type="button" data-qc-find="'+esc(t)+'">Find '+esc(t)+'</button>').join('')+'</div>';
        }).join('')
      : [...new Set(issue.targets||[])].filter(Boolean).slice(0,5).map(t=>'<button type="button" data-qc-find="'+esc(t)+'">Find '+esc(t)+'</button>').join('');
    return '<div class="ccqc-issue"><strong class="'+(level==='warn'?'ccqc-warning':'')+'">'+esc(issue.title)+'</strong><p>'+esc(issue.detail)+'</p>'+chainRows+(issue.credits||'')+'</div>';
  }
  function creditHtml(check) {
    const qualifiers=check.qualifiers?.length?' ('+check.qualifiers.map(esc).join(', ')+')':'';
    const label=esc(check.production||'(missing title)')+qualifiers+' / '+esc(check.actor||'(missing actor)');
    const detail='<p>'+label+' — '+esc(check.detail)+'</p>';
    if(check.documented)return '<div class="ccqc-credit">'+detail+
      '<a href="'+esc(check.source)+'" target="_blank" rel="noopener noreferrer">Cast evidence</a></div>';
    if(check.published)return '<div class="ccqc-credit">'+detail+
      '<a href="'+esc(check.source)+'" target="_blank" rel="noopener noreferrer">Published cast source</a></div>';
    if(check.status==='confirmed')return '<div class="ccqc-credit">'+detail+
      '<a href="'+esc(check.source)+'" target="_blank" rel="noopener noreferrer">Source</a> '+
      (check.shared&&!check.shared.own?'':'<button type="button" data-qc-unconfirm="'+esc(check.key)+'">Remove confirmation</button>')+
      (!check.shared&&confirmationRoom()?'<button type="button" data-qc-share="'+esc(check.key)+'">Share with room</button>':'')+
      '<p role="status"></p></div>';
    if(!check.key)return '<div class="ccqc-credit">'+detail+'</div>';
    return '<div class="ccqc-credit">'+detail+
      '<details><summary>Confirm credit</summary><form data-qc-confirm="'+esc(check.key)+'">'+
      '<label>Source URL<input type="url" name="source" required maxlength="2048" placeholder="https://"></label>'+
      '<button type="submit">'+(confirmationRoom()?'Save to room':'Save confirmation')+'</button><p role="status"></p></form></details></div>';
  }
  async function changeSharedCredit(room,key,source,entryId,status,button){
    button.disabled=true;
    status.textContent=source?'Saving to room…':'Removing from room…';
    try {
      if(!entryId){
        const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));
        entryId=Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
      }
      if(confirmationRoom()?.ref!==room.ref)throw Error('Room changed');
      const ref=room.ref.child('qcCreditConfirmations').child(room.uid).child(entryId);
      await withFirebaseTimeout(ref.set(source?{key,source}:null));
    }catch{
      status.textContent='The room did not confirm the change. Reopen Verify the Entire Board to check.';
      button.disabled=false;
      return;
    }
    if(!overlay?.contains(status)||confirmationRoom()?.ref!==room.ref)return;
    let credits;
    try { credits=await loadSharedCredits(room); }
    catch {
      status.textContent='Change saved. Reopen Verify the Entire Board to reload the room confirmations.';
      return;
    }
    if(!overlay?.contains(status)||confirmationRoom()?.ref!==room.ref)return;
    sharedCredits=credits;
    sharedStatus='';
    show(overlay.querySelector('#ccBoardQcDialog').scrollTop);
  }
  function saveConfirmation(key,source,status,button,shareLocal=false) {
    const check=verifyConnections().results.flatMap(link=>link.checks).find(credit=>credit.key===key);
    const room=confirmationRoom();
    const canShareLocal=shareLocal&&room&&check?.status==='confirmed'&&!check.shared;
    if(!check||(!canShareLocal&&(source ? !['review','unverified'].includes(check.status) : check.status!=='confirmed'))) {
      status.textContent='This credit changed. Reopen Verify the Entire Board and try again.';
      return;
    }
    if(room&&(source||canShareLocal||check.shared)){
      if(room.ref!==sharedRoom?.ref||(!source&&!canShareLocal&&!check.shared?.own)){
        status.textContent='Reopen Verify the Entire Board to refresh room confirmations.';
        return;
      }
      changeSharedCredit(room,key,canShareLocal?check.source:source,check.shared?.entryId,status,button);
      return;
    }
    const confirmations=readConfirmations();
    if(source)confirmations.set(key,source);
    else confirmations.delete(key);
    try {
      localStorage.setItem(confirmationStorageKey,JSON.stringify([...confirmations]));
    } catch {
      status.textContent='This browser could not save the confirmation.';
      return;
    }
    show(overlay.querySelector('#ccBoardQcDialog').scrollTop);
  }
  function exportIndependentVerification() {
    const board = getBoardData();
    const report = verifyConnections();
    const payload = {
      format: 'cage-connection-independent-verification',
      version: 1,
      exportedAt: new Date().toISOString(),
      board: {
        nodes: board.nodes.map(({id,name}) => ({id,name})),
        connections: board.connections.map(({id,aId,bId,type,bridgeTitle,leftActor,rightActor,
          sharedActor,bridgeProductionId,bridgeMediaType,bridgeYear,editVersion}) => ({
          id,aId,bId,type,bridgeTitle,leftActor,rightActor,sharedActor,
          bridgeProductionId,bridgeMediaType,bridgeYear,editVersion
        }))
      },
      castReview: report.results.map(({id,label,checks}) => ({
        id,label,checks:checks.map(({production,actor,status,source,qualifiers}) => ({
          production,actor,status,source,qualifiers
        }))
      }))
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cage-connection-independent-verification.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  }

  function boardVerdict(structure, cast) {
    const count = structure.movies.length;
    if (!count) return 'No board to verify.';
    const fullLoop = count >= 3 && structure.components.length === 1 &&
      structure.ends.length === 0 && structure.links.length === count &&
      !structure.issues.some(issue => issue.title === 'Branching movies');
    if (!fullLoop) return 'Win conditions not met: the board is not one complete loop.';
    const otherIssues = structure.issues.filter(issue => issue.title !== 'Circular connection(s)');
    const badConnector = cast.results.some(link => link.checks.some(check => check.production === 'Game rule'));
    if (otherIssues.length || badConnector) return 'Full loop found. Resolve the rule findings before claiming a win.';
    if (cast.review || cast.unverified) return 'Full loop found. Win unverified: cast credits still need review.';
    return 'Full loop found. All saved links pass the available cast and rule checks.';
  }

  function show(scrollTop=0){
    const r=scan();
    const v=verifyConnections();
    if(overlay)overlay.remove();
    overlay=document.createElement('div');overlay.id='ccBoardQcOverlay';
    overlay.innerHTML='<section id="ccBoardQcDialog" role="dialog" aria-modal="true" aria-label="Verify the Entire Board">'+
    '<div class="ccqc-top"><h2>VERIFY THE ENTIRE BOARD</h2><button type="button" data-qc-export>Export for Independent Verification</button><button type="button" data-qc-close>Close</button></div>'+
    '<div class="ccqc-stats">'+[['Connections',r.links.length],['Board movies',r.movies.length],['Chains / components',r.components.length],['Endpoints',r.ends.length]].map(a=>'<div class="ccqc-stat"><strong>'+a[1]+'</strong>'+a[0]+'</div>').join('')+'</div>'+
    '<p class="ccqc-muted">'+(confirmationRoom()?'New confirmations are shared with players in this room. Only the player who shared a confirmation can remove it.':'Confirmations are saved in this browser.')+'</p>'+
    '<p role="status"><strong>'+esc(boardVerdict(r,v))+'</strong></p>'+
    (sharedStatus?'<p role="status">'+esc(sharedStatus)+'</p>':'')+
    '<div class="ccqc-issue"><strong>Online cast lookup</strong><div id="ccQcInternetResults" aria-live="polite"></div><button type="button" id="ccQcInternetButton">Start extended Wikipedia lookup</button></div>'+
    '<h3>Cast verification (game cast records)</h3>'+
    '<p class="ccqc-muted">Checks each saved actor against both relevant productions (four cast appearances for bridge connections). For credits that need review, save a source link after you verify the specific movie or show.</p>'+
    '<div class="ccqc-stats">'+[['Cast data matches',v.matched],['Source-confirmed links',v.confirmed],['Needs review',v.review],['Unverified',v.unverified]].map(a=>'<div class="ccqc-stat"><strong>'+a[1]+'</strong>'+esc(a[0])+'</div>').join('')+'</div>'+
    (v.results.length?v.results.filter(x=>x.status!=='matched').map(x=>issueHtml({
      title:({review:'Review cast',unverified:'Unverified cast',confirmed:'Source-confirmed'})[x.status]+': '+x.label,
      detail:'',targets:x.targets,credits:x.checks.filter(c=>c.status!=='matched').map(creditHtml).join('')
    },x.status==='unverified'?'warn':'issue')).join('') || '<p class="ccqc-ok">All saved actor appearances match available cast records.</p>':'<p>No saved connections to check.</p>')+
    '<h3>Findings ('+r.issues.length+')</h3>'+(r.issues.length?r.issues.map(x=>issueHtml(x,'issue')).join(''):'<p class="ccqc-ok">✓ No structural or exact-actor reuse problems detected.</p>')+
    '<h3>Review warnings ('+r.warnings.length+')</h3>'+(r.warnings.length?r.warnings.map(x=>issueHtml(x,'warn')).join(''):'<p class="ccqc-ok">✓ No additional review warnings.</p>')+
    '<p class="ccqc-muted">Actor reuse is checked against stored text, including bridge productions. Similar spellings are flagged only when plausible. Cast verification uses the existing game cast records. The optional extended lookup queries public Wikipedia cast sections for missing or questionable credits; it cannot certify every film credit. No connection is changed. Multiple chains or a loop can be legitimate; they are reported for awareness.</p>'+
    '<div style="text-align:right;margin-top:12px"><button type="button" data-qc-close>Close QC Review</button></div></section>';
    document.body.appendChild(overlay);
    overlay.querySelector('[data-qc-close]').focus({preventScroll:true});
    overlay.querySelector('#ccBoardQcDialog').scrollTop=scrollTop;
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
  btn.addEventListener('click',()=>{menu.closest('details.tools-menu')?.removeAttribute('open');void openQc();});
  document.addEventListener('submit',e=>{
    const form=e.target.closest('[data-qc-confirm]');
    if(!overlay?.contains(form))return;
    e.preventDefault();
    const status=form.querySelector('[role="status"]');
    const source=creditSource(new FormData(form).get('source'));
    if(!source){status.textContent='Enter an HTTP or HTTPS source URL.';return;}
    saveConfirmation(form.dataset.qcConfirm,source,status,form.querySelector('[type="submit"]'));
  });
  document.addEventListener('click',e=>{
    if(!overlay)return;
    if(e.target.closest('[data-qc-export]')){exportIndependentVerification();return;}
    const x=e.target.closest('[data-qc-close]'),f=e.target.closest('[data-qc-find]');
    const remove=e.target.closest('[data-qc-unconfirm]');
    const share=e.target.closest('[data-qc-share]');
    if(remove||share){
      const button=remove||share;
      saveConfirmation(remove?remove.dataset.qcUnconfirm:share.dataset.qcShare,'',
        button.parentElement.querySelector('[role="status"]'),button,Boolean(share));
      return;
    }
    if(x||e.target===overlay){overlay.remove();overlay=null;return;}
    if(f){const title=f.getAttribute('data-qc-find');overlay.remove();overlay=null;findTitle(title);}
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay){overlay.remove();overlay=null;}});
  window.ccBoardQcScan=scan; // Pure diagnostic helper for regression testing.
  window.ccBoardQcVerifyConnections=verifyConnections; // Diagnostic helper; no writes.
})();