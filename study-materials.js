(() => {
  const POP_HISTORY_KEY = 'studyMaterialPop';

  const STROLLER_SLIDES = [
    {
      src: 'assets/study-materials/stroller/stroller-01-arrival.png',
      alt: 'ベビーカー利用客の乗降マニュアル バス停に着車した時',
    },
    {
      src: 'assets/study-materials/stroller/stroller-02-after-boarding.png',
      alt: 'ベビーカー利用客の乗降マニュアル 利用者が乗車した後',
    },
    {
      src: 'assets/study-materials/stroller/stroller-03-fare-payment.png',
      alt: 'ベビーカー利用客の乗降マニュアル 運賃の支払い案内',
    },
    {
      src: 'assets/study-materials/stroller/stroller-04-departure.png',
      alt: 'ベビーカー利用客の乗降マニュアル バス停発車時',
    },
    {
      src: 'assets/study-materials/stroller/stroller-05-alighting.png',
      alt: 'ベビーカー利用客の乗降マニュアル 降車バス停に着車した時',
    },
    {
      src: 'assets/study-materials/stroller/stroller-06-handling-rules.png',
      alt: 'ベビーカーの取扱い方法と取扱いできない場合',
    },
  ];

  const WHEELCHAIR_SLIDES = [
    {
      src: 'assets/study-materials/wheelchair/wheelchair-01-departure-check.png',
      alt: '車椅子客乗降時の作業マニュアル 発車時対応と車両操作',
    },
    {
      src: 'assets/study-materials/wheelchair/wheelchair-02-boarding.png',
      alt: '車椅子客乗降時の作業マニュアル 乗車時対応',
    },
    {
      src: 'assets/study-materials/wheelchair/wheelchair-03-alighting.png',
      alt: '車椅子客乗降時の作業マニュアル 降車時対応',
    },
  ];

  const MIC_GUIDE_SLIDES = [
    {
      src: 'assets/study-materials/mic-guide/mic-guide-01-start-terminal.png',
      alt: 'マイク案内の基本的な用語 起点での案内と終点案内',
    },
    {
      src: 'assets/study-materials/mic-guide/mic-guide-02-safety-guidance.png',
      alt: 'マイク案内の基本的な用語 注意喚起と案内',
    },
  ];

  const BICYCLE_SLIDES = [
    {
      src: 'assets/study-materials/bicycle/bicycle-accident-prevention-three-principles.png',
      alt: '自転車事故防止の三原則',
    },
  ];

  const DRIVER_HEALTH_SLIDES = [
    {
      src: 'assets/study-materials/driver-health/driver-health-emergency-response.png',
      alt: '運行中に体調の異変を感じた時の対応',
    },
  ];

  const ACCIDENT_RESPONSE_SLIDES = [
    {
      src: 'assets/study-materials/accident-response/accident-response-guide.png',
      alt: '事故発生時の処置',
    },
  ];

  const BUS_HIJACKING_SLIDES = [
    {
      src: 'assets/study-materials/bus-hijacking/bus-hijacking-response-manual.png',
      alt: 'バスジャック対応マニュアル',
    },
  ];

  const INTERSECTION_TURNING_SLIDES = [
    {
      src: 'assets/study-materials/intersection-turning/intersection-turning-safety-guide.png',
      alt: '交差点右左折時の実践要領',
    },
  ];

  const PASSENGER_INJURY_PREVENTION_SLIDES = [
    {
      src: 'assets/study-materials/passenger-injury-prevention/passenger-injury-prevention-guide.png',
      alt: '車内事故防止の徹底',
    },
  ];

  const START_END_ROLL_CALL_SLIDES = [
    {
      src: 'assets/study-materials/start-end-roll-call/start-end-roll-call-guide.png',
      alt: '始業・終業点呼の手順',
    },
  ];

  const PRE_TRIP_INSPECTION_SLIDES = [
    {
      src: 'assets/study-materials/pre-trip-inspection/pre-trip-inspection-01.png',
      alt: '始業点検の手順 1ページ目（準備・①〜④）',
    },
    {
      src: 'assets/study-materials/pre-trip-inspection/pre-trip-inspection-02.png',
      alt: '始業点検の手順 2ページ目（⑤〜⑨）',
    },
    {
      src: 'assets/study-materials/pre-trip-inspection/pre-trip-inspection-03.png',
      alt: '始業点検の手順 3ページ目（⑩車内・点検後・点呼）',
    },
  ];

  const BUS_STOP_DEPARTURE_SLIDES = [
    {
      src: 'assets/study-materials/bus-stop-departure/bus-stop-departure-safety.png',
      alt: '停留所発進時の安全習慣',
    },
  ];

  const BUS_STOP_ARRIVAL_SLIDES = [
    {
      src: 'assets/study-materials/bus-stop-arrival/bus-stop-arrival-safety-01.png',
      alt: '停留所到着時の安全習慣 1ページ目（予告・確認・減速）',
    },
    {
      src: 'assets/study-materials/bus-stop-arrival/bus-stop-arrival-safety-02.png',
      alt: '停留所到着時の安全習慣 2ページ目（左寄せ・停車・サイドブレーキ）',
    },
  ];

  const MATERIAL_SLIDES = {
    stroller: STROLLER_SLIDES,
    wheelchair: WHEELCHAIR_SLIDES,
    'mic-guide': MIC_GUIDE_SLIDES,
    'bicycle-accident-prevention': BICYCLE_SLIDES,
    'driver-health-emergency-response': DRIVER_HEALTH_SLIDES,
    'accident-response-guide': ACCIDENT_RESPONSE_SLIDES,
    'bus-hijacking-response-manual': BUS_HIJACKING_SLIDES,
    'intersection-turning-safety-guide': INTERSECTION_TURNING_SLIDES,
    'passenger-injury-prevention-guide': PASSENGER_INJURY_PREVENTION_SLIDES,
    'start-end-roll-call-guide': START_END_ROLL_CALL_SLIDES,
    'pre-trip-inspection-procedure': PRE_TRIP_INSPECTION_SLIDES,
    'bus-stop-departure-safety': BUS_STOP_DEPARTURE_SLIDES,
    'bus-stop-arrival-safety': BUS_STOP_ARRIVAL_SLIDES,
  };

  let popOpen = false;
  let popReturnFocus = null;
  let savedScrollY = 0;
  let historyPushed = false;
  let ignoreNextPopstate = false;
  let popKeyHandler = null;
  let popFocusTrapHandler = null;
  let openMaterialId = null;
  let slideIndex = 0;
  let slideMode = false;
  let activeSlides = [];

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
    slideMode = false;
    slideIndex = 0;
    activeSlides = [];
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

  function attachCommonPopChrome(root, panel, { onEscapeExtra } = {}) {
    const closeX = document.getElementById('studyPopCloseX');
    closeX?.addEventListener('click', () => closePop());
    root.querySelector('[data-study-pop-dismiss]')?.addEventListener('click', () => closePop());
    panel?.addEventListener('click', (event) => event.stopPropagation());

    popKeyHandler = (event) => {
      if (!popOpen) return;
      if (event.key === 'Escape' || event.key === 'Esc') {
        event.preventDefault();
        event.stopPropagation();
        closePop();
        return;
      }
      if (typeof onEscapeExtra === 'function') onEscapeExtra(event);
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
      history.pushState({ [POP_HISTORY_KEY]: openMaterialId }, '');
      historyPushed = true;
    } catch (_) {
      historyPushed = false;
    }

    closeX?.focus();
  }

  function beginPop(material, triggerEl) {
    if (popOpen) {
      closePop({ fromPopstate: true });
      historyPushed = false;
    }
    popReturnFocus = triggerEl || document.activeElement;
    openMaterialId = material.id;
    lockBackgroundScroll();
    removePopDom();
  }

  function preloadSlides(slides) {
    slides.forEach((slide) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = slide.src;
    });
  }

  function updateSlideView() {
    const slides = activeSlides;
    const slide = slides[slideIndex];
    const img = document.getElementById('studySlideImage');
    const pageLabel = document.getElementById('studySlidePage');
    const stage = document.getElementById('studyPopBody');
    const prevBtn = document.getElementById('studySlidePrev');
    const nextBtn = document.getElementById('studySlideNext');
    if (!slide || !img || !pageLabel || !prevBtn || !nextBtn) return;

    img.src = slide.src;
    img.alt = slide.alt;
    pageLabel.textContent = `${slideIndex + 1} / ${slides.length}`;
    if (stage) stage.scrollTop = 0;

    const atFirst = slideIndex <= 0;
    const atLast = slideIndex >= slides.length - 1;
    prevBtn.disabled = atFirst;
    prevBtn.setAttribute('aria-disabled', atFirst ? 'true' : 'false');

    if (atLast) {
      nextBtn.textContent = '閉じる';
      nextBtn.disabled = false;
      nextBtn.setAttribute('aria-disabled', 'false');
      nextBtn.setAttribute('aria-label', '資料を閉じる');
      nextBtn.dataset.action = 'close';
    } else {
      nextBtn.textContent = '次へ';
      nextBtn.disabled = false;
      nextBtn.setAttribute('aria-disabled', 'false');
      nextBtn.setAttribute('aria-label', '次の画像');
      nextBtn.dataset.action = 'next';
    }
  }

  function goSlide(delta) {
    if (!slideMode || !popOpen) return;
    const next = slideIndex + delta;
    if (next < 0 || next >= activeSlides.length) return;
    slideIndex = next;
    updateSlideView();
  }

  function bindSwipe(stage) {
    let startX = 0;
    let startY = 0;
    let tracking = false;

    stage.addEventListener('touchstart', (event) => {
      if (!event.touches || event.touches.length !== 1) return;
      tracking = true;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
    }, { passive: true });

    stage.addEventListener('touchend', (event) => {
      if (!tracking) return;
      tracking = false;
      const touch = event.changedTouches && event.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0) goSlide(1);
      else goSlide(-1);
    }, { passive: true });
  }

  function openImageSlides(material, slides, triggerEl) {
    if (!Array.isArray(slides) || !slides.length) return;

    beginPop(material, triggerEl);
    slideMode = true;
    slideIndex = 0;
    activeSlides = slides.slice();
    preloadSlides(activeSlides);

    const index = materialIndex(material.id);
    const numberLabel = index >= 0 ? String(index + 1) : '';
    const titleId = 'studyPopTitle';
    const first = activeSlides[0];
    const root = document.createElement('div');
    root.id = 'studyMaterialPop';
    root.className = 'study-pop-root';
    root.innerHTML =
      `<div class="study-pop-overlay" data-study-pop-dismiss="1"></div>` +
      `<div class="study-pop-panel study-pop-panel--slides" role="dialog" aria-modal="true" aria-labelledby="${titleId}">` +
      `<header class="study-pop-header study-pop-header--slides">` +
      `<div class="study-pop-header-text">` +
      (numberLabel ? `<p class="study-pop-docno">資料 ${esc(numberLabel)}</p>` : '') +
      `<p class="study-pop-number" id="studySlidePage">1 / ${activeSlides.length}</p>` +
      `<h2 class="study-pop-title" id="${titleId}">${esc(material.title)}</h2>` +
      `</div>` +
      `<button type="button" class="study-pop-close-x" id="studyPopCloseX" aria-label="資料を閉じる">×</button>` +
      `</header>` +
      `<div class="study-pop-body study-pop-body--slides" id="studyPopBody" tabindex="-1">` +
      `<img id="studySlideImage" class="study-slide-image" src="${esc(first.src)}" alt="${esc(first.alt)}" draggable="false" />` +
      `</div>` +
      `<footer class="study-pop-footer study-pop-footer--slides">` +
      `<button type="button" class="study-pop-nav-btn" id="studySlidePrev" aria-label="前の画像">前へ</button>` +
      `<button type="button" class="study-pop-nav-btn study-pop-nav-btn--primary" id="studySlideNext" data-action="next" aria-label="次の画像">次へ</button>` +
      `</footer>` +
      `</div>`;

    document.body.appendChild(root);
    popOpen = true;

    const panel = root.querySelector('.study-pop-panel');
    const stage = document.getElementById('studyPopBody');
    const prevBtn = document.getElementById('studySlidePrev');
    const nextBtn = document.getElementById('studySlideNext');

    prevBtn?.addEventListener('click', () => goSlide(-1));
    nextBtn?.addEventListener('click', () => {
      if (nextBtn.dataset.action === 'close') {
        closePop();
        return;
      }
      goSlide(1);
    });
    if (stage) bindSwipe(stage);

    attachCommonPopChrome(root, panel, {
      onEscapeExtra: (event) => {
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          if (slideIndex >= activeSlides.length - 1) return;
          goSlide(1);
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          goSlide(-1);
        }
      },
    });

    updateSlideView();
  }

  function openTextMaterialPopup(material, triggerEl) {
    beginPop(material, triggerEl);
    slideMode = false;

    const index = materialIndex(material.id);
    const numberLabel = index >= 0 ? String(index + 1) : '';
    const titleId = 'studyPopTitle';
    const bodyHtml = renderBlocks(material.blocks);

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
      `<button type="button" class="study-pop-close-x" id="studyPopCloseX" aria-label="資料を閉じる">×</button>` +
      `</header>` +
      `<div class="study-pop-body" id="studyPopBody" tabindex="-1">${bodyHtml}</div>` +
      `<footer class="study-pop-footer">` +
      `<button type="button" class="study-pop-close-btn" id="studyPopCloseBtn" aria-label="資料を閉じる">閉じる</button>` +
      `</footer>` +
      `</div>`;

    document.body.appendChild(root);
    popOpen = true;

    const bodyEl = document.getElementById('studyPopBody');
    if (bodyEl) bodyEl.scrollTop = 0;

    const panel = root.querySelector('.study-pop-panel');
    document.getElementById('studyPopCloseBtn')?.addEventListener('click', () => closePop());
    attachCommonPopChrome(root, panel);
  }

  function openPop(id, triggerEl) {
    const material = findMaterial(id);
    if (!material) return;
    const slides = MATERIAL_SLIDES[material.id];
    if (slides) {
      openImageSlides(material, slides, triggerEl);
      return;
    }
    openTextMaterialPopup(material, triggerEl);
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
    const items = materials().map((item, index) => {
      const slides = MATERIAL_SLIDES[item.id];
      const thumb = item.showThumbnail && slides && slides[0]
        ? `<img class="study-material-thumb" src="${esc(slides[0].src)}" alt="" loading="lazy" decoding="async" />`
        : '';
      const pageCount = slides && slides.length > 1
        ? `<span class="study-material-pages">全${slides.length}ページ</span>`
        : '';
      return (
        `<button type="button" class="menu study-material-item${thumb ? ' study-material-item--thumb' : ''}" data-material-id="${esc(item.id)}">` +
        (thumb ? `<span class="study-material-thumb-wrap" aria-hidden="true">${thumb}</span>` : '') +
        `<span class="study-material-copy">` +
        `<strong>${index + 1}. ${esc(item.title)}</strong>` +
        `<span class="study-material-desc">${esc(item.description || 'タップして本文を表示')}</span>` +
        pageCount +
        `</span>` +
        `</button>`
      );
    }).join('');

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
    slideIndex: () => slideIndex,
    activeSlides: () => activeSlides.slice(),
    strollerSlides: STROLLER_SLIDES,
    wheelchairSlides: WHEELCHAIR_SLIDES,
    micGuideSlides: MIC_GUIDE_SLIDES,
    bicycleSlides: BICYCLE_SLIDES,
    driverHealthSlides: DRIVER_HEALTH_SLIDES,
    accidentResponseSlides: ACCIDENT_RESPONSE_SLIDES,
  };

  window.__chidoriOpenStudyMaterialDetail = openDetail;
})();
