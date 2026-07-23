(() => {
  function materials() {
    return Array.isArray(window.STUDY_MATERIALS) ? window.STUDY_MATERIALS : [];
  }

  function findMaterial(id) {
    return materials().find((item) => item.id === id) || null;
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

  function openDetail(id) {
    studyMaterialId = id;
    go('materials-detail');
  }

  function renderList() {
    studyMaterialId = null;
    const items = materials().map((item, index) => (
      `<button type="button" class="menu study-material-item" data-material-id="${esc(item.id)}">` +
      `<strong>${index + 1}. ${esc(item.title)}</strong>` +
      `<span>タップして本文を表示</span>` +
      `</button>`
    )).join('');

    shell(
      `<section class="study-materials">` +
      `<h2 class="study-page-title">勉強資料</h2>` +
      `<p class="study-page-lead">乗務員向けの作業マニュアル・案内用語</p>` +
      `<div class="study-list">${items || '<div class="empty">資料がありません。</div>'}</div>` +
      `</section>`
    );

    document.querySelectorAll('[data-material-id]').forEach((button) => {
      button.addEventListener('click', () => openDetail(button.getAttribute('data-material-id')));
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
})();
