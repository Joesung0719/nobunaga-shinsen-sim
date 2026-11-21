// 真戰 Q版戰棋：8 回合自動戰鬥。
// 官方公式沒有公開，這裡的傷害公式、相剋倍率、地形加成都是推估值（集中在 K 裡，方便之後用戰報對照調整）。
// 戰法效果從 land.json 的 skillText 說明文字讀出（發動率、傷害率、目標數、治療率、控制狀態、自身屬性加點），
// 沒有說明文字的戰法依類型與等級給通用值，並標成「推估」。

export const K={
  rounds:8,
  // 2026-11-18 校正（第一版）：由 52 場詳細戰報、394 次普通攻擊擬合（35 場擬合、15 場回測）；
  // bootstrap 80% 區間 statDiv 240～340、base 4.0～4.4；中位絕對對數誤差 0.56 → 0.32。
  // 限制：資料未含兵學／標籤／評定眾／裝備（裝備為隨機打造無法還原）；戰法發動率與相剋倍率尚未校正，僅為第一版。
  base:4.2,          // 傷害基數 = √兵力 × base × 傷害率 × 屬性差係數
  statDiv:280,       // 屬性差係數 = 1 + (攻方屬性 − 守方屬性) / statDiv，夾在 0.3～3
  counter:[1.15,0.87],   // 兵種相剋：剋制方兵刃傷害 ×1.15，被剋方 ×0.87
  terrain:{},        // 地形對傷害的倍率，例如 {林:0.9}；遊戲內地形沒有攻防加成（Joe）
  // 火炬（Joe 截圖 2026-11-20）：占領後擁有火炬視野，視野內同一門玩家部隊戰鬥時造成傷害 +3%、受到傷害 −3%。
  // 用法：team.mods={dmg:K.torch.dmg,taken:K.torch.taken}（視野範圍的格數尚未收集，由呼叫端決定誰在範圍內）
  torch:{dmg:1.03,taken:.97,w:7,h:6},   // 視野範圍 7×6 格（Joe）
  crit:1.5,         // 會心（兵刃）／奇謀（謀略）觸發時的傷害倍率：推估值，奇謀傷害率另外加上去
  guess:{主動:{S:[.35,1.7],A:[.35,1.45],B:[.4,1.2]},突擊:{S:[.3,1.9],A:[.3,1.6],B:[.3,1.3]}},
};
// 兵種相剋（遊戲內說明，Joe 提供）：騎兵剋弓兵、弓兵剋鐵炮、鐵炮剋足輕、足輕剋騎兵；器械被其他兵種剋制。
export const COUNTER={槍:['騎','器械'],騎:['弓','器械'],弓:['鐵炮','器械'],鐵炮:['槍','器械']};
// 火炬視野：(x,y) 是否在以 (cx,cy) 為中心的 7×6 格內。6 的那一邊中心偏哪側還沒確認，暫時多算上側（y−3～y+2）。
export const inTorch=(cx,cy,x,y)=>Math.abs(x-cx)<=Math.floor(K.torch.w/2)&&y>=cy-Math.floor(K.torch.h/2)&&y<=cy+Math.ceil(K.torch.h/2)-1;
export const ST4=['武勇','智略','統率','速度'];
const STATUS={威壓:'無法行動',麻痺:'30% 機率無法行動',混亂:'50% 機率無法行動',無策:'無法發動主動戰法',封擊:'無法普通攻擊'};

