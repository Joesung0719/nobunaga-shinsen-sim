// 武將規則層（2026-11-24 起的唯一來源）：勢力、兵種加成、兵種選擇、大將技、性別、特性數值。
// 引擎（engine.js）、組隊頁（land.html）、推薦（teamlib.js、advisor.js）、AI 配隊（aisearch.js）、劇本（game.js）、離線工具（tools/）全部只讀這裡。
// 以前這些規則在 5 個檔案各寫一份，修一份其他不會跟著改（問題總表 R1、R2、E2、R7、D6）。這支不 import 任何東西，誰都能用。

export const ST4=['武勇','智略','統率','速度'];
export const FAC6=['織田','豐臣','德川','武田','上杉','群雄'];
export const ARMS=['騎','槍','弓','鐵炮'];
export const ARM_NAME={騎:'騎兵',槍:'足輕',弓:'弓兵',鐵炮:'鐵炮',器械:'器械'};
const ARM_CH={馬:'騎',弓:'弓',槍:'槍',炮:'鐵炮',器:'器械'},ARM_WORD={騎兵:'騎',弓兵:'弓',足輕:'槍',鐵炮:'鐵炮',器械:'器械'},STAT_TR={武威:'武勇',智慧:'智略',領兵:'統率',靈巧:'速度'};
export const RED_AT=[0,1,3,5];   // 特性欄 1～4 在 0／1／3／5 紅解鎖

// ---- 特性 ----
// 一個特性的數值效果：兵種等級 arm{兵種:級}、等級上限 cap、自身屬性 % stat/pct、我軍全體屬性 % team/tpct。
// 有說明文字就只看說明文字（同一個特性只算一次）；沒有說明才看特性名稱（X術I～III、武威I～III…）。
export function traitFx(D,n,t){
  const txt=D.traitText?.[n]?.[t]||'';let m=txt.match(/^部隊的?(.+?)等級(?:上升(\d)級|\+(\d))/);   // 舊寫法「部隊的騎兵等級上升3級」、新賽季預告「部隊騎兵等級+3，等級上限+1」
  if(m){const ws=m[1].split('、').filter(w=>ARM_WORD[w]),lv=+(m[2]||m[3]),c=txt.match(/等級上限(?:增加(\d)級|\+(\d))/),cv=c&&+(c[1]||c[2]);
    return{arm:Object.fromEntries(ws.map(w=>[ARM_WORD[w],lv])),cap:c?Object.fromEntries(ws.map(w=>[ARM_WORD[w],cv])):null,big:!!c}}
  if(!txt){m=t.match(/^([馬弓槍炮器]+)術(I{1,3})$/);if(m)return{arm:Object.fromEntries([...m[1]].map(c=>[ARM_CH[c],m[2].length]))}}
  m=t.match(/^(武威|智慧|領兵|靈巧)(I{1,3})$/);if(m)return{stat:STAT_TR[m[1]],pct:[2,2.5,3][m[2].length-1]};
  m=txt.match(/^我軍全體(武勇|智略|統率|速度)提高([\d.]+)%$/);if(m)return{team:m[1],tpct:+m[2]};
  return{};
}
// 紅度 red 可以是數字或 {武將:紅度}
const rdOf=(red,n)=>typeof red==='object'&&red?(red[n]??5):(red??5);
export const traitsAtRed=(D,n,red=5)=>(D.stats?.[n]?.traits||[]).slice(0,red>=5?4:red>=3?3:red>=1?2:1);

