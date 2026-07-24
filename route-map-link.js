const CHIDORI_ROUTE_MAP_PDF_URL = 'https://www.keiseibus.co.jp/wp-content/uploads/2026/02/routemap-chidori.pdf';

function ensureRouteMapPdfButton() {
  const link = document.querySelector('[data-route-map-pdf]');
  if (!link) return;

  link.href = CHIDORI_ROUTE_MAP_PDF_URL;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
}

new MutationObserver(ensureRouteMapPdfButton).observe(document.getElementById('app'), {
  childList: true,
  subtree: true,
});

ensureRouteMapPdfButton();
