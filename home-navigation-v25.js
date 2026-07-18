(() => {
  function clearOrphanOverlays() {
    if (typeof page !== 'undefined' && page === 'home') {
      document.querySelectorAll('.stop-edit-backdrop').forEach((element) => element.remove());
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('.home [data-go]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    clearOrphanOverlays();
    go(button.dataset.go);
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const button = event.target.closest?.('.home [data-go]');
    if (!button) return;
    event.preventDefault();
    clearOrphanOverlays();
    go(button.dataset.go);
  }, true);

  new MutationObserver(clearOrphanOverlays).observe(document.getElementById('app'), {
    childList: true,
    subtree: true,
  });

  clearOrphanOverlays();
})();