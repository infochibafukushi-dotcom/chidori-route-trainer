const KEY='chidori-route-trainer-v1';
let data=load();let page='home';let settingsTab='stops';
const app=document.getElementById('app');
function clone(v){return JSON.parse(JSON.stringify(v))}function load(){try{return JSON.parse(localStorage.getItem(KEY))||clone(window.INITIAL_DATA)}catch{return clone(window.INITIAL_DATA)}}function save(){localStorage.setItem(KEY,JSON.stringify(data))}function id(p){return `${p}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`}function label(r){return `${r.number} ${r.name}`}function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
let studyMaterialId=null;
const HOME_ICONS={
  bus:'<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="8" y="6" width="32" height="30" rx="6" fill="#0f5ea8"/><rect x="12" y="10" width="24" height="12" rx="2" fill="#bfe1ff"/><rect x="12" y="24" width="24" height="6" rx="1.5" fill="#fff"/><circle cx="16" cy="38" r="4" fill="#17202a"/><circle cx="32" cy="38" r="4" fill="#17202a"/><circle cx="16" cy="38" r="1.6" fill="#fff"/><circle cx="32" cy="38" r="1.6" fill="#fff"/></svg>',
  map:'<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 12l10-4 8 4 10-4v28l-10 4-8-4-10 4V12z" fill="none" stroke="#0f5ea8" stroke-width="2.4" stroke-linejoin="round"/><path d="M20 8v28M28 12v28" stroke="#0f5ea8" stroke-width="2" opacity=".45"/><circle cx="30" cy="22" r="5.5" fill="#0f5ea8"/><circle cx="30" cy="22" r="2.2" fill="#fff"/></svg>',
  install:'<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 8v22" stroke="#0f5ea8" stroke-width="3.2" stroke-linecap="round"/><path d="M16 22l8 8 8-8" fill="none" stroke="#0f5ea8" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 36h24" stroke="#0f5ea8" stroke-width="3.2" stroke-linecap="round"/></svg>',
  chevron:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  routes:'<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 46c8-14 12-14 20 0s12 14 20 0" fill="none" stroke="#2f9e6a" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 6"/><circle cx="42" cy="22" r="10" fill="#2f9e6a"/><circle cx="42" cy="22" r="4" fill="#fff"/><path d="M42 32v8" stroke="#2f9e6a" stroke-width="4" stroke-linecap="round"/></svg>',
  materials:'<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 16h16c4 0 8 2 10 5 2-3 6-5 10-5h16v34H40c-4 0-8 1-10 3-2-2-6-3-10-3H14V16z" fill="#7b5cff"/><path d="M32 21v29" stroke="#fff" stroke-width="2.5" opacity=".7"/></svg>',
  quiz:'<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="18" fill="#f08a24"/><text x="32" y="40" text-anchor="middle" font-size="24" font-weight="700" fill="#fff" font-family="system-ui,sans-serif">?</text></svg>',
  settings:'<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M27.2 10h9.6l1.3 6.1 5.5-2.8 4.8 8.3-5.1 3.5c.4 1.3.6 2.6.6 4s-.2 2.7-.6 4l5.1 3.5-4.8 8.3-5.5-2.8L36.8 54h-9.6l-1.3-6.1-5.5 2.8-4.8-8.3 5.1-3.5c-.4-1.3-.6-2.6-.6-4s.2-2.7.6-4l-5.1-3.5 4.8-8.3 5.5 2.8L27.2 10z" fill="#2f7fd6"/><circle cx="32" cy="32" r="7.5" fill="#e7f2ff"/><circle cx="32" cy="32" r="4.2" fill="#2f7fd6"/></svg>',
  city:'<svg class="home-cityscape" viewBox="0 0 900 120" preserveAspectRatio="xMidYMax meet" aria-hidden="true"><g fill="#9ec7e8" opacity=".9"><rect x="40" y="48" width="36" height="52" rx="2"/><rect x="88" y="28" width="44" height="72" rx="2"/><rect x="144" y="40" width="30" height="60" rx="2"/><rect x="190" y="20" width="52" height="80" rx="2"/><rect x="260" y="46" width="34" height="54" rx="2"/><rect x="320" y="32" width="48" height="68" rx="2"/><rect x="390" y="50" width="28" height="50" rx="2"/><rect x="440" y="24" width="56" height="76" rx="2"/><rect x="520" y="42" width="38" height="58" rx="2"/><rect x="580" y="18" width="50" height="82" rx="2"/><rect x="650" y="44" width="34" height="56" rx="2"/><rect x="710" y="30" width="46" height="70" rx="2"/><rect x="780" y="48" width="40" height="52" rx="2"/></g><g fill="#6faf6a" opacity=".75"><ellipse cx="120" cy="92" rx="18" ry="10"/><ellipse cx="300" cy="94" rx="22" ry="11"/><ellipse cx="560" cy="93" rx="20" ry="10"/><ellipse cx="760" cy="94" rx="24" ry="12"/></g><rect x="0" y="100" width="900" height="20" fill="#d7e6f2"/><g transform="translate(620 62)"><rect x="0" y="8" width="92" height="30" rx="8" fill="#0f5ea8"/><rect x="10" y="14" width="28" height="12" rx="2" fill="#bfe1ff"/><rect x="44" y="14" width="20" height="12" rx="2" fill="#bfe1ff"/><rect x="70" y="14" width="14" height="12" rx="2" fill="#bfe1ff"/><circle cx="22" cy="42" r="7" fill="#17202a"/><circle cx="72" cy="42" r="7" fill="#17202a"/><circle cx="22" cy="42" r="2.5" fill="#fff"/><circle cx="72" cy="42" r="2.5" fill="#fff"/></g><g transform="translate(780 48)"><rect x="10" y="0" width="6" height="52" fill="#0f5ea8"/><circle cx="13" cy="18" r="16" fill="#0f5ea8"/><circle cx="13" cy="18" r="10" fill="#fff"/><text x="13" y="23" text-anchor="middle" font-size="12" font-weight="700" fill="#0f5ea8" font-family="system-ui,sans-serif">停</text></g></svg>'
};
function shell(body,backTo='home'){
  const isHome=page==='home';
  const brandTitle=isHome?'千鳥路線図':'千鳥営業所 路線学習';
  const shortcuts=isHome?`<div class="header-shortcuts"><a class="home-shortcut" data-route-map-pdf href="https://www.keiseibus.co.jp/wp-content/uploads/2026/02/routemap-chidori.pdf" target="_blank" rel="noopener noreferrer"><span class="home-shortcut-icon">${HOME_ICONS.map}</span><span class="home-shortcut-label"><span>千鳥路線図</span><span>全体図</span></span></a><button type="button" class="home-shortcut" data-pwa-install><span class="home-shortcut-icon">${HOME_ICONS.install}</span><span class="home-shortcut-label"><span>ショートカット</span><span>作成</span></span></button></div>`:'';
  const footer=isHome?`<footer class="home-footer">${HOME_ICONS.city}<p class="home-copy">© 千鳥営業所</p></footer>`:'';
  app.innerHTML=`<div class="app${isHome?' app--home':''}"><header class="header${isHome?' header--home':''}">${isHome?'':`<button class="back" id="back" aria-label="戻る">←</button>`}<div class="header-brand">${isHome?`<span class="header-bus" aria-hidden="true">${HOME_ICONS.bus}</span>`:''}<div><h1>${brandTitle}</h1><p>路線・停留所・注意地点</p></div></div>${shortcuts}</header><main class="main">${body}</main>${footer}</div>`;
  document.getElementById('back')?.addEventListener('click',()=>go(backTo));
}
function showRouteLoadError(error,retryFn){
  const msg=esc((error&&error.message)||'読み込みに失敗しました');
  shell(`<section><p class="status">路線データを読み込めませんでした。再試行してください。</p><p class="status">${msg}</p><p style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="primary" id="retryRouteLoad">再試行</button><button type="button" class="secondary" id="backHomeFromRouteError">ホームへ</button></p></section>`);
  document.getElementById('retryRouteLoad')?.addEventListener('click',()=>{if(typeof retryFn==='function')retryFn();});
  document.getElementById('backHomeFromRouteError')?.addEventListener('click',()=>go('home'));
}
window.__chidoriShowRouteLoadError=showRouteLoadError;
function go(next){
  try{window.__chidoriBoot&&window.__chidoriBoot.mark('go',next)}catch(e){}
  page=next;
  if(next==='home'||next==='quiz'||next==='materials'||next==='materials-detail'){
    render();
    return;
  }
  if((next==='routes'||next==='settings')&&window.__chidoriRouteAssets){
    const routeId=routeState.routeId||data.routes[0]?.id||'route-1';
    if(window.__chidoriRouteAssets.isRouteReady(routeId)){
      render();
      return;
    }
    const started=Date.now();
    try{window.__chidoriBoot&&window.__chidoriBoot.mark('await-route-assets',routeId)}catch(e){}
    shell(`<section><p class="status">路線データを読み込み中...</p><p style="margin-top:12px"><button type="button" class="secondary" id="cancelRouteLoad">ホームへ戻る</button></p></section>`);
    document.getElementById('cancelRouteLoad')?.addEventListener('click',()=>go('home'));
    window.__chidoriRouteAssets.ensureRoute(routeId).then(()=>{
      try{window.__chidoriBoot&&window.__chidoriBoot.mark('route-assets-ready',Date.now()-started)}catch(e){}
      if(page===next)render();
    }).catch((error)=>{
      console.error('[chidori] route assets failed',error);
      if(page!==next)return;
      showRouteLoadError(error,()=>go(next));
    });
    return;
  }
  render();
}
function render(){if(page==='materials'||page==='materials-detail'){if(typeof window.renderStudyMaterials==='function')window.renderStudyMaterials();try{window.__chidoriBoot&&window.__chidoriBoot.mark('render')}catch(e){}return}if(page==='home')home();if(page==='routes')routes();if(page==='quiz')quiz();if(page==='settings')settings();try{window.__chidoriBoot&&window.__chidoriBoot.mark('render')}catch(e){}}
function homeCard(goTo,tone,icon,title,desc){return`<button type="button" class="home-card home-card--${tone}" data-go="${goTo}"><span class="home-card-icon" aria-hidden="true">${icon}</span><span class="home-card-text"><strong>${title}</strong><span>${desc}</span></span><span class="home-card-chevron" aria-hidden="true">${HOME_ICONS.chevron}</span></button>`}
function home(){
  shell(`<section class="home">${homeCard('routes','routes',HOME_ICONS.routes,'千鳥営業所 路線図','各路線の往路・復路と停留所を確認')}${homeCard('materials','materials',HOME_ICONS.materials,'基本研修資料','乗務員向け作業マニュアル・マイク案内')}${homeCard('quiz','quiz',HOME_ICONS.quiz,'問題','次の停留所・この路線は何線')}${homeCard('settings','settings',HOME_ICONS.settings,'設定','停留所・ヒヤリハット・注意地点を登録')}</section>`);
  document.querySelectorAll('[data-go]').forEach((b)=>{
    b.addEventListener('pointerdown',()=>{try{window.__chidoriBoot&&window.__chidoriBoot.mark('pointerdown',b.dataset.go)}catch(e){}},{passive:true});
    b.onclick=()=>go(b.dataset.go);
  });
  window.__chidoriHomeInteractive=true;
  try{window.__chidoriBoot&&window.__chidoriBoot.mark('home-interactive')}catch(e){}
  if(typeof window.__chidoriOnHomeInteractive==='function'){
    try{window.__chidoriOnHomeInteractive()}catch(e){console.warn(e)}
  }
}
let routeState={routeId:data.routes[0]?.id||'',direction:'outbound'};
function routes(){const r=data.routes.find(x=>x.id===routeState.routeId)||data.routes[0];const stops=r?.[routeState.direction]||[];shell(`<section><div class="controls"><label>路線<select id="routeSelect">${data.routes.map(x=>`<option value="${x.id}" ${x.id===r?.id?'selected':''}>${label(x)}</option>`).join('')}</select></label><div class="seg"><button data-dir="outbound" class="${routeState.direction==='outbound'?'active':''}">往路</button><button data-dir="inbound" class="${routeState.direction==='inbound'?'active':''}">復路</button></div></div><div class="split"><div id="routeMap" class="map"></div><div id="street" class="street"></div></div><p id="mapStatus" class="status">停留所ピンを押すと下半分にStreet Viewを表示します。</p>${stops.length?'':`<div class="empty">この路線の停留所は未登録です。設定から登録してください。</div>`}</section>`);document.getElementById('routeSelect').onchange=e=>{routeState.routeId=e.target.value;routes()};document.querySelectorAll('[data-dir]').forEach(b=>b.onclick=()=>{routeState.direction=b.dataset.dir;routes()});drawRoute(r,stops)}
function loadMaps(){if(window.google?.maps)return Promise.resolve(window.google);if(window._mapsPromise)return window._mapsPromise;const key=window.GOOGLE_MAPS_API_KEY;if(!key||key.includes('__'))return Promise.reject(new Error('Google Maps APIキーが未設定です。'));window._mapsPromise=new Promise((resolve,reject)=>{const cb='gmapsInit'+Date.now();window[cb]=()=>{delete window[cb];resolve(window.google)};const s=document.createElement('script');s.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=${cb}&v=weekly&language=ja&region=JP`;s.async=true;s.onerror=()=>reject(new Error('Google Mapsを読み込めませんでした。'));document.head.appendChild(s)});return window._mapsPromise}
async function drawRoute(route,stops){const status=document.getElementById('mapStatus');try{const g=await loadMaps();const valid=stops.filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lng));const center=valid[0]?{lat:valid[0].lat,lng:valid[0].lng}:{lat:35.653,lng:139.901};const map=new g.maps.Map(document.getElementById('routeMap'),{center,zoom:valid.length?14:12,mapTypeControl:false});const pano=new g.maps.StreetViewPanorama(document.getElementById('street'),{position:center,pov:{heading:0,pitch:0},zoom:1});valid.forEach((s,i)=>{const m=new g.maps.Marker({map,position:{lat:s.lat,lng:s.lng},label:String(i+1),title:s.name});m.addListener('click',()=>{pano.setPosition({lat:s.lat,lng:s.lng});status.textContent=`${s.name}${s.address?'｜'+s.address:''}`})});if(valid.length>1)new g.maps.Polyline({map,path:valid.map(s=>({lat:s.lat,lng:s.lng})),strokeColor:'#0f5ea8',strokeWeight:5});data.pins.filter(p=>!p.routeId||p.routeId===route?.id).forEach(p=>new g.maps.Marker({map,position:{lat:p.lat,lng:p.lng},title:p.title,icon:{path:g.maps.SymbolPath.CIRCLE,scale:8,fillColor:data.categories.find(c=>c.id===p.categoryId)?.color||'#555',fillOpacity:1,strokeColor:'#fff',strokeWeight:2}}));}catch(e){status.textContent=e.message}}
let quizType='next';
function quiz(){const qs=makeQuestion();shell(`<section><div class="seg" style="margin-bottom:16px"><button data-qt="next" class="${quizType==='next'?'active':''}">次の停留所</button><button data-qt="route" class="${quizType==='route'?'active':''}">この路線</button></div>${qs?`<div class="question">${qs.text}</div><div class="answers">${qs.options.map(o=>`<button data-answer="${esc(o)}">${esc(o)}</button>`).join('')}</div><p id="result" class="status"></p><button class="primary" id="nextQ">次の問題</button>`:'<div class="empty">問題を作るには、設定から停留所を2件以上登録してください。</div>'}</section>`);document.querySelectorAll('[data-qt]').forEach(b=>b.onclick=()=>{quizType=b.dataset.qt;quiz()});if(qs){document.querySelectorAll('[data-answer]').forEach(b=>b.onclick=()=>document.getElementById('result').textContent=b.dataset.answer===qs.answer?'正解です。':`不正解です。正解：${qs.answer}`);document.getElementById('nextQ').onclick=quiz}}
function makeQuestion(){const usable=data.routes.filter(r=>r.outbound.length>=2||r.inbound.length>=2);if(!usable.length)return null;const r=usable[Math.floor(Math.random()*usable.length)];const dir=r.outbound.length>=2?'outbound':'inbound';const s=r[dir];if(quizType==='next'){const i=Math.floor(Math.random()*(s.length-1));const answer=s[i+1].name;const pool=[answer,...data.routes.flatMap(x=>[...x.outbound,...x.inbound]).map(x=>x.name).filter(x=>x!==answer)].filter((v,i,a)=>a.indexOf(v)===i).slice(0,4).sort(()=>Math.random()-.5);return{text:`${label(r)}・${dir==='outbound'?'往路':'復路'}<br>現在：${esc(s[i].name)}<br>次の停留所は？`,answer,options:pool}}const answer=label(r);const options=[answer,...data.routes.filter(x=>x.id!==r.id).sort(()=>Math.random()-.5).slice(0,3).map(label)].sort(()=>Math.random()-.5);return{text:`停留所順<br>${s.slice(0,3).map(x=>esc(x.name)).join(' → ')}<br>この路線は？`,answer,options}}
function settings(){shell(`<section><div class="tabs tabs--4"><button data-tab="stops" class="${settingsTab==='stops'?'active':''}">停留所</button><button data-tab="pins" class="${settingsTab==='pins'?'active':''}">注意ピン</button><button data-tab="categories" class="${settingsTab==='categories'?'active':''}">項目</button><button data-tab="materials-order" class="${settingsTab==='materials-order'?'active':''}">資料順</button></div><div id="settingsBody"></div></section>`);document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{settingsTab=b.dataset.tab;settings()});if(settingsTab==='stops')stopEditor();if(settingsTab==='pins')pinEditor();if(settingsTab==='categories')categoryEditor();if(settingsTab==='materials-order')materialsOrderEditor()}
function stopEditor(){document.getElementById('settingsBody').innerHTML=`<div class="grid"><div class="card"><label>路線<select id="sRoute">${data.routes.map(r=>`<option value="${r.id}">${label(r)}</option>`).join('')}</select></label><label>方向<select id="sDir"><option value="outbound">往路</option><option value="inbound">復路</option></select></label><label>停留所名<input id="sName"></label><label>住所・施設名<input id="sAddress"></label><button class="secondary" id="sSearch">住所から位置を取得</button><div id="picker" class="picker"></div><p id="sStatus" class="status">地図をタップしても位置を指定できます。</p><button class="primary" id="sAdd">停留所を追加</button></div><div class="card"><strong>登録済み停留所</strong><div id="stopList"></div></div></div>`;const state={pos:null};picker('picker',state,'sStatus');document.getElementById('sSearch').onclick=async()=>{try{state.pos=await geocode(document.getElementById('sAddress').value);settings()}catch(e){document.getElementById('sStatus').textContent=e.message}};document.getElementById('sAdd').onclick=()=>{const r=data.routes.find(x=>x.id===document.getElementById('sRoute').value);const dir=document.getElementById('sDir').value;const name=document.getElementById('sName').value.trim();if(!r||!name||!state.pos)return alert('停留所名と位置を設定してください。');r[dir].push({id:id('stop'),name,address:document.getElementById('sAddress').value.trim(),...state.pos});save();settings()};renderStopList()}
function renderStopList(){const box=document.getElementById('stopList');box.innerHTML=data.routes.map(r=>['outbound','inbound'].map(dir=>r[dir].map(s=>`<div class="item"><span>${label(r)}・${dir==='outbound'?'往路':'復路'}｜${esc(s.name)}</span><button data-delstop="${r.id}|${dir}|${s.id}">削除</button></div>`).join('')).join('')).join('')||'<p>未登録</p>';document.querySelectorAll('[data-delstop]').forEach(b=>b.onclick=()=>{const [rid,dir,sid]=b.dataset.delstop.split('|');const r=data.routes.find(x=>x.id===rid);r[dir]=r[dir].filter(s=>s.id!==sid);save();settings()})}
function pinEditor(){document.getElementById('settingsBody').innerHTML=`<div class="grid"><div class="card"><label>項目<select id="pCat">${data.categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label><label>タイトル<input id="pTitle"></label><label>対象路線<select id="pRoute"><option value="">全路線共通</option>${data.routes.map(r=>`<option value="${r.id}">${label(r)}</option>`).join('')}</select></label><label>方向<select id="pDir"><option value="both">往復共通</option><option value="outbound">往路</option><option value="inbound">復路</option></select></label><label>住所・施設名<input id="pAddress"></label><button class="secondary" id="pSearch">住所から位置を取得</button><div id="picker" class="picker"></div><label>注意内容<textarea id="pNote"></textarea></label><p id="pStatus" class="status">地図をタップしても位置を指定できます。</p><button class="primary" id="pAdd">注意ピンを追加</button></div><div class="card"><strong>登録済みピン</strong>${data.pins.map(p=>`<div class="item"><span>${esc(data.categories.find(c=>c.id===p.categoryId)?.name||'未分類')}｜${esc(p.title)}</span><button data-delpin="${p.id}">削除</button></div>`).join('')||'<p>未登録</p>'}</div></div>`;const state={pos:null};picker('picker',state,'pStatus');document.getElementById('pSearch').onclick=async()=>{try{state.pos=await geocode(document.getElementById('pAddress').value);settings()}catch(e){document.getElementById('pStatus').textContent=e.message}};document.getElementById('pAdd').onclick=()=>{const title=document.getElementById('pTitle').value.trim();if(!title||!state.pos)return alert('タイトルと位置を設定してください。');data.pins.push({id:id('pin'),title,categoryId:document.getElementById('pCat').value,routeId:document.getElementById('pRoute').value||undefined,direction:document.getElementById('pDir').value,address:document.getElementById('pAddress').value.trim(),lat:state.pos.lat,lng:state.pos.lng,note:document.getElementById('pNote').value.trim()});save();settings()};document.querySelectorAll('[data-delpin]').forEach(b=>b.onclick=()=>{data.pins=data.pins.filter(p=>p.id!==b.dataset.delpin);save();settings()})}
function categoryEditor(){document.getElementById('settingsBody').innerHTML=`<div class="card" style="max-width:560px;margin:auto"><label>項目名<input id="cName" placeholder="例：狭路注意"></label><label>ピン色<input id="cColor" type="color" value="#555555"></label><button class="primary" id="cAdd">項目を追加</button>${data.categories.map(c=>`<div class="item"><span><i class="dot" style="background:${c.color}"></i>${esc(c.name)}</span><button data-delcat="${c.id}" ${data.pins.some(p=>p.categoryId===c.id)?'disabled':''}>削除</button></div>`).join('')}</div>`;document.getElementById('cAdd').onclick=()=>{const name=document.getElementById('cName').value.trim();if(!name)return;data.categories.push({id:id('cat'),name,color:document.getElementById('cColor').value});save();settings()};document.querySelectorAll('[data-delcat]').forEach(b=>b.onclick=()=>{data.categories=data.categories.filter(c=>c.id!==b.dataset.delcat);save();settings()})}
function materialsOrderEditor(){
  const api=window.__chidoriStudyMaterialsApi;
  const body=document.getElementById('settingsBody');
  if(!api||!body){
    document.getElementById('settingsBody').innerHTML='<div class="card"><p class="status">研修資料データを読み込めませんでした。</p></div>';
    return;
  }
  const catalog=api.catalog();
  const byId=new Map(catalog.map((m)=>[m.id,m]));
  let draft=api.normalizeStudyMaterialOrder(
    Array.isArray(materialsOrderDraft)&&materialsOrderDraft.length?materialsOrderDraft:api.readSavedOrderIds(),
    catalog
  );
  const saved=api.normalizeStudyMaterialOrder(api.readSavedOrderIds(),catalog);
  const dirty=JSON.stringify(draft)!==JSON.stringify(saved);
  const defaultThumb=api.DEFAULT_THUMB;
  body.innerHTML=
    `<div class="card materials-order-card">`+
    `<h3 class="materials-order-title">基本研修資料の並び順</h3>`+
    `<p class="materials-order-lead">基本研修資料一覧に表示する順番を変更できます</p>`+
    `<div class="materials-order-list" id="materialsOrderList">`+
    draft.map((id,index)=>{
      const m=byId.get(id); if(!m) return '';
      const thumb=api.getThumbnailSrc(m);
      const atFirst=index===0;
      const atLast=index===draft.length-1;
      return (
        `<div class="materials-order-row" draggable="true" data-order-id="${esc(id)}" data-order-index="${index}">`+
        `<span class="materials-order-handle" title="ドラッグして移動" aria-hidden="true">≡</span>`+
        `<span class="materials-order-thumb-wrap" aria-hidden="true"><img class="materials-order-thumb" src="${esc(thumb)}" alt="" data-fallback="${esc(defaultThumb)}" loading="lazy" decoding="async" /></span>`+
        `<span class="materials-order-meta"><strong>${index+1}. ${esc(m.title)}</strong><span>現在の順番：${index+1}</span></span>`+
        `<span class="materials-order-actions">`+
        `<button type="button" class="materials-order-btn" data-move-up="${index}" ${atFirst?'disabled':''} aria-label="上へ移動">↑</button>`+
        `<button type="button" class="materials-order-btn" data-move-down="${index}" ${atLast?'disabled':''} aria-label="下へ移動">↓</button>`+
        `</span></div>`
      );
    }).join('')+
    `</div>`+
    `<p id="materialsOrderStatus" class="status"></p>`+
    `<div class="materials-order-footer">`+
    `<button type="button" class="primary" id="materialsOrderSave" ${dirty?'':'disabled'}>この並び順を保存</button>`+
    `<button type="button" class="secondary" id="materialsOrderReset">初期の並び順に戻す</button>`+
    `</div></div>`;

  materialsOrderDraft=draft.slice();

  body.querySelectorAll('.materials-order-thumb').forEach((img)=>{
    img.addEventListener('error',()=>{
      const fallback=img.getAttribute('data-fallback')||defaultThumb;
      if(img.dataset.fallbackApplied==='1'||img.getAttribute('src')===fallback)return;
      img.dataset.fallbackApplied='1';
      img.src=fallback;
    });
  });

  function move(from,to){
    if(to<0||to>=draft.length)return;
    const next=draft.slice();
    const [item]=next.splice(from,1);
    next.splice(to,0,item);
    materialsOrderDraft=next;
    materialsOrderEditor();
  }

  body.querySelectorAll('[data-move-up]').forEach((btn)=>{
    btn.onclick=()=>move(Number(btn.dataset.moveUp),Number(btn.dataset.moveUp)-1);
  });
  body.querySelectorAll('[data-move-down]').forEach((btn)=>{
    btn.onclick=()=>move(Number(btn.dataset.moveDown),Number(btn.dataset.moveDown)+1);
  });

  let dragFrom=-1;
  body.querySelectorAll('.materials-order-row').forEach((row)=>{
    row.addEventListener('dragstart',(e)=>{
      dragFrom=Number(row.dataset.orderIndex);
      row.classList.add('is-dragging');
      try{e.dataTransfer.setData('text/plain',String(dragFrom));e.dataTransfer.effectAllowed='move';}catch(_){}
    });
    row.addEventListener('dragend',()=>row.classList.remove('is-dragging'));
    row.addEventListener('dragover',(e)=>{e.preventDefault();row.classList.add('is-dragover');});
    row.addEventListener('dragleave',()=>row.classList.remove('is-dragover'));
    row.addEventListener('drop',(e)=>{
      e.preventDefault();
      row.classList.remove('is-dragover');
      const to=Number(row.dataset.orderIndex);
      if(!Number.isFinite(dragFrom)||dragFrom===to)return;
      move(dragFrom,to);
      dragFrom=-1;
    });
  });

  document.getElementById('materialsOrderReset').onclick=()=>{
    materialsOrderDraft=api.getDefaultOrderIds(catalog);
    materialsOrderEditor();
  };

  document.getElementById('materialsOrderSave').onclick=()=>{
    const status=document.getElementById('materialsOrderStatus');
    try{
      const normalized=api.normalizeStudyMaterialOrder(materialsOrderDraft,catalog);
      if(typeof window.__chidoriSetStudyMaterialsOrder==='function'){
        window.__chidoriSetStudyMaterialsOrder(normalized);
      }else{
        localStorage.setItem(api.ORDER_LS_KEY,JSON.stringify(normalized));
      }
      materialsOrderDraft=normalized.slice();
      materialsOrderEditor();
      const after=document.getElementById('materialsOrderStatus');
      if(after)after.textContent='基本研修資料の並び順を保存しました';
    }catch(err){
      console.error(err);
      if(status)status.textContent='保存できませんでした。通信状態を確認して、もう一度お試しください';
    }
  };
}
let materialsOrderDraft=null;
window.__chidoriGetStudyMaterialsOrder=function(){
  if(Array.isArray(data.studyMaterialsOrder))return data.studyMaterialsOrder;
  return null;
};
window.__chidoriSetStudyMaterialsOrder=function(ids){
  data.studyMaterialsOrder=Array.isArray(ids)?ids.slice():null;
  try{
    const key=(window.__chidoriStudyMaterialsApi&&window.__chidoriStudyMaterialsApi.ORDER_LS_KEY)||'chidori-study-materials-order-v1';
    if(Array.isArray(ids))localStorage.setItem(key,JSON.stringify(ids));
    else localStorage.removeItem(key);
  }catch(e){}
  save();
};
async function geocode(address){if(!address.trim())throw new Error('住所を入力してください。');const g=await loadMaps();const res=await new g.maps.Geocoder().geocode({address,region:'JP'});const p=res.results[0]?.geometry.location;if(!p)throw new Error('位置を取得できませんでした。');return{lat:p.lat(),lng:p.lng()}}
async function picker(el,state,statusId){try{const g=await loadMaps();const map=new g.maps.Map(document.getElementById(el),{center:{lat:35.653,lng:139.901},zoom:12,mapTypeControl:false,streetViewControl:false});let marker=null;map.addListener('click',e=>{const pos={lat:e.latLng.lat(),lng:e.latLng.lng()};state.pos=pos;if(!marker)marker=new g.maps.Marker({map,position:pos,draggable:true});else marker.setPosition(pos);marker.addListener('dragend',()=>{const p=marker.getPosition();state.pos={lat:p.lat(),lng:p.lng()}});document.getElementById(statusId).textContent=`位置：${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`})}catch(e){document.getElementById(statusId).textContent=e.message}}
render();
