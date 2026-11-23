// 隨機珍品裝備（Joe 2026-11-23 決定：只做隨機、全珍品；遊戲裡本來就是亂跳）。
// 資料來自遊戲內「獎品說明」與 Joe 的裝備畫面：每件 1~3 個屬性、珍品屬性總和約 8~13.5、單項最小約 2.5、單件 1 個特技。
// 列表上的屬性不含特技效果，特技另外擲值（範圍見 TRAITS）。上品資料只留紀錄，不進隨機池。
// 引擎只吃 武勇／智略／統率／速度 四項屬性；政務、魅力只是顯示用，不影響戰鬥。
// 特技的 fx：st＝直接加屬性；tm＝戰鬥中全程生效的 % 加成（鍵同兵學 fx）；cav＝只在騎兵隊生效的屬性。沒有 fx 的特技（引擎尚未模擬）照抽、照顯示，但不影響戰鬥。

const SLOT_ATTR={武器:['武勇','智略','統率','政務'],防具:['智略','統率','速度','政務','魅力'],坐騎:['武勇','統率','速度','魅力'],家寶:['武勇','智略','統率','速度','政務','魅力']};
const NAMES={
  武器:['大典太光世','童子切安綱','數珠丸恒次','鬼丸國綱','蜻蛉切','皆朱槍','日本號','御手杵','大包平','小豆長光','宗三左文字','壓切長谷部','山姥切長義','日光助真','骨喰藤四郎','片鎌槍','一張弓','豐通槍','馬上宿許筒','不動行光','明智近景','笑面青江','國崩','獵隼砲','人間無骨','一期一振','鶯丸','來國長','三日月宗近','甲斐竹弓','赤突槍','宇佐美長光','黑穗槍','采配','握剪','蝶之短刀','八文字長義'],
  防具:['惣黑熊毛具足','朱漆塗佛二枚胴','長烏帽子形兜','十二間筋兜','大釘後立兜','唐冠形兜','飯綱權現付兜','大水牛脇立兜','銀白檀塗兜','三日月兜','一之谷兜','金覆輪筋兜','金銀象嵌兜','馬蘭後立付兜','鹿角脇立兜','萌蔥糸素懸威','金陀美具足','熏韋素懸威','魚鱗札二枚胴','紫糸威最上胴','鯰尾形兜','齒朵具足','黑糸威二枚胴','片肌脫二枚胴','藍韋威肩赤鎧','南蠻胴具足','黑漆塗五枚胴','小櫻韋威鎧','金小札色色威','橙色肩骨紋打袴','十二間突盔形兜','升梯子二枚胴'],
  坐騎:['遠江鹿毛','小雲雀','大鹿毛','內記黑','白石','星河原毛','大蘆毛','鬼鹿毛','鬼蘆毛','百里黑','三國黑','阿拉伯馬','放生月毛','黑雲','帝釋栗毛','松風'],
  家寶:['蘭奢待','白鷺圖','瀟湘八景圖','羅盤','三國志演義','孫子','史記','尺素往來','念珠','地球儀','李衛公問對','維吉諾琴','黃石公三略','司馬法','三十六計','貞永式目抄','築城記','佛典','香袋'],
};
// 特技池（共用池，不含專屬特技）。r＝擲值範圍 [lo,hi]；stat 型：to＝加到哪個屬性
const STAT4=[['光炎','武勇'],['朧月','智略'],['磐石','統率'],['空蟬','速度']].map(([n,k])=>({n,fx:'st',to:k,r:[3,8]}));
const TRAITS={
  武器:[...STAT4,
    {n:'萬全',fx:'st4',r:[1,4]},
    {n:'一意',fx:'tm',k:'crit',r:[1,6]},
    {n:'森羅',fx:'tm',k:'critS',r:[1,6]},
    {n:'萬象',fx:'tm',k:'critSDmg',r:[3,15]},
    {n:'進擊',fx:'tm',k:'dmgRush',r:[0.5,1.4]},
    {n:'專心'},{n:'妖氣'},{n:'果決'},{n:'摧堅'},{n:'折銳'},{n:'壓迫'},{n:'激昂'},{n:'逆轉'},{n:'無言'}],
  防具:[
    {n:'方圓',fx:'fangyuan'},
    {n:'脫兔'},{n:'反影'},{n:'殘心'},{n:'默殺'},{n:'光耀'},{n:'戒心'},{n:'怒濤'},{n:'氣骨'},{n:'強固'},{n:'奪旗'},{n:'勇猛'},{n:'耀武'},{n:'復甦'},{n:'絕境'},{n:'堅韌'},{n:'籠絡'}],
  坐騎:[...STAT4,
    {n:'急進',fx:'cav',to:'速度',r:[5,15]},
    {n:'背水'},{n:'刹那'},{n:'險相'},{n:'紫電'},{n:'止水'},{n:'惡毒'},{n:'斷謀'},{n:'凌厲'},{n:'石鐵'},{n:'鐵甲'},{n:'庇佑'}],
  家寶:[
    {n:'散華',fx:'tm',k:'dmg',r:[1,3]},
    {n:'相堅',fx:'tm',k:'taken',r:[1,3]},
    {n:'急襲',fx:'st2',to:['武勇','統率'],r:[2,6]},
    {n:'磨練',fx:'st2',to:['智略','速度'],r:[2,6]},
    {n:'德望'},{n:'華麗'},{n:'修羅'},{n:'鬼謀'},{n:'架勢'},{n:'詭計'},{n:'練磨'},{n:'集結'},{n:'指南'}],
};
const r1=x=>Math.round(x*10)/10;
const between=(R,[lo,hi])=>lo+R()*(hi-lo);

