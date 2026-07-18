const CHIDORI_ROUTE_MAP_PDF_URL='https://www.keiseibus.co.jp/wp-content/uploads/2026/02/routemap-chidori.pdf';

function addRouteMapPdfButton(){
  const home=document.querySelector('.home');
  if(!home||home.querySelector('[data-route-map-pdf]'))return;

  const link=document.createElement('a');
  link.href=CHIDORI_ROUTE_MAP_PDF_URL;
  link.target='_blank';
  link.rel='noopener noreferrer';
  link.className='menu';
  link.dataset.routeMapPdf='';
  link.style.color='inherit';
  link.style.textDecoration='none';
  link.style.minHeight='88px';
  link.innerHTML='<strong>全体路線図を確認</strong><span>京成バス公式の千鳥営業所路線図を開く（PDF）</span>';

  home.insertBefore(link,home.children[1]||null);
}

new MutationObserver(addRouteMapPdfButton).observe(document.getElementById('app'),{
  childList:true,
  subtree:true,
});

addRouteMapPdfButton();
