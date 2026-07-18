(() => {
  const originalGo = go;
  let cleanupScheduled = false;

  function clearOrphanOverlays() {
    if (!document.querySelector('.home')) return;
    document.querySelectorAll('.stop-edit-backdrop').forEach((element) => element.remove());
  }

  function scheduleCleanup() {
    if (cleanupScheduled) return;
    cleanupScheduled = true;
    requestAnimationFrame(() => {
      cleanupScheduled = false;
      clearOrphanOverlays();
    });
  }

  go = function goWithOverlayCleanup(next) {
    if (next === 'home') clearOrphanOverlays();
    originalGo(next);
    if (next === 'home') scheduleCleanup();
  };

  new MutationObserver(scheduleCleanup).observe(document.body, {
    childList: true,
    subtree: true,
  });

  scheduleCleanup();
})();