const num=s=>s==null?null:+s;
// 「Lv1→滿級」：預設取滿級；parseSkill(name,D,lv) 指定 1～10 級時，兩端數值線性內插（推估：遊戲沒公開每級數值，只有 Lv1 與滿級）。
export const MAX_SKILL_LV=10,DEFAULT_SKILL_LV=8;   // 戰法等級 Lv1～Lv10（Joe 2026-11-20 更正，原先誤設 1～5）；預設 Lv8 是推估的一般玩家練度
let curLv=null;
const hi=(a,b)=>{const x=num(a),y=num(b);if(y==null||curLv==null)return y??x;return x+(y-x)*(Math.max(1,Math.min(MAX_SKILL_LV,curLv))-1)/(MAX_SKILL_LV-1)};
function targetCount(s){
  if(!s)return[1,1];
  if(/全體/.test(s))return[3,3];
  const m=s.match(/(\d)(?:-(\d))?人/);if(m)return[+m[1],+(m[2]||m[1])];
  return[1,1];
}
// 指揮／被動戰法裡「戰鬥中／戰鬥前N回合，自身／我軍…造成傷害提高、受到傷害降低、會心、屬性增加、發動率增加、每回合治療」這類單純的增益，
// 以句子為單位解析；含「若／機率／累計／每次受到…時／敵軍」等條件的句子整句略過（partial=true），不亂猜。
// 結果 buf: [{k, v, to:'self'|'team'|'grp', n, r}]，k 是兵學同一套 fx 鍵（dmg dmgBlade dmgStrat taken takenBlade takenStrat weak crit critS healIn rateAct rushRate），
// 或 'stat:武勇' 等（直接加屬性）。r = 持續到第幾回合（99＝整場）。
const SUBJ=/(自身|自己|我軍全體|我軍群體（([\d-]+)人）|友軍群體（([\d-]+)人）)/;
const BLOCK=/每次|每當|每累計|累計|受到[^，。]{0,8}時|若|有[\d.]+%(?:→[\d.]+%)?(?:的)?機率|疊加|第[\d、]+回合|冷卻|敵軍|其中|優先|之後|傭兵|援護/;
const VV='([\\d.]+)%?(?:→([\\d.]+)%?)?';
function parseBuffs(x){
  const buf=[];let regen=null,partial=false;
  for(let sen of x.replace(/（受[^）]*影響）/g,'').split(/。|，但|但/)){
    sen=sen.trim();if(!sen)continue;
    const sm=sen.match(SUBJ),r=+(sen.match(/戰鬥前(\d)回合/)?.[1]||99);
    const rg=sen.match(new RegExp('每回合治療(我軍群體|友軍群體)（(\\d)人，治療率'+VV));
    if(rg&&!/若|機率.*機率/.test(sen.replace(/，有[^，。]*機率治療我軍全體/,''))){regen={n:+rg[2],rate:hi(rg[3],rg[4])/100};continue}
    if(/獲得休養狀態/.test(sen)){const m=sen.match(new RegExp('治療率'+VV));if(m){regen={n:1,rate:hi(m[1],m[2])/100,self:true};continue}}
    if(!sm||BLOCK.test(sen)){if(/提高|降低|增加|獲得|治療|傷害/.test(sen))partial=true;continue}
    const to=sm[1]==='自身'||sm[1]==='自己'?'self':/全體/.test(sm[1])?'team':'grp';
    const n=to==='grp'?+(sm[2]||sm[3]).split('-').pop():0;
    const put=(k,v)=>buf.push({k,v,to,n,r});
    let m,got=0;
    if(m=sen.match(new RegExp('造成(兵刃|謀略)?傷害(?:提高|提升|增加)'+VV))){put(m[1]==='兵刃'?'dmgBlade':m[1]==='謀略'?'dmgStrat':'dmg',hi(m[2],m[3]));got++}
    if(m=sen.match(new RegExp('造成(?:的)?傷害降低'+VV))){put('weak',hi(m[1],m[2]));got++}
    if(m=sen.match(new RegExp('受到(兵刃與謀略|兵刃|謀略)?(?:的)?傷害(?:降低|減少)'+VV))){put(m[1]==='兵刃'?'takenBlade':m[1]==='謀略'?'takenStrat':'taken',hi(m[2],m[3]));got++}
    if(m=sen.match(new RegExp('獲得'+VV+'會心狀態'))){put('crit',hi(m[1],m[2]));got++}
    if(m=sen.match(new RegExp('受到治療(?:效果)?提高'+VV))){put('healIn',hi(m[1],m[2]));got++}
    if(m=sen.match(new RegExp('((?:武勇|智略|統率|速度)(?:、(?:武勇|智略|統率|速度))*)增加'+VV+'(?!%)'))){for(const k of m[1].split('、'))put('stat:'+k,hi(m[2],m[3]));got++}
    if(m=sen.match(new RegExp('主動戰法的?發動機率增加'+VV))){put('rateAct',hi(m[1],m[2]));got++}
    if(m=sen.match(new RegExp('突擊戰法的?發動機率增加'+VV))){put('rushRate',hi(m[1],m[2]));got++}
    if(!got&&/提高|降低|增加|獲得/.test(sen))partial=true;
  }
  return{buf,regen,partial};
}
// 兵種技（kind＝兵種）：說明文字寫的是「將○兵進階為…」，整隊（3 人）開場就生效。arm＝需要的隊伍兵種；只模擬屬性、傷害／會心／發動率這類數值，
// 回生、反擊、密報、冷卻這類條件效果沒有模擬（龍騎兵的彈丸機制簡化成每回合機率打一次）。數值 [Lv1, 滿級]。
const ARMSK={
  龍騎兵:{arm:'鐵炮',each:{rate:[35,70],dmg:[52,104],dtype:'auto'}},
  伊賀忍者:{arm:'弓',buf:[{k:'stat:武勇',v:[5,10]},{k:'stat:速度',v:[5,10]}],each:{rate:[100,100],dmg:[54,107]}},
  三河弓兵隊:{arm:'弓',buf:[{k:'stat:統率',v:[10,20]}]},
  越後先手組:{arm:'騎',buf:[{k:'stat:速度',v:[12,24]}]},
  三河武士:{arm:'槍',buf:[{k:'stat:統率',v:[8,16]}]},
  母衣武者:{arm:'騎',buf:[{k:'stat:速度',v:[10,20]}]},
  僧兵隊:{arm:'槍',buf:[{k:'takenBlade',v:[10,20]}]},
  甲斐弓騎兵:{arm:'弓',buf:[{k:'rateAct',v:[4,8]}]},
  大太刀力士隊:{arm:'槍',buf:[{k:'takenAtkRush',v:[9,18],r:2}]},
  薩摩鐵炮隊:{arm:'鐵炮',buf:[{k:'dmgAtk',v:[20,40]}]},
  鐵炮僧兵隊:{arm:'鐵炮',buf:[{k:'stat:統率',v:[6,12]},{k:'stat:智略',v:[6,12]}]},
  赤備隊:{arm:'騎',buf:[{k:'crit',v:[17.5,35]}]},
  // 合盟之陣：三人勢力都不同、大將自帶戰法是主動或突擊才生效（Joe）。大將自帶戰法發動率 +6.5→13%；兵力高的副將傷害 +9→18%、受傷 −5→10%，兵力低的副將傷害 +5→10%、受傷 −9→18%（誰高誰低隨戰況變，這裡取兩者平均）。
  合盟之陣:{arm:null,alliance:{boss:[6.5,13],sub:[7,14]}},
};
// 手工建模的戰法（官方編制最常用、說明文字寫明數值；Lv1→滿級內插）：連擊、封擊、挑釁、傷害降低、減傷、反制、治療…
// 說明文字沒寫明的部分（一領具足的傭兵、七十二欺計累計7次的全體傷害、文武雙全／運勝之鼻／疑心暗鬼等）不模擬。
// open＝開場／每回合自動生效（指揮、被動）；cast＝主動戰法發動時；rush＝突擊戰法命中時。全部設 buffOnly，劇本隨機抽戰法不會抽到（不改既有劇本）。
const SKFX={
  縱橫馳突:()=>({cast:{t:'combo',imm:true}}),
  前後夾擊:()=>({cast:{t:'combo',ally:true}}),
  氣炎萬丈:()=>({open:{t:'seal',n:2,p:hi(35,70)/100,dec:hi(7,14)/100,rounds:3}}),
  深謀遠慮:()=>({open:{t:'weak',n:2,v:hi(14,28),rounds:3}}),
  一領具足:()=>({open:{t:'taken',v:hi(6,12),rounds:2}}),
  罵詈雜言:()=>({open:{t:'taunt',p:hi(45,90)/100,rounds:3,self:hi(25,50)}}),
  氣勢沖天:()=>({open:{t:'shiten',v:hi(15,30),rounds:4}}),
  直言極諫:()=>({cast:{t:'guard',v:hi(12,24),dur:2}}),
  沉魚落雁:()=>({open:{t:'react',p:hi(18,36)/100}}),
  七十二欺計:()=>({open:{t:'qimou',p:hi(25,50),dmg:hi(15,30)}}),
  毘沙門天:()=>({open:{t:'bisha',p:hi(20,40)/100,heal:hi(27,54)/100,weak:hi(4.5,9)}}),
  戮力同心:()=>({open:{t:'ryoku',p:hi(17,34)/100,heal:hi(41,82)/100}}),
  惠風和雨:()=>({open:{t:'keifu',p:hi(40,80)/100,heal:hi(61,122)/100}}),
  斬雷神:()=>({open:{t:'zan',crit:hi(25,50),st:hi(60,120)}}),
  祓除:()=>({cast:{t:'purge',v:hi(12,24),dur:2}}),
  立身之志:()=>({cast:{t:'taunt2',pct:hi(22.5,55)}}),
  戰意崩壞:()=>({rush:{t:'fall',v:65}}),
  堅忍不拔:()=>({open:{t:'counter',a:hi(36,72)/100,b:hi(46,92)/100}}),
};
// one skill → what the engine can run
export function parseSkill(name,D,lv=null){
  curLv=lv;
  try{return parseSkill0(name,D)}finally{curLv=null}
}
function parseSkill0(name,D){
  const t=D.skillText?.[name],kind=t?.kind||D.kind?.[name]||(t?'?':'主動'),g=t?.g||D.skills?.[name]||'B';
  const sk={name,kind,g,modeled:'none',text:t?.text||''};
  if(kind==='內政')return sk;
  if(kind==='兵種'){const a=ARMSK[name];if(!a)return sk;   // 兵種技：開場直接生效，整隊吃到，只有隊伍兵種相符才有效（合盟之陣等條件型沒有模擬）
    sk.arm=a.arm;sk.opening=true;
    if(a.alliance){sk.alliance={boss:hi(a.alliance.boss[0],a.alliance.boss[1]),sub:hi(a.alliance.sub[0],a.alliance.sub[1])};sk.modeled='text';sk.buffOnly=true;return sk}
    const val=(v,i)=>hi(v[0],v[1]);
    if(a.buf)sk.buf=a.buf.map(b=>({k:b.k,v:hi(b.v[0],b.v[1]),to:'team',n:0,r:b.r||99}));
    if(a.each){sk.each=true;sk.rate=hi(a.each.rate[0],a.each.rate[1])/100;sk.dmg=hi(a.each.dmg[0],a.each.dmg[1])/100;sk.dtype=a.each.dtype||'兵刃';sk.n=[1,1]}
    sk.modeled='text';if(!sk.dmg)sk.buffOnly=true;
    return sk}
  if(!t){
    const gs=K.guess[kind]?.[g];
    if(gs)Object.assign(sk,{modeled:'guess',rate:gs[0],dmg:gs[1],dtype:'auto',n:[1,1]});
    return sk;
  }
  const x=t.text;
  if(SKFX[name]){const rm0=(t.rate||'').match(/([\d.]+)%(?:→([\d.]+)%)?/);
    Object.assign(sk,{modeled:'text',buffOnly:true,fx:SKFX[name](),rate:rm0?hi(rm0[1],rm0[2])/100:1,n:[1,1],partial:/傭兵|累計|蓄勢/.test(x)||undefined});return sk}
  // 「戰鬥中／每回合，有 a%→b% 機率對敵軍…造成傷害」 → 指揮／被動也在每回合行動時判定
  const pm=x.match(/有([\d.]+)%(?:→([\d.]+)%)?(?:（受\S{2}影響）)?機率(?:（受\S{2}影響）)?對敵軍/);
  // reactive skills (受到普通攻擊時…) are not simulated yet
  if(!pm&&/受到(普通攻擊|傷害|戰法)時|首次受到/.test(x)&&kind!=='主動'&&kind!=='突擊')return sk;
  const rm=(t.rate||'').match(/([\d.]+)%(?:→([\d.]+)%)?/);let rate=rm?hi(rm[1],rm[2])/100:1;
  const dm=x.match(/傷害率([\d.]+)%(?:→([\d.]+)%)?/)||x.match(/造成([\d.]+)%(?:→([\d.]+)%)?(?:兵刃|謀略)傷害/);
  const hm=x.match(/(?:治療率|恢復率)([\d.]+)%(?:→([\d.]+)%)?/);
  const ib=x.indexOf('兵刃傷害'),im=x.indexOf('謀略傷害');
  sk.dtype=ib<0?'謀略':im<0?'兵刃':ib<im?'兵刃':'謀略';
  if(ib<0&&im<0)sk.dtype=/普通攻擊|亂舞|連擊/.test(x)?'兵刃':'謀略';   // 一力當先（亂舞）是兵刃
  else if(/傷害率[\d.%→]+，受智略影響/.test(x)&&!/造成[\d.%→]*兵刃傷害|兵刃傷害（傷害率/.test(x))sk.dtype='謀略';   // 大智不智（消沉）吃智略
  if(t.tags?.includes('兵謀'))sk.dtype='auto';
  const tm=x.match(/對敵軍(單體|全體|群體（\d(?:-\d)?人）)/);
  sk.n=targetCount(tm?tm[1]:/^敵軍/.test(t.target||'')?t.target:'單體');
  if(dm)sk.dmg=hi(dm[1],dm[2])/100;
  if(hm){sk.heal=hi(hm[1],hm[2])/100;sk.healSelf=/治療自身|為自身進行治療/.test(x)&&!/我軍/.test(x.slice(0,x.indexOf('治療')))}
  sk.prep=/^準備1回合/.test(x);
  const cm=x.match(/(?:有([\d.]+)%(?:→([\d.]+)%)?機率[^，。]{0,12}?)?(?:使其|並使其|使敵軍\S{0,8}?|對其施加|施加)(?:進入)?(?:持續(\d)回合的)?(威壓|麻痺|混亂|無策|封擊)(?:、(威壓|麻痺|混亂|無策|封擊))?(?:狀態)?(?:[^。]{0,6}?持續(\d)回合)?/);
  if(cm){const dd=x.slice(cm.index,cm.index+cm[0].length+30).match(/持續(\d)回合/);
    sk.status={p:cm[1]?hi(cm[1],cm[2])/100:1,k:[cm[4],cm[5]].filter(Boolean),dur:+(cm[3]||dd?.[1]||1)}}
  const sm=x.match(/使自己的((?:武勇|智略|統率|速度)(?:、(?:武勇|智略|統率|速度))*)增加([\d.]+)(?:→([\d.]+))?點/);
  if(sm)sk.self={ks:sm[1].split('、'),v:hi(sm[2],sm[3])};
  let bf=null;
  if(kind==='指揮'||kind==='被動'){
    bf=parseBuffs(x);
    if(bf.buf.length)sk.buf=bf.buf;
    if(bf.regen)sk.regen=bf.regen;
    if(bf.partial||(pm&&!dm))sk.partial=true;
    if(pm&&dm){rate=hi(pm[1],pm[2])/100;sk.each=true}
    else if(!sm&&!sk.buf&&!sk.regen){return sk}
  }
  sk.rate=rate;
  if(sk.dmg||sk.heal||sk.status||sk.self||sk.buf||sk.regen)sk.modeled='text';
  if(sk.modeled==='text'&&!(sk.dmg||sk.heal||sk.status||sk.self))sk.buffOnly=true;   // 只有增益：劇本隨機抽戰法不用，免得改動既有劇本的武將配招（hash 分配）
  return sk;
}

