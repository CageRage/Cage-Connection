/* Read-only referee trial. Enable per browser with ?referee=trial. */
(function () {
  'use strict';

  function inspectConnection(board, link, sourceFor, documentedFinding) {
    const movie = id => board.nodes.find(node => node.id === id)?.name;
    const a = movie(link.aId), b = movie(link.bId);
    const credits = link.type === 'shared'
      ? [{title:a, actor:link.sharedActor}, {title:b, actor:link.sharedActor}]
      : [{title:a, actor:link.leftActor},
         {title:link.bridgeTitle, actor:link.leftActor, year:link.bridgeYear, type:link.bridgeMediaType},
         {title:link.bridgeTitle, actor:link.rightActor, year:link.bridgeYear, type:link.bridgeMediaType},
         {title:b, actor:link.rightActor}];
    if (credits.some(credit => String(credit.actor || '').trim().toLowerCase() === 'nicolas cage')) {
      return {status:'incorrect', reason:'Nicolas Cage cannot be the connecting actor.'};
    }
    const finding = documentedFinding?.(link);
    if (finding?.status === 'incorrect') {
      return {status:'incorrect',reason:finding.detail,source:finding.source};
    }
    const verified = credits.every(credit => credit.title && credit.actor &&
      sourceFor?.(credit.title,credit.actor,credit.year,credit.type));
    return {status:verified?'confirmed':'inconclusive',credits};
  }

  async function checkBeforeSave(board,link,published,documented,lookUp) {
    const verdict = inspectConnection(board,link,published,documented);
    if (verdict.status === 'incorrect') return verdict.reason;
    if (verdict.status === 'confirmed') return '';
    const checks = await Promise.all(verdict.credits.map(async credit => {
      try {
        return published?.(credit.title,credit.actor,credit.year,credit.type) ||
          await lookUp?.(credit);
      } catch {
        return null;
      }
    }));
    const missing = verdict.credits.filter((_,index) => !checks[index])
      .map(credit => credit.actor+' in '+credit.title);
    return missing.length ? 'Connection not saved. Could not verify '+[...new Set(missing)].join('; ')+'.' : '';
  }

  function createObserver({check, notify, defer, research, record}) {
    let researchQueue = Promise.resolve();
    let scope, current = new Map(), generation = 0;

    return function observe(nextScope, board) {
      const next = new Map(board.connections.map(link => [link.id,link]));
      if (scope !== nextScope) {
        scope = nextScope;
        generation++;
        current = next;
        return;
      }
      const previous = current;
      current = next;
      const activeGeneration = generation;
      for (const [id,link] of next) {
        if (previous.has(id)) continue;
        defer(() => {
          if (generation !== activeGeneration || !current.has(id)) return;
          const isCurrent = () => generation === activeGeneration && current.has(id) &&
            (current.get(id).editVersion ?? 0) === (link.editVersion ?? 0);
          if (!isCurrent()) return;
          const verdict = check(board,link);
          if (verdict.status === 'incorrect') notify(board,link,verdict);
          if (verdict.status !== 'inconclusive' || !research) return;
          researchQueue = researchQueue.then(async () => {
            if (!isCurrent()) return;
            const results = await research(verdict.credits,isCurrent);
            if (isCurrent()) record?.(nextScope,link,results);
          }).catch(() => {});
        });
      }
    };
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = {inspectConnection, createObserver, checkBeforeSave};
    return;
  }
  if (typeof getBoardData !== 'function') return;
  const menu = document.querySelector('.tools-menu-panel');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  const setting = 'cage-connection-referee-trial';
  const linkedTrial = new URLSearchParams(location.search).get('referee') === 'trial';
  let enabled = linkedTrial;
  try {
    enabled ||= localStorage.getItem(setting) === 'on';
  } catch {}

  let observe;
  const liveResults = new Map();
  const roomScope = () => (typeof remoteRoomCode === 'string' && remoteRoomCode) || 'local';
  const resultKey = (scope,link) => JSON.stringify([scope,link.id,link.editVersion ?? 0]);
  window.ccRefereeLiveCredit = (link,slot,title,actor) => {
    const result = liveResults.get(resultKey(roomScope(),link))?.[slot];
    return result?.title === title && result.actor === actor ? result : null;
  };
  function observeBoard() {
    observe(roomScope(),getBoardData());
  }

  function updateTrial() {
    toggle.textContent = 'Automatic Referee Trial: '+(enabled?'On':'Off');
    toggle.setAttribute('aria-pressed',String(enabled));
    if (!enabled) {
      delete window.ccRefereeObserveBoard;
      delete window.ccRefereeCheckBeforeSave;
      observe = undefined;
      return;
    }
    const observer = createObserver({
      check: (board,link) => inspectConnection(board,link,window.ccPublishedCreditSource,window.ccDocumentedBridgeFinding),
      defer: work => setTimeout(() => { if (observe === observer) work(); },0),
      research: async (credits,isCurrent) => {
        const results = [];
        for (const credit of credits) {
          if (observe !== observer || !isCurrent()) break;
          const source = window.ccPublishedCreditSource?.(credit.title,credit.actor,credit.year,credit.type) ||
            await window.ccLookupLiveCastCredit?.(credit);
          results.push({...credit,source:source || null});
        }
        return results;
      },
      record: (scope,link,results) => {
        if (observe !== observer) return;
        liveResults.set(resultKey(scope,link),results);
        if (liveResults.size > 256) liveResults.delete(liveResults.keys().next().value);
      },
      notify: (board,link,verdict) => {
        const name = id => board.nodes.find(movie => movie.id === id)?.name || 'Unknown movie';
        const notice = document.createElement('p');
        notice.setAttribute('role','status');
        notice.textContent = 'Referee trial: '+name(link.aId)+' to '+name(link.bId)+'. '+verdict.reason;
        if (verdict.source) {
          const source = document.createElement('a');
          source.href = verdict.source;
          source.target = '_blank';
          source.rel = 'noopener noreferrer';
          source.textContent = 'Cast evidence';
          notice.append(' ',source);
        }
        document.getElementById('boardConnectionStatus')?.insertAdjacentElement('afterend',notice);
      }
    });
    observe = observer;
    window.ccRefereeObserveBoard = observeBoard;
    window.ccRefereeCheckBeforeSave = (a,b,draft) => checkBeforeSave(
      {nodes:[a,b]}, {...draft,aId:a.id,bId:b.id},
      window.ccPublishedCreditSource,window.ccDocumentedBridgeFinding,window.ccLookupLiveCastCredit
    );
    observeBoard();
  }

  toggle.addEventListener('click',() => {
    enabled = !enabled;
    try { localStorage.setItem(setting,enabled?'on':'off'); } catch {}
    const url = new URL(location.href);
    if (!enabled && url.searchParams.has('referee')) {
      url.searchParams.delete('referee');
      history.replaceState(history.state,'',url);
    }
    updateTrial();
  });
  menu?.appendChild(toggle);
  updateTrial();
})();
