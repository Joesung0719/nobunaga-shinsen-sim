// 隨機珍品裝備（Joe 2026-11-23 決定：只做隨機、全珍品；遊戲裡本來就是亂跳）。
// 資料來自遊戲內「獎品說明」與 Joe 的裝備畫面：每件 1~3 個屬性、珍品屬性總和約 8~13.5、單項最小約 2.5、單件 1 個特技。
// 列表上的屬性不含特技效果，特技另外擲值（範圍見 TRAITS）。上品資料只留紀錄，不進隨機池。
// 引擎只吃 武勇／智略／統率／速度 四項屬性；政務、魅力只是顯示用，不影響戰鬥。
// 特技的 fx：st＝直接加屬性；tm＝戰鬥中全程生效的 % 加成（鍵同兵學 fx）；cav＝只在騎兵隊生效的屬性。沒有 fx 的特技（引擎尚未模擬）照抽、照顯示，但不影響戰鬥。

const SLOT_ATTR={武器:['武勇','智略','統率','政務'],防具:['智略','統率','速度','政務','魅力'],坐騎:['武勇','統率','速度','魅力'],家寶:['武勇','智略','統率','速度','政務','魅力']};
const NAMES={
  武器:['大典太光世','童子切安綱','數珠丸恒次','鬼丸國綱','蜻蛉切','皆朱槍','日本號','御手杵','大包平','小豆長光','宗三左文字','壓切長谷部','山姥切長義','日光助真','骨喰藤四郎','片鎌槍','一張弓','豐通槍','馬上宿許筒','不動行光','明智近景','笑面青江','國崩','獵隼砲','人間無骨','一期一振','鶯丸','來國長','三日月宗近','甲斐竹弓','赤突槍','宇佐美長光','黑穗槍','采配','握剪','蝶之短刀','八文字長義','三人張弓','雷切'],
  防具:['惣黑熊毛具足','朱漆塗佛二枚胴','長烏帽子形兜','十二間筋兜','大釘後立兜','唐冠形兜','飯綱權現付兜','大水牛脇立兜','銀白檀塗兜','三日月兜','一之谷兜','金覆輪筋兜','金銀象嵌兜','馬蘭後立付兜','鹿角脇立兜','萌蔥糸素懸威','金陀美具足','熏韋素懸威','魚鱗札二枚胴','紫糸威最上胴','鯰尾形兜','齒朵具足','黑糸威二枚胴','片肌脫二枚胴','藍韋威肩赤鎧','南蠻胴具足','黑漆塗五枚胴','小櫻韋威鎧','金小札色色威','橙色扇骨紋打掛','十二間突盔形兜','升梯子二枚胴具足'],
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
    {n:'專心',fx:'tm',k:'critDmg',r:[3,15]},{n:'妖氣',fx:'gc',key:'妖氣',r:[0,1]},{n:'果決',fx:'gc',key:'果決',r:[0,1]},{n:'摧堅',fx:'gc',key:'摧堅',r:[0,1]},{n:'折銳',fx:'gc',key:'折銳',r:[0,1]},{n:'壓迫',fx:'gc',key:'壓迫',r:[0,1]},{n:'激昂',fx:'gc',key:'激昂',r:[0,1]},
    // 逆轉 1~2.5%、無言 0.5~3%、流轉 第 5~6 回合 5~40% 連擊（Joe 2026-11-25 鍛造畫面截圖）
    {n:'逆轉',fx:'tm',k:'dmgBowCav',r:[1,2.5]},{n:'無言',fx:'tm',k:'dmgPas',r:[0.5,3]},{n:'流轉',fx:'gc',key:'流轉',r:[0,1]},
    // 號令 指揮戰法傷害 +0.5~3%；破空 鐵炮隊每回合 4~12% 機率謀略傷害 50~100%（每場 1 次）（2026-11-26 鍛造畫面）
    {n:'號令',fx:'tm',k:'dmgCom',r:[0.5,3]},{n:'破空',fx:'gc',key:'破空',r:[0,1]}],
  防具:[
    {n:'方圓',fx:'fangyuan'},
    {n:'脫兔',fx:'tm',k:'evade',r:[1,3]},{n:'反影',fx:'gc',key:'反影',r:[0,1]},{n:'殘心',fx:'gc',key:'殘心',r:[0,1]},{n:'默殺',fx:'tm',k:'takenAtkRush',r:[3,15]},{n:'光耀',fx:'gc',key:'光耀',r:[0,1]},{n:'戒心',fx:'gc',key:'戒心',r:[0,1]},{n:'怒濤',fx:'gc',key:'怒濤',r:[0,1]},{n:'氣骨',fx:'tm',k:'takenPas',r:[2,8]},{n:'強固',fx:'tm',k:'takenCom',r:[2,8]},{n:'奪旗',fx:'gc',key:'奪旗',r:[0,1]},{n:'勇猛',fx:'gc',key:'勇猛',r:[0,1]},{n:'耀武',fx:'gc',key:'耀武',r:[0,1]},{n:'復甦',fx:'gc',key:'復甦',r:[0,1]},{n:'絕境',fx:'gc',key:'絕境',r:[0,1]},{n:'堅韌',fx:'gc',key:'堅韌',r:[0,1]},{n:'籠絡',fx:'gc',key:'籠絡',r:[0,1]},
    // 2026-11-26 鍛造畫面：靈藥（休養／回生治療機率提高）、不屈（首次被施加持續性減益 → 減傷）、不動（首次被控制 → 減傷）、密謀／設伏（施加的控制／持續減益被淨化 → 謀略傷害）
    ...['靈藥','不屈','不動','密謀','設伏'].map(n=>({n,fx:'gc',key:n,r:[0,1]}))],
  坐騎:[...STAT4,
    {n:'急進',fx:'cav',to:'速度',r:[5,15]},
    {n:'背水',fx:'gc',key:'背水',r:[0,1]},{n:'刹那',fx:'gc',key:'刹那',r:[0,1]},{n:'險相',fx:'gc',key:'險相',r:[0,1]},{n:'紫電',fx:'gc',key:'紫電',r:[0,1]},{n:'止水',fx:'gc',key:'止水',r:[0,1]},{n:'惡毒',fx:'gc',key:'惡毒',r:[0,1]},{n:'斷謀',fx:'gc',key:'斷謀',r:[0,1]},{n:'凌厲',fx:'gc',key:'凌厲',r:[0,1]},{n:'石鐵',fx:'gc',key:'石鐵',r:[0,1]},{n:'鐵甲',fx:'gc',key:'鐵甲',r:[0,1]},{n:'庇佑',fx:'gc',key:'庇佑',r:[0,1]}],
  家寶:[
    {n:'散華',fx:'tm',k:'dmg',r:[1,3]},
    {n:'相堅',fx:'tm',k:'taken',r:[1,3]},
    {n:'急襲',fx:'st2',to:['武勇','統率'],r:[2,6]},
    {n:'磨練',fx:'st2',to:['智略','速度'],r:[2,6]},
    {n:'德望',fx:'off',to:'政務',r:[3,8]},{n:'華麗',fx:'off',to:'魅力',r:[3,8]},{n:'修羅',fx:'gc',key:'修羅',r:[0,1]},{n:'鬼謀',fx:'gc',key:'鬼謀',r:[0,1]},{n:'架勢',fx:'gc',key:'架勢',r:[0,1]},{n:'詭計',fx:'gc',key:'詭計',r:[0,1]},{n:'練磨',fx:'off'},{n:'集結',fx:'off'},{n:'指南',fx:'off'}],   // off＝政務、魅力、經驗、行軍：戰鬥用不到，只顯示
};
// 專屬特技：只會出現在那一件裝備上（和共用池一起抽）。早期型＝戰鬥前 1~3 回合加屬性／狀態，擲值 0~1 同時決定回合數與數值。
const EARLY=(n,to)=>({n,fx:'gc',key:n,r:[0,1],early:to});
const G=(n,who)=>({n,fx:'gc',key:n,r:[0,1],...(who?{who}:{})});   // 條件型專屬：擲值 0~1，引擎依說明換算；who＝綁定武將
// 每件裝備的專屬特技（可能不只一個；和共用池一起抽）。說明全文見 /mnt/project-files/equipment/equipment-notes.md（2026-11-25～26 遊戲內收集）
const EXCL={
  // 坐騎
  遠江鹿毛:[EARLY('炯眼','智略')],星河原毛:[EARLY('青嵐','速度')],大蘆毛:[EARLY('岩肌','統率')],阿拉伯馬:[EARLY('激突','武勇')],   // 前 1~3 回合 +6~18
  // 家寶
  蘭奢待:[G('清香')],   // 前 1~3 回合 會心＋奇謀 5~25%
  白鷺圖:[G('繚亂')],孫子:[G('蜃氣樓')],李衛公問對:[G('斷刃')],   // 第 4~5 回合 20~80% 使敵軍大將混亂／無策／封擊 1 回合
  三國志演義:[G('魏傳')],   // 同勢力友軍武勇 +1~6
  史記:[G('陽炎')],   // 前 1~2 回合我軍 1~2 人奇謀 5~20%
  念珠:[{n:'般若',fx:'tm',k:'heal',r:[1,8]}],   // 造成的治療效果 +1~8%
  維吉諾琴:[G('幻影')],司馬法:[G('扶危')],三十六計:[G('毒計')],貞永式目抄:[G('泰然')],
  築城記:[{n:'鬼斧',fx:'off',r:[0.5,3]},{n:'神工',fx:'off',r:[0.5,3]}],   // 內政／軍事建設時間縮短，不影響戰鬥
  香袋:[G('凝香','阿初'),G('落英','阿江')],
  // 防具
  惣黑熊毛具足:[G('白瀧')],   // 受戰法傷害 5~10% 機率獲得 10~25% 會心，1~2 回合，疊 1~2 次
  長烏帽子形兜:[G('相殺')],銀白檀塗兜:[G('定謀','黑田官兵衛')],三日月兜:[G('逆鱗','伊達政宗')],橙色扇骨紋打掛:[G('安康','寧寧')],
  十二間突盔形兜:[G('迅疾','長宗我部元親')],黑漆塗五枚胴:[G('底力')],升梯子二枚胴具足:[G('反復','真田昌幸')],大水牛脇立兜:[G('亂雲')],
  金小札色色威:[G('薰風')],南蠻胴具足:[G('荒天')],大釘後立兜:[G('鐵壁')],
  // 武器
  宇佐美長光:[G('回響','宇佐美定滿')],三人張弓:[G('第一','今川義元')],山姥切長義:[G('獅心','北條氏康')],
  雷切:[G('雷刃','立花道雪'),G('電閃','立花誾千代')],
  數珠丸恒次:[{n:'破邪',fx:'tm',k:'rateAct',r:[0.5,2]}],鬼丸國綱:[{n:'影切',fx:'tm',k:'rushRate',r:[0.5,2]}],國崩:[{n:'轟鳴',fx:'tm',k:'ratePrep',r:[1,5]}],
  蜻蛉切:[{n:'銳利',fx:'tm',k:'crit',r:[2.5,10],who:'本多忠勝'}],
  赤突槍:[G('流星','山縣昌景'),G('貫通','飯富虎昌')],甲斐竹弓:[G('烈弓','成田甲斐')],笑面青江:[G('歸雁','柴田勝家')],黑穗槍:[G('長驅','柿崎景家')],
  采配:[G('奇襲','山本勘助')],握剪:[G('持家','妻木熙子')],明智近景:[G('深謀','明智光秀')],片鎌槍:[G('勇力','加藤清正')],骨喰藤四郎:[G('百計','毛利元就')],
  大典太光世:[G('靈刀')],壓切長谷部:[G('先見','織田信長')],日光助真:[G('太平','德川家康')],小豆長光:[G('龍牙','上杉謙信')],童子切安綱:[G('鬼斬')],
  一期一振:[G('日輪','豐臣秀吉')],來國長:[G('虎目','武田信玄')],八文字長義:[G('威懾','佐竹義重')],蝶之短刀:[G('蝶夢','歸蝶')],
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
function rollTrait(slot,R,want,name){
  const pool=[...(EXCL[name]||[]),...TRAITS[slot]];
  const t=pool.find(x=>x.n===want)||pool[Math.floor(R()*pool.length)];
  const v=t.r?r1(between(R,t.r)):null;
  return{n:t.n,v,t};
}
// 擲一套四件（武器、防具、坐騎、家寶）。want 可指定每件想要的屬性與特技（玩家指定，數值仍隨機）：
// {武器:{attrs:['武勇','統率'],trait:'萬全'}, 防具:{...}, ...}；沒指定的部分全隨機。
export function rollGear(R=Math.random,want={}){
  return['武器','防具','坐騎','家寶'].map(slot=>{
    const names=NAMES[slot],w=want[slot]||{},name=w.name&&names.includes(w.name)?w.name:names[Math.floor(R()*names.length)],tr=rollTrait(slot,R,w.trait,name);
    return{slot,name,attrs:rollAttrs(slot,R,w.attrs),trait:{n:tr.n,v:tr.v,fx:tr.t.fx||null,k:tr.t.k||null,to:tr.t.to||null,key:tr.t.key||null,early:tr.t.early||null,who:tr.t.who||null}};
  });
}
// 把四件裝備合成戰鬥用的加成：st（四項屬性）、cav（騎兵隊才生效的屬性）、tm（戰鬥中全程 % 加成）
// 舊存檔的裝備只存了 n／v／fx，這裡用特技名補回 key 等欄位（特技表改過也能跟上）
const ALL=Object.fromEntries([...Object.values(TRAITS).flat(),...Object.values(EXCL).flat()].map(t=>[t.n,t]));
ALL.白瀨=ALL.白瀧;   // 舊存檔：先前誤記為「白瀨」
export function gearBonus(items,who){
  const st={武勇:0,智略:0,統率:0,速度:0},cav={},tm=[],gc={};
  const add=(o,k,v)=>{o[k]=(o[k]||0)+v};
  for(const it of items||[]){
    for(const k in it.attrs)if(k in st)st[k]+=it.attrs[k];
    const d=ALL[it.trait?.n]||{},t={...it.trait,fx:d.fx??it.trait?.fx,k:d.k??it.trait?.k,to:d.to??it.trait?.to,key:d.key},v=t.v;
    if(d.who&&who&&who!==d.who)continue;   // 綁定武將的專屬特技：別人帶就沒有效果
    if(t.fx==='st')st[t.to]+=v;
    else if(t.fx==='st4'){for(const k in st)st[k]+=v}
    else if(t.fx==='st2'){for(const k of t.to)st[k]+=v}
    else if(t.fx==='cav')add(cav,t.to,v);
    else if(t.fx==='tm')tm.push({k:t.k,v,until:99});
    else if(t.fx==='gc')gc[t.key||t.n]=v;   // 條件型特技：擲值 0~1 對應說明的範圍，戰鬥引擎 slg/engine.js 的 GP() 換算
    else if(t.fx==='fangyuan'){st.統率+=v;st.速度-=Math.min(6,Math.max(2,v/3))}   // 方圓：統率 +3~15、速度 −2~6（速度扣多少用統率擲值換算）
  }
  for(const k in st)st[k]=Math.round(st[k]*10)/10;
  return{st,cav,tm,gc};
}
// 一行文字說明（給介面／除錯）
export const GEAR_OPTIONS={attrs:SLOT_ATTR,names:NAMES,excl:Object.fromEntries(Object.entries(EXCL).map(([k,v])=>[k,v.map(t=>t.n)])),traits:Object.fromEntries(Object.entries(TRAITS).map(([k,v])=>[k,v.map(t=>t.n)]))};
// 特技在戰鬥中的狀態：'battle'＝已接進引擎；'off'＝戰鬥用不到（政務／魅力／經驗／行軍）；'todo'＝還沒有說明資料
export const traitWho=n=>ALL[n]?.who||null;
export const traitRange=n=>ALL[n]?.r||null;
export const traitStatus=n=>{const t=ALL[n];return !t?'todo':t.fx==='off'?'off':t.fx?'battle':'todo'};
export function gearText(items){return items.map(it=>`${it.slot}：${it.name}（${Object.entries(it.attrs).map(([k,v])=>k+'+'+v.toFixed(2)).join(' ')}）${it.trait.n}${it.trait.v!=null?' '+it.trait.v:''}`).join('\n')}