function aliveIdx(team){return team.gens.map((g,i)=>g.troops>0?i:-1).filter(i=>i>=0)}
function pickN(arr,n,R){const a=[...arr],o=[];while(a.length&&o.length<n)o.push(a.splice(Math.floor(R()*a.length),1)[0]);return o}

// A: attacker team, B: defender team. team = {name, side, arm, terrain:'平'|'林'|'城', gens:[{n, st:{武勇…}, troops, max, skills:[parsed], bg}]}
// gens[0] is 大將. g.bg 是 bingaku.js compile() 的結果（兵學，可為 null）。Troops are changed in place.
// Returns {res:'W'|'D'|'L' (for A), log:[events], rounds}
// 軍學修習 Lv5：騎／鐵炮 武勇智略+2.5、傷害+1.25%、受傷-1.25%；弓 速度+5、傷害+2.5%；足輕 統率+5、受傷-2.5%
const STUDY={騎:{st:{武勇:2.5,智略:2.5},dmg:1.25,taken:1.25},鐵炮:{st:{武勇:2.5,智略:2.5},dmg:1.25,taken:1.25},弓:{st:{速度:5},dmg:2.5},槍:{st:{統率:5},taken:2.5}};
export function battle(A,B,R=Math.random){
  const T=[A,B],log=[];
  let round=0,res='D';
  // per-battle state: stat buffs, statuses, prepared skills, 兵學 values (fx) and timed 兵學 effects (tm)
  for(const t of T)for(const g of t.gens){
    g.b={...g.st};g.fx={};g.prep=null;g.start=g.troops;
    g.bx=g.bg?.fx||{};g.q=g.bg?.q||null;g.tm=[];g.cnt={反討之計:3,明鏡:2};g.lj=0;g.first=0;g.sealR=0;g.tn=null;g.sb=[];g.sh=0;g.cb=0;g.imm=0;
    for(const s of g.skills)if(s.self&&s.modeled==='text')for(const k of s.self.ks)g.b[k]+=s.self.v;
    if(g.bx.spd)g.b.速度+=g.bx.spd;
  }
  const ev=(e)=>log.push(e);
  const BG='兵學';
  // 軍學修習（設施，Lv5 全滿；玩家一律滿級）：依隊伍兵種給屬性與傷害／受傷％；t.study 才生效（守軍沒有）
  for(const t of T)if(t.study){const S=STUDY[t.arm];if(S)for(const g of t.gens){
    for(const k in S.st)g.b[k]+=S.st[k];
    if(S.dmg)g.tm.push({k:'dmg',v:S.dmg,until:99});if(S.taken)g.tm.push({k:'taken',v:S.taken,until:99});
  }}
  // 指揮／被動戰法的單純增益（buf）：戰鬥開始時套到自己／全隊／隨機友軍，屬性直接加，其餘走 tm（到第 r 回合）
  for(const t of T)t.gens.forEach(g=>{for(const sk of g.skills)if(sk.buf&&!(sk.arm&&t.arm!==sk.arm))for(const b of sk.buf){
    const tg=b.to==='self'?[g]:b.to==='team'?t.gens:pickN(t.gens,b.n,R);
    for(const m of tg){if(b.k.startsWith('stat:'))m.b[b.k.slice(5)]+=b.v;else m.tm.push({k:b.k,v:b.v,until:b.r})}
  }});
  // 合盟之陣：三人勢力各不相同、大將自帶戰法（skills[0]）是主動或突擊才生效
  for(const t of T)t.gens.forEach(g=>{for(const sk of g.skills)if(sk.alliance){
    const fs=t.gens.map(x=>x.f),bk=t.gens[0].skills[0]?.kind;
    if(fs.every(Boolean)&&new Set(fs).size===fs.length&&(bk==='主動'||bk==='突擊')){
      t.gens[0].tm.push({k:bk==='主動'?'rateAct':'rushRate',v:sk.alliance.boss,until:99});
      for(const m of t.gens.slice(1)){m.tm.push({k:'dmg',v:sk.alliance.sub,until:99});m.tm.push({k:'taken',v:sk.alliance.sub,until:99})}
    }}});
  // 手工建模戰法（SKFX）：開場生效的增益／減益
  T.forEach((t,ti)=>{const e=T[1-ti];t.gens.forEach(g=>{for(const sk of g.skills){const o=sk.fx?.open;if(!o)continue;
    if(o.t==='weak')for(const d of pickN(e.gens,o.n,R))d.tm.push({k:'weak',v:o.v,until:o.rounds});
    else if(o.t==='taken')for(const m of t.gens)m.tm.push({k:'taken',v:o.v,until:o.rounds});
    else if(o.t==='taunt')g.tm.push({k:'takenAtkRush',v:o.self,until:o.rounds});
    else if(o.t==='qimou'){g.tm.push({k:'critS',v:o.p,until:99});g.tm.push({k:'critSDmg',v:o.dmg,until:99})}
  }})});
  // 協同：隨機友軍單體造成的傷害提高
  for(const t of T)t.gens.forEach((g,i)=>{if(g.bx.ally){const j=Math.floor(R()*t.gens.length);t.gens[j].tm.push({k:'dmg',v:g.bx.ally,until:99})}});
  const M=(g,k)=>(g.bx[k]||0)+g.tm.reduce((a,x)=>a+(x.k===k&&x.until>=round?x.v:0),0);
  const timed=(g,k,v,n)=>g.tm.push({k,v,until:round+n-1});   // 持續 n 回合（含本回合）
  const routed=t=>t.gens[0].troops<=0;
  // kind: 'atk' 普通攻擊、戰法類型（主動／突擊／指揮／被動）或 '兵學'；prep: 準備後發動的主動戰法
  function hit(src,st,s,dst,dt,rate,dtype,kind='atk',prep=false){
    const g=src.gens[s],d=dst.gens[dt];
    if(d.troops<=0)return null;
    if(d.sh>0){d.sh--;return{side:dst.side,i:dt,v:0,left:d.troops,dtype,shield:true}}   // 鐵壁：免受傷害
    if(dtype==='auto')dtype=g.b.武勇>=g.b.智略?'兵刃':'謀略';
    if(R()*100<M(d,'evade'))return{side:dst.side,i:dt,v:0,left:d.troops,dtype,evade:true};
    const a=dtype==='兵刃'?g.b.武勇:g.b.智略,df=(dtype==='兵刃'?d.b.統率:d.b.智略)*(1-M(d,'statDown')/100)*(1-Math.min(100,M(g,'pierce'))/100);
    let f=Math.min(3,Math.max(.3,1+(a-df)/K.statDiv));
    if(dtype==='兵刃'){if(COUNTER[src.arm]?.includes(dst.arm))f*=K.counter[0];else if(COUNTER[dst.arm]?.includes(src.arm))f*=K.counter[1]}
    f*=K.terrain[dst.terrain]??1;
    f*=src.mods?.dmg??1;   // 劇本效果（例如豪雨奇襲）、火炬視野
    f*=dst.mods?.taken??1;   // 火炬視野：受到傷害降低
    // 兵學：造成傷害 %
    const up=M(g,'dmg')+(dtype==='兵刃'?M(g,'dmgBlade'):0)+(kind==='atk'?M(g,'dmgAtk'):0)+(kind==='主動'?M(g,'dmgAct'):0)+(prep?M(g,'dmgPrep'):0)
      +(kind==='突擊'?M(g,'dmgRush'):0)+(dtype==='謀略'?M(g,'dmgStrat'):0)-M(g,'weak')-(dtype==='兵刃'?M(g,'weakBlade'):M(g,'weakStrat'));
    // 兵學：受到傷害降低 %
    const dn=M(d,'taken')+(dtype==='兵刃'?M(d,'takenBlade'):M(d,'takenStrat'))+(kind==='atk'||kind==='突擊'?M(d,'takenAtkRush'):0)
      +(kind==='主動'?M(d,'takenAct'):0)+(kind==='指揮'||kind==='被動'?M(d,'takenCmd'):0)+M(d,'guard')-M(d,'expose');
    f*=Math.max(.1,1+up/100)*Math.max(.1,1-dn/100);
    let crit=false;
    if(dtype==='兵刃'&&R()*100<M(g,'crit')){f*=K.crit;crit=true}
    if(dtype==='謀略'&&R()*100<M(g,'critS')){f*=K.crit+M(g,'critSDmg')/100;crit=true}
    let v=Math.sqrt(g.troops)*K.base*rate*f*(0.94+R()*0.12);
    v=Math.max(1,Math.min(d.troops,Math.round(v)));
    d.troops-=v;
    // 離間之計：離反／攻心，依造成的傷害恢復自身兵力
    if(g.lj&&g.troops>0){const h=Math.min(g.max-g.troops,Math.round(v*g.lj*1.25/100));if(h>0)g.troops+=h}
    return{side:dst.side,i:dt,v,left:d.troops,dtype,rout:d.troops<=0,crit};
  }
  const healAmt=(g,rate)=>Math.sqrt(g.troops)*K.base*rate*(1+(g.b.智略-80)/220);
  function healTo(t,j,g,rate){
    const m=t.gens[j];if(m.troops<=0)return null;
    const v=Math.round(Math.min(m.max-m.troops,healAmt(g,rate)*(1+M(g,'heal')/100)*(1+M(m,'healIn')/100)));
    if(v<=0)return null;m.troops+=v;return{side:t.side,i:j,heal:v,left:m.troops};
  }
  const lowest=t=>aliveIdx(t).sort((a,b)=>t.gens[a].troops/t.gens[a].max-t.gens[b].troops/t.gens[b].max)[0];
  // 施加控制狀態（威壓／麻痺／混亂／無策／封擊）後的兵學反應
  function onControl(t,ti,i,e,j){
    const g=t.gens[i],d=e.gens[j];
    if(g.q==='挫其銳氣'){timed(d,'weak',8,2);ev({type:'skill',side:t.side,i,skill:'挫其銳氣',kind:BG,tg:[{side:e.side,i:j,status:'傷害 -8%'}]})}
    if(g.q==='軍律擾亂'&&R()<.6){timed(d,'statDown',8,2);ev({type:'skill',side:t.side,i,skill:'軍律擾亂',kind:BG,tg:[{side:e.side,i:j,status:'統率智略 -8%'}]})}
    if(g.q==='掎手之策'&&R()<.6){timed(d,'expose',8,2);ev({type:'skill',side:t.side,i,skill:'掎手之策',kind:BG,tg:[{side:e.side,i:j,status:'受傷 +8%'}]})}
    // 受控方：不惑（友軍）、明鏡、反討之計
    for(const[k,m]of e.gens.entries())if(m.troops>0&&m.bx.calm&&m.calmR!==round){m.calmR=round;timed(d,'guard',m.bx.calm,1);ev({type:'skill',side:e.side,i:k,skill:'不惑',kind:BG,tg:[{side:e.side,i:j,status:`受傷 -${m.bx.calm}%`}]})}
    if(d.bx.mirror&&d.cnt.明鏡>0){d.cnt.明鏡--;const h=healTo(e,lowest(e),d,d.bx.mirror/100);ev({type:'skill',side:e.side,i:j,skill:'明鏡',kind:BG,tg:h?[h]:[]})}
    if(d.q==='反討之計'&&d.cnt.反討之計>0&&R()<.9){
      d.cnt.反討之計--;const al=aliveIdx(t);
      if(al.length){const h=hit(e,1-ti,j,t,al[Math.floor(R()*al.length)],.85,'auto',BG);ev({type:'skill',side:e.side,i:j,skill:'反討之計',kind:BG,tg:h?[h]:[]})}
    }
  }
  function useSkill(t,ti,i,sk,o){
    const g=t.gens[i],e=T[1-ti],tg=[],ctl=[];
    if(sk.dmg){
      const ids=pickN(aliveIdx(e),sk.n[0]+Math.floor(R()*(sk.n[1]-sk.n[0]+1)),R);
      for(const j of ids){const h=hit(t,ti,i,e,j,sk.dmg,sk.dtype,sk.kind,!!o?.prepared);if(h)tg.push(h)}
    }
    if(sk.status){
      for(const j of (tg.length?tg.map(x=>x.i):pickN(aliveIdx(e),sk.n[1],R)))if(e.gens[j].troops>0&&R()<sk.status.p){
        for(const k of sk.status.k)e.gens[j].fx[k]=Math.max(e.gens[j].fx[k]||0,sk.status.dur);
        tg.push({side:e.side,i:j,status:sk.status.k.join('、')});ctl.push(j);
      }
    }
    if(sk.heal){
      const j=sk.healSelf?i:lowest(t),h=healTo(t,j,g,sk.heal);
      if(h){tg.push(h);if(!sk.healSelf&&g.q==='救援心得')timed(t.gens[j],'guard',6,1)}
    }
    const c=sk.fx?.cast;
    if(c){
      if(c.t==='combo'){g.cb=round;if(c.imm)g.imm=round;tg.push({side:t.side,i,status:'連擊'});
        if(c.ally){const o=pickN(aliveIdx(t).filter(x=>x!==i),1,R)[0];if(o!=null){t.gens[o].cb=round;tg.push({side:t.side,i:o,status:'連擊'})}}}
      else if(c.t==='guard')for(const j of pickN(aliveIdx(t),2,R)){timed(t.gens[j],'taken',c.v,c.dur);tg.push({side:t.side,i:j,status:`受傷 -${Math.round(c.v)}%`})}
      else if(c.t==='purge')for(const j of pickN(aliveIdx(t),2,R)){const m=t.gens[j];
        for(const k of['武勇','智略','速度']){m.b[k]+=c.v;m.sb.push({k,v:c.v,until:round+c.dur-1})}
        for(const k of Object.keys(m.fx).slice(0,2))delete m.fx[k];tg.push({side:t.side,i:j,status:`屬性 +${Math.round(c.v)}`})}
      else if(c.t==='taunt2'){for(const j of aliveIdx(e))e.gens[j].tn={until:round+1,to:i};
        const dv=g.b.統率*c.pct/100;g.b.統率+=dv;g.sb.push({k:'統率',v:dv,until:round+1});tg.push({side:t.side,i,status:'挑釁敵軍全體'})}
    }
    ev({type:'skill',side:t.side,i,skill:sk.name,kind:sk.kind,guess:sk.modeled==='guess',tg,...o});
    for(const j of ctl)onControl(t,ti,i,e,j);
    if(sk.kind==='主動'&&g.q==='離間之計'&&g.lj<4)g.lj++;
  }
  outer:for(round=1;round<=K.rounds;round++){
    ev({type:'round',round});
    // 軍學能力：只模擬截圖寫明的足輕 守禦（第5回合，我軍群體2人，治療率100%）
    for(const t of T)if(t.study&&t.gens.some(g=>g.troops>0)){
      const al=aliveIdx(t);
      // 齊射（弓，第2、6回合）的傷害係數、破軍（鐵炮，第3回合）的持續回合：截圖沒寫，標示為未知、不模擬
      if(t.arm==='槍'&&round===5){const hs=pickN(al,2,R).map(j=>healTo(t,j,t.gens[j],1)).filter(Boolean);if(hs.length)ev({type:'skill',side:t.side,i:al[0],skill:'守禦',kind:'軍學',tg:hs})}
    }
    // 達人大觀：第 4 回合淨化友軍單體 2 個減益狀態
    if(round===4)for(const t of T)t.gens.forEach((g,i)=>{if(g.troops>0&&g.q==='達人大觀'){
      const j=aliveIdx(t).sort((a,b)=>Object.keys(t.gens[b].fx).length-Object.keys(t.gens[a].fx).length)[0],m=t.gens[j];
      const ks=Object.keys(m.fx).slice(0,2);ks.forEach(k=>delete m.fx[k]);
      m.tm=m.tm.filter(x=>!['weak','statDown','expose'].includes(x.k));
      ev({type:'skill',side:t.side,i,skill:'達人大觀',kind:BG,tg:[{side:t.side,i:j,status:ks.length?'淨化 '+ks.join('、'):'淨化'}]});
    }});
    // 指揮／被動的每回合治療（休養、每回合治療我軍群體）
    for(const t of T)t.gens.forEach((g,i)=>{if(g.troops>0)for(const sk of g.skills)if(sk.regen){
      const al=aliveIdx(t).sort((a,b)=>t.gens[a].troops/t.gens[a].max-t.gens[b].troops/t.gens[b].max);
      const hs=(sk.regen.self?[i]:al.slice(0,sk.regen.n)).map(j=>healTo(t,j,g,sk.regen.rate)).filter(Boolean);
      if(hs.length)ev({type:'skill',side:t.side,i,skill:sk.name,kind:sk.kind,tg:hs});
    }});
    // 手工建模戰法（SKFX）的每回合效果：封擊、挑釁、每回合機率治療、蓄勢；到期的屬性加成還原
    T.forEach((t,ti)=>{const e=T[1-ti];t.gens.forEach((g,i)=>{if(g.troops<=0)return;
      g.sb=g.sb.filter(x=>{if(x.until<round){g.b[x.k]-=x.v;return false}return true});
      for(const sk of g.skills){const o=sk.fx?.open;if(!o)continue;
        if(o.t==='seal'&&round<=o.rounds){const p=Math.max(0,o.p-o.dec*(round-1));for(const d of pickN(aliveIdx(e),o.n,R))if(R()<p)e.gens[d].sealR=round}
        else if(o.t==='taunt'&&round<=o.rounds&&i!==0){for(const d of pickN(aliveIdx(e),2+Math.floor(R()*2),R))if(R()<o.p)e.gens[d].tn={until:round,to:i}}
        else if(o.t==='keifu'&&round%2===0&&R()<o.p){const hs=aliveIdx(t).sort((a,b)=>t.gens[a].troops/t.gens[a].max-t.gens[b].troops/t.gens[b].max).slice(0,2).map(j=>healTo(t,j,g,o.heal)).filter(Boolean);if(hs.length)ev({type:'skill',side:t.side,i,skill:sk.name,kind:sk.kind,tg:hs})}
        else if(o.t==='ryoku'&&R()<o.p){const al=aliveIdx(t),lo=lowest(t),ids=lo===i?[i,...pickN(al.filter(x=>x!==i),1,R)]:al;const hs=ids.map(j=>healTo(t,j,g,o.heal)).filter(Boolean);if(hs.length)ev({type:'skill',side:t.side,i,skill:sk.name,kind:sk.kind,tg:hs})}
        else if(o.t==='zan'&&round%2===0&&!g.fx.威壓){g.tm.push({k:'crit',v:o.crit,until:round});g.b.武勇+=o.st;g.sb.push({k:'武勇',v:o.st,until:round})}
      }})});
    const order=[];
    T.forEach((t,ti)=>t.gens.forEach((g,i)=>{if(g.troops>0)order.push([ti,i,g.b.速度+(round===1?M(g,'spd1'):0)+(g.first===round?1000:0)+R()*4])}));
    order.sort((a,b)=>b[2]-a[2]);
    for(const[ti,i]of order){
      const t=T[ti],g=t.gens[i],e=T[1-ti];
      if(g.troops<=0)continue;
      const fx=g.fx;
      const tick=()=>{for(const k in fx)if(--fx[k]<=0)delete fx[k]};
      if(g.bx.shield)timed(g,'guard',g.bx.shield,1);   // 神祕
      if(g.q==='生生不息'&&R()<.4){const h=healTo(t,i,g,.5);if(h)ev({type:'skill',side:t.side,i,skill:'生生不息',kind:BG,tg:[h]})}
      if(fx.威壓||(fx.麻痺&&R()<.3)||(fx.混亂&&R()<.5)){ev({type:'stun',side:t.side,i,why:fx.威壓?'威壓':fx.麻痺?'麻痺':'混亂'});tick();continue}
      if(g.prep){useSkill(t,ti,i,g.prep,{prepared:true});g.prep=null}
      for(const sk of g.skills){const o=sk.fx?.open;if(o?.t==='shiten'&&round<=o.rounds&&R()<.8){const al=aliveIdx(e);if(al.length){
        const a1=[...al].sort((x,y)=>e.gens[y].b.武勇-e.gens[x].b.武勇)[0],a2=[...al].sort((x,y)=>e.gens[y].b.智略-e.gens[x].b.智略)[0];
        timed(e.gens[a1],'weakBlade',o.v,1);timed(e.gens[a2],'weakStrat',o.v,1)}}}   // 氣勢沖天：削弱敵軍武勇最高者的兵刃傷害、智略最高者的謀略傷害
      for(const sk of g.skills){
        if(sk.modeled==='none'||(sk.self||sk.buf||sk.regen)&&!sk.dmg&&!sk.heal&&!sk.status)continue;
        if(sk.arm&&t.arm!==sk.arm)continue;   // 兵種技：隊伍兵種不符就沒效果
        const act=sk.kind==='主動'||sk.each;
        if(!act||(sk.kind==='主動'&&fx.無策))continue;
        if(R()<sk.rate+(sk.kind==='主動'?M(g,'rateAct')/100:0)){
          if(sk.prep){g.prep=sk;ev({type:'prep',side:t.side,i,skill:sk.name});
            if(g.q==='臨機應變'&&R()<.4){g.first=round+1;ev({type:'skill',side:t.side,i,skill:'臨機應變',kind:BG,tg:[{side:t.side,i,status:'下回合先攻'}]})}}
          else useSkill(t,ti,i,sk);
          if(routed(e))break;
        }
      }
      if(routed(e)){res=ti===0?'W':'L';break outer}
      let sealed=!!fx.封擊||g.sealR===round;
      if(g.imm===round)sealed=false;   // 縱橫馳突：免疫封擊
      if(sealed&&g.q==='冷靜沉著'&&R()<.8){sealed=false;ev({type:'skill',side:t.side,i,skill:'冷靜沉著',kind:BG,tg:[{side:t.side,i,status:'免疫封擊'}]})}
      // 虛實自在：10% 連擊（多普通攻擊一次）
      const swings=!sealed?(g.cb===round||(g.q==='虛實自在'&&R()<.1)?2:1):0;
      let gr=g.grR===round?.25:.5;
      for(let sw=0;sw<swings;sw++){
        const al=aliveIdx(e);if(!al.length)break;
        const tn=g.tn&&g.tn.until>=round&&e.gens[g.tn.to]?.troops>0?g.tn.to:-1;   // 挑釁：強迫對挑釁者普通攻擊
        const j=tn>=0?tn:al[Math.floor(R()*al.length)],h=hit(t,ti,i,e,j,1,'兵刃','atk');
        ev({type:'atk',side:t.side,i,tg:h?[h]:[],combo:sw>0});
        if(h&&!h.shield&&e.gens[j].troops>0)for(const sk of e.gens[j].skills){const o=sk.fx?.open;   // 沉魚落雁：受到普通攻擊時反制
          if(o?.t==='react'&&R()<o.p){const k=['混亂','無策','疲弊'][Math.floor(R()*3)];if(k==='疲弊')timed(g,'weak',100,2);else g.fx[k]=Math.max(g.fx[k]||0,2)}
          if(o?.t==='counter'&&g.troops>0){const hh=hit(e,1-ti,j,t,i,j===0?o.a:o.b,'兵刃','atk');if(hh)ev({type:'skill',side:e.side,i:j,skill:sk.name,kind:sk.kind,tg:[hh]})}}   // 堅忍不拔：反擊
        if(g.q==='剛柔相濟'&&R()<gr){g.grR=round;gr=.25;const hh=healTo(t,i,g,.6);if(hh)ev({type:'skill',side:t.side,i,skill:'剛柔相濟',kind:BG,tg:[hh]})}
        if(h&&e.gens[j].troops>0)for(const sk of g.skills)if(sk.kind==='突擊'&&sk.modeled!=='none'&&R()<sk.rate+M(g,'rushRate')/100){
          // 突擊 hits the same target as the normal attack
          const k2=sk.dmg?hit(t,ti,i,e,j,sk.dmg,sk.dtype,'突擊'):{side:e.side,i:j,status:sk.status?.k.join('、')||''};
          if(sk.fx?.rush){const d=e.gens[j];for(const k of['統率','智略']){d.b[k]-=sk.fx.rush.v;d.sb.push({k,v:-sk.fx.rush.v,until:round+1})}t.gens[0].sh+=i===0?1:2}   // 戰意崩壞：目標統率智略-65，大將鐵壁
          ev({type:'skill',side:t.side,i,skill:sk.name,kind:'突擊',guess:sk.modeled==='guess',tg:k2?[k2]:[]});
          if(g.bx.rushGuard)timed(g,'guard',g.bx.rushGuard,1);   // 膽力
          if(sk.status&&k2&&R()<sk.status.p){for(const k of sk.status.k)e.gens[j].fx[k]=Math.max(e.gens[j].fx[k]||0,sk.status.dur);onControl(t,ti,i,e,j)}
          if(e.gens[j].troops<=0)break;
        }
        if(routed(e))break;
      }
      for(const sk of g.skills){const o=sk.fx?.open;if(o?.t==='bisha'&&g.troops>0&&R()<o.p){   // 毘沙門天：行動後機率治療我軍、削弱敵軍傷害
        const hs=pickN(aliveIdx(t),2+Math.floor(R()*2),R).map(j=>healTo(t,j,g,o.heal)).filter(Boolean);
        for(const d of pickN(aliveIdx(e),2+Math.floor(R()*2),R))timed(e.gens[d],'weak',o.weak,2);
        if(hs.length)ev({type:'skill',side:t.side,i,skill:sk.name,kind:sk.kind,tg:hs})}}
      tick();
      if(routed(e)){res=ti===0?'W':'L';break outer}
    }
  }
  if(round>K.rounds)round=K.rounds;
  for(const t of T)for(const g of t.gens){for(const k of['b','fx','prep','bx','q','tm','cnt','lj','first','calmR','grR','sealR','tn','sb','sh','cb','imm'])delete g[k]}
  ev({type:'end',res});
  return{res,log,rounds:round};
}

