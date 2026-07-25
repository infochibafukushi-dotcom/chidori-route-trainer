(() => {
  const POP_HISTORY_KEY = 'studyMaterialPop';

  let popOpen = false;
  let popReturnFocus = null;
  let savedScrollY = 0;
  let historyPushed = false;
  let ignoreNextPopstate = false;
  let popKeyHandler = null;
  let popFocusTrapHandler = null;
  let openMaterialId = null;

  function materials() {
    return Array.isArray(window.STUDY_MATERIALS) ? window.STUDY_MATERIALS : [];
  }

  function findMaterial(id) {
    return materials().find((item) => item.id === id) || null;
  }

  function materialIndex(id) {
    return materials().findIndex((item) => item.id === id);
  }

  function blockClass(type) {
    if (type === 'heading') return 'study-heading';
    if (type === 'label') return 'study-label';
    if (type === 'sublabel') return 'study-sublabel';
    if (type === 'note') return 'study-note';
    return 'study-text';
  }

  function renderBlocks(blocks) {
    return (blocks || []).map((block) => {
      const cls = blockClass(block.type);
      return `<div class="${cls}">${esc(block.text || '')}</div>`;
    }).join('');
  }

  function isPopOpen() {
    return popOpen;
  }

  function getFocusable(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter((el) => el.offsetParent !== null || el === document.activeElement);
  }

  function lockBackgroundScroll() {
    savedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.classList.add('study-pop-open');
    document.body.style.top = `-${savedScrollY}px`;
  }

  function unlockBackgroundScroll() {
    document.body.classList.remove('study-pop-open');
    document.body.style.top = '';
    window.scrollTo(0, savedScrollY);
  }

  function removePopDom() {
    document.getElementById('studyMaterialPop')?.remove();
  }

  function detachPopListeners() {
    if (popKeyHandler) {
      document.removeEventListener('keydown', popKeyHandler, true);
      popKeyHandler = null;
    }
    if (popFocusTrapHandler) {
      document.removeEventListener('keydown', popFocusTrapHandler, true);
      popFocusTrapHandler = null;
    }
  }

  function closePop(options = {}) {
    const fromPopstate = !!options.fromPopstate;
    if (!popOpen) return;

    popOpen = false;
    openMaterialId = null;
    detachPopListeners();
    removePopDom();
    unlockBackgroundScroll();

    const returnEl = popReturnFocus;
    popReturnFocus = null;
    if (returnEl && typeof returnEl.focus === 'function') {
      try {
        returnEl.focus({ preventScroll: true });
      } catch (_) {
        try { returnEl.focus(); } catch (__) { /* ignore */ }
      }
    }

    if (!fromPopstate && historyPushed) {
      historyPushed = false;
      ignoreNextPopstate = true;
      history.back();
      return;
    }
    historyPushed = false;
  }

  function openPop(id, triggerEl) {
    const material = findMaterial(id);
    if (!material) return;

    if (popOpen) {
      closePop({ fromPopstate: true });
      historyPushed = false;
    }

    const index = materialIndex(id);
    const numberLabel = index >= 0 ? String(index + 1) : '';
    const titleId = 'studyPopTitle';
    const bodyHtml = renderBlocks(material.blocks);

    popReturnFocus = triggerEl || document.activeElement;
    openMaterialId = id;
    lockBackgroundScroll();

    removePopDom();
    const root = document.createElement('div');
    root.id = 'studyMaterialPop';
    root.className = 'study-pop-root';
    root.innerHTML =
      `<div class="study-pop-overlay" data-study-pop-dismiss="1"></div>` +
      `<div class="study-pop-panel" role="dialog" aria-modal="true" aria-labelledby="${titleId}">` +
      `<header class="study-pop-header">` +
      `<div class="study-pop-header-text">` +
      (numberLabel ? `<p class="study-pop-number">資料 ${esc(numberLabel)}</p>` : '') +
      `<h2 class="study-pop-title" id="${titleId}">${esc(material.title)}</h2>` +
      `</div>` +
      `<button type="button" class="study-pop-close-x" id="studyPopCloseX" aria-label="閉じる">×</button>` +
      `</header>` +
      `<div class="study-pop-body" id="studyPopBody" tabindex="-1">${bodyHtml}</div>` +
      `<footer class="study-pop-footer">` +
      `<button type="button" class="study-pop-close-btn" id="studyPopCloseBtn" aria-label="閉じる">閉じる</button>` +
      `</footer>` +
      `</div>`;

    document.body.appendChild(root);
    popOpen = true;

    const bodyEl = document.getElementById('studyPopBody');
    if (bodyEl) bodyEl.scrollTop = 0;

    const panel = root.querySelector('.study-pop-panel');
    const closeX = document.getElementById('studyPopCloseX');
    const closeBtn = document.getElementById('studyPopCloseBtn');

    closeX?.addEventListener('click', () => closePop());
    closeBtn?.addEventListener('click', () => closePop());
    root.querySelector('[data-study-pop-dismiss]')?.addEventListener('click', () => closePop());
    panel?.addEventListener('click', (event) => event.stopPropagation());

    popKeyHandler = (event) => {
      if (!popOpen) return;
      if (event.key === 'Escape' || event.key === 'Esc') {
        event.preventDefault();
        event.stopPropagation();
        closePop();
      }
    };
    document.addEventListener('keydown', popKeyHandler, true);

    popFocusTrapHandler = (event) => {
      if (!popOpen || event.key !== 'Tab') return;
      const focusables = getFocusable(panel);
      if (!focusables.length) {
        event.preventDefault();
        closeX?.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !panel.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', popFocusTrapHandler, true);

    try {
      history.pushState({ [POP_HISTORY_KEY]: id }, '');
      historyPushed = true;
    } catch (_) {
      historyPushed = false;
    }

    closeX?.focus();
  }

  window.addEventListener('popstate', () => {
    if (ignoreNextPopstate) {
      ignoreNextPopstate = false;
      return;
    }
    if (popOpen) {
      closePop({ fromPopstate: true });
    }
  });

  function bindHeaderBackGuard() {
    const back = document.getElementById('back');
    if (!back || back.dataset.studyPopGuard === '1') return;
    back.dataset.studyPopGuard = '1';
    back.addEventListener('click', (event) => {
      if (!isPopOpen()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closePop();
    }, true);
  }

  function openDetail(id) {
    studyMaterialId = id;
    go('materials-detail');
  }

  function renderList() {
    if (popOpen) {
      closePop({ fromPopstate: true });
      historyPushed = false;
    }
    studyMaterialId = null;
    const items = materials().map((item, index) => (
      `<button type="button" class="menu study-material-item" data-material-id="${esc(item.id)}">` +
      `<strong>${index + 1}. ${esc(item.title)}</strong>` +
      `<span>タップして本文を表示</span>` +
      `</button>`
    )).join('');

    shell(
      `<section class="study-materials">` +
      `<h2 class="study-page-title">基本研修資料</h2>` +
      `<p class="study-page-lead">乗務員向けの作業マニュアル・案内用語</p>` +
      `<div class="study-list">${items || '<div class="empty">資料がありません。</div>'}</div>` +
      `</section>`
    );

    bindHeaderBackGuard();

    document.querySelectorAll('[data-material-id]').forEach((button) => {
      button.addEventListener('click', () => {
        openPop(button.getAttribute('data-material-id'), button);
      });
    });
  }

  function renderDetail() {
    const material = findMaterial(studyMaterialId);
    if (!material) {
      go('materials');
      return;
    }

    shell(
      `<section class="study-materials study-detail">` +
      `<h2 class="study-doc-title">${esc(material.title)}</h2>` +
      `<div class="study-body">${renderBlocks(material.blocks)}</div>` +
      `<button type="button" class="secondary study-back-list" id="studyBackList">一覧に戻る</button>` +
      `</section>`,
      'materials'
    );

    document.getElementById('studyBackList')?.addEventListener('click', () => go('materials'));
  }

  window.renderStudyMaterials = function renderStudyMaterials() {
    if (page === 'materials') {
      renderList();
      return;
    }
    if (page === 'materials-detail') {
      renderDetail();
    }
  };

  window.__chidoriStudyMaterialsPop = {
    isOpen: isPopOpen,
    open: openPop,
    close: closePop,
    openMaterialId: () => openMaterialId,
  };

  // Keep openDetail available for any legacy callers / debug.
  window.__chidoriOpenStudyMaterialDetail = openDetail;
})();