// ---- 兵種 ----
// 這位武將（滿紅）每個兵種給幾級；big＝有「X兵大將」（等級上限 +1）的兵種
export function armTraits(D,n){
  const o={},big=[],src=[];
  for(const t of D.stats?.[n]?.traits||[]){const x=traitFx(D,n,t);if(!x.arm)continue;src.push(t);
    for(const k in x.arm){o[k]=(o[k]||0)+x.arm[k];if(x.big)big.push(k)}}
  return{o,big,src};
}
// 隊伍兵種等級：兵種營＋隊中已解鎖特性（每個特性只算一次），上限 10＋X兵大將
export function armLevel(D,names,arm,red=5,camp=5){
  let tr=0,cap=10;const parts=[];
  for(const n of names)for(const t of traitsAtRed(D,n,rdOf(red,n))){const x=traitFx(D,n,t);const v=x.arm?.[arm]||0;if(v){tr+=v;parts.push([n,t,v])}cap+=x.cap?.[arm]||0}
  return{lv:Math.min(cap,camp+tr),raw:camp+tr,cap,camp,tr,parts};
}
// 兵種怎麼定（Joe 2026-11-24）：大將有「X兵大將」→ 固定那個兵種；否則全隊特性兵種等級最高的（同分的都可以，由模擬或大將偏好決定）；全隊都沒有兵種特性 → 四種都可以。
// names[0] 是大將。回傳 {arms:[可用兵種，第一個是預設], why}
export function chooseArm(D,names){
  const tot={},lead=armTraits(D,names[0]);
  for(const n of names){const a=armTraits(D,n).o;for(const k in a)if(ARMS.includes(k))tot[k]=(tot[k]||0)+a[k]}
  const bigL=lead.big.filter(a=>ARMS.includes(a)).sort((x,y)=>(tot[y]||0)-(tot[x]||0));
  if(bigL.length)return{arms:[bigL[0]],why:`大將 ${names[0]} 有「${ARM_NAME[bigL[0]]}大將」特性，兵種固定用${ARM_NAME[bigL[0]]}`};
  const ks=Object.keys(tot);
  if(!ks.length)return{arms:[...ARMS],why:'隊中沒有兵種特性，四種兵種都可以'};
  const mx=Math.max(...ks.map(k=>tot[k]));
  const top=ks.filter(k=>tot[k]===mx).sort((a,b)=>(lead.o[b]||0)-(lead.o[a]||0)||ARMS.indexOf(a)-ARMS.indexOf(b));
  return{arms:top,why:top.length>1?`特性兵種等級同分（${top.map(a=>ARM_NAME[a]+' +'+mx).join('、')}）`:`全隊特性兵種等級最高：${ARM_NAME[top[0]]} +${mx}`};
}
export const bestArm=(D,names)=>names.some(n=>ARMS.some(k=>armTraits(D,n).o[k]))?chooseArm(D,names).arms[0]:null;   // 全隊都沒有兵種特性時回 null（由呼叫端決定）
// 「兵種等級加成：A「X」+2、…」說明（顯示用，和 armLevel 同一份計算）
export const armReason=(D,arm,names,red=5)=>{const p=armLevel(D,names,arm,red).parts;return p.length?`兵種等級加成：${p.map(([n,t,v])=>`${n}「${t}」+${v}`).join('、')}`:''};

// ---- 勢力 ----
// 會變勢力的特性：lead＝老獪（勢力與大將一致，自己不是大將時）；fox＝老狐狸（另外兩人同勢力且和自己不同時，變成那個勢力）
export function facRule(D,n){const x=Object.values(D.traitText?.[n]||{}).join('');return/勢力將與大將保持一致/.test(x)?'lead':/轉變為其勢力/.test(x)?'fox':null}
// list：[{f, rule}]（rule 由 facRule 給），回傳實際勢力
export function effFacs(list){
  const f=list.map(x=>x.f);
  list.forEach((x,i)=>{if(x.rule==='lead'&&i>0&&f[0])f[i]=f[0]});
  list.forEach((x,i)=>{if(x.rule==='fox'){const o=f.filter((_,j)=>j!==i);if(o[0]&&o[0]===o[1]&&o[0]!==f[i])f[i]=o[0]}});
  return f;
}
export const facsOf=(D,names)=>effFacs(names.map(n=>({f:D.stats?.[n]?.f,rule:facRule(D,n)})));
// same＝三人同勢力（吃協力）；alliance＝三人勢力都不同（合盟之陣可生效）；mixed＝其他
export function facTypeOf(fs){return fs.every(Boolean)&&new Set(fs).size===1?'same':fs.every(Boolean)&&new Set(fs).size===fs.length?'alliance':'mixed'}
export const facType=(D,names)=>facTypeOf(facsOf(D,names));
// 協力：只有三人同勢力（六勢力之一，群雄也算）才生效
export const CO_PCT=[0,0.5,1,1.5,2,2.5,3,4,5,6,7];
export const coopPct=(D,names,co=10)=>{const fs=facsOf(D,names);return co&&FAC6.includes(fs[0])&&facTypeOf(fs)==='same'?CO_PCT[co]:0};
// 設施：全部升滿（Joe），家門 +3% 沒有資料，預設不勾（Joe 2026-11-24）
export const FAC_FULL={co:10,arm:5,ka:3,same:false};

// ---- 大將技 ----
// 固有戰法說明裡真的有大將技（boss 欄是效果文字，不是只有「（發動機率X→Y）」）
export const bossText=(D,inn)=>{const b=D.skillText?.[inn]?.boss;return b&&!/^\s*（?發動機率[\d.%→]+）?\s*$/.test(b)?b:''};

// ---- 性別 ----
// 資料庫沒有性別欄，依官方設定列出（謀將與女性通常帶補血、輔助戰法）
export const FEMALE=new Set(['阿市','寧寧','阿初','阿江','阿松','歸蝶','成田甲斐','立花誾千代','吉岡妙林','大祝鶴','妻木熙子','壽桂尼','仙桃院','瑞溪院','諏訪姬','池田千']);
