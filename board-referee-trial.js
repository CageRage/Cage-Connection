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
    return {status:verified?'confirmed':'inconclusive'};
  }

  function createObserver({check, notify, defer}) {
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
          const savedLink = current.get(id);
          if ((savedLink.editVersion ?? 0) !== (link.editVersion ?? 0)) return;
          const verdict = check(board,link);
          if (verdict.status === 'incorrect') notify(board,link,verdict);
        });
      }
    };
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = {inspectConnection, createObserver};
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
  function observeBoard() {
    const room = typeof remoteRoomCode === 'string' ? remoteRoomCode : '';
    observe(room || 'local',getBoardData());
  }

  function updateTrial() {
    toggle.textContent = 'Automatic Referee Trial: '+(enabled?'On':'Off');
    toggle.setAttribute('aria-pressed',String(enabled));
    if (!enabled) {
      delete window.ccRefereeObserveBoard;
      observe = undefined;
      return;
    }
    const observer = createObserver({
      check: (board,link) => inspectConnection(board,link,window.ccPublishedCreditSource,window.ccDocumentedBridgeFinding),
      defer: work => setTimeout(() => { if (observe === observer) work(); },0),
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