// stats of a general at level lv from land.json stats (Lv1 + 成長率 × (lv−1)); fallback by rarity when not collected
export function statsAt(D,n,lv,r=4){
  const x=D.stats?.[n];
  if(!x){const b={5:[82,1.6],4:[72,1.3],3:[62,1.0]}[r]||[70,1.2];return Object.fromEntries(ST4.map(k=>[k,Math.round(b[0]+b[1]*(lv-1))]))}
  return Object.fromEntries(ST4.map(k=>{const[b,g]=x.st[k];return[k,Math.round((b+g*(lv-1))*10)/10]}));
}
// 滿紅（5 紅）的武將數值，劇本用：Lv50、4 個特性全部解鎖、自由點數 = 每 10 級 10 點（立身出世類特性另加）+ 紅度 5×10，全加在武勇／智略較高的一項；
// 再乘上 兵種營 Lv5 與隊中已解鎖兵種特性（馬術、弓術…、X兵大將）提供的兵種等級（每級全屬性 +2%，上限 10＋大將數）、特性自身的屬性 %、我軍全體屬性 %。
// 規則同 land.html 的組隊頁；沒有收錄的特性文字就只讀特性名稱。gens 是同隊武將名單。
const ARM_CH={馬:'騎',弓:'弓',槍:'槍',炮:'鐵炮',器:'器械'},ARM_WORD={騎兵:'騎',弓兵:'弓',足輕:'槍',鐵炮:'鐵炮',器械:'器械'},STAT_TR={武威:'武勇',智慧:'智略',領兵:'統率',靈巧:'速度'};
function traitFx(D,n,t){
  const txt=D.traitText?.[n]?.[t];let m=txt&&txt.match(/^部隊的(.+?)等級上升(\d)級/);
  if(m){const ws=m[1].split('、').filter(w=>ARM_WORD[w]),c=txt.match(/等級上限增加(\d)級/);
    return{arm:Object.fromEntries(ws.map(w=>[ARM_WORD[w],+m[2]])),cap:c?Object.fromEntries(ws.map(w=>[ARM_WORD[w],+c[1]])):null}}
  m=t.match(/^([馬弓槍炮器]+)術(I{1,3})$/);if(m)return{arm:Object.fromEntries([...m[1]].map(c=>[ARM_CH[c],m[2].length]))};
  m=t.match(/^(武威|智慧|領兵|靈巧)(I{1,3})$/);if(m)return{stat:STAT_TR[m[1]],pct:[2,2.5,3][m[2].length-1]};
  m=(txt||'').match(/^我軍全體(武勇|智略|統率|速度)提高([\d.]+)%$/);if(m)return{team:m[1],tpct:+m[2]};
  return{};
}
// 隊伍滿紅時自帶的兵種：把隊中每位武將 4 個特性裡的兵種加成（X術N、X兵大將）加總，最高的兵種為主；同分看大將自己，再依 騎→槍→弓→鐵炮→器械。都沒有就回 null。
export function bestArm(D,names){
  const score=n=>{const o={};for(const t of D.stats?.[n]?.traits||[]){const a=traitFx(D,n,t).arm;for(const k in a||{})o[k]=(o[k]||0)+a[k]}return o};
  const tot={},lead=score(names[0]);for(const n of names){const o=score(n);for(const k in o)tot[k]=(tot[k]||0)+o[k]}
  const order=['騎','槍','弓','鐵炮','器械'];
  return order.filter(k=>tot[k]).sort((a,b)=>tot[b]-tot[a]||(lead[b]||0)-(lead[a]||0)||order.indexOf(a)-order.indexOf(b))[0]||null;
}
// red：紅度 0–5（預設 5＝滿紅）。特性欄 2～4 在 1／3／5 紅解鎖；自由點數每紅 +10（滿紅 50）。
export const traitsAtRed=(D,n,red=5)=>(D.stats?.[n]?.traits||[]).slice(0,red>=5?4:red>=3?3:red>=1?2:1);
// red 也可以是 {武將名:紅度}，隊中每人紅度不同時用（沒列的算滿紅）。
// 設施加成（Joe 的設施截圖）：協力-勢力 Lv1～10 = 0.5,1,1.5,2,2.5,3,4,5,6,7%（三人同勢力才生效）、協力-家門 每級 1%（同家門才生效，家門資料沒收，由玩家勾選）、兵種營 每級 +1 兵種等級（×2%）。
export const CO_PCT=[0,0.5,1,1.5,2,2.5,3,4,5,6,7];
const FAC6=['織田','豐臣','德川','武田','上杉','群雄'];
// fac = {co, arm, ka, same}；不給就是舊行為（兵種營 Lv5、沒有協力與家門）
export function fullRedStats(D,n,names,arm,lv=50,red=5,fac=null){
  const rd=nm=>typeof red==='object'?(red[nm]??5):red;
  const traits=traitsAtRed(D,n,rd(n));
  let lvArm=fac?fac.arm:5,cap=10;const team={};
  for(const nm of names)for(const t of traitsAtRed(D,nm,rd(nm))){const x=traitFx(D,nm,t);lvArm+=x.arm?.[arm]||0;cap+=x.cap?.[arm]||0;if(x.team)team[x.team]=(team[x.team]||0)+x.tpct}
  lvArm=Math.min(cap,lvArm);
  const own={};let extra=0;
  for(const t of traits){const x=traitFx(D,n,t);if(x.stat)own[x.stat]=(own[x.stat]||0)+x.pct;extra+=+(D.traitText?.[n]?.[t]||'').match(/每升10級，獲得(\d+)點自由屬性點/)?.[1]||0}
  const st=statsAt(D,n,lv,D.stats?.[n]?.r),k=st.武勇>=st.智略?'武勇':'智略';
  st[k]+=Math.floor(lv/10)*(10+extra)+10*rd(n);
  let fp=0;if(fac){const f0=D.stats?.[names[0]]?.f;if(fac.co&&FAC6.includes(f0)&&names.every(x=>D.stats?.[x]?.f===f0))fp+=CO_PCT[fac.co];if(fac.same&&fac.ka)fp+=fac.ka}
  return Object.fromEntries(ST4.map(x=>[x,Math.round(st[x]*(1+(lvArm*2+fp+(own[x]||0)+(team[x]||0))/100)*10)/10]));
}
export const innateOf=(D,n)=>D.stats?.[n]?.inn||D.innate?.[n]||'';