// 一件珍品的屬性：個數 1/2/3 ＝ 6%/36%/58%，總和約 8.2~13.3（偏低），每項至少 2.5
function rollAttrs(slot,R,want){
  const pool=SLOT_ATTR[slot].filter(k=>!want?.includes(k)),r=R(),pick=(want||[]).filter(k=>SLOT_ATTR[slot].includes(k)).slice(0,3);
  const n=pick.length||(r<.06?1:r<.42?2:3);   // 玩家指定屬性（鍛冶可選）就用指定的個數與項目，數值照樣隨機；沒指定的補滿隨機項
  while(pick.length<n)pick.push(pool.splice(Math.floor(R()*pool.length),1)[0]);
  const total=8.2+5.1*Math.pow(R(),1.6),rest=total-2.5*n,w=pick.map(()=>R()+.05),ws=w.reduce((a,b)=>a+b,0);
  const o={};pick.forEach((k,i)=>{o[k]=Math.round((2.5+rest*w[i]/ws)*100)/100});
  return o;
}
function rollTrait(slot,R,want){
  const t=TRAITS[slot].find(x=>x.n===want)||TRAITS[slot][Math.floor(R()*TRAITS[slot].length)];
  const v=t.r?r1(between(R,t.r)):null;
  return{n:t.n,v,t};
}
// 擲一套四件（武器、防具、坐騎、家寶）。want 可指定每件想要的屬性與特技（玩家指定，數值仍隨機）：
// {武器:{attrs:['武勇','統率'],trait:'萬全'}, 防具:{...}, ...}；沒指定的部分全隨機。
export function rollGear(R=Math.random,want={}){
  return['武器','防具','坐騎','家寶'].map(slot=>{
    const names=NAMES[slot],w=want[slot]||{},tr=rollTrait(slot,R,w.trait);
    return{slot,name:names[Math.floor(R()*names.length)],attrs:rollAttrs(slot,R,w.attrs),trait:{n:tr.n,v:tr.v,fx:tr.t.fx||null,k:tr.t.k||null,to:tr.t.to||null}};
  });
}
// 把四件裝備合成戰鬥用的加成：st（四項屬性）、cav（騎兵隊才生效的屬性）、tm（戰鬥中全程 % 加成）
export function gearBonus(items){
  const st={武勇:0,智略:0,統率:0,速度:0},cav={},tm=[];
  const add=(o,k,v)=>{o[k]=(o[k]||0)+v};
  for(const it of items||[]){
    for(const k in it.attrs)if(k in st)st[k]+=it.attrs[k];
    const t=it.trait,v=t.v;
    if(t.fx==='st')st[t.to]+=v;
    else if(t.fx==='st4'){for(const k in st)st[k]+=v}
    else if(t.fx==='st2'){for(const k of t.to)st[k]+=v}
    else if(t.fx==='cav')add(cav,t.to,v);
    else if(t.fx==='tm')tm.push({k:t.k,v,until:99});
    else if(t.fx==='fangyuan'){st.統率+=v;st.速度-=Math.min(6,Math.max(2,v/3))}   // 方圓：統率 +3~15、速度 −2~6（速度扣多少用統率擲值換算）
  }
  for(const k in st)st[k]=Math.round(st[k]*10)/10;
  return{st,cav,tm};
}
// 一行文字說明（給介面／除錯）
export const GEAR_OPTIONS={attrs:SLOT_ATTR,traits:Object.fromEntries(Object.entries(TRAITS).map(([k,v])=>[k,v.map(t=>t.n)]))};
export function gearText(items){return items.map(it=>`${it.slot}：${it.name}（${Object.entries(it.attrs).map(([k,v])=>k+'+'+v.toFixed(2)).join(' ')}）${it.trait.n}${it.trait.v!=null?' '+it.trait.v:''}`).join('\n')}
