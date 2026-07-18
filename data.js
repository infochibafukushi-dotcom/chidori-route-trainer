const INITIAL_HOKUEI_OUTBOUND = [
  '新浦安駅','入船東団地','入船五丁目','入船六丁目','浦安警察署','美浜北小学校','美浜中学校',
  '海楽東児童公園','浦安高校前','海楽西児童公園','消防本部前','砂田橋','北栄四丁目','北栄大三角線',
  '北栄中央','北栄三丁目','北栄一丁目','浦安駅東口','浦安駅入口'
].map((name,index)=>({
  id:`hokuei-1-${String(index+1).padStart(2,'0')}`,
  name,
  address:`${name} バス停, 浦安市, 千葉県`,
  lat:null,
  lng:null
}));

window.INITIAL_DATA = {
  routes: [
    {
      id:'route-1',number:1,name:'北栄線',
      description:'系統1 新浦安駅 → 浦安駅入口',
      hokueiDataVersion:'2026-07-18-system-1',
      sourceUrl:'https://mb.jorudan.co.jp/os/bus/1274/line/63299.html',
      outbound:INITIAL_HOKUEI_OUTBOUND,
      inbound:[]
    },
    [2,'今川線'],[3,'浦安東団地線'],[4,'富岡線'],[5,'堀江線'],[6,'市役所線'],
    [9,'舞浜線'],[10,'高洲線'],[11,'シンボルロード線'],[12,'舞浜リゾート線'],[14,'弁天・富岡線'],
    [15,'潮音の街線'],[16,'日の出線'],[17,'日の出線'],[18,'明海・高洲線'],[19,'高洲南線'],
    [20,'千鳥線'],[22,'若潮通り線'],[23,'浦安東団地線'],[24,'富士見循環線'],[25,'舞浜・高洲線'],
    [37,'大三角線'],[38,'明海クオン線']
  ].map((route)=>Array.isArray(route)
    ? {id:`route-${route[0]}`,number:route[0],name:route[1],outbound:[],inbound:[]}
    : route),
  categories: [
    {id:'near-miss',name:'ヒヤリハット',color:'#e67e22'},
    {id:'accident',name:'アクシデント',color:'#c0392b'},
    {id:'bus-stop',name:'バス停注意点',color:'#2471a3'},
    {id:'caution',name:'注意地点',color:'#8e44ad'}
  ],
  pins: []
};