// 真戰 Q版戰棋：8 回合自動戰鬥。
// 官方公式沒有公開，這裡的傷害公式、相剋倍率、地形加成都是推估值（集中在 K 裡，方便之後用戰報對照調整）。
// 戰法效果從 land.json 的 skillText 說明文字讀出（發動率、傷害率、目標數、治療率、控制狀態、自身屬性加點），
// 沒有說明文字的戰法依類型與等級給通用值，並標成「推估」。
import {traitFx,traitsAtRed,armLevel,bestArm,coopPct,CO_PCT,FAC6,facRule,effFacs,FEMALE} from './rules.js?v=2';
export {traitsAtRed,bestArm,CO_PCT};

export const K={
  rounds:8,
  // 2026-11-18 校正（第一版）：由 52 場詳細戰報、394 次普通攻擊擬合（35 場擬合、15 場回測）；
  // bootstrap 80% 區間 statDiv 240～340、base 4.0～4.4；中位絕對對數誤差 0.56 → 0.32。
  // 限制：資料未含兵學／標籤／評定眾／裝備（裝備為隨機打造無法還原）；戰法發動率與相剋倍率尚未校正，僅為第一版。
  // 2026-11-25 第二版：107 場戰報（Mac 內建文字辨識）逐筆帶入戰報寫明的實際屬性、累計造成／受到傷害％、相剋、會心後擬合：
  // 普攻 821 筆 → 5.1、戰法傷害 1236 筆 → 5.25、持續傷害 182 跳 → 5.2，三者一致，所以 base 由 4.2 改為 5.2。
  // 舊值 4.2 是沒扣掉戰報裡的減傷／增傷時擬合的，等於把平均減傷算進 base；引擎自己會再算一次兵學、特性、裝備的增減傷，所以要用扣掉後的值。
  base:5.2,          // 傷害基數 = √兵力 × base × 傷害率 × 屬性差係數
  healBase:4.4,      // 治療基數（259 筆治療擬合 ≈ 4.5，與舊值 4.2 接近，維持獨立，不跟著傷害 base 變）
  // 個別戰法實測校正（戰報實際傷害 ÷ 引擎預測，樣本 ≥12 次且離散小）：說明文字的傷害率和實戰對不上，乘上這個倍率
  skCal:{亂世戰華:1.41,比翼連理:1.25,勇猛無前:1.17,破陣亂舞:1.3,誘敵深入:1.34,矢石飛交:.8,荷馱崩:.73,疾風迅雷:.73,電光雷轟:.77,反討之計:.65},
  statDiv:280,       // 屬性差係數 = 1 + (攻方屬性 − 守方屬性) / statDiv，夾在 0.3～3
  counter:[1.10,0.87],   // 兵種相剋：剋制方兵刃傷害 ×1.10，被剋方 ×0.87（2026-11-25 由 107 場戰報 821 次普攻擬合，原本 1.15）
  // 士氣（戰報準備階段，107 場精確吻合）：士氣低於 100 時造成傷害 = 100% − (100 − 士氣) × 0.7%，100 以上一律 100%。用法：team.morale（預設 100）
  morale:m=>m>=100?1:Math.max(0,1-(100-m)*.007),
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
const STATUS={威壓:'無法行動',麻痺:'30% 機率無法行動',混亂:'普通攻擊隨機選目標（含友軍）',無策:'無法發動主動戰法',封擊:'無法普通攻擊'};   // 混亂：107 場戰報 137 次混亂中普攻全部照常出手、36% 打到友軍（2026-11-25）

const num=s=>s==null?null:+s;
// 「Lv1→滿級」：預設取滿級；parseSkill(name,D,lv) 指定 1～10 級時，兩端數值線性內插（推估：遊戲沒公開每級數值，只有 Lv1 與滿級）。
export const MAX_SKILL_LV=10,DEFAULT_SKILL_LV=10;   // 戰法等級 Lv1～Lv10（Joe 2026-11-20）；預設滿級：上戰場戰法一定滿級，等級下拉只給測試用（Joe 2026-11-22，2026-11-24 由 Lv8 改正）
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
// 2026-11-24 起固有／傳授戰法全部有模擬（一領具足傭兵、七十二欺計累計 7 次全體傷害等見 INNFIX）；條件難換算的用期望值，註明在各行。
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
  // 2026-11-21 官方編制逐位拆解後補上的（照說明文字；說明寫的「受智略／武勇影響」這類縮放不模擬，取顯示的數值）：
  運勝之鼻:()=>({open:{t:'unsho',skip:hi(37.5,75)/100,rate:hi(5,10),dur:3}}),   // 自帶「準備」主動：有機率跳過準備；沒跳過則發動率 +5→10% 持續 3 回合（簡化成自身主動發動率）
  疑心暗鬼:()=>({open:{t:'giki',rate:hi(6,12),st:hi(15,30),dur:2}}),   // 自帶「準備」主動發動率 +6→12%；開始準備時智略 +15→30 持續 2 回合
  出奇制勝:()=>({open:{t:'shutsu',dmg:hi(14,28)}}),   // 自帶主動傷害 +14→28%（攻心效果沒模擬）
  文武雙全:()=>({open:{t:'bunbu',v:hi(15,30),max:5}}),   // 造成謀略傷害 +武勇、兵刃傷害 +智略，各最多疊 5 次
  御旗盾無:()=>({open:{t:'gokihata',p:hi(20,40)/100,v:hi(20,40),p2:hi(20,40)/100,a:hi(47,94)/100}}),   // 受傷時機率減傷；受普攻時機率讓友軍單體反擊
  融通無礙:()=>({cast:{t:'rateup',v:hi(6,12),dur:2,max:2}}),
  // 2026-11-23 補建模的固有戰法（Joe 要求）：照說明文字，「受XX影響」的縮放不模擬，取顯示的滿級／Lv 內插值；機率類每回合判定。
  風林火山:()=>({open:{t:'fuurin',wind:hi(11,22),lin:hi(46,92)/100,fire:hi(78,156)/100,mount:hi(11,22)}}),
  伊達風采:()=>({open:{t:'date',r:hi(46,92)/100,st:hi(2.5,5)}}),
  松柏之操:()=>({open:{t:'matsu',v:hi(7.5,15)}}),   // 只模擬大將非自帶主動發動率；副將減傷沒模擬
  武田之赤備:()=>({open:{t:'akabe',crit:hi(10,20),p:hi(12.5,25)/100,rate:hi(69,138)/100,dec:hi(7.5,15)}}),
  軍神:()=>({open:{t:'kenshin',p:hi(33,66)/100,v:hi(5,10),full:hi(80,160)}}),
  百萬一心:()=>({open:{t:'mouri',pAll:hi(7.5,15)/100,p:hi(15,30)/100}}),
  鬼若子:()=>({open:{t:'kijiko',p:hi(25,50)/100,st:hi(9,18)}}),
  歸蝶之舞:()=>({open:{t:'kikyo',p:hi(20,40)/100,v:hi(11,22)}}),
  古今獨步:()=>({open:{t:'kokin',p:hi(24,48)/100,a:hi(35,70)/100,lf:hi(2,4),max:8}}),
  上州黃斑:()=>({open:{t:'kozan',p1:hi(37.5,75)/100,p2:hi(15,30)/100,dot:hi(23,46)/100,fat:hi(18,36)}}),
  一切皆空:()=>({open:{t:'ichiki',v:hi(36,72)/100}}),
  槍之又左:()=>({open:{t:'maeda',p:hi(45,90)/100}}),
  東國戰華:()=>({open:{t:'nari',st:hi(3,30)}}),
  竭力而戰:()=>({open:{t:'saito',p:hi(35,70)/100}}),
  鬼美濃:()=>({open:{t:'baba',p:hi(17.5,35)/100,rate:hi(56,112)/100}}),
  豐後戰神:()=>({open:{t:'bungo',dmg:hi(6,12),rate:hi(4,8)}}),
  尼御台:()=>({open:{t:'jushu',v:hi(9,18),lf:hi(12,24)}}),
  風流武者:()=>({open:{t:'miyoshi',p:hi(40,80)/100,heal:hi(66,132)/100,v:hi(15,30)}}),
  夜叉美濃:()=>({open:{t:'yasha',v:hi(17.5,35),v2:hi(25,50)}}),
  諸行無常:()=>({open:{t:'zuikei',v:hi(12,24),w:hi(28,56)}}),
  末世道者:()=>({open:{t:'ouchi',v:hi(7,14)}}),
  耐苦成剛:()=>({open:{t:'chisaka',v:hi(7,14),fin:hi(80,160)/100}}),
  風姿綽約:()=>({open:{t:'ae',v:hi(2.3,5.5),p:hi(25,50)/100}}),
  霸王右筆:()=>({open:{t:'ota',p:hi(20,40)/100,rate:1.26}}),
  三河魂:()=>({open:{t:'mikawa',v:hi(1.25,2.5)}}),
  // 第二批（2026-11-23）：主動／突擊類固有走 cast／rush，指揮／被動走 open
  七本槍筆頭:()=>({open:{t:'fukushima',p:hi(46,92)/100}}),   // 亂舞：普攻時另打同隊一人（鎖定統率最低的部分沒模擬）
  一徹意志:()=>({cast:{t:'inaba',v:150}}),
  勇志不移:()=>({cast:{t:'nobuyasu',v:hi(37.5,75),v2:hi(50,100),lf:hi(12,24),lf2:hi(16,32)}}),   // 分擔傷害沒模擬
  掃疑平亂:()=>({cast:{t:'datehar',p:hi(39,78)/100}}),
  湖水渡過:()=>({cast:{t:'hidemitsu',p:65,v:30}}),
  佛高力:()=>({cast:{t:'kourik',v:hi(4.5,9)}}),
  諏訪明光:()=>({cast:{t:'suwa',v:36}}),
  落花啼鳥:()=>({cast:{t:'asakura',v:hi(37.5,75)}}),   // 準備 1 回合沒模擬（直接發動）
  北斗星:()=>({cast:{t:'andou',p:hi(37.5,75)/100,v:hi(25,50)}}),
  殿軍奮戰:()=>({cast:{t:'ujiie'}}),
  弓調馬服:()=>({cast:{t:'yamauchi',v:hi(50,100)}}),
  嘲罵:()=>({cast:{t:'naito'}}),
  識破:()=>({cast:{t:'sugi',v:hi(9,18)}}),
  殿後:()=>({cast:{t:'endo',v:hi(15,30),v2:hi(20,40)}}),
  破甲:()=>({rush:{t:'break',v:hi(18,36)}}),
  猛擊:()=>({rush:{t:'crit',v:hi(7.5,15)}}),
  荒切:()=>({rush:{t:'combo'}}),
  驕討:()=>({open:{t:'yoshioka',heal:hi(48,96)/100,w:hi(16,32),p:hi(35,70)/100,v:hi(62,124)/100}}),
  同氣連枝:()=>({open:{t:'ahatsu',v:hi(2.5,5)}}),   // 敵軍選定目標的回復效果沒模擬
  內賢之助:()=>({open:{t:'tsuma',heal:hi(48,96)/100}}),   // 持續時間延長沒模擬
  懷刀謀臣:()=>({open:{t:'ishikawa',p:hi(18,36)/100,v:hi(13,26)}}),
  越後流軍學:()=>({open:{t:'usami',v:hi(10,20)}}),   // 成功發動後全隊隨機免疫沒模擬
  樽俎折衝:()=>({open:{t:'terumune',p:hi(15,30)/100}}),
  轉:()=>({open:{t:'kami',p:hi(22.5,45)/100,v:hi(4,8),rate:hi(51,102)/100}}),
  腹中鱗甲:()=>({open:{t:'counter',a:hi(26,52)/100,b:hi(31,62)/100}}),   // 大將 26→52%，非大將 31→62%
  // 2026-11-24 補齊（④）：原本沒模擬的固有／傳授戰法
  獻身:()=>({open:{t:'kenshin2',p:hi(22,44)/100,dmg:hi(131,262)/100,exp:18}}),
  剛毅木訥:()=>({open:{t:'gouki',p:hi(22.5,45)/100,dmg:hi(43,86)/100,heal:hi(43,86)/100}}),
  對話:()=>({cast:{t:'noconf',dur:3}}),
  士氣高漲:()=>({cast:{t:'dong',self:false,dur:1}}),
  靜動自在:()=>({cast:{t:'seido',dur:2}}),
  磐石眈眈:()=>({open:{t:'banjaku',v:hi(4.5,9),inc:hi(2,4)}}),
  金鼓連天:()=>({cast:{t:'tmself',cd:1,list:[{k:'dmgAct',v:hi(24,48),dur:3},{k:'takenRush',v:hi(12.5,25),dur:3}]}}),
  剛毅果斷:()=>({cast:{t:'tmself',cd:1,list:[{k:'dmgRush',v:hi(17.5,35),dur:3},{k:'takenAct',v:hi(10,20),dur:3}]}}),
  戰意消沉:()=>({open:{t:'senyi',v:hi(25,50)}}),
  死中求活:()=>({open:{t:'shichu',st:hi(2.5,5),dmg:hi(62.5,125)/100,per:hi(6,12)/100}}),
  奮鬥:()=>({cast:{t:'combo',weak:15}}),
  奪氣:()=>({cast:{t:'dakki',st:hi(14,28)}}),
  以戰養戰:()=>({open:{t:'isen',v:hi(12.5,25)}}),
  神妙劍:()=>({open:{t:'shinmyo',v:hi(12,24),p:hi(42.5,85)/100}}),
  // 2026-11-25 新賽季官方預告（tools/pk_preview.txt，以上線為準）：照預告說明文字；「受XX影響」的縮放照慣例不模擬，取顯示的數值
  三階菅笠:()=>({open:{t:'sasa',p:hi(17.5,35)/100,heal:hi(73,146)/100,dmg:hi(80,160)/100}}),   // 佐佐成政：自身與武勇最高友軍行動前，累計受傷 ≥20% 最大兵力 → 機率治療（受武勇影響），否則機率兵刃傷害
  南予智將:()=>({open:{t:'nanyo',v:hi(10,20),p:hi(17.5,35)/100,dmg:hi(62,124)/100}}),   // 土居清良：前 3 回合敵我全體兵刃傷害降低；友軍普攻後機率追加謀略傷害（「友軍」＝自己以外的友軍武將，Joe 2026-11-25 確認）
  風聲鶴唳:()=>({cast:{t:'fuusei',dmg:hi(83,166)/100,spd:hi(10,20)}}),   // 兵刃＋謀略各一次，速度降低 2 回合
  武士之鑒:()=>({cast:{t:'bushi',dot:hi(54,108)/100,dmg:hi(70,140)/100,dur:2}}),   // 全體潰走（兵刃持續傷害）；目標已潰走則兵刃傷害
};
// one skill → what the engine can run
// 大將技（2026-11-24 起）：固有戰法的「大將技」只在這位武將當大將（gens[0]）時生效。數值照卡面大將技欄（滿級）。
// 能換算成既有參數的直接改參數；需要新機制的另外寫在戰鬥流程裡（見 bossOn）。沒列在這裡的大將技 → BOSS_TODO（全庫檢查會列出）。
const cp=sk=>({...sk,fx:sk.fx?JSON.parse(JSON.stringify(sk.fx)):sk.fx,regen:sk.regen?{...sk.regen}:sk.regen,status:sk.status?{...sk.status}:sk.status,dot:sk.dot?{...sk.dot}:sk.dot,buf:sk.buf?.map(b=>({...b}))});
export const BOSSFX={
  千成瓢簞:s=>{if(s.regen)s.regen.pAll=.70},                       // 治療我軍全體的機率 35%→70%
  如水:s=>{s.rate=Math.min(1,s.rate+.15)},                          // 造成傷害的機率 +15%
  武田之赤備:s=>{s.fx.open.p+=.10},                                 // 赤備突擊機率 +10%
  越後二天:s=>{s.dmg*=1+.2/1.5},                                    // 額外一擊 50%→70%（期望傷害換算）
  百萬一心:s=>{s.fx.open.pAll=.35},                                 // 選敵軍全體 15%→35%
  古今獨步:s=>{s.fx.open.max=10},                                   // 離反疊加 8→10 次
  海道第一:s=>{s.bossTm=[{k:'crit',v:12,from:5,p:.7},{k:'critS',v:12,from:5,p:.7},{k:'critDmg',v:50,from:5,p:.7},{k:'critSDmg',v:50,from:5,p:.7}]},   // 第 5 回合起 70% 機率獲得會心＋奇謀（+50% 傷害）
  地黃八幡:s=>{if(s.status)s.status.p=.44},                         // 控制基礎機率 36%→44%
  啄木鳥:s=>{s.dmg*=1.1;if(s.status)s.status.p=Math.min(1,s.status.p*1.1)},   // 10% 再發動一次（期望值）
  豐後戰神:s=>{s.fx.open.boss=20},                                  // 主屬性 +20
  怪力無雙:s=>{s.n=[3,3]},                                          // 目標必定 3 人
  旋乾轉坤:s=>{s.dmg=1.46},                                         // 立即傷害率 126%→146%
  月盈中天:s=>{if(s.dot)s.dot.dur=8},                               // 潰走持續到戰鬥結束
  落花啼鳥:s=>{s.fx.cast.v=85},                                     // 主動傷害提升 75%→85%
  電光雷轟:s=>{s.dmg=.60},                                          // 雷鳴傷害 52%→60%
  轉:s=>{s.fx.open.rate+=.15},                                      // 傷害率 +15%
  破陣亂舞:s=>{s.dmg*=1.35},                                        // 強化普攻 35% 額外打一名敵軍（期望值）
  疾風迅雷:s=>{s.dmg*=1.08},                                        // 目標麻痺時 16% 再發動（期望值，約一半時間目標已麻痺）
  天神山殘照:s=>{if(s.fx?.open)s.fx.open.rounds=5},        // 加屬性持續回合 4→5
  槍之又左:s=>{s.fx.open.enh=70},                                   // 強化普攻 +50%→+70%
  軍神:s=>{s.fx.open.boss=1},                                       // 每回合行動前額外蓄力 1 次
  // 以下需要新機制的，先換算成期望值（2026-11-24，之後有戰報再校正）
  方今之時:s=>{if(s.dot)s.dot.v*=1.1},                              // 持續狀態無法移除（期望值：持續傷害 +10%）
  新生:s=>{s.regen={self:true,n:1,rate:.65*.4}},                    // 敵軍兵力 <70% 後每回合治療 65%（約 4 成回合生效）
  三河魂:s=>{s.bossTm=[{k:'takenAtkRush',v:20,p:1}]},               // 被普攻時 80% 由武勇最高友軍援護（換算：自身受普攻傷害 -20%）
  風林火山:s=>{const o=s.fx.open;o.wind*=1.1;o.mount*=1.1;o.lin*=1.1;o.fire*=1.1},   // 選中更多目標 +25%（期望值 +10%）
  表裡比興:s=>{s.dmg*=1.03},                                        // 混亂目標分擔 3% 傷害
  伊達風采:s=>{s.fx.open.r*=1.15},                                  // 疊滿後額外兩擊 134%（期望值 +15%）
  鬼若子:s=>{s.fx.open.st*=1.25},                                   // 選中更多目標 +25%
  相模之獅:s=>{s.heal=(s.heal||0)+.40*.3},                          // 鐵壁沒生效時治療 40%（約 3 成）
  三州總大將:s=>{if(s.heal)s.heal*=1.25},                           // 額外恢復 1 人的機率受智略影響（50%→約 75%）
  上州黃斑:s=>{s.fx.open.fat+=2.5},                                 // 疲弊基礎機率 +2.5%
  一切皆空:s=>{s.fx.open.v*=1.12},                                  // 每名雜賀本願寺友軍一揆傷害 +12%（約 1 人）
  肥前之熊:s=>{for(const b of s.buf||[])if(b.k==='taken')b.v+=14},   // 傷害率 +14%（換算到減傷）
  梟雄之計:s=>{s.dmg*=1.05},                                        // 第 5 回合起施放後不再混亂自己
  鬼義重:s=>{s.dmg*=1.05},                                          // 累計選中 2 次 15% 威壓（期望值）
  猛攻柴田:s=>{s.dmg*=1.03},                                        // 第 5 回合起多替一名友軍淨化
  七本槍筆頭:s=>{s.fx.open.p=Math.min(1,s.fx.open.p*1.1)},          // 鎖定機率最多 +5 次（期望值）
  破竹之勢:s=>{if(s.fx?.open)s.fx.open.max=15}, // 疊加 10→15 次（期望值 +15%）
  十面埋伏:s=>{s.dmg*=1.08},                                        // 第 5 回合起受傷提高無法移除
  無想掃討:s=>{s.dmg*=1.1},                                         // 兵刃傷害提高最多只減 2 次
  越後流軍學:s=>{s.fx.open.v*=1.2},                                 // 持續回合增至 3
  彈嵐雨霰:s=>{s.dmg*=1.1},                                         // 3 次傷害機率 50%→75%（2.5→2.75 次）
  冷徹無情:s=>{s.dmg*=1.05},                                        // 發動率加成持續增至 4 回合
  末世道者:s=>{s.fx.open.v*=1.1},                                   // 武勇降低縮短為 4 回合
  信義貫徹:s=>{s.dmg*=1.05},                                        // 額外一名友軍獲得離反
  掃疑平亂:s=>{s.fx.cast.p=Math.min(1,s.fx.cast.p*1.1)},            // 優先選武勇較高的友軍
  一心一德:s=>{if(s.heal)s.heal*=1.1},                              // 治療時目標武勇智略 +6
  綱紀肅清:s=>{s.dmg*=1.1},                                         // 已威壓 50% 再疲弊
  樽俎折衝:s=>{s.fx.open.p=Math.min(1,s.fx.open.p*1.1)},            // 分擔比例 7%
  傲岸不遜:s=>{s.dmg*=1.05},                                        // 另降普攻傷害 30%
  義無反顧:s=>{s.dmg*=1.12},                                        // 24% 機率改為敵軍全體
  先陣鼓舞:s=>{s.rate=Math.min(1,s.rate+.04)},                      // 發動機率 +4%
  仁者懷勇:s=>{s.dmg*=1.1},                                         // 友軍造成傷害的機率 +20%
  無刀取:s=>{s.dmg*=1.07;if(s.heal)s.heal*=1.07},
  剛毅木訥:s=>{s.fx.open.p=Math.min(1,s.fx.open.p*1.2)},
  // 新賽季預告（以上線為準）
  三階菅笠:s=>{s.fx.open.boss=8},                                   // 每次成功發動自身武勇 +8（持續 1 回合，最多疊 2 次）
  野之虎:s=>{s.bossTm=[{k:'dmgAtk',v:15,p:1}]},                      // 普通攻擊傷害率 +15%
  雨夜手拍子:s=>{s.fx.cast.heal=.40},                                // 持續時間內非自帶主動發動時恢復自身兵力 40%（受武勇影響）              // 發動機率另受統率影響（假設 +20%）                   // 15% 同時觸發兩種效果
};
const BOSSC=new WeakMap();
export const bossSkill=sk=>{if(!sk||!BOSSFX[sk.name]||sk.bossOn)return sk;let c=BOSSC.get(sk);if(!c){c=cp(sk);BOSSFX[sk.name](c);c.bossOn=true;BOSSC.set(sk,c)}return c};
// 說明文字解析不到、但數值寫得很清楚的固有戰法補丁（大將與非大將都適用）
const INNFIX={
  千成瓢簞:s=>{if(s.regen)s.regen.pAll=hi(17.5,35)/100},             // 有 17.5→35% 機率治療我軍全體
  地黃八幡:s=>{s.status={p:hi(18,36)/100,k:['封擊','無策'],dur:1}},  // 封擊、無策 18→36%
  // 2026-11-24（④）：原本「只模擬一部分」的戰法，把沒模擬的條件補上，partial 拿掉
  如水:s=>{s.dmg*=1.5;s.fx={open:{t:'stack',k:'critS',p:hi(24,48)/100,v:hi(2.5,5),max:8}}},   // 執行 1-2 次（平均 1.5）；每回合機率疊奇謀
  疾風迅雷:s=>{if(s.heal)s.heal*=.5},                                  // 目標已麻痺才治療（約一半）
  肥前之熊:s=>{s.fx={open:{t:'hizen',p:hi(15,30)/100,dmg:hi(35,70)/100}}},   // 受兵刃傷害時機率反打敵軍群體（存活友軍越少機率越低）
  破竹之勢:s=>{s.buf=[...(s.buf||[]),{k:'critDmg',v:hi(15,30),to:'self',n:0,r:99}];s.fx={open:{t:'hachiku',v:hi(2.5,5),max:10}}},   // 會心傷害 +30%；每次會心後再 +5%（最多 10 次）
  比翼連理:s=>{s.dmg*=1.3},                                           // 受積攢治療量影響（期望值 +30%）
  月華鶴影:s=>{s.fx={open:{t:'gekka',v:hi(12.5,25)}}},                 // 友軍每被普攻 4 次自身會心 +25%（最多 2 次）
  天神山殘照:s=>{s.afterAtk=hi(25,50)/100;s.buf=[];s.fx={open:{t:'tenjin',v:hi(30,60),rounds:4}}},   // 普攻後機率謀略傷害；前 4 回合武勇智略遞減加成；第 5 回合混亂智略最高友軍
  鈴鳴:s=>{s.lowHalf=1},                                               // 我軍兵力 <50% 且低於敵軍時機率減半
  一念亂志:s=>{s.from=3;s.dec=hi(2.5,5)/100;s.dmg*=1.35},              // 第 3 回合起、每回合機率遞減；35% 武勇更高友軍同時出手（期望值）
  智者樂水:s=>{s.buf=[];s.fx={open:{t:'chisha',v:hi(9,18),up:hi(12,24)}}},
  堅忍不拔:s=>{s.fx.open.st=hi(8,16)},                                  // 非大將：每受 4 次普攻統率 +16%（最多 3 次）
  七十二欺計:s=>{s.fx.open.n7=7;s.fx.open.aoe=hi(60,120)/100},         // 累計 7 次奇謀後對敵軍全體謀略傷害
  一領具足:s=>{s.fx.open.merc=hi(48,96)/100},                          // 第 3、4 回合全隊獲得傭兵（額外兵力，持續 3 回合）
  // 新賽季預告（以上線為準）
  三階菅笠:s=>{},                                                       // 「累計受到 20% 傷害」已在戰鬥流程實作（只是讓全庫檢查不再標成部分模擬）
  武士之鑒:s=>{s.arm='騎'},                                             // 適用兵種只有騎兵
  野之虎:s=>{s.fx={open:{t:'atkS'}};s.rushN=true},                     // 普攻變謀略傷害；突擊打敵軍群體 2 人（普攻目標＋另一人）
  當機立斷:s=>{s.fx={rush:{t:'tanki'}}},                                // 先解除目標 2 個增益再打；50% 對重新選的敵軍單體再執行 1 次
  雨夜手拍子:s=>{s.fx={cast:{t:'amayo',v:hi(17.5,35),cd:1}}},           // 自身非自帶主動傷害 +35% 持續 2 回合；發動後冷卻 1 回合
  能鷹隱爪:s=>{delete s.dmg;delete s.heal;s.fx={rush:{t:'nouka',dmg:hi(71,142)/100,heal:hi(65,130)/100}}},   // 隨機 2-4 次，每次 50% 謀略傷害／50% 治療我軍單體（兩者機率各半，Joe 2026-11-25 確認）
  孤注一擲:s=>{delete s.dmg;delete s.heal;s.fx={rush:{t:'kochu',dmg:hi(80,160)/100,heal:hi(86,172)/100}}},   // 未連擊友軍各打 1 次（智武較高）；連擊中友軍治療（受統率影響）。「80%-160%」＝Lv1→滿級（Joe 2026-11-25 確認）
};
const PFIX=new Set(['三階菅笠','如水','疾風迅雷','肥前之熊','破竹之勢','比翼連理','月華鶴影','天神山殘照','鈴鳴','一念亂志','智者樂水','堅忍不拔','七十二欺計','一領具足']);
export function parseSkill(name,D,lv=null){
  curLv=lv;
  try{const sk=parseSkill0(name,D);if(INNFIX[name]){INNFIX[name](sk);if(PFIX.has(name))delete sk.partial}const c=K.skCal[name];if(c&&sk.dmg){sk.dmg*=c;sk.cal=c}return sk}finally{curLv=null}
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
  // 持續性狀態（火傷／水攻／中毒／潰走／消沉…）：「每回合持續受到傷害（傷害率a→b%…），持續N回合」或「X狀態（傷害率a→b%…），持續N回合」（官方：不可疊加、可被刷新）
  {const dt=x.match(/持續受到傷害（傷害率([\d.]+)%(?:→([\d.]+)%)?[^）]*）[^。]{0,40}?持續(\d)回合/)||x.match(/(?:火傷|水攻|中毒|潰走|消沉)(?:狀態|效果)?（傷害率([\d.]+)%(?:→([\d.]+)%)?[^）]*）[^。]{0,40}?持續(\d)回合/);
    if(dt){sk.dot={v:hi(dt[1],dt[2])/100,dur:+dt[3],kd:x.match(/火傷|水攻|中毒|潰走|消沉/)?.[0]};if(sk.dmg&&Math.abs(sk.dmg-sk.dot.v)<1e-9&&!/造成[^，。]{0,6}(兵刃|謀略)傷害/.test(x))delete sk.dmg}}
  if(hm){sk.heal=hi(hm[1],hm[2])/100;sk.healSelf=/治療自身|為自身進行治療/.test(x)&&!/我軍/.test(x.slice(0,x.indexOf('治療')))}
  sk.prepN=+(x.match(/^準備(\d)回合/)?.[1]||0);sk.prep=sk.prepN>0;   // 準備 N 回合（過去只認 1 回合，準備2回合的怪力無雙被當成即發，傷害被高估）
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
  {let m=x.match(/使(我軍單體|敵軍單體)(?:本回合)?(武勇|智略|統率|速度)(增加|減少)([\d.]+)(?:→([\d.]+))?點，持續(\d)回合/);   // 初級鼓舞／擾亂／壓制…：單體屬性增減
    if(m)sk.sm={ally:m[1]==='我軍單體',k:m[2],v:(m[3]==='減少'?-1:1)*hi(m[4],m[5]),dur:+m[6]};
    m=x.match(/使敵軍(單體|群體（(\d)人）)造成傷害降低([\d.]+)%(?:→([\d.]+)%)?，持續(\d)回合/);   // 威壓（口羽通良）：敵軍造成傷害降低
    if(m)sk.wk={n:m[2]?+m[2]:1,v:hi(m[3],m[4]),dur:+m[5]}}
  sk.rate=rate;
  if(sk.dmg||sk.heal||sk.status||sk.self||sk.buf||sk.regen||sk.dot||sk.sm||sk.wk)sk.modeled='text';
  if(sk.modeled==='text'&&!(sk.dmg||sk.heal||sk.status||sk.self))sk.buffOnly=true;   // （持續傷害／屬性增減／降傷也算「非純增益」但先維持 buffOnly，避免改動劇本隨機抽戰法）   // 只有增益：劇本隨機抽戰法不用，免得改動既有劇本的武將配招（hash 分配）
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
  for(const t of T){for(const g of t.gens)if(g.sk0){g.skills=g.sk0;delete g.sk0}const g0=t.gens[0];if(g0?.skills?.[0]&&BOSSFX[g0.skills[0].name]&&!g0.noBoss){g0.sk0=g0.skills;g0.skills=[bossSkill(g0.skills[0]),...g0.skills.slice(1)]}
    if(g0){g0.genEv=0;if(g0.tcIn?.genbou){const al=t.gens.slice(1).sort((a,b)=>b.st.統率-a.st.統率)[0];if(al&&BOSSFX[al.skills?.[0]?.name]){al.sk0=al.skills;al.skills=[bossSkill(al.skills[0]),...al.skills.slice(1)]}else g0.genEv=1}}}   // 玄謀：官兵衛當大將時，統率最高的友軍大將技也生效；沒有的話自己 3% 規避   // 大將技：只有大將的固有戰法（skills[0]）生效
  for(const t of T)for(const g of t.gens){
    g.b={...g.st};g.fx={};g.prep=null;g.start=g.troops;
    g.bx=g.tr?{...(g.bg?.fx||{}),...Object.fromEntries(Object.entries(g.tr).map(([k,v])=>[k,(g.bg?.fx?.[k]||0)+v]))}:(g.bg?.fx||{});g.q=g.bg?.q||null;g.tm=(g.trTm||[]).map(x=>({...x}));g.tc=g.tcIn||{};g.nu=0;g.bs={};g.dmgIn=0;g.phxU=0;g.rokouD=0;g.akaD=0;g.shoD=0;g.haoL=0;g.hoR=0;g.thR=0;g.g1=0;g.maoD=0;g.dr=0;g.hoN=0;g.setD=0;g.ssU=0;g.danD=0;g.kamD=0;g.kikD=0;g.dots=[];g.cnt={反討之計:3,明鏡:2};g.lj=0;g.noPrepR=0;g.first=0;g.sealR=0;g.tn=null;g.sb=[];g.sh=0;g.cb=0;g.imm=0;g.jogeU=0;g.senN=0;g.shuR=0;g.msN=0;
    if(g.tc.lj)g.lj=Math.max(g.lj||0,g.tc.lj);for(const k in g.tc.stAdd||{})g.b[k]+=g.tc.stAdd[k];
    g.wen=g.skills.find(s=>s.fx?.open?.t==='bunbu')?.fx.open||null;g.wc=[0,0];g.go=g.skills.find(s=>s.fx?.open?.t==='gokihata')?.fx.open||null;
    for(const s of g.skills)if(s.self&&s.modeled==='text')for(const k of s.self.ks)g.b[k]+=s.self.v;
    if(g.bx.spd)g.b.速度+=g.bx.spd;
    if(g.gear){for(const k in g.gear.st)g.b[k]+=g.gear.st[k];   // 隨機珍品裝備（slg/equipment.js）：屬性、騎兵限定屬性、全程 % 加成
      if(t.arm==='騎')for(const k in g.gear.cav)g.b[k]+=g.gear.cav[k];
      for(const x of g.gear.tm)g.tm.push({...x})}
    g.gc=g.gear?.gc||{};
    for(const s of g.skills)for(const x of s.bossTm||[])if(R()<(x.p??1))g.tm.push({k:x.k,v:x.v,from:x.from,until:99,src:g});   // 大將技的定時加成（海道第一：第 5 回合起）
    if(g.gc.修羅!==undefined)g.lfv=(g.lfv||0)+1+4*g.gc.修羅;   // 修羅：離反 1~5%
    if(g.gc.鬼謀!==undefined)g.lj=(g.lj||0)+1+4*g.gc.鬼謀;   // 鬼謀：攻心 1~5%
    if(g.gc.反復!==undefined)g.lj=(g.lj||0)+.5+2.5*g.gc.反復;   // 反復（升梯子二枚胴具足專屬，真田昌幸）：攻心 0.5~3%
    if(g.gc.鐵壁!==undefined)g.b.統率*=1+(1+5*g.gc.鐵壁)/100;   // 鐵壁（大釘後立兜專屬）：統率 +1~6%
  }
  T.forEach((t,ti)=>{const g0=t.gens[0],e=T[1-ti];if(!g0)return;
    if(g0.genEv)g0.tm.push({k:'evade',v:3,until:99});
    if(t.gens.some(m=>m.tc.tanto)&&!FEMALE.has(g0.n))for(const k of ST4)g0.b[k]*=1.02;   // 短刀之契：男性大將全屬性 +2%
    const kg=t.gens.find(m=>m.tc.kuge),ek=e.gens[0]?.kaho;   // 公家嗜好：敵軍大將的家寶效果失效，自己拿到
    if(kg&&ek){const d=e.gens[0];for(const k in ek.st){d.b[k]-=ek.st[k];kg.b[k]+=ek.st[k]}for(const x of ek.tm){const q=d.tm.findIndex(y=>y.k===x.k&&y.v===x.v&&y.until===99);if(q>=0)d.tm.splice(q,1);kg.tm.push({...x})}for(const k in ek.gc){delete d.gc[k];kg.gc={...kg.gc,[k]:ek.gc[k]}}}
  });
  // 魏傳（三國志演義專屬）：與自身相同勢力的友軍武勇 +1~6
  for(const t of T)for(const g of t.gens)if(g.gc?.魏傳!==undefined){const v=1+5*g.gc.魏傳;for(const m of t.gens)if(m!==g&&m.f&&m.f===g.f)m.b.武勇+=v}
  // 控制抵抗（特性）：上下一心、先驅、傾奇者、義將；淑德替大將承擔。回傳 true＝這個控制不生效
  const CTRLK=new Set(['封擊','無策','混亂','威壓','麻痺']);
  function resist(tt,j,k){const d=tt.gens[j],c=d?.tc;if(!c||!CTRLK.has(k))return false;
    if(kouyou(d))return true;   // 光耀（裝備）：機率免疫減益狀態
    if(k==='無策'&&gearImm(d,'深謀'))return true;if(k==='封擊'&&gearImm(d,'龍牙'))return true;   // 深謀（明智光秀）／龍牙（上杉謙信）：前 1~2 回合 20~80% 免疫
    if((k==='封擊'||k==='無策')&&round<=2&&d.gc?.泰然!==undefined&&!d.bs.taizen){d.bs.taizen=1;if(R()<.45+.45*d.gc.泰然)return true}   // 泰然（貞永式目抄）：前 2 回合僅 1 次 45~90% 使封擊／無策無效
    if(d.dong>=round||(k==='混亂'&&d.noConf>=round))return true;   // 洞察：免疫控制；對話：免疫混亂
    if(c.joge){if(round===1)return true;if(!d.jogeU&&R()<.3){d.jogeU=1;return true}}
    if(c.senku&&round<=3&&d.senN<2&&R()<.4){d.senN++;return true}
    if(c.kabuki&&R()*100<c.kabuki+(d.gearN||0))return true;
    if(c.gisho&&k==='混亂'&&R()<c.gisho)return true;
    if(j===0&&round<=2&&['無策','封擊','混亂'].includes(k)&&d.shuR!==round){const m=tt.gens.find((x,q)=>q>0&&x.troops>0&&x.tc.shukutoku);if(m){d.shuR=round;if(R()<.8){m.fx[k]=Math.max(m.fx[k]||0,1);return true}}}
    return false}
  // 戰報用：行動者當下速度，與有狀態變化的目標當下四維（顯示「統率降低了…(變化)(結果)」用）
  // 另外每次事件後比對各武將的四維與 tm（% 加成）有沒有變動，變動就補一筆 stat／buff 事件（誰、哪項、數值、來源、持續到第幾回合），
  // 這樣沒有明寫成事件的增減益（文武雙全、開場兵學／裝備／特性／指揮戰法…）也看得到。來源不明的標「接近【某戰法】」。
  const LBL={dmg:'造成傷害提高',taken:'受到傷害降低',dmgBlade:'兵刃傷害提高',dmgStrat:'謀略傷害提高',takenBlade:'受兵刃傷害降低',takenStrat:'受謀略傷害降低',crit:'會心率',critS:'奇謀率',critSDmg:'奇謀傷害',critDmg:'會心傷害',rateAct:'主動戰法發動率',rateActNI:'主動戰法發動率',dmgAtk:'普攻傷害提高',dmgAct:'主動戰法傷害提高',dmgRush:'突擊戰法傷害提高',dmgPas:'被動戰法傷害提高',takenPas:'受被動戰法傷害降低',takenCom:'受指揮戰法傷害降低',dmgBowCav:'弓兵對騎兵傷害提高',dmgCom:'指揮戰法傷害提高',ratePrep:'準備戰法發動率',dmgPrep:'準備戰法傷害提高',weak:'造成傷害降低',weakBlade:'兵刃傷害降低',weakStrat:'謀略傷害降低',statDown:'統率智略降低',guard:'受到傷害降低',expose:'受到傷害提高',evade:'規避率',pierce:'無視防禦',takenAtkRush:'受普攻突擊傷害降低',takenRush:'受突擊傷害降低',heal:'治療效果提高',healIn:'受治療效果提高',rushRate:'突擊發動率',takenAct:'受主動戰法傷害降低',takenCmd:'受指揮被動傷害降低',dmgActNI:'非自帶主動戰法傷害提高'};
  const lastB=T.map(t=>t.gens.map(g=>({...g.b}))),seenTm=T.map(t=>t.gens.map(()=>new Set())),SK4=['武勇','智略','統率','速度'];
  let started=false,SEQ=0;
  // 沒有獨立事件的兵力變化（離反、吸血、鬼美濃、死守、霸王、紫電、反影、魔王、反擊…）先排進 pend，下一筆事件後補成「效果」事件（aux），
  // 回合交界再對帳一次：引擎實際兵力 ≠ 戰報最後顯示的兵力 → 補一筆「其他效果」，確保戰報每個數字加得起來。
  const pend=[],aux=(by,side,i,h,kind='效果')=>{if(h.q==null&&(h.heal!=null||h.v!=null))h.q=++SEQ;pend.push({type:'skill',side,i,skill:by,kind,aux:true,tg:[h]})};
  const lastT=T.map(t=>t.gens.map(g=>g.troops)),lastQ=T.map(t=>t.gens.map(()=>0));
  const note=x=>{for(const t of x.tg||[])if(t.left!=null&&(t.q??Infinity)>=lastQ[t.side][t.i]){lastT[t.side][t.i]=t.left;lastQ[t.side][t.i]=t.q??lastQ[t.side][t.i]}};
  const reconcile=()=>T.forEach((t,s)=>t.gens.forEach((m,i)=>{const d=m.troops-lastT[s][i];if(!d)return;
    log.push({type:'skill',side:s,i,skill:'其他效果',kind:'效果',aux:true,tg:[d>0?{side:s,i,heal:d,left:m.troops,q:++SEQ}:{side:s,i,v:-d,left:m.troops,dtype:'流失',q:++SEQ}]});lastT[s][i]=m.troops;lastQ[s][i]=SEQ}));
  // 狀態（控制、持續傷害）有沒有寫進事件都追：新出現的補「施加」、消失的補「解除」
  const lastFx=T.map(t=>t.gens.map(()=>new Set())),lastDot=T.map(t=>t.gens.map(()=>new Set()));
  const ev=(e)=>{
    if(e.type==='round'&&started)reconcile();
    const a=e.side!=null&&T[e.side]?.gens[e.i];
    if(a?.b)e.spd=Math.round(a.b.速度*100)/100;
    const cov=new Set();
    const stc=new Set();
    for(const t of e.tg||[])if(t.status){const m=T[t.side]?.gens[t.i];if(m?.b){t.b={武勇:m.b.武勇,智略:m.b.智略,統率:m.b.統率,速度:m.b.速度};cov.add(t.side+'|'+t.i)}for(const k of t.status.split('、'))stc.add(t.side+'|'+t.i+'|'+k)}
    const flush=why=>T.forEach((t,s)=>t.gens.forEach((m,i)=>{if(!m.b)return;
      if(e.type!=='end'){
        const fl={};if(m.sh>0)fl.鐵壁=`可免傷 ${m.sh} 次`;if(m.dong>=round)fl.洞察=`至第 ${m.dong} 回合`;if(m.noConf>=round)fl.免疫混亂=`至第 ${m.noConf} 回合`;
        if(m.first>=round)fl.先攻=`第 ${m.first} 回合`;if(m.merc>0&&m.mercU>=round)fl.傭兵=`${Math.round(m.merc)} 兵力，至第 ${m.mercU} 回合`;if(m.cb>=round)fl.連擊=`第 ${m.cb} 回合`;
        const fx=new Set([...Object.keys(m.fx||{}).filter(k=>m.fx[k]>0),...Object.keys(fl)]),L=lastFx[s][i];
        for(const k of fx)if(!L.has(k)&&m.troops>0&&!stc.has(s+'|'+i+'|'+k))log.push({type:'st',side:s,i,k,dur:m.fx?.[k],note:fl[k],cause:why});
        for(const k of L)if(!fx.has(k)&&m.troops>0&&k!=='連擊'&&k!=='先攻')log.push({type:'st',side:s,i,k,off:true});   // 只維持一回合的不報消失
        lastFx[s][i]=fx;
        const ds=new Set((m.dots||[]).filter(x=>x.until>=round).map(x=>x.name)),LD=lastDot[s][i];
        for(const x of (m.dots||[]))if(x.until>=round&&!LD.has(x.name)&&m.troops>0)log.push({type:'st',side:s,i,k:x.name,dot:true,until:x.until,src:T[x.ti]?.gens[x.i]?.n??null,srcSide:x.ti,srcI:x.i});
        for(const k of LD)if(!ds.has(k)&&m.troops>0)log.push({type:'st',side:s,i,k,dot:true,off:true});
        lastDot[s][i]=ds}
      for(const k of SK4){const d=m.b[k]-lastB[s][i][k];if(Math.abs(d)<=0.005)continue;lastB[s][i][k]=m.b[k];
        if(cov.has(s+'|'+i)){continue}
        const sb=[...(m.sb||[])].reverse().find(x=>x.k===k&&(x.v>0)===(d>0));
        log.push({type:'stat',side:s,i,k,d,res:m.b[k],cause:m.cz?.[k]||why,until:sb?sb.until:99});if(m.cz)delete m.cz[k]}
      for(const x of m.tm){if(seenTm[s][i].has(x))continue;seenTm[s][i].add(x);if(!LBL[x.k])continue;
        log.push({type:'buff',side:s,i,k:x.k,label:LBL[x.k],v:x.v,until:x.until,src:x.src?.n||null,cause:why})}}));
    if(e.type==='turn'){   // 某位武將輪到行動（依速度排序）：之前回合開始階段（指揮／被動／持續效果）的結算先收尾，再標出行動者
      while(pend.length){const x=pend.shift(),a=T[x.side]?.gens[x.i];if(a?.b)x.spd=Math.round(a.b.速度*100)/100;log.push(x);note(x)}
      flush('回合開始／效果到期');const ta=T[e.side]?.gens[e.i];if(ta?.b)e.spd=Math.round(ta.b.速度*100)/100;log.push(e);return}
    if(e.type==='round'&&!started){started=true;flush('開場效果（特性、兵學、裝備、軍學、指揮戰法）');
      T.forEach((t,s)=>t.gens.forEach((m,i)=>{for(const[k,v]of Object.entries(m.bx||{}))if(typeof v==='number'&&v)log.push({type:'buff',side:s,i,k,label:LBL[k]||('兵學：'+k),v,until:99,src:null,cause:'兵學'})}));   // 兵學數值（進階、神算、協同…）整場生效
      log.push(e);return}   // 開場的增減益排在第 1 回合之前
    log.push(e);note(e);
    while(pend.length){const x=pend.shift(),a=T[x.side]?.gens[x.i];if(a?.b)x.spd=Math.round(a.b.速度*100)/100;log.push(x);note(x)}
    flush(e.type==='round'?'回合開始／效果到期':`接近【${e.skill||'普通攻擊'}】`);
  };
  const BG='兵學';
  // 軍學修習（設施，Lv5 全滿；玩家一律滿級）：依隊伍兵種給屬性與傷害／受傷％；t.study 才生效（守軍沒有）
  for(const t of T)if(t.study){const S=STUDY[t.arm];if(S)for(const g of t.gens){
    for(const k in S.st)g.b[k]+=S.st[k];
    if(S.dmg)g.tm.push({k:'dmg',v:S.dmg,until:99});if(S.taken)g.tm.push({k:'taken',v:S.taken,until:99});
  }}
  // 指揮／被動戰法的單純增益（buf）：戰鬥開始時套到自己／全隊／隨機友軍，屬性直接加，其餘走 tm（到第 r 回合）
  for(const t of T)t.gens.forEach(g=>{for(const sk of g.skills)if(sk.buf&&!(sk.arm&&t.arm!==sk.arm))for(const b of sk.buf){
    const tg=b.to==='self'?[g]:b.to==='team'?t.gens:pickN(t.gens,b.n,R);
    for(const m of tg){if(b.k.startsWith('stat:')){m.b[b.k.slice(5)]+=b.v;(g.stBuffs=g.stBuffs||[]).push({m,k:b.k.slice(5),v:b.v})}else m.tm.push({k:b.k,v:b.v,until:b.r,src:g})}
  }});
  // 合盟之陣：三人勢力各不相同、大將自帶戰法（skills[0]）是主動或突擊才生效
  for(const t of T)t.gens.forEach(g=>{for(const sk of g.skills)if(sk.alliance){
    const fs=effFacs(t.gens.map(x=>({f:x.f,rule:x.tc?.facRule}))),bk=t.gens[0].skills[0]?.kind;   // 實際勢力（rules.js）
    if(fs.every(Boolean)&&new Set(fs).size===fs.length&&(bk==='主動'||bk==='突擊')){
      t.gens[0].tm.push({k:bk==='主動'?'rateAct':'rushRate',v:sk.alliance.boss,until:99});
      for(const m of t.gens.slice(1)){m.tm.push({k:'dmg',v:sk.alliance.sub,until:99});m.tm.push({k:'taken',v:sk.alliance.sub,until:99})}
    }}});
  // 固有戰法補建模（2026-11-23）：開場設定。狀態放 g.ix（戰鬥結束時清掉）。
  const ixs=g=>g.ix||(g.ix={});
  const IO={
    banjaku:({g,o})=>{g.tm.push({k:'taken',v:o.v,until:99,src:g})},
    hizen:({g,o})=>{g.hz=o},
    hachiku:({g,o})=>{g.hck={n:0,v:o.v,max:o.max}},
    gekka:({t,g,o})=>{ixs(g).gk2=pickN(t.gens.map((_,j)=>j).filter(j=>t.gens[j]!==g),2,R);ixs(g).gkn=0;ixs(g).gkv=o.v},
    chisha:({t,g,o})=>{const al=pickN(t.gens.map((_,j)=>j),2,R),strat=t.gens.filter(m=>m.b.智略>m.b.武勇).length*2>t.gens.length;for(const j of al){const m=t.gens[j];m.tm.push({k:'takenBlade',v:strat?o.up:o.v,until:3,src:g},{k:'takenStrat',v:strat?o.v:o.up,until:3,src:g},{k:'weak',v:5,until:3})}},   // 智者樂水
    isen:({g,o})=>{g.lfv=(g.lfv||0)+o.v},
    shichu:({g,o})=>{g.shc={n:0,st:o.st}},
    gouki:({t,g,o})=>{ixs(g).gk=pickN(t.gens.map((_,j)=>j).filter(j=>t.gens[j]!==g),2,R)},
    kijiko:({t,g,o})=>{for(const m of t.gens){m.b.統率+=o.st;m.sb.push({k:'統率',v:o.st,until:4})}},
    nari:({g,o})=>{g.b.武勇+=o.st},
    akabe:({g,o})=>{g.tm.push({k:'crit',v:o.crit,until:99,src:g})},
    bungo:({g,o})=>{const b=g.b,m=Math.max(b.武勇,b.智略,b.統率);if(b.武勇===m)g.tm.push({k:'dmgBlade',v:o.dmg,until:99,src:g});else if(b.智略===m)g.tm.push({k:'dmgStrat',v:o.dmg,until:99,src:g});else g.tm.push({k:'rateAct',v:o.rate,until:99,src:g});if(o.boss){const k=b.武勇===m?'武勇':b.智略===m?'智略':'統率';b[k]+=o.boss}},
    yasha:({e,g,o})=>{g.tm.push({k:'taken',v:(e.arm==='騎'||e.arm==='鐵炮')?o.v2:o.v,until:99,src:g})},
    zuikei:({t,g,o})=>{for(const m of t.gens)m.tm.push({k:'dmg',v:o.v,until:3,src:g})},
    ouchi:({t,g,o})=>{const al=t.gens,s=[...al].sort((a,b)=>b.b.智略-a.b.智略)[0],w=[...al].sort((a,b)=>b.b.武勇-a.b.武勇)[0];s.tm.push({k:'dmgStrat',v:o.v,until:99,src:g});w.b.武勇*=.9},
    usami:({g,o})=>{g.tm.push({k:'rateAct',v:o.v,until:99,src:g})},
    matsu:({t,g,o})=>{t.gens[0].tm.push({k:'rateActNI',v:o.v,until:99,src:g})},
    baba:({g,o})=>{g.baba={p:o.p,rate:o.rate}},
    atkS:({g})=>{g.atkS=1},   // 野之虎：普通攻擊變為謀略傷害
    nanyo:({t,e,g,o})=>{for(const m of[...t.gens,...e.gens])m.tm.push({k:'weakBlade',v:o.v,until:3,src:g})},   // 南予智將：前 3 回合敵我全體兵刃傷害降低
    mouri:({e,g,o})=>{ixs(g).set=R()<o.pAll?aliveIdx(e):pickN(aliveIdx(e),2,R)},
  };
  // 三矢家訓：三名武將主屬性（最高屬性）都不同 → 各自主屬性 +8
  for(const t of T)if(t.gens.some(g=>g.tc.mitsuya)){const mk=g=>ST4.reduce((a,k)=>g.b[k]>g.b[a]?k:a,'武勇');const ks=t.gens.map(mk);if(new Set(ks).size===ks.length)t.gens.forEach((g,i)=>{g.b[ks[i]]+=8})}
  // 手工建模戰法（SKFX）：開場生效的增益／減益
  T.forEach((t,ti)=>{const e=T[1-ti];t.gens.forEach(g=>{for(const sk of g.skills){const o=sk.fx?.open;if(!o)continue;
    if(o.t==='weak')for(const d of pickN(e.gens,o.n,R))d.tm.push({k:'weak',v:o.v,until:o.rounds});
    else if(o.t==='taken')for(const m of t.gens)m.tm.push({k:'taken',v:o.v,until:o.rounds});
    else if(o.t==='taunt')g.tm.push({k:'takenAtkRush',v:o.self,until:o.rounds});
    else if(o.t==='qimou'){g.tm.push({k:'critS',v:o.p,until:99});g.tm.push({k:'critSDmg',v:o.dmg,until:99});if(o.n7)g.q72={n:0,need:o.n7,aoe:o.aoe}}
    else if(IO[o.t])IO[o.t]({t,ti,e,g,o});
  }})});
  // 協同：隨機友軍單體造成的傷害提高
  for(const t of T)t.gens.forEach((g,i)=>{if(g.bx.ally){const j=Math.floor(R()*t.gens.length);t.gens[j].tm.push({k:'dmg',v:g.bx.ally,until:99})}});
  const M=(g,k)=>(g.bx[k]||0)+g.tm.reduce((a,x)=>a+(x.k===k&&x.until>=round&&!(x.from&&round<x.from)&&!(x.src&&x.src.troops<=0)?x.v:0),0);   // 官方：持有者陣亡後，其指揮戰法效果失效
  const timed=(g,k,v,n)=>g.tm.push({k,v,until:round+n-1});   // 持續 n 回合（含本回合）
  const GP=(g,k,lo,hi)=>g.gc&&g.gc[k]!==undefined?lo+(hi-lo)*g.gc[k]:null;   // 裝備條件特技：擲值 0~1 → 說明的範圍
  // 功能性增益狀態（壓迫、激昂用）：連擊、鐵壁、離反、攻心、規避、先攻、免疫
  const hasBuff=m=>m.cb>=round||m.sh>0||(m.lfv||0)>0||(m.lj||0)>0||M(m,'evade')>0||m.first>=round||m.imm===round||m.dong>=round;
  const mainOf=m=>['武勇','智略','統率'].reduce((a,k)=>m.b[k]>m.b[a]?k:a,'武勇');
  // 惡毒：首次施加持續性減益狀態時，40~80% 機率降低目標主屬性 5~15，持續 4~6 回合
  const onDebuff=(g,gs,gi,d,side,j)=>{firstBad(d,'不屈');const p=GP(g,'惡毒',5,15);if(p==null||g.bs.akudoku)return;g.bs.akudoku=1;if(R()<.4+.4*g.gc.惡毒&&d.troops>0){const k=mainOf(d),v=Math.round(p*10)/10;d.b[k]-=v;d.sb.push({k,v:-v,until:round+3+Math.round(2*g.gc.惡毒)});aux('惡毒',gs,gi,{side,i:j,status:`${k} -${v}`})}};
  // 果決：施加的持續性減益狀態傷害 30~50% 機率提高 5~20%，每場最多 1~2 次
  const kekketsu=(g,dot)=>{const p=GP(g,'果決',5,20);if(p==null||(g.bs.kk||0)>=(g.gc.果決>.5?2:1)||R()>=.3+.2*g.gc.果決)return;g.bs.kk=(g.bs.kk||0)+1;dot.v*=1+p/100};
  // 光耀：1~4% 機率免疫減益狀態
  const kouyou=d=>{const p=GP(d,'光耀',1,4),q=GP(d,'日輪',3,9);return p!=null&&R()*100<p||q!=null&&R()*100<q};   // 日輪（一期一振專屬，豐臣秀吉）：3~9% 不受減益狀態影響
  const gearImm=(d,k)=>{const p=GP(d,k,20,80);return p!=null&&round<=1+Math.round(d.gc[k])&&R()*100<p};
  // 不屈／不動（防具）：首次被施加持續性減益／首次被控制時，受到傷害降低 1~6%，1~2 回合
  const firstBad=(d,k)=>{const p=GP(d,k,1,6);if(p==null||d.bs['fb'+k])return;d.bs['fb'+k]=1;timed(d,'taken',p,1+Math.round(d.gc[k]))};
  // 密謀／設伏（防具）：自己施加的控制／持續性減益被淨化時，40~80% 機率對目標造成謀略傷害 20~60%，每場最多 2 次
  const cleaned=(tt,j,k,dot)=>{const by=dot?[dot.ti,dot.i]:tt.gens[j]?.fxBy?.[k];if(!by)return;const a=T[by[0]]?.gens[by[1]];if(!a)return;const key=dot?'設伏':'密謀',p=GP(a,key,.4,.8);
    if(p==null||a.troops<=0||(a.bs[key]||0)>=2||R()>=p)return;a.bs[key]=(a.bs[key]||0)+1;const h=hit(T[by[0]],by[0],by[1],tt,j,.2+.4*a.gc[key],'謀略','eq');if(h)aux(key,T[by[0]].side,by[1],h)};
  const setFx=(tt,j,k,dur,by)=>{const d=tt.gens[j];d.fx[k]=Math.max(d.fx[k]||0,dur);if(by)(d.fxBy||(d.fxBy={}))[k]=by;if(CTRLK.has(k))firstBad(d,'不動')};
  const routed=t=>t.gens[0].troops<=0;
  // 專屬裝備：自帶戰法傷害率提高（貫通＝甲山猛虎 3~18%、奇襲＝啄木鳥 4~20%、雷刃＝電光雷轟 2~8%）
  const SKUP={甲山猛虎:['貫通',3,18],啄木鳥:['奇襲',4,20],電光雷轟:['雷刃',2,8]};
  const skUp=(g,sk)=>{const u=SKUP[sk.name];if(!u||sk!==g.skills[0])return 0;const p=GP(g,u[0],u[1],u[2]);return p==null?0:p/100*(sk.cal||1)};
  // kind: 'atk' 普通攻擊、戰法類型（主動／突擊／指揮／被動）或 '兵學'；prep: 準備後發動的主動戰法
  function hit(src,st,s,dst,dt,rate,dtype,kind='atk',prep=false){
    const g=src.gens[s];let d=dst.gens[dt];
    if(d.troops<=0)return null;
    if(d.engo&&d.engo.until>=round&&src!==dst){const pj=d.engo.by,pm=dst.gens[pj];if(pm&&pm.troops>0&&pj!==dt){dt=pj;d=pm}}   // 薰風（金小札色色威）：援護友軍，代為承受傷害
    if(d.sh>0){d.sh--;return{side:dst.side,i:dt,v:0,left:d.troops,dtype,shield:true}}   // 鐵壁：免受傷害
    {const p=GP(d,'險相',1,4);if(p!=null&&dtype==='兵刃'&&R()*100<p)return{side:dst.side,i:dt,v:0,left:d.troops,dtype,evade:true}}   // 險相：受兵刃傷害時機率免疫
    if(kind==='atk'&&d.tc.seida&&R()<.25)return{side:dst.side,i:dt,v:0,left:d.troops,dtype,evade:true};   // 清濁併吞：25% 阻止普通攻擊
    if(dtype==='auto')dtype=g.b.武勇>=g.b.智略?'兵刃':'謀略';
    if(R()*100<M(d,'evade')&&!(g.sure&&g.sure.until>=round&&R()*100<g.sure.p))return{side:dst.side,i:dt,v:0,left:d.troops,dtype,evade:true};   // 歸雁：必中
    const a=dtype==='兵刃'?g.b.武勇:g.b.智略,df=(dtype==='兵刃'?d.b.統率:d.b.智略)*(1-M(d,'statDown')/100)*(1-Math.min(100,M(g,'pierce'))/100);
    let f=Math.min(3,Math.max(.3,1+(a-df)/K.statDiv));
    if(dtype==='謀略'&&g.tc.moushin&&g.msN<3&&a>df&&R()<.25){g.msN++;f*=1+(a-df)/K.statDiv}   // 謀神：25% 額外再受一次智略差影響（每場最多 3 次）
    if(dtype==='兵刃'){if(COUNTER[src.arm]?.includes(dst.arm))f*=K.counter[0];else if(COUNTER[dst.arm]?.includes(src.arm))f*=K.counter[1]}
    f*=K.terrain[dst.terrain]??1;
    f*=src.mods?.dmg??1;   // 劇本效果（例如豪雨奇襲）、火炬視野
    f*=K.morale(src.morale??100);   // 士氣
    f*=dst.mods?.taken??1;   // 火炬視野：受到傷害降低
    if(g.tc.kengo&&d.st.武勇>=g.st.武勇)f*=1.09;if(d.tc.kengo&&g.st.武勇<d.st.武勇)f*=.91;   // 劍豪
    if(d.tc.phx)f*=1.015;   // 鳳凰：受到傷害 +1.5%
    if(d.tc.fushi)f*=1-d.tc.fushi/100;   // 不死身／無傷雄師（假設 −5%）
    {const p=GP(d,'鐵甲',1,2.5);if(p!=null&&dst.arm==='騎'&&src.arm==='槍')f*=1-p/100}   // 鐵甲：騎兵受足輕傷害降低
    {const p=GP(g,'摧堅',2,10);if(p!=null&&round>=(g.gc.摧堅>.5?3:4)&&['威壓','麻痺','混亂','無策','封擊'].some(k=>d.fx[k]))f*=1+p/100}   // 摧堅：對受控制目標
    {const p=GP(g,'折銳',2,10);if(p!=null&&round>=(g.gc.折銳>.5?3:4)&&d.dots.length)f*=1+p/100}   // 折銳：對持續傷害目標
    {const p=GP(g,'壓迫',2,10);if(p!=null&&round>=(g.gc.壓迫>.5?3:4)&&hasBuff(d))f*=1+p/100}   // 壓迫：對有功能性增益狀態的目標
    if(src.arm==='弓'&&dst.arm==='騎')f*=1+M(g,'dmgBowCav')/100;   // 逆轉：弓兵對騎兵造成傷害提高
    // 兵學：造成傷害 %
    const nuV=g.nu||0;g.nu=0;   // 才德兼備：下次造成的傷害提高
    const up=nuV+M(g,'dmg')+(dtype==='兵刃'?M(g,'dmgBlade'):0)+(kind==='atk'?M(g,'dmgAtk'):0)+(kind==='主動'?M(g,'dmgAct')+(g.curSk&&g.curSk!==g.skills[0]?M(g,'dmgActNI'):0):0)+(prep?M(g,'dmgPrep'):0)
      +(kind==='突擊'?M(g,'dmgRush'):0)+(kind==='被動'?M(g,'dmgPas'):0)+(kind==='指揮'?M(g,'dmgCom'):0)+(dtype==='謀略'?M(g,'dmgStrat'):0)-M(g,'weak')-(dtype==='兵刃'?M(g,'weakBlade'):M(g,'weakStrat'));
    // 兵學：受到傷害降低 %
    const dn=M(d,'taken')+(dtype==='兵刃'?M(d,'takenBlade'):M(d,'takenStrat'))+(kind==='atk'||kind==='突擊'?M(d,'takenAtkRush'):0)+(kind==='突擊'?M(d,'takenRush'):0)
      +(kind==='主動'?M(d,'takenAct'):0)+(kind==='指揮'||kind==='被動'?M(d,'takenCmd'):0)+(kind==='被動'?M(d,'takenPas'):0)+(kind==='指揮'?M(d,'takenCom'):0)+M(d,'guard')-M(d,'expose');
    f*=Math.max(.1,1+up/100)*Math.max(.1,1-dn/100);
    if(d.genei&&d.genei.round===round&&src!==dst&&d.genei.set.includes(s))f*=1-d.genei.v/100;   // 幻影（維吉諾琴）：本回合受選定武將的傷害減少
    if(d.g1){f*=1-d.g1/100;d.g1=0}   // 三河武士：下次受到傷害降低
    if(d.go&&R()<d.go.p)f*=1-d.go.v/100;   // 御旗盾無：受傷時機率減傷
    let crit=false;
    if(dtype==='兵刃'&&R()*100<M(g,'crit')){f*=K.crit+M(g,'critDmg')/100;crit=true;g.cr=round}
    if(dtype==='謀略'&&R()*100<M(g,'critS')){f*=K.crit+M(g,'critSDmg')/100;crit=true}
    let v=Math.sqrt(g.troops)*K.base*rate*f*(0.94+R()*0.12);
    v=Math.max(1,Math.min(d.troops,Math.round(v)));
    {const p=GP(d,'戒心',5,20);if(p!=null&&kind==='atk')v=Math.max(1,v-Math.round(p))}   // 戒心：受到普通攻擊減少傷害點數
    {const p=GP(g,'刹那',.3,1.5);if(p!=null&&round===1&&!g.setD){g.setD=1;v+=Math.round(g.b.速度*p)}}   // 刹那：首回合首次傷害附加兵力流失
    v=Math.min(d.troops,v);
    if(d.merc>0&&d.mercU>=round){const a=Math.min(d.merc,v);d.merc-=a;v-=a;if(v<=0)return{side:dst.side,i:dt,v:0,left:d.troops,dtype,shield:true}}
    d.troops-=v;
    if(crit&&dtype==='兵刃'){let p;
      if((p=GP(g,'流星',2,9))!=null&&(g.bs.ryusei||0)<(g.gc.流星>.5?2:1)){g.bs.ryusei=(g.bs.ryusei||0)+1;g.tm.push({k:'critDmg',v:p,until:99})}   // 流星（赤突槍，山縣昌景）：會心後會心傷害 +2~9%，疊 1~2 次
      if((p=GP(g,'勇力',4,10))!=null&&g.troops>0&&R()*100<p){const hv=Math.min(g.max-g.troops,Math.round(v*(.15+.05*g.gc.勇力)));if(hv>0){g.troops+=hv;aux('勇力',src.side,s,{side:src.side,i:s,heal:hv,left:g.troops})}}}   // 勇力（片鎌槍，加藤清正）
    {const p=GP(g,'斷謀',5,15);if(p!=null&&dtype==='謀略'&&!g.danD){g.danD=1;if(R()<.3+.2*g.gc.斷謀)d.b.智略-=p}}   // 斷謀：首次謀略傷害後降低目標智略
    {const p=GP(d,'架勢',.5,1),pr=GP(d,'架勢',.4,.8);if(p!=null&&dtype==='兵刃'&&kind!=='反'&&round>=4&&round<=6&&!d.kamD&&d.troops>0&&R()<pr){d.kamD=1;const hh=hit(dst,dt,dt,src,s,p,'兵刃','反');if(hh)aux('架勢（反擊）',dst.side,dt,hh)}}   // 架勢：首次受兵刃傷害後反擊
    {const p=GP(d,'詭計',.5,1),pr=GP(d,'詭計',.4,.8);if(p!=null&&dtype==='謀略'&&kind!=='反'&&round>=4&&round<=6&&!d.kikD&&d.troops>0&&R()<pr){d.kikD=1;const hh=hit(dst,dt,dt,src,s,p,'謀略','反');if(hh)aux('詭計（反擊）',dst.side,dt,hh)}}   // 詭計：首次受謀略傷害後反擊
    g.dr=round;d.dmgIn=(d.dmgIn||0)+v;
    {const p=GP(d,'白瀧',5,10);if(p!=null&&kind!=='atk'&&kind!=='反'&&d.troops>0&&R()*100<p){const mx=d.gc.白瀧>.5?2:1,n=d.tm.filter(x=>x.hakuse&&x.until>=round).length;if(n<mx){const v2=Math.round((10+15*d.gc.白瀧)*10)/10;d.tm.push({k:'crit',v:v2,until:round+Math.round(d.gc.白瀧),hakuse:1});aux('白瀧',dst.side,dt,{side:dst.side,i:dt,status:`會心 +${v2}%`})}}}   // 白瀧（惣黑熊毛具足專屬）
    if(dtype==='兵刃'&&d.shc){if(d.shc.n<10){d.shc.n++;d.b.武勇+=d.shc.st}}   // 死中求活：受兵刃傷害後武勇疊加
    if(!d.lh||d.lh.round!==round)d.lh={round,s};
    if(dtype==='兵刃'&&d.hz&&R()<d.hz.p*aliveIdx(dst).length/3)d.hzQ=(d.hzQ||0)+1;   // 肥前之熊
    if(crit&&dtype==='兵刃'&&g.hck&&g.hck.n<g.hck.max){g.hck.n++;g.tm.push({k:'critDmg',v:g.hck.v,until:99})}   // 破竹之勢
    if(crit&&dtype==='謀略'&&g.q72&&g.q72.n<g.q72.need){if(++g.q72.n===g.q72.need)g.q72.fire=1}   // 七十二欺計   // 本回合首次受傷的來源（剛毅木訥用）
    if(d.tc.phx&&round>=3&&!d.phxU&&d.troops<=0){d.phxU=1;d.troops=1;v-=1;aux('鳳凰',dst.side,dt,{side:dst.side,i:dt,status:'鳳凰：免於潰敗'})}   // 鳳凰：第 3 回合起首次致命傷害被阻止
    const left0=d.troops,q0=++SEQ;
    if(d.tc.shishu2&&!d.ssU&&d.troops>0&&d.troops<d.max*.5){d.ssU=1;const hv=Math.min(d.max-d.troops,Math.round(d.max*d.tc.shishu2));d.troops+=hv;if(hv>0)aux('死守',dst.side,dt,{side:dst.side,i:dt,heal:hv,left:d.troops})}   // 死守（假設恢復 30%）
    if(kind!=='atk'&&dst.gens.some(m=>m.tc.shinfuku&&m.troops>0)){d.bs.sf=(d.bs.sf||0)+1;if(d.bs.sf%3===0&&(d.bs.sfU||0)<2){d.bs.sfU=(d.bs.sfU||0)+1;const k=['武勇','智略','統率','速度'].reduce((a,x)=>d.b[x]>d.b[a]?x:a,'武勇');d.b[k]+=6}}   // 心腹之智：友軍累計受到 3 次戰法傷害 → 主屬性 +6
    if(g.tc.rash&&dtype==='兵刃'&&R()<.6&&(g.bs.rash||0)<6){g.bs.rash=(g.bs.rash||0)+1;g.tm.push({k:'crit',v:1,until:99},{k:'critDmg',v:1,until:99})}   // 魯莽武者
    if(g.tc.muke&&R()<.6)timed(d,'expose',7,1);   // 無形之位：目標受到傷害 +7%
    if(g.tc.hoen&&dtype==='謀略'&&round>=3&&g.hoR!==round){g.hoR=round;if(R()<.5&&(src.hoN||0)<2){src.hoN=(src.hoN||0)+1;for(const m of src.gens)if(m.troops>0)m.b.智略+=5}}   // 方圓之器
    if(d.tc.rokou&&kind==='主動'&&!d.rokouD){d.rokouD=1;g.b.智略-=15}   // 老功古實
    if(d.tc.kouro){const n=d.bs.kouro||0;if(n<3&&d.dmgIn>=(n+1)*.1*d.max){d.bs.kouro=n+1;d.lfv=(d.lfv||0)+3}}   // 紅爐點雪：離反
    if(g.tc.hime&&dtype==='兵刃'){g.bs.hime=(g.bs.hime||0)+1;if(g.bs.hime%6===0&&(g.bs.himeU||0)<2){g.bs.himeU=(g.bs.himeU||0)+1;const hh=healTo(src,lowest(src),g,.98);if(hh)aux('姬城督',src.side,s,hh)}}   // 姬城督
    if(g.tc.bando&&dtype==='兵刃'&&d.b.統率<d.st.統率&&R()<.55&&(g.bs.bando||0)<3){g.bs.bando=(g.bs.bando||0)+1;g.b.武勇+=8;g.sb.push({k:'武勇',v:8,until:round+1})}   // 坂東太郎
    if(g.wen){const k=dtype==='謀略'?0:1;if(g.wc[k]<g.wen.max){g.wc[k]++;g.b[k?'智略':'武勇']+=g.wen.v;(g.cz=g.cz||{})[k?'智略':'武勇']=`文武雙全（第${g.wc[k]}次）`}}   // 文武雙全
    // 離間之計：離反／攻心，依造成的傷害恢復自身兵力
    if(g.lj&&g.troops>0){const h=Math.min(g.max-g.troops,Math.round(v*g.lj*1.25/100*(1+M(g,'healIn')/100)));if(h>0){g.troops+=h;aux('離間之計（離反）',src.side,s,{side:src.side,i:s,heal:h,left:g.troops})}}
    if(g.lfv&&g.troops>0){const h=Math.min(g.max-g.troops,Math.round(v*g.lfv/100*(1+M(g,'healIn')/100)));if(h>0){g.troops+=h;aux('離反',src.side,s,{side:src.side,i:s,heal:h,left:g.troops})}}   // 離反：依造成的傷害恢復自身兵力
    if(d.baba&&d.troops>0&&R()<d.baba.p){const hv=Math.round(Math.min(d.max-d.troops,healAmt(d,d.baba.rate)));if(hv>0){d.troops+=hv;aux('鬼美濃',dst.side,dt,{side:dst.side,i:dt,heal:hv,left:d.troops})}}   // 鬼美濃：受傷時機率恢復自身兵力
    return{side:dst.side,i:dt,v,left:left0,dtype,rout:left0<=0,crit,q:q0};
  }
  // 靈藥（防具）：施加的休養、回生治療 30~50% 機率提高 5~20%，每場 1~2 次
  const reiyaku=g=>{const p=GP(g,'靈藥',5,20);if(p==null||(g.bs.reiyaku||0)>=(g.gc.靈藥>.5?2:1)||R()>=.3+.2*g.gc.靈藥)return 1;g.bs.reiyaku=(g.bs.reiyaku||0)+1;return 1+p/100};
  const healAmt=(g,rate,sk='智略')=>Math.sqrt(g.troops)*K.healBase*rate*(1+(g.b[sk]-80)/220);   // sk：治療受哪個屬性影響（預設智略；說明寫「受武勇／統率影響」的傳進來）
  function healTo(t,j,g,rate,sk){
    const m=t.gens[j];if(!m||m.troops<=0)return null;
    const raw=healAmt(g,rate,sk)*(1+M(g,'heal')/100)*(1+M(m,'healIn')/100),v=Math.round(Math.min(m.max-m.troops,raw));
    const mainK=x=>['武勇','智略','統率'].reduce((a,k)=>x.b[k]>x.b[a]?k:a,'武勇');
    if(g.tc.shinjin&&raw-v>0&&R()<.5){const k=mainK(m);m.b[k]+=15;m.sb.push({k,v:15,until:round})}   // 深諳人心：溢出治療
    if(g.tc.teashi&&m!==g&&g.thR!==round){g.thR=round;const x=Math.round(m.b[mainK(m)]*.12*10)/10;g.b.統率+=x;g.sb.push({k:'統率',v:x,until:round})}   // 手足之愛
    if(v<=0)return null;m.troops+=v;
    if(g.tc.hao&&m===g){const e2=T[1-T.indexOf(t)],tj=pickN(aliveIdx(e2),1,R)[0];if(tj!=null){const cap=Math.round(g.max*.1)-(g.haoL||0),ls=Math.max(0,Math.min(Math.round(v*.1),cap,e2.gens[tj].troops-1));g.haoL=(g.haoL||0)+ls;e2.gens[tj].troops-=ls;if(ls>0)aux('霸王',t.side,j,{side:e2.side,i:tj,v:ls,left:e2.gens[tj].troops,dtype:'流失'})}}   // 霸王：恢復兵力時敵軍單體兵力流失
    return{side:t.side,i:j,heal:v,left:m.troops,q:++SEQ};
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
    const g=t.gens[i],e=T[1-ti],tg=[],ctl=[],allyTg=[];const curSk0=g.curSk;g.curSk=sk;
    let tmpDmg=null;if(sk.kind==='主動'&&sk===g.skills[0]){const o=g.skills.find(x=>x.fx?.open?.t==='shutsu')?.fx.open;if(o){tmpDmg={k:'dmg',v:o.dmg,until:99};g.tm.push(tmpDmg)}}   // 出奇制勝：自帶主動傷害提高
    if(sk.dmg){
      let nT=sk.n[0]+Math.floor(R()*(sk.n[1]-sk.n[0]+1));
      if(sk.name==='比翼連理'&&sk===g.skills[0]&&nT<sk.n[1]){const p=GP(g,'安康',5,10);if(p!=null&&R()*50<p)nT++}   // 安康（寧寧）：選中 2 名敵軍的機率 50% → 55~60%
      const dR=sk.dmg+skUp(g,sk);
      if(g.fx.混亂){   // 混亂：戰法傷害目標也在敵我全部武將中隨機選（戰報 176 次混亂中的戰法傷害 40% 打到友軍，2026-11-25）
        const pool=[...aliveIdx(e).map(j=>[e,j]),...aliveIdx(t).filter(j=>j!==i).map(j=>[t,j])];
        for(const [side,j] of pickN(pool,nT,R)){const h=hit(t,ti,i,side,j,dR,sk.dtype,sk.kind,!!o?.prepared);if(h)(side===e?tg:allyTg).push(side===e?h:{...h,confused:true})}}
      else{const ids=pickN(aliveIdx(e),nT,R);
      for(const j of ids){const h=hit(t,ti,i,e,j,dR,sk.dtype,sk.kind,!!o?.prepared);if(h)tg.push(h)}}
      if(sk.name==='鬼義重'&&sk===g.skills[0]){const v=65+(GP(g,'威懾',8,35)||0);for(const h of tg){const d=e.gens[h.i];if(h.v==null||d.troops<=0)continue;d.b.統率-=v;d.sb.push({k:'統率',v:-v,until:round});h.status=`統率 -${Math.round(v)}`}}   // 鬼義重：統率降低 65（滿級）；威懾（八文字長義，佐竹義重）再 +8~35
    }
    if(sk.dot){   // 施加持續傷害：同一戰法再次施加只刷新回合、不疊加
      const dj=tg.length&&tg.every(x=>x.v!=null)?tg.map(x=>x.i):pickN(aliveIdx(e),sk.n[1],R);
      for(const j of dj){const d=e.gens[j];if(d.troops<=0)continue;const old=d.dots.find(x=>x.name===sk.name&&x.ti===ti&&x.i===i);
        if(old)old.until=round+sk.dot.dur;else if(!kouyou(d)){d.dots.push({name:sk.name,kd:sk.dot.kd,t,ti,i,v:sk.dot.v,dtype:sk.dtype==='auto'?'auto':sk.dtype,until:round+sk.dot.dur,from:round});kekketsu(g,d.dots[d.dots.length-1]);onDebuff(g,t.side,i,d,e.side,j)}}
    }
    if(sk.status){
      for(const j of (tg.length?tg.map(x=>x.i):pickN(aliveIdx(e),sk.n[1],R)))if(e.gens[j].troops>0&&R()<sk.status.p){
        const ap=sk.status.k.filter(k=>!resist(e,j,k));for(const k of ap)setFx(e,j,k,sk.status.dur,[ti,i]);
        tg.push({side:e.side,i:j,status:ap.length?ap.join('、'):'抵抗了「'+sk.status.k.join('、')+'」'});ctl.push(j);
      }
    }
    if(sk.heal){
      const j=sk.healSelf?i:lowest(t),h=healTo(t,j,g,sk.heal+(sk.name==='疾風迅雷'&&sk===g.skills[0]?(GP(g,'電閃',5,25)||0)/100*.5:0));   // 電閃（雷切，立花誾千代）：疾風迅雷治療率 +5~25%（目標已麻痺才治療，約一半）
      if(h){tg.push(h);if(!sk.healSelf&&g.q==='救援心得')timed(t.gens[j],'guard',6,1)}
    }
    const c=sk.fx?.cast;
    if(c){
      if(c.cd)(g.cdm||(g.cdm={}))[sk.name]=round+c.cd;   // 發動後冷卻 c.cd 回合
      if(c.t==='tmself'){for(const x of c.list)timed(g,x.k,x.v,x.dur);tg.push({side:t.side,i,status:c.list.map(x=>(LBL[x.k]||x.k)+' '+Math.round(x.v)+'%').join('、')})}
      else if(c.t==='noconf'){const j=pickN(aliveIdx(t),1,R)[0];if(j!=null){t.gens[j].noConf=round+c.dur-1;tg.push({side:t.side,i:j,status:'免疫混亂'})}}
      else if(c.t==='dong'){const j=pickN(aliveIdx(t),1,R)[0];if(j!=null){t.gens[j].dong=round+c.dur-1;tg.push({side:t.side,i:j,status:'洞察'})}}
      else if(c.t==='seido'){const late=aliveIdx(t).filter(x=>x!==i&&t.gens[x].b.速度<g.b.速度),j=late.length?pickN(late,1,R)[0]:i;const m=t.gens[j];m.dong=round+c.dur-1;m.first=round+1;tg.push({side:t.side,i:j,status:'洞察、先攻'})}
      else if(c.t==='dakki'){for(const j of pickN(aliveIdx(e),2,R)){const d=e.gens[j];let n=0;d.tm=d.tm.filter(x=>{if(n<2&&x.until<99&&x.v>0&&!['weak','weakBlade','weakStrat','statDown','expose'].includes(x.k)){n++;return false}return true});tg.push({side:e.side,i:j,status:'驅散增益'})}g.b.智略+=c.st;g.sb.push({k:'智略',v:c.st,until:round+2})}
      else if(c.t==='combo'){g.cb=round;if(c.imm)g.imm=round;if(c.weak)timed(g,'weak',c.weak,1);tg.push({side:t.side,i,status:'連擊'});
        if(c.ally){const o=pickN(aliveIdx(t).filter(x=>x!==i),1,R)[0];if(o!=null){t.gens[o].cb=round;tg.push({side:t.side,i:o,status:'連擊'})}}}
      else if(c.t==='guard')for(const j of pickN(aliveIdx(t),2,R)){timed(t.gens[j],'taken',c.v,c.dur);tg.push({side:t.side,i:j,status:`受傷 -${Math.round(c.v)}%`})}
      else if(c.t==='purge')for(const j of pickN(aliveIdx(t),2,R)){const m=t.gens[j];
        for(const k of['武勇','智略','速度']){m.b[k]+=c.v;m.sb.push({k,v:c.v,until:round+c.dur-1})}
        for(const k of Object.keys(m.fx).slice(0,2)){delete m.fx[k];cleaned(t,j,k)}tg.push({side:t.side,i:j,status:`屬性 +${Math.round(c.v)}`})}
      else if(c.t==='rateup'){const o=pickN(aliveIdx(t).filter(x=>x!==i),1,R)[0];if(o!=null){const m=t.gens[o];if(m.tm.filter(x=>x.ru&&x.until>=round).length<c.max){m.tm.push({k:'rateAct',v:c.v,until:round+c.dur-1,ru:1});tg.push({side:t.side,i:o,status:`主動發動率 +${Math.round(c.v)}%`})}}}
      else if(c.t==='inaba'){g.b.統率+=c.v;g.sb.push({k:'統率',v:c.v,until:round+1});const j=[...aliveIdx(e)].sort((a,b)=>e.gens[b].b.武勇-e.gens[a].b.武勇)[0];if(j!=null){e.gens[j].tn={until:round+1,to:i};tg.push({side:e.side,i:j,status:'挑釁'})}tg.push({side:t.side,i,status:`統率 +${c.v}`})}
      else if(c.t==='nobuyasu'){const low=g.troops<g.max*.5,v=low?c.v2:c.v;g.b.武勇+=v;g.sb.push({k:'武勇',v,until:round+1});g.lfv=low?c.lf2:c.lf;ixs(g).lfEnd=round+1;tg.push({side:t.side,i,status:`武勇 +${Math.round(v)}、離反`})}
      else if(c.t==='datehar'){const ids=[i,...pickN(aliveIdx(t).filter(x=>x!==i),1,R)];for(const j of ids){const m=t.gens[j];m.rwp=c.p;m.rwu=round+1;tg.push({side:t.side,i:j,status:'亂舞'})}
        if(round>=5)for(const T2 of T)for(const m of T2.gens){const v=m.st.速度*.15;m.b.速度+=v;m.sb.push({k:'速度',v,until:round+1})}}
      else if(c.t==='hidemitsu'){const ids=[i,...pickN(aliveIdx(t).filter(x=>x!==i),1,R)];for(const j of ids){t.gens[j].tm.push({k:'critS',v:c.p,until:round+1},{k:'critSDmg',v:c.v,until:round+1});tg.push({side:t.side,i:j,status:'奇謀'})}}
      else if(c.t==='kourik'){const o2=pickN(aliveIdx(t),1,R)[0];if(o2!=null){t.gens[o2].tm.push({k:'rateAct',v:c.v,until:round+1});tg.push({side:t.side,i:o2,status:`主動發動率 +${c.v.toFixed(1)}%`})}}
      else if(c.t==='suwa')for(const j of pickN(aliveIdx(t),2,R)){const m=t.gens[j];for(const k of['武勇','統率']){m.b[k]+=c.v;m.sb.push({k,v:c.v,until:round+1})}for(const k of Object.keys(m.fx).slice(0,2)){delete m.fx[k];cleaned(t,j,k)}tg.push({side:t.side,i:j,status:'淨化、武勇統率 +36'})}
      else if(c.t==='asakura')for(const j of pickN(aliveIdx(t),2,R)){const m=t.gens[j];m.tm.push({k:'dmgAct',v:c.v,until:round+1});m.first=round+1;tg.push({side:t.side,i:j,status:'先攻、主動傷害提高'})}
      else if(c.t==='andou'){for(const k of['統率','智略']){g.b[k]+=c.v;g.sb.push({k,v:c.v,until:round+1})}for(const j of pickN(aliveIdx(e),2,R))if(R()<c.p){e.gens[j].tn={until:round+1,to:i};tg.push({side:e.side,i:j,status:'牽制'})}}
      else if(c.t==='ujiie'){const j=pickN(aliveIdx(e),1,R)[0];if(j!=null){const d=e.gens[j];if(d.tn&&d.tn.until>=round)timed(d,'weak',25,2);d.tn={until:round+1,to:i};tg.push({side:e.side,i:j,status:'挑釁'})}}
      else if(c.t==='yamauchi'){const j=pickN(aliveIdx(e),1,R)[0];if(j!=null){const d=e.gens[j],k=d.b.武勇>=d.b.智略?'武勇':'智略';d.b[k]-=c.v;d.sb.push({k,v:-c.v,until:round+1});tg.push({side:e.side,i:j,status:`${k} -${Math.round(c.v)}`})}}
      else if(c.t==='naito'){for(const j of aliveIdx(e))e.gens[j].tn={until:round,to:i};tg.push({side:t.side,i,status:'挑釁敵軍全體'})}
      else if(c.t==='sugi'){const j=pickN(aliveIdx(e),1,R)[0];if(j!=null){const d=e.gens[j];d.tm=d.tm.filter(x=>x.until>=99||!['dmg','dmgBlade','dmgStrat','crit','taken','takenBlade','takenStrat','rateAct','dmgAtk','dmgAct','guard'].includes(x.k));d.b.智略-=c.v;d.sb.push({k:'智略',v:-c.v,until:round+1});tg.push({side:e.side,i:j,status:'解除增益、智略下降'})}}
      else if(c.t==='endo'){const v=c.v;g.b.武勇+=v;g.sb.push({k:'武勇',v,until:round+1});if(i!==0){g.b.統率+=c.v2;g.sb.push({k:'統率',v:c.v2,until:round+1})}tg.push({side:t.side,i,status:`武勇 +${Math.round(v)}`})}
      else if(c.t==='fuusei'){const j=pickN(aliveIdx(e),1,R)[0];if(j!=null){const d=e.gens[j];for(const dt of['兵刃','謀略']){const h=hit(t,ti,i,e,j,c.dmg,dt,sk.kind,!!o?.prepared);if(h)tg.push(h)}
        if(d.troops>0){d.b.速度-=c.spd;d.sb.push({k:'速度',v:-c.spd,until:round+1});tg.push({side:e.side,i:j,status:`速度 -${Math.round(c.spd)}`})}}}   // 風聲鶴唳
      else if(c.t==='bushi')for(const j of aliveIdx(e)){const d=e.gens[j];   // 武士之鑒：已潰走 → 兵刃傷害；再施加（刷新）潰走
        if(d.dots.some(x=>x.kd==='潰走'&&x.until>=round)){const h=hit(t,ti,i,e,j,c.dmg,'兵刃',sk.kind,!!o?.prepared);if(h)tg.push(h)}
        if(d.troops>0){addDot(t,ti,i,d,sk.name,c.dot,'兵刃',c.dur,'潰走');tg.push({side:e.side,i:j,status:'潰走'})}}
      else if(c.t==='amayo'){timed(g,'dmgActNI',c.v,2);g.amayo={until:round+1,heal:c.heal||0};tg.push({side:t.side,i,status:`非自帶主動戰法傷害 +${Math.round(c.v)}%`})}   // 雨夜手拍子
      else if(c.t==='taunt2'){for(const j of aliveIdx(e))e.gens[j].tn={until:round+1,to:i};
        const dv=g.b.統率*c.pct/100;g.b.統率+=dv;g.sb.push({k:'統率',v:dv,until:round+1});tg.push({side:t.side,i,status:'挑釁敵軍全體'})}
    }
    if(sk.sm){const side=sk.sm.ally?t:e,jj=pickN(aliveIdx(side),1,R)[0];if(jj!=null){const m=side.gens[jj];m.b[sk.sm.k]+=sk.sm.v;m.sb.push({k:sk.sm.k,v:sk.sm.v,until:round+sk.sm.dur-1});tg.push({side:side.side,i:jj,status:`${sk.sm.k} ${sk.sm.v>0?'+':''}${Math.round(sk.sm.v)}`})}}
    if(sk.wk)for(const j of pickN(aliveIdx(e),sk.wk.n,R)){timed(e.gens[j],'weak',sk.wk.v,sk.wk.dur);tg.push({side:e.side,i:j,status:`造成傷害 -${Math.round(sk.wk.v)}%`})}
    if(sk.kind==='主動')for(const s2 of g.skills){const o2=s2.fx?.open;if(!o2)continue;const ix=ixs(g);
      if(o2.t==='maeda'){if(R()<o2.p){g.sh++;tg.push({side:t.side,i,status:'鐵壁'})}ix.att=(ix.att||0)+1;if(ix.att%2===0)ix.enh=true}   // 槍之又左：每次主動發動，機率獲得鐵壁；每 2 次強化下次普攻（+50%、擴散全體）
      else if(o2.t==='miyoshi'){ix.n=(ix.n||0)+1;
        if(ix.n===1&&R()<o2.p){for(const j of aliveIdx(t).sort((a,b)=>t.gens[a].troops/t.gens[a].max-t.gens[b].troops/t.gens[b].max).slice(0,2)){const h=healTo(t,j,g,o2.heal);if(h)tg.push(h)}}
        else if(ix.n===2&&R()<o2.p){for(const j of pickN(aliveIdx(t),2,R)){t.gens[j].tm.push({k:'dmgStrat',v:o2.v,until:round+2,src:g});tg.push({side:t.side,i:j,status:`謀略傷害 +${Math.round(o2.v)}%`})}}}}
    if(sk.kind==='主動'&&sk!==g.skills[0]&&g.amayo?.heal&&g.amayo.until>=round){const h=healTo(t,i,g,g.amayo.heal,'武勇');if(h)tg.push(h)}   // 雨夜手拍子大將技：持續時間內非自帶主動發動時恢復自身兵力
    if(tmpDmg)g.tm.splice(g.tm.indexOf(tmpDmg),1);
    g.curSk=curSk0;
    ev({type:'skill',side:t.side,i,skill:sk.name,kind:sk.kind,guess:sk.modeled==='guess',tg:allyTg.length?[...tg,...allyTg]:tg,...o});
    for(const j of ctl)onControl(t,ti,i,e,j);
    if(sk.kind==='主動'&&g.q==='離間之計'&&g.lj<4)g.lj++;
    {const p=GP(g,'回響',5,25);if(p!=null&&sk.kind==='主動'&&R()*100<p){g.dong=Math.max(g.dong||0,round+1);aux('回響',t.side,i,{side:t.side,i,status:'免疫控制 2 回合'})}}   // 回響（宇佐美長光專屬，宇佐美定滿攜帶）：狀態免疫近似為免疫控制
  }
  const addDot=(t,ti,i,d,name,v,dtype,dur,kd=name)=>{const old=d.dots.find(x=>x.name===name&&x.ti===ti&&x.i===i);if(old)old.until=round+dur;else if(!kouyou(d)){d.dots.push({name,kd,t,ti,i,v,dtype,until:round+dur,from:round});kekketsu(t.gens[i],d.dots[d.dots.length-1]);const e=T[1-ti];onDebuff(t.gens[i],t.side,i,d,e.side,e.gens.indexOf(d))}};
  // 解除增益：最多 n 個有持續回合的正面效果（% 加成或屬性加點），回傳戰報用的狀態列
  const NEGK=new Set(['weak','weakBlade','weakStrat','statDown','expose']);
  const strip=(tt,j,n)=>{const d=tt.gens[j];if(!d||d.troops<=0)return[];let c=0;
    d.tm=d.tm.filter(x=>{if(c<n&&x.until<99&&x.v>0&&!NEGK.has(x.k)){c++;return false}return true});
    d.sb=d.sb.filter(x=>{if(c<n&&x.v>0){c++;d.b[x.k]-=x.v;return false}return true});
    return c?[{side:tt.side,i:j,status:`解除 ${c} 個增益`}]:[]};
  const evS=(t,i,name,kind,tg)=>ev({type:'skill',side:t.side,i,skill:name,kind,tg:tg.filter(Boolean)});
  // 每回合開始（行動順序決定前）：風林火山旗、歸蝶之舞、鬼若子連擊、上州黃斑、尼御台、諸行無常後半、風姿綽約…
  const IR={
    stack:({g,o,sk})=>{const ix=ixs(g);if((ix.sk||0)<o.max&&R()<o.p){ix.sk=(ix.sk||0)+1;g.tm.push({k:o.k,v:o.v,until:99});
      if(ix.sk===o.max&&sk?.name==='如水'&&sk===g.skills[0]){const p=GP(g,'定謀',1,5);if(p!=null)g.tm.push({k:'taken',v:p,until:99})}}},   // 定謀（銀白檀塗兜，黑田官兵衛）：如水奇謀疊滿 → 減傷 1~5%   // 如水：每回合機率疊奇謀
    hizen:({t,ti,e,g,i,o})=>{const n=Math.min(3,g.hzQ||0);g.hzQ=0;for(let q=0;q<n;q++){const tg=[];for(const j of pickN(aliveIdx(e),2,R))tg.push(hit(t,ti,i,e,j,o.dmg,'兵刃','被動'));evS(t,i,'肥前之熊','被動',tg)}},   // 上回合累積的反打（近似：下回合開始結算）
    gekka:({g,o})=>{const ix=ixs(g),n=Math.min(2,Math.floor((ix.gkc||0)/4));while(ix.gkn<n){ix.gkn++;g.tm.push({k:'crit',v:o.v,until:99})}},
    tenjin:({t,g,i,o})=>{if(round<=o.rounds){const v=o.v*Math.max(0,1-.25*(round-1));for(const k of['武勇','智略']){g.b[k]+=v;g.sb.push({k,v,until:round})}}
      if(round===o.rounds+1){const j=aliveIdx(t).filter(x=>x!==i).sort((a,b)=>t.gens[b].b.智略-t.gens[a].b.智略)[0];if(j!=null&&!resist(t,j,'混亂'))t.gens[j].fx.混亂=Math.max(t.gens[j].fx.混亂||0,1)}},
    taken:({t,g,o})=>{if(o.merc&&(round===3||round===4))for(const m of t.gens)if(m.troops>0){m.merc=Math.round(healAmt(g,o.merc));m.mercU=round+2}},   // 一領具足：傭兵（額外兵力，先扣傭兵）
    qimou:({t,ti,e,g,i})=>{if(g.q72?.fire){g.q72.fire=0;const tg=[];for(const j of aliveIdx(e))tg.push(hit(t,ti,i,e,j,g.q72.aoe,'謀略','被動'));evS(t,i,'七十二欺計','被動',tg)}},
    banjaku:({g,o})=>{if(round>1)g.tm.push({k:'taken',v:o.inc,until:99,src:g})},   // 磐石眈眈：每回合再疊減傷
    isen:({g,o})=>{if(round===5){g.lfv=(g.lfv||0)+o.v;if(g.troops<g.max/2)g.tm.push({k:'crit',v:o.v,until:99})}},
    shinmyo:({g,o})=>{const v=o.v*Math.max(0,1-.25*(round-1));if(v>0){g.tm.push({k:'takenBlade',v,until:round});g.tm.push({k:'takenStrat',v,until:round})}if(round>=5&&R()<o.p)g.cb=round},   // 神妙劍：減傷每回合遞減 25%；第 5 回合起機率連擊
    senyi:({t,ti,e,g,i,o})=>{if(round!==1&&round!==3)return;const tg=[];for(const j of pickN(aliveIdx(e),2,R)){timed(e.gens[j],'weak',o.v,2);tg.push({side:e.side,i:j,status:'疲弊'})}evS(t,i,'戰意消沉','指揮',tg)},
    shichu:({t,ti,e,g,i,o})=>{if(round!==5)return;const tg=[];for(const j of aliveIdx(e)){const h=hit(t,ti,i,e,j,o.dmg+o.per*(g.shc?.n||0),'兵刃','被動');if(h)tg.push(h)}evS(t,i,'死中求活','被動',tg)},
    kenshin2:({t,ti,e,g,i,o})=>{if(R()>=o.p)return;const fem=FEMALE.has(g.n),al=aliveIdx(t).filter(j=>j!==i&&FEMALE.has(t.gens[j].n)!==fem),j=pickN(al,1,R)[0];if(j==null)return;const k=pickN(aliveIdx(e),1,R)[0];if(k==null)return;timed(g,'expose',o.exp,1);const h=hit(t,ti,j,e,k,o.dmg,'兵刃','指揮');evS(t,i,'獻身','指揮',[h])},   // 獻身：異性友軍追加一擊（近似為當回合立即打）
    gouki:({t,ti,e,g,i,o})=>{const tg=[];for(const j of ixs(g).gk||[]){const m=t.gens[j];if(m.troops<=0||m.lh?.round!==round-1||R()>=o.p)continue;const a=m.lh.s;if(e.gens[a]?.troops>0){const h=hit(t,ti,i,e,a,o.dmg,'兵刃','指揮');if(h)tg.push(h)}const hh=healTo(t,j,g,o.heal);if(hh)tg.push(hh)}if(tg.length)evS(t,i,'剛毅木訥','指揮',tg)},   // 剛毅木訥：友軍上回合首次受傷 → 反擊並治療（近似為下回合開始時結算）
    fuurin:({t,ti,e,g,i,o})=>{if(round%2!==1)return;const ix=ixs(g);
      if(ix.f==null){const b=g.b,m=Math.max(b.速度,b.智略,b.武勇,b.統率);ix.f=b.速度===m?0:b.智略===m?1:b.武勇===m?2:3}   // 首回合旗幟由自身最高屬性決定：速度＝風、智略＝林、武勇＝火、統率＝山
      const f=ix.f++%4,al=aliveIdx(t),ea=aliveIdx(e),tg=[];
      if(f===0){for(const j of al){t.gens[j].tm.push({k:'dmgBlade',v:o.wind,until:round+1,src:g});tg.push({side:t.side,i:j,status:`兵刃傷害 +${Math.round(o.wind)}%`})}}
      else if(f===1){for(const j of pickN(ea,2+Math.floor(R()*2),R))tg.push(hit(t,ti,i,e,j,o.lin,'謀略','指揮'))}
      else if(f===2){for(const j of pickN(ea,1+Math.floor(R()*2),R))tg.push(hit(t,ti,i,e,j,o.fire,'兵刃','指揮'))}
      else{for(const j of al){t.gens[j].tm.push({k:'takenBlade',v:o.mount,until:round+1,src:g});tg.push({side:t.side,i:j,status:`受兵刃傷害 -${Math.round(o.mount)}%`})}}
      evS(t,i,'風林火山','指揮',tg)},
    kikyo:({t,ti,e,g,i,o})=>{if(R()>=o.p+(GP(g,'蝶夢',1,4)||0)/100)return;const tg=[];   // 蝶夢（蝶之短刀，歸蝶）：生效機率 +1~4%

      if(round%2===1){for(const j of pickN(aliveIdx(e),2,R)){timed(e.gens[j],'statDown',o.v,1);tg.push({side:e.side,i:j,status:`統率智略 -${Math.round(o.v)}%`})}}
      else{for(const j of pickN(aliveIdx(e),2,R)){const ok=!resist(e,j,'混亂');if(ok)e.gens[j].fx.混亂=Math.max(e.gens[j].fx.混亂||0,1);tg.push({side:e.side,i:j,status:ok?'混亂':'抵抗了「混亂」'})}}
      evS(t,i,'歸蝶之舞','被動',tg)},
    kijiko:({t,g,o})=>{if(round>4)return;for(const m of t.gens)if(m.troops>0&&R()<o.p)m.cb=round},
    nari:({g})=>{g.cb=round},
    saito:({g,o})=>{if(round>=5&&R()<o.p)g.cb=round},
    jushu:({t,g,o})=>{const b=t.gens[0];if(round===1)b.tm.push({k:'taken',v:o.v,until:2,src:g});if(round===3)b.lfv=o.lf;if(round===7)b.lfv=0},
    zuikei:({t,e,g,o})=>{if(round!==4)return;timed(g,'weak',o.w,3);const j=pickN(aliveIdx(e),1,R)[0];if(j!=null)timed(e.gens[j],'weak',o.w,3)},
    kozan:({t,ti,e,g,i,o})=>{const hb=g.hitBy&&g.hitBy.round===round-1&&e.gens[g.hitBy.i]?.troops>0?g.hitBy.i:null,tg=[];
      const put=j=>{const d=e.gens[j];if(d.troops<=0)return;if(d.dots.some(x=>x.name==='消沉')){timed(d,'weak',o.fat,1);tg.push({side:e.side,i:j,status:'疲弊'})}else{addDot(t,ti,i,d,'消沉',o.dot,'謀略',3);tg.push({side:e.side,i:j,status:'消沉'})}};
      if(hb!=null){if(R()<o.p1)put(hb)}else if(R()<o.p2){for(const j of pickN(aliveIdx(e),2,R))put(j)}
      if(tg.length)evS(t,i,'上州黃斑','指揮',tg)},
    yoshioka:({t,ti,e,g,i,o})=>{const tg=[];
      if(round===1){for(const j of pickN(aliveIdx(e),2,R)){tg.push(healTo(e,j,g,o.heal));timed(e.gens[j],'weakBlade',o.w,2)}evS(t,i,'驕討','指揮',tg)}
      else if(R()<o.p){const j=pickN(aliveIdx(e),1,R)[0];if(j!=null){g.tm.push({k:'pierce',v:100,until:round});const mt=g.tm[g.tm.length-1];tg.push(hit(t,ti,i,e,j,o.v,'auto','持續'));g.tm.splice(g.tm.indexOf(mt),1);evS(t,i,'驕討','指揮',tg)}}},   // 叛逃：無視防禦的傷害（持續 1 回合，當場結算）
    ahatsu:({t,g,i,o})=>{const ix=ixs(g);if((ix.n||0)<5){ix.n=(ix.n||0)+1;for(const j of pickN(aliveIdx(t),2,R)){const m=t.gens[j],k=m.b.武勇>=m.b.智略?'武勇':'智略';m.b[k]+=o.v}
      if(ix.n===5){const p=GP(g,'凝香',20,90);if(p!=null){const hh=healTo(t,i,g,p/100);if(hh)evS(t,i,'凝香','裝備',[hh])}}}},   // 凝香（香袋，阿初）：屬性疊滿後恢復自身兵力 20~90%
    tsuma:({t,e,g,i,o})=>{if(round%2!==0){const p=GP(g,'持家',5,15);if(p==null||R()*100>=p)return}   // 持家（握剪，妻木熙子）：奇數回合也有 5~15% 機率
      const ea=aliveIdx(e);if(ea.length&&ea.every(j=>e.gens[j].dots.length)){evS(t,i,'內賢之助','指揮',aliveIdx(t).map(j=>healTo(t,j,g,o.heal)))}},
    ishikawa:({t,g,i,o})=>{if(R()>=o.p)return;const al=aliveIdx(t),m=t.gens[[...al].sort((a,b)=>Math.max(t.gens[b].b.統率,t.gens[b].b.智略)-Math.max(t.gens[a].b.統率,t.gens[a].b.智略))[0]];
      m.tm.push({k:m.b.智略>m.b.統率?'takenBlade':'takenStrat',v:o.v,until:round+1,src:g})},
    ae:({t,e,g,i,o})=>{const ix=ixs(g);if((ix.n||0)<3){ix.n=(ix.n||0)+1;for(const m of t.gens)m.b.武勇+=m.st.武勇*o.v/100}
      if(R()<o.p){const j=pickN(aliveIdx(e),1,R)[0];if(j!=null){const d=e.gens[j],k=['混亂','封擊','無策','疲弊'][Math.floor(R()*4)];
        if(k==='封擊')d.sealR=round;else if(k==='疲弊')timed(d,'weak',100,1);else d.fx[k]=Math.max(d.fx[k]||0,1);evS(t,i,'風姿綽約','指揮',[{side:e.side,i:j,status:k}]);
        {const p=GP(g,'落英',10,40);if(p!=null&&(g.bs.rakuei||0)<2&&R()*100<p){g.bs.rakuei=(g.bs.rakuei||0)+1;const k2=['混亂','封擊','無策','疲弊'][Math.floor(R()*4)];if(k2==='封擊')d.sealR=round;else if(k2==='疲弊')timed(d,'weak',100,1);else d.fx[k2]=Math.max(d.fx[k2]||0,1);evS(t,i,'落英','裝備',[{side:e.side,i:j,status:k2}])}}}}},   // 落英（香袋，阿江）：再施加一次控制，最多 2 次（「施加完所有控制」近似為每次施加後判定）
  };
  // 行動前觸發（指揮／被動不受控制影響，所以放在控制判定之前）：伊達風采、一切皆空
  const IA={
    date:({t,ti,e,g,i,o})=>{const ix=ixs(g);if(ix.f==null){ix.f=5;ix.nb=0;ix.ns=0;ix.st=0}if(ix.f<=0)return;ix.f--;const tg=[];
      let al=aliveIdx(e);if(!al.length)return;let h=hit(t,ti,i,e,al[Math.floor(R()*al.length)],o.r,'兵刃','指揮');if(h){tg.push(h);ix.nb++}
      al=aliveIdx(e);if(al.length){h=hit(t,ti,i,e,al[Math.floor(R()*al.length)],o.r,'謀略','指揮');if(h){tg.push(h);ix.ns++}}
      while(ix.nb>=2&&ix.ns>=2){ix.nb-=2;ix.ns-=2;if(ix.st<4){ix.st++;g.b.武勇+=g.st.武勇*o.st/100;g.b.智略+=g.st.智略*o.st/100}else ix.f++}
      evS(t,i,'伊達風采','指揮',tg)},
    terumune:({t,e,g,i,o})=>{if(R()>=o.p)return;const j=pickN(aliveIdx(e),1,R)[0];if(j==null)return;e.gens[j].fx.封擊=Math.max(e.gens[j].fx.封擊||0,2);g.fx.封擊=Math.max(g.fx.封擊||0,2);evS(t,i,'樽俎折衝','指揮',[{side:e.side,i:j,status:'封擊'},{side:t.side,i,status:'封擊'}])},
    kami:({t,ti,e,g,i,o})=>{if(R()>=o.p)return;const tg=[];const ix=ixs(g);
      for(const j of pickN(aliveIdx(e),2,R)){const d=e.gens[j];if((ix.n||0)<4){ix.n=(ix.n||0)+1;d.b.統率-=o.v;g.b.武勇+=o.v}tg.push(hit(t,ti,i,e,j,o.rate,'兵刃','指揮'))}
      evS(t,i,'轉','指揮',tg)},
    ichiki:({t,ti,e,g,i,o})=>{const ix=ixs(g);
      if(!ix.on){if(round<2)return;ix.p=ix.p==null?.3:ix.p+.4;if(R()<ix.p)ix.on=true;else return}
      if(R()<.85){const tg=[];g.tm.push({k:'pierce',v:100,until:round});const mt=g.tm[g.tm.length-1];
        for(const j of pickN(aliveIdx(e),2+Math.floor(R()*2),R))tg.push(hit(t,ti,i,e,j,o.v,'auto','被動'));
        g.tm.splice(g.tm.indexOf(mt),1);evS(t,i,'一切皆空','被動',tg)}},
  };
  // 敵方主動戰法發動前：百萬一心有機率阻止並反傷
  const mblock=(t,ti,i)=>{const e=T[1-ti];
    for(let k=0;k<e.gens.length;k++){const m=e.gens[k];if(m.troops<=0)continue;
      for(const s of m.skills){const o=s.fx?.open;if(o?.t==='mouri'&&ixs(m).set?.includes(i)&&R()<o.p){
        const h=hit(e,1-ti,k,t,i,1,'謀略','指揮');evS(e,k,'百萬一心','指揮',[h]);return true}}}
    return false};
  outer:for(round=1;round<=K.rounds;round++){
    ev({type:'round',round});
    for(const t of T)for(const m of t.gens)if(m.troops>0&&m.tc.kentai&&R()<.3){const k=[...CTRLK].find(x=>m.fx[x]>0);if(k){delete m.fx[k];cleaned(t,t.gens.indexOf(m),k)}}   // 懸待表裡：屬性變動時 30% 淨化 1 個負面狀態（每回合最多 1 次，近似每回合判定）
    for(const t of T)for(const m of t.gens)if(m.troops>0)for(const s of m.skills){const o=s.fx?.open;if(o?.t==='kenshin'&&o.boss){const ix=ixs(m);ix.c=Math.min(12,(ix.c||0)+o.boss)}}   // 軍神大將技：每回合行動前額外蓄力
    // 持續性狀態每回合結算（施加後的下一回合起；按施加者當下屬性算，官方是施加時快照，這裡為近似）
    for(const dt of T)for(let dj=0;dj<dt.gens.length;dj++){const d=dt.gens[dj];if(!d.dots.length||d.troops<=0)continue;
      d.dots=d.dots.filter(x=>x.until>=round);
      for(const x of d.dots)if(round>x.from&&d.troops>0&&x.t.gens[x.i].troops>0){const h=hit(x.t,x.ti,x.i,dt,dj,x.v,x.dtype,'dot');if(h)ev({type:'skill',side:x.t.side,i:x.i,skill:x.name,kind:'持續',tg:[h]})}}
    // 軍學能力：只模擬截圖寫明的足輕 守禦（第5回合，我軍群體2人，治療率100%）
    for(const t of T)if(t.study&&t.gens.some(g=>g.troops>0)){
      const al=aliveIdx(t);
      // 齊射（弓，第2、6回合）的傷害係數、破軍（鐵炮，第3回合）的持續回合：截圖沒寫，標示為未知、不模擬
      if(t.arm==='槍'&&round===5){const hs=pickN(al,2,R).map(j=>healTo(t,j,t.gens[j],1)).filter(Boolean);if(hs.length)ev({type:'skill',side:t.side,i:al[0],skill:'守禦',kind:'軍學',tg:hs})}
    }
    // 達人大觀：第 4 回合淨化友軍單體 2 個減益狀態
    if(round===4)for(const t of T)t.gens.forEach((g,i)=>{if(g.troops>0&&g.q==='達人大觀'){
      const j=aliveIdx(t).sort((a,b)=>Object.keys(t.gens[b].fx).length-Object.keys(t.gens[a].fx).length)[0],m=t.gens[j];
      const ks=Object.keys(m.fx).slice(0,2);ks.forEach(k=>{delete m.fx[k];cleaned(t,j,k)});
      m.tm=m.tm.filter(x=>!['weak','statDown','expose'].includes(x.k));
      ev({type:'skill',side:t.side,i,skill:'達人大觀',kind:BG,tg:[{side:t.side,i:j,status:ks.length?'淨化 '+ks.join('、'):'淨化'}]});
    }});
    // 指揮／被動的每回合治療（休養、每回合治療我軍群體）
    for(const t of T)t.gens.forEach((g,i)=>{if(g.troops>0)for(const sk of g.skills)if(sk.regen){
      const al=aliveIdx(t).sort((a,b)=>t.gens[a].troops/t.gens[a].max-t.gens[b].troops/t.gens[b].max);
      const hs=(sk.regen.self?[i]:sk.regen.pAll&&R()<sk.regen.pAll?al:al.slice(0,sk.regen.n)).map(j=>healTo(t,j,g,sk.regen.rate*reiyaku(g))).filter(Boolean);
      if(hs.length)ev({type:'skill',side:t.side,i,skill:sk.name,kind:sk.kind,tg:hs});
    }});
    // 手工建模戰法（SKFX）的每回合效果：封擊、挑釁、每回合機率治療、蓄勢；到期的屬性加成還原
    T.forEach((t,ti)=>{const e=T[1-ti];t.gens.forEach((g,i)=>{if(g.troops<=0)return;
      g.sb=g.sb.filter(x=>{if(x.until<round){g.b[x.k]-=x.v;return false}return true});
      // 裝備特技（條件型）：回合開始
      if(g.gc){let p;
        if((p=GP(g,'殘心',2,10))!=null&&R()*100<p)g.sh++;   // 殘心：機率獲得 1 次鐵壁
        if((p=GP(g,'奪旗',5,30))!=null&&round===2&&g.b.武勇>=Math.max(...t.gens.map(m=>m.b.武勇))){g.b.統率+=p;g.sb.push({k:'統率',v:p,until:round+1})}   // 奪旗
        if((p=GP(g,'耀武',.3,.9))!=null&&round===(g.gc.耀武>.5?3:2)&&R()<p){const d=pickN(aliveIdx(e),1,R)[0];if(d!=null)e.gens[d].tn={until:round+Math.round(g.gc.耀武*2),to:i}}   // 耀武：挑釁敵軍單體
        if((p=GP(g,'背水',3,15))!=null&&g.troops<g.max*(.5+.2*g.gc.背水)){g.b.武勇+=p;g.sb.push({k:'武勇',v:p,until:round})}   // 背水：兵力低時加武勇
        if((p=GP(g,'止水',5,10))!=null&&round>=Math.ceil(6-2*g.gc.止水)&&!g.bs.shisui){g.bs.shisui=1;g.tm.push({k:'crit',v:p,until:99})}   // 止水：後半段會心
        if((p=GP(g,'凌厲',5,15))!=null&&round===(g.gc.凌厲>.5?3:2)){g.lfv=Math.max(g.lfv||0,p);ixs(g).lfEnd=round}   // 凌厲：短暫離反
        if((p=GP(g,'石鐵',5,15))!=null&&round===(g.gc.石鐵>.5?3:2)){g.lj=Math.max(g.lj||0,p)}   // 石鐵：攻心
        if(round===1)for(const[k,to]of[['炯眼','智略'],['青嵐','速度'],['岩肌','統率'],['激突','武勇']])if((p=GP(g,k,6,18))!=null){const v=Math.round(p*10)/10;g.b[to]+=v;g.sb.push({k:to,v,until:1+Math.round(2*g.gc[k])})}   // 坐騎專屬：前 1~3 回合加屬性
        if(round===1&&(p=GP(g,'第一',4,8))!=null)g.tm.push({k:'crit',v:p,until:99},{k:'critS',v:p,until:99});   // 第一（三人張弓專屬，今川義元攜帶）：會心、奇謀 4~8%
        if(round===1&&(p=GP(g,'清香',5,25))!=null){const u=1+Math.round(2*g.gc.清香);g.tm.push({k:'crit',v:p,until:u},{k:'critS',v:p,until:u})}   // 清香（蘭奢待專屬）：前 1~3 回合會心、奇謀
        if((p=GP(g,'流轉',5,40))!=null&&round===((g.gc.流轉*997)%1<.5?5:6)&&R()*100<p){g.cb=round;aux('流轉',t.side,i,{side:t.side,i,status:'連擊'})}   // 流轉：第 5~6 回合（各件不同）5~40% 機率連擊
        if((p=GP(g,'勇猛',.1,.4))!=null&&round===(g.gc.勇猛>.5?3:2)&&g.b.統率>=Math.max(...t.gens.filter(m=>m.troops>0).map(m=>m.b.統率)))g.bs.yumo={until:round+1,a:p};   // 勇猛：統率最高 → 反擊 2 回合
        if((p=GP(g,'絕境',5,12))!=null&&!g.bs.zekkyo&&g.troops<g.max*(.5+.3*g.gc.絕境)){g.bs.zekkyo=1;g.tm.push({k:'healIn',v:p,until:99})}   // 絕境：兵力低時受治療提高
        if((p=GP(g,'庇佑',.3,.9))!=null&&round===(g.gc.庇佑>.5?5:4)&&R()<p){const k=[...CTRLK].find(x=>g.fx[x]>0);let what=null;if(k){delete g.fx[k];what=k;cleaned(t,i,k)}else if(g.dots.length){const x=g.dots.shift();what=x.kd;cleaned(t,i,null,x)}else{const q=g.tm.findIndex(x=>['weak','weakBlade','weakStrat','statDown','expose'].includes(x.k)&&x.until>=round);if(q>=0){what=LBL[g.tm[q].k];g.tm.splice(q,1)}}if(what)aux('庇佑',t.side,i,{side:t.side,i,status:'淨化 '+what})}   // 庇佑：淨化自身 1 個減益
        if(round===1){   // 首回合：歸雁（必中）、先見（洞察）、虎目（先攻）、陽炎（奇謀）、百計、亂雲（挑釁）、荒天（牽制）、薰風（援護）
          if((p=GP(g,'歸雁',25,100))!=null)g.sure={until:1+Math.round(2*g.gc.歸雁),p};
          const ally=(k,n,pr)=>{const out=[];for(const j of pickN(aliveIdx(t),n,R))if(pr==null||R()*100<pr)out.push(j);return out};
          if((p=GP(g,'先見',20,80))!=null){const js=ally('先見',1+Math.round(g.gc.先見),p);for(const j of js)t.gens[j].dong=Math.max(t.gens[j].dong||0,1);if(js.length)evS(t,i,'先見','裝備',js.map(j=>({side:t.side,i:j,status:'洞察'})))}
          if((p=GP(g,'虎目',25,100))!=null){const js=ally('虎目',1+Math.round(2*g.gc.虎目),p);for(const j of js)t.gens[j].first=1;if(js.length)evS(t,i,'虎目','裝備',js.map(j=>({side:t.side,i:j,status:'先攻'})))}
          if((p=GP(g,'陽炎',5,20))!=null){const js=ally('陽炎',1+Math.round(g.gc.陽炎));for(const j of js)t.gens[j].tm.push({k:'critS',v:p,until:1+Math.round(g.gc.陽炎)});evS(t,i,'陽炎','裝備',js.map(j=>({side:t.side,i:j,status:`奇謀 +${Math.round(p*10)/10}%`})))}
          if((p=GP(g,'百計',6,12))!=null){const js=pickN(aliveIdx(e),1+Math.round(g.gc.百計),R);for(const j of js)e.gens[j].tm.push({k:'takenStrat',v:-p,until:1});evS(t,i,'百計','裝備',js.map(j=>({side:e.side,i:j,status:`受謀略傷害 +${Math.round(p*10)/10}%`})))}
          for(const [k,nm] of[['亂雲','挑釁'],['荒天','牽制']])if((p=GP(g,k,50,100))!=null&&R()*100<p){const js=pickN(aliveIdx(e),1+Math.round(g.gc[k]),R);for(const j of js)e.gens[j].tn={until:1,to:i};evS(t,i,k,'裝備',js.map(j=>({side:e.side,i:j,status:nm})))}
          if((p=GP(g,'薰風',50,100))!=null&&R()*100<p){const j=pickN(aliveIdx(t).filter(x=>x!==i),1,R)[0];if(j!=null){t.gens[j].engo={until:1,by:i};evS(t,i,'薰風','裝備',[{side:t.side,i:j,status:'援護'}])}}
        }
        if(t.arm==='鐵炮'&&(p=GP(g,'破空',4,12))!=null&&!g.bs.hakuu&&R()*100<p){g.bs.hakuu=1;const j=pickN(aliveIdx(e),1,R)[0];if(j!=null){const h=hit(t,ti,i,e,j,.5+.5*g.gc.破空,'謀略','eq');if(h)evS(t,i,'破空','裝備',[h])}}   // 破空：鐵炮隊每回合 4~12%，每場 1 次
        for(const[k,c]of[['繚亂','混亂'],['蜃氣樓','無策'],['斷刃','封擊']])if((p=GP(g,k,20,80))!=null&&round===(g.gc[k]>.5?5:4)&&e.gens[0].troops>0&&R()*100<p){const ok=!resist(e,0,c);if(ok)setFx(e,0,c,1,[ti,i]);evS(t,i,k,'裝備',[{side:e.side,i:0,status:ok?c:'抵抗了「'+c+'」'}])}   // 白鷺圖／孫子／李衛公問對：第 4~5 回合敵軍大將控制 1 回合
        if((p=GP(g,'幻影',5,30))!=null&&round>=2&&round<=4){const al=aliveIdx(e),set=pickN(al,R()<.2+.3*g.gc.幻影?2:1,R);g.genei={round,set,v:Math.min(60,p*(1+((g.chr??80)-80)/220))}}   // 幻影（維吉諾琴）：第 2~4 回合，選定敵將對自身傷害 −5~30%，受魅力影響（Joe 2026-11-26 確認；換算比照治療的「受屬性影響」(1+(魅力−80)/220)，Lv50 魅力由 land.html 帶入，沒帶時當 80）
        if((p=GP(g,'扶危',45,90))!=null)for(const j of aliveIdx(t)){const m=t.gens[j];if(!m.bs.fuki&&m.troops<m.max*p/100){m.bs.fuki=1;const hh=healTo(t,j,g,.1+.3*g.gc.扶危);if(hh)evS(t,i,'扶危（休整）','裝備',[hh])}}   // 扶危（司馬法）：友軍兵力首次低於 45~90% → 休整（近似為當下治療一次）
        if((p=GP(g,'底力',5,10))!=null&&!g.bs.sokoji&&g.troops<g.max*(.5+.2*g.gc.底力)){g.bs.sokoji=1;timed(g,'takenBlade',p,1+Math.round(2*g.gc.底力))}   // 底力（黑漆塗五枚胴）
        if((p=GP(g,'復甦',.4,.8))!=null&&g.troops<g.max*p&&(g.bs.fukkyu||0)<(g.gc.復甦>.5?2:1)){g.bs.fukkyu=(g.bs.fukkyu||0)+1;const hh=healTo(t,i,g,.3+.2*g.gc.復甦);if(hh)aux('復甦',t.side,i,hh,BG)}   // 復甦
      }
      for(const sk of g.skills){const o=sk.fx?.open;if(!o)continue;
        if(o.t==='seal'&&round<=o.rounds){const p=Math.max(0,o.p-o.dec*(round-1));for(const d of pickN(aliveIdx(e),o.n,R))if(R()<p)e.gens[d].sealR=round}
        else if(o.t==='taunt'&&round<=o.rounds&&i!==0){for(const d of pickN(aliveIdx(e),2+Math.floor(R()*2),R))if(R()<o.p)e.gens[d].tn={until:round,to:i}}
        else if(o.t==='keifu'&&round%2===0&&R()<o.p){const hs=aliveIdx(t).sort((a,b)=>t.gens[a].troops/t.gens[a].max-t.gens[b].troops/t.gens[b].max).slice(0,2).map(j=>healTo(t,j,g,o.heal)).filter(Boolean);if(hs.length)ev({type:'skill',side:t.side,i,skill:sk.name,kind:sk.kind,tg:hs})}
        else if(o.t==='ryoku'&&R()<o.p){const al=aliveIdx(t),lo=lowest(t),ids=lo===i?[i,...pickN(al.filter(x=>x!==i),1,R)]:al;const hs=ids.map(j=>healTo(t,j,g,o.heal)).filter(Boolean);if(hs.length)ev({type:'skill',side:t.side,i,skill:sk.name,kind:sk.kind,tg:hs})}
        else if(o.t==='zan'&&round%2===0&&!g.fx.威壓){g.tm.push({k:'crit',v:o.crit,until:round});g.b.武勇+=o.st;g.sb.push({k:'武勇',v:o.st,until:round})}
        else if(IR[o.t])IR[o.t]({t,ti,e,g,i,o,sk})
      }})});
    const order=[];
    T.forEach((t,ti)=>t.gens.forEach((g,i)=>{if(g.troops>0)order.push([ti,i,g.b.速度+(round===1?M(g,'spd1'):0)+(g.first===round?1000:0),R()])}));
    order.sort((a,b)=>b[2]-a[2]||b[3]-a[3]);   // 速度快的先行動（先攻最優先）；只有速度完全相同才隨機（2026-11-26 修：原本加了 ±4 隨機，115 對 114.4 會顛倒）
    for(const[ti,i]of order){
      for(const tt of T)for(const dg of tt.gens)if(dg.troops<=0&&dg.stBuffs&&!dg.purged){dg.purged=1;for(const b of dg.stBuffs)b.m.b[b.k]-=b.v}   // 陣亡者給的屬性加成一併失效
      const t=T[ti],g=t.gens[i],e=T[1-ti];
      if(g.troops<=0)continue;
      ev({type:'turn',side:t.side,i,first:g.first===round});   // 戰報：這位武將「開始行動」從這裡算（速度快的先）；在這之前的是回合開始階段
      const fx=g.fx;
      // 裝備特技（首次獲得狀態時）：激昂（功能性增益 → 傷害提高 1~6%，1~2 回合）、堅韌（離反）／籠絡（攻心）→ 受治療提高 20~85%，1 回合
      {let p;
        if((p=GP(g,'激昂',1,6))!=null&&!g.bs.gekkou&&hasBuff(g)){g.bs.gekkou=1;timed(g,'dmg',p,1+Math.round(g.gc.激昂));aux('激昂',t.side,i,{side:t.side,i,status:`傷害 +${Math.round(p*10)/10}%`})}
        if((p=GP(g,'堅韌',20,85))!=null&&!g.bs.kenjin&&(g.lfv||0)>0){g.bs.kenjin=1;timed(g,'healIn',p,1)}
        if((p=GP(g,'籠絡',20,85))!=null&&!g.bs.rouraku&&(g.lj||0)>0){g.bs.rouraku=1;timed(g,'healIn',p,1)}}
      const tick=()=>{for(const k in fx)if(--fx[k]<=0)delete fx[k]};
      if([...CTRLK].some(k=>fx[k]>0)||g.sealR===round)firstBad(g,'不動');
      if(g.bx.shield)timed(g,'guard',g.bx.shield,1);   // 神祕
      // 武將特性（條件型）：行動前
      if(g.tc.dokugan){const w=g.b.武勇,z=g.b.智略,p=GP(g,'逆鱗',45,90),low=g.sb.some(x=>(x.k==='武勇'||x.k==='智略')&&x.v<0)||w<g.st.武勇||z<g.st.智略,r=p!=null&&low&&R()*100<p?0:Math.abs(w-z)/Math.max(w,z,1);   // 逆鱗（三日月兜，伊達政宗）：武勇／智略被降低時 45~90% 以最高值生效
       if(r<=.2)g.tm.push({k:'dmg',v:(i===0?15:10)*(1-r/.2),until:round})}   // 獨眼龍：武勇智略越接近傷害越高
      if(g.tc.yuretsu){g.b.武勇+=g.tc.yuretsu;g.sb.push({k:'武勇',v:g.tc.yuretsu,until:round})}   // 勇烈
      if(g.tc.hafu&&round>=5){g.lfv=Math.max(g.lfv||0,10);if(g.troops<g.max*.5)g.tm.push({k:'dmg',v:10,until:round})}   // 破釜沉舟
      if(t.gens.some(m=>m.tc.caide&&m.troops>0)&&(g.bs.caide||0)<2&&R()<.4){g.bs.caide=(g.bs.caide||0)+1;g.nu=28}   // 才德兼備
      // 三階菅笠（佐佐成政）：自身與武勇最高的友軍行動前判定
      for(let mi=0;mi<t.gens.length;mi++){const m=t.gens[mi];if(m.troops<=0)continue;for(const s of m.skills){const o=s.fx?.open;if(o?.t!=='sasa')continue;
        const top=aliveIdx(t).filter(x=>x!==mi).sort((a,b)=>t.gens[b].b.武勇-t.gens[a].b.武勇)[0];if(g!==m&&i!==top)continue;
        const ix=ixs(m),bs=ix.base||(ix.base={});let h=null;
        if(g.dmgIn-(bs[i]||0)>=g.max*.2){if(R()<o.p){h=healTo(t,i,m,o.heal,'武勇');bs[i]=g.dmgIn}}   // 治療成功後才重新累計（Joe 2026-11-25 確認）
        else if(R()<o.p){const al=aliveIdx(e);if(al.length)h=hit(t,ti,mi,e,al[Math.floor(R()*al.length)],o.dmg,'兵刃','指揮')}
        if(h){if(o.boss&&m.sb.filter(x=>x.sasa&&x.until>=round).length<2){m.b.武勇+=o.boss;m.sb.push({k:'武勇',v:o.boss,until:round,sasa:1})}evS(t,mi,s.name,s.kind,[h])}}}
      if(routed(e)){res=ti===0?'W':'L';break outer}
      for(const sk of g.skills){const o=sk.fx?.open;if(o&&IA[o.t]){IA[o.t]({t,ti,e,g,i,o});if(routed(e)){res=ti===0?'W':'L';break outer}if(routed(t)){res=ti===0?'L':'W';break outer}}}
      if(g.q==='生生不息'&&R()<.4){const h=healTo(t,i,g,.5);if(h)ev({type:'skill',side:t.side,i,skill:'生生不息',kind:BG,tg:[h]})}
      if(fx.威壓||(fx.麻痺&&R()<.3)){ev({type:'stun',side:t.side,i,why:fx.威壓?'威壓':'麻痺'});
        if(g.prep&&R()<.5){g.prep=null;g.pl=0;ev({type:'skill',side:t.side,i,skill:'準備被打斷',kind:'控制',tg:[]})}   // 官方：準備期間受到控制可能被打斷（機率未知，先設 50%，Joe 2026-11-23）
        // 官方：麻痺「不影響指揮戰法與被動戰法」、指揮／被動戰法「不受控制效果影響」→ 被控制時，每回合判定的指揮／被動戰法照常發動
        for(const sk of g.skills){if(sk.each&&sk.kind!=='主動'&&sk.modeled!=='none'&&!(sk.arm&&t.arm!==sk.arm)&&R()<sk.rate)useSkill(t,ti,i,sk)}
        tick();continue}
      if(g.prep){if(g.pl>0)g.pl--;else{useSkill(t,ti,i,g.prep,{prepared:true});g.prep=null;g.noPrepR=round}}   // 準備完成發動的那回合不能馬上再準備（Joe 2026-11-23：準備型 8 回合頂多約 4 次）
      for(const sk of g.skills){const o=sk.fx?.open;if(o?.t==='shiten'&&round<=o.rounds&&R()<.8){const al=aliveIdx(e);if(al.length){
        const a1=[...al].sort((x,y)=>e.gens[y].b.武勇-e.gens[x].b.武勇)[0],a2=[...al].sort((x,y)=>e.gens[y].b.智略-e.gens[x].b.智略)[0];
        timed(e.gens[a1],'weakBlade',o.v,1);timed(e.gens[a2],'weakStrat',o.v,1)}}}   // 氣勢沖天：削弱敵軍武勇最高者的兵刃傷害、智略最高者的謀略傷害
      for(const sk of g.skills){
        if(sk.modeled==='none'||(sk.self||sk.buf||sk.regen)&&!sk.dmg&&!sk.heal&&!sk.status)continue;
        if(sk.arm&&t.arm!==sk.arm)continue;   // 兵種技：隊伍兵種不符就沒效果
        if(g.prep===sk)continue;   // 正在準備同一招
        if(g.cdm&&g.cdm[sk.name]>=round)continue;   // 冷卻中
        if(sk.prep&&(g.prep||g.noPrepR===round))continue;   // 一次只準備一招；剛發動完準備戰法的回合不能再開始準備
        const act=sk.kind==='主動'||sk.each;
        if(!act||(sk.kind==='主動'&&fx.無策))continue;
        const gk=sk===g.skills[0]&&sk.prep?g.skills.find(x=>x.fx?.open?.t==='giki')?.fx.open:null;   // 疑心暗鬼：自帶準備主動發動率增加
        const pr=sk.rate+(sk.kind==='主動'?M(g,'rateAct')/100:0)+(sk.kind==='主動'&&g.hitBy?.round!==round?((sk===g.skills[0]?g.tc.wei:g.tc.fen)||0)/100:0)+(sk.kind==='主動'&&sk!==g.skills[0]?M(g,'rateActNI')/100:0)+(gk?gk.rate/100:0)+(sk.prep&&sk.kind==='主動'?M(g,'ratePrep')/100:0)+(sk===g.skills[0]&&sk.name==='相模之獅'?(GP(g,'獅心',1,5)||0)/100:0)-(sk.dec?sk.dec*(round-(sk.from||1)):0);
        if(sk.from&&round<sk.from)continue;
        const tot=x=>x.gens.reduce((a,m)=>a+Math.max(0,m.troops),0),pr2=sk.lowHalf&&tot(t)<.5*t.gens.reduce((a,m)=>a+m.max,0)&&tot(t)<tot(e)?pr*.5:pr;   // 鈴鳴：兵力劣勢時機率減半
        if(R()<pr2){
          if(sk.kind==='主動'&&mblock(t,ti,i)){if(routed(t)){res=ti===0?'L':'W';break outer}continue}
          const un=sk===g.skills[0]&&sk.prep?g.skills.find(x=>x.fx?.open?.t==='unsho')?.fx.open:null;   // 運勝之鼻：自帶準備主動有機率跳過準備
          if(sk.prep&&un&&R()<un.skip&&sk.prepN<=1)useSkill(t,ti,i,sk);
          else if(sk.prep){g.prep=sk;g.pl=sk.prepN-1-(un&&R()<un.skip?1:0);ev({type:'prep',side:t.side,i,skill:sk.name});
            if(un)g.tm.push({k:'rateAct',v:un.rate,until:round+un.dur-1});
            if(gk){g.b.智略+=gk.st;g.sb.push({k:'智略',v:gk.st,until:round+gk.dur-1})}
            if(g.q==='臨機應變'&&R()<.4){g.first=round+1;ev({type:'skill',side:t.side,i,skill:'臨機應變',kind:BG,tg:[{side:t.side,i,status:'下回合先攻'}]})}}
          else useSkill(t,ti,i,sk);
          if(g.tc.renga&&sk.kind==='主動'&&!sk.prep&&!routed(e)&&R()<(sk===g.skills[0]?.35:.07)&&R()<pr)useSkill(t,ti,i,sk);   // 連歌百韻：成功後 7%（自帶 35%）再嘗試一次
          if(routed(e))break;
        }
      }
      if(routed(e)){res=ti===0?'W':'L';break outer}
      let sealed=!!fx.封擊||g.sealR===round&&!gearImm(g,'龍牙');
      if(g.imm===round)sealed=false;   // 縱橫馳突：免疫封擊
      if(sealed&&g.q==='冷靜沉著'&&R()<.8){sealed=false;ev({type:'skill',side:t.side,i,skill:'冷靜沉著',kind:BG,tg:[{side:t.side,i,status:'免疫封擊'}]})}
      // 虛實自在：10% 連擊（多普通攻擊一次）
      const swings=!sealed?(g.cb===round||(g.q==='虛實自在'&&R()<.1)?2:1):0;
      let gr=g.grR===round?.25:.5;
      if(g.ix?.lfEnd<round){g.lfv=0;g.ix.lfEnd=99}
      const fk=g.skills.find(s=>s.fx?.open?.t==='fukushima')?.fx.open,rwp=(g.rwu>=round?g.rwp:0)+(fk?fk.p:0);
      const kn=g.skills.find(s=>s.fx?.open?.t==='kenshin')?.fx.open,mae=g.skills.some(s=>s.fx?.open?.t==='maeda')&&g.ix?.enh;
      let tmpA=null;{const c=g.ix?.c||0,extra=(kn&&c>0?c*kn.v+(c>=12?kn.full:0):0)+(mae?(g.skills.find(s=>s.fx?.open?.t==='maeda').fx.open.enh||50):0);if(extra&&swings>0){tmpA={k:'dmgAtk',v:extra,until:99};g.tm.push(tmpA)}}
      for(let sw=0;sw<swings;sw++){
        const al=aliveIdx(e);if(!al.length)break;
        const tn=g.tn&&g.tn.until>=round&&e.gens[g.tn.to]?.troops>0?g.tn.to:-1;   // 挑釁：強迫對挑釁者普通攻擊
        const wt=al.map(x=>e.gens[x].tc.tw||1),wsum=wt.reduce((a,b)=>a+b,0);let wr=R()*wsum,wj=al[al.length-1];for(let q=0;q<al.length;q++){wr-=wt[q];if(wr<=0){wj=al[q];break}}   // 剛猛／隱忍：被普攻機率
        if(fx.混亂&&tn<0){const fr=aliveIdx(t).filter(x=>x!==i);const k=Math.floor(R()*(al.length+fr.length));
          if(k>=al.length){const fj=fr[k-al.length],hf=hit(t,ti,i,t,fj,1,g.atkS?'謀略':'兵刃','atk');ev({type:'atk',side:t.side,i,tg:hf?[{...hf,confused:true}]:[],combo:sw>0});if(routed(t))break;continue}}   // 混亂：在敵我全部武將中隨機選普攻目標，打到友軍就結束這一擊
        const j=tn>=0?tn:wj,h=hit(t,ti,i,e,j,1,g.atkS?'謀略':'兵刃','atk');
        const tgs=h?[h]:[];if(rwp&&h&&R()<rwp){const o3=aliveIdx(e).filter(x=>x!==j);if(o3.length){const h4=hit(t,ti,i,e,o3[Math.floor(R()*o3.length)],1,g.atkS?'謀略':'兵刃','atk');if(h4)tgs.push(h4)}}   // 亂舞：普攻時對同隊其他武將造成傷害if(mae&&sw===0&&h)for(const k of aliveIdx(e))if(k!==j){const h2=hit(t,ti,i,e,k,1,'兵刃','atk');if(h2)tgs.push(h2)}   // 槍之又左：強化普攻擴散至敵軍全體
        ev({type:'atk',side:t.side,i,tg:tgs,combo:sw>0});
        for(const[mi,m]of t.gens.entries()){const p=GP(m,'迅疾',10,40);if(p==null||m.troops<=0)continue;m.bs.jsN=(m.bs.jsN||0)+1;if(m.bs.jsN%3===0&&(m.bs.jsU||0)<2+Math.round(2*m.gc.迅疾)){m.bs.jsU=(m.bs.jsU||0)+1;const hh=healTo(t,lowest(t),m,p/100,'統率');if(hh)aux('迅疾',t.side,mi,hh)}}   // 迅疾（十二間突盔形兜，長宗我部元親）：我軍累計普攻 3 次 → 治療單體
        if(h&&g.tc.tosa&&R()<.7&&g.sb.filter(x=>x.tosa&&x.until>=round).length<4){g.b.智略+=10;g.sb.push({k:'智略',v:10,until:round+1,tosa:1})}   // 土佐基石：普攻後 70% 智略 +10，持續 2 回合，最多疊 4 次
        if(h)for(let mi=0;mi<t.gens.length;mi++){const m=t.gens[mi];if(m===g||m.troops<=0)continue;for(const s of m.skills){const o=s.fx?.open;   // 南予智將：自己以外的友軍普攻後機率謀略傷害
          if(o?.t==='nanyo'&&R()<o.p){const al=aliveIdx(e);if(al.length){const h3=hit(t,ti,mi,e,al[Math.floor(R()*al.length)],o.dmg,'謀略','指揮');if(h3)ev({type:'skill',side:t.side,i:mi,skill:s.name,kind:s.kind,tg:[h3]})}}}}
        if(h){e.gens[j].hitBy={round,i};for(const m of e.gens){const gx=m.ix?.gk2;if(gx&&gx.includes(j))m.ix.gkc=(m.ix.gkc||0)+1}}
        if(h&&!h.shield&&!h.evade){const dj=e.gens[j];
          {let p;
          if((p=GP(g,'妖氣',.4,.8))!=null&&R()<p){const hh=healTo(t,i,g,.05+.1*g.gc.妖氣);if(hh)ev({type:'skill',side:t.side,i,skill:'妖氣',kind:'裝備',tg:[hh]})}   // 妖氣：普攻後機率恢復兵力
          if((p=GP(g,'紫電',.1,.4))!=null&&R()<p&&dj.troops>0){const x=Math.min(dj.troops-1,Math.round(g.b.速度*(.25+.25*g.gc.紫電)));if(x>0){dj.troops-=x;aux('紫電',t.side,i,{side:e.side,i:j,v:x,left:dj.troops,dtype:'兵刃'})}}   // 紫電：普攻後追加兵刃傷害
          if((p=GP(dj,'反影',.03,.12))!=null&&g.troops>1){const x=Math.min(g.troops-1,Math.round(h.v*p));if(x>0){g.troops-=x;aux('反影（反彈）',e.side,j,{side:t.side,i,v:x,left:g.troops,dtype:'兵刃'})}}   // 反影：反彈傷害
          if(dj.bs.yumo?.until>=round&&dj.troops>0&&g.troops>0){const hh=hit(e,1-ti,j,t,i,dj.bs.yumo.a,'兵刃','反');if(hh)aux('勇猛（反擊）',e.side,j,hh)}   // 勇猛：受普攻時反擊
          if((p=GP(g,'烈弓',2,8))!=null&&R()<.25)g.tm.push({k:'crit',v:p,until:round+1},{k:'critDmg',v:p,until:round+1});   // 烈弓（甲斐竹弓，成田甲斐）：普攻後 25% 會心＋會心傷害 2~8%，2 回合
          if((p=GP(g,'太平',1,10))!=null&&dj.troops>0&&R()*100<p&&!kouyou(dj)){timed(dj,'weak',100,1);aux('太平',t.side,i,{side:e.side,i:j,status:'疲弊'})}   // 太平（日光助真，德川家康）
          if((p=GP(g,'鬼斬',5,15))!=null&&dj.troops>0&&R()*100<p){const x=strip(e,j,1+Math.round(g.gc.鬼斬));if(x.length)aux('鬼斬',t.side,i,x[0])}   // 鬼斬（童子切安綱）：驅散目標 1~2 個增益
          if((p=GP(g,'靈刀',5,15))!=null&&R()*100<p){let n=1+Math.round(g.gc.靈刀);const out=[];   // 靈刀（大典太光世）：淨化自身 1~2 個減益
            for(const k of[...CTRLK])if(n>0&&g.fx[k]>0){delete g.fx[k];n--;out.push(k);cleaned(t,i,k)}
            while(n>0&&g.dots.length){const x=g.dots.shift();n--;out.push(x.kd);cleaned(t,i,null,x)}
            g.tm=g.tm.filter(x=>{if(n>0&&x.until<99&&NEGK.has(x.k)&&x.until>=round){n--;out.push(LBL[x.k]||x.k);return false}return true});
            if(out.length)aux('靈刀',t.side,i,{side:t.side,i,status:'淨化 '+out.join('、')})}
          if((p=GP(g,'毒計',.4,.8))!=null&&round===(g.gc.毒計>.5?4:3)&&!g.bs.dokkei){g.bs.dokkei=1;if(dj.troops>0&&R()<p){const kd=['火傷','中毒','水攻','消沉'][Math.floor(R()*4)];addDot(t,ti,i,dj,'毒計·'+kd,.5+.3*g.gc.毒計,'謀略',2,kd);aux('毒計',t.side,i,{side:e.side,i:j,status:kd})}}   // 毒計（三十六計）：第 3~4 回合首次攻擊後
          if(round===1&&(p=GP(dj,'相殺',.5,1))!=null&&(dj.bs.sousai||0)<(dj.gc.相殺>.5?2:1)&&dj.troops>0&&g.troops>0){dj.bs.sousai=(dj.bs.sousai||0)+1;const hh=hit(e,1-ti,j,t,i,p,'兵刃','反');if(hh)aux('相殺（反擊）',e.side,j,hh)}   // 相殺（長烏帽子形兜）：首回合受普攻後反擊
          if((p=GP(dj,'怒濤',4,8))!=null&&(dj.bs.nt||0)<(dj.gc.怒濤>.5?3:2)){dj.bs.nt=(dj.bs.nt||0)+1;dj.b.武勇+=p;dj.sb.push({k:'武勇',v:p,until:round+Math.round(dj.gc.怒濤*2)})}}   // 怒濤：被普攻增加武勇
        if(g.tc.himemusha){g.bs.hm=(g.bs.hm||0)+1;if(g.bs.hm%2===0&&(g.bs.hmS||0)<8){g.bs.hmS=(g.bs.hmS||0)+1;g.tm.push({k:'crit',v:2,until:99})}}   // 姬武者
          if(dj.tc.raiden&&R()<dj.tc.raiden){g.fx.麻痺=Math.max(g.fx.麻痺||0,2);aux('雷電化身',e.side,j,{side:t.side,i,status:'麻痺'})}   // 雷電化身（假設 10%）
          if(dj.tc.zessei&&(dj.bs.zs||0)<8){dj.bs.zs=(dj.bs.zs||0)+1;const k=['武勇','智略','統率','速度'].reduce((a,x)=>dj.b[x]>dj.b[a]?x:a,'武勇');g.b[k]-=2;dj.b[k]+=2}   // 絕世雄略：被普攻時偷取攻擊者 2 點主屬性
          if(g.tc.namikaze&&(g.bs.nm||0)<10&&R()<.8){g.bs.nm=(g.bs.nm||0)+1;dj.b.智略-=2;g.b.智略+=2}   // 波風：吸取目標 2 點智略
          if(g.tc.akabe&&!g.akaD){g.akaD=1;dj.b.統率-=18}   // 赤備：首次普攻後降低目標統率
          if(g.tc.shosen&&round===1&&!g.shoD&&R()<.5){g.shoD=1;const k=['武勇','智略','統率','速度'].reduce((a,x)=>g.b[x]>g.b[a]?x:a,'武勇');g.b[k]+=18}   // 首先立功
          if(g.tc.sokugeki&&dj.troops>0&&g.hitBy?.round!==round&&R()*100<g.tc.sokugeki)timed(dj,'weak',100,1);   // 側擊：疲弊
          if(g.tc.konoe&&dj.troops>0&&R()*100<g.tc.konoe&&!resist(e,j,'麻痺')){dj.fx.麻痺=Math.max(dj.fx.麻痺||0,2);onControl(t,ti,i,e,j)}   // 近衛齊射：麻痺
          for(const m of t.gens)if(m.troops>0&&m.tc.mikawa&&R()<.15)m.g1=50;   // 三河武士：我軍全體普攻後 15% 使自身下次受傷 -50%
          if(dj.troops>0){
            if(dj.tc.kinjo&&(Object.keys(g.fx).length||g.dots.length)&&R()<.3){const hh=healTo(e,j,dj,.52);if(hh)ev({type:'skill',side:e.side,i:j,skill:'金城鐵壁',kind:'被動',tg:[hh]})}
            if(dj.tc.hanae&&(dj.bs.hanae||0)<3&&R()<.45){dj.bs.hanae=(dj.bs.hanae||0)+1;const hh=healTo(e,j,dj,.68);if(hh)ev({type:'skill',side:e.side,i:j,skill:'花枝招展',kind:'被動',tg:[hh]})}}}
        if(h&&e.gens[j].troops>0)for(const m of t.gens){if(m.troops<=0)continue;for(const s of m.skills){const o=s.fx?.open;   // 霸王右筆：友軍普攻之後，機率追加兵刃傷害
          if(o?.t==='ota'&&R()<o.p){const h3=hit(t,ti,t.gens.indexOf(m),e,j,o.rate,'兵刃','指揮');if(h3)ev({type:'skill',side:t.side,i:t.gens.indexOf(m),skill:s.name,kind:s.kind,tg:[h3]})}}}
        if(h&&!h.shield&&e.gens[j].troops>0)for(const sk of e.gens[j].skills){const o=sk.fx?.open;   // 沉魚落雁：受到普通攻擊時反制
          if(o?.t==='react'&&R()<o.p){const k=['混亂','無策','疲弊'][Math.floor(R()*3)];if(k==='疲弊')timed(g,'weak',100,2);else g.fx[k]=Math.max(g.fx[k]||0,2)}
          if(o?.t==='gokihata'&&R()<o.p2&&g.troops>0){const al=aliveIdx(e).filter(x=>x!==j);if(al.length){const hh=hit(e,1-ti,al[Math.floor(R()*al.length)],t,i,o.a,'兵刃','被動');if(hh)ev({type:'skill',side:e.side,i:j,skill:sk.name,kind:sk.kind,tg:[hh]})}}   // 御旗盾無：友軍單體反擊
          if(o?.t==='kokin'&&g.troops>0&&R()<o.p){const hh=hit(e,1-ti,j,t,i,o.a,'兵刃','被動');if(hh)ev({type:'skill',side:e.side,i:j,skill:sk.name,kind:sk.kind,tg:[hh]});const dg=e.gens[j];dg.lfv=Math.min(o.lf*o.max,(dg.lfv||0)+o.lf)}   // 古今獨步：反擊並累積離反（吸血）
          if(o?.t==='chisaka'){const ix=ixs(e.gens[j]);if((ix.n||0)<5){ix.n=(ix.n||0)+1;e.gens[j].b.武勇+=o.v;e.gens[j].b.統率+=o.v;
            if(ix.n===5){const tg=[];for(const k of aliveIdx(t))tg.push(hit(e,1-ti,j,t,k,o.fin,'兵刃','指揮'));evS(e,j,sk.name,sk.kind,tg)}}}   // 耐苦成剛：被普攻累積，滿 5 次後對敵全體兵刃傷害
          if(o?.t==='counter'&&o.st&&j!==0){const dg=e.gens[j],ix=ixs(dg);ix.kn=(ix.kn||0)+1;if(ix.kn%4===0&&ix.kn<=12)dg.b.統率+=dg.st.統率*o.st/100}   // 堅忍不拔：非大將每受 4 次普攻統率提高
          if(o?.t==='counter'&&g.troops>0){const hh=hit(e,1-ti,j,t,i,j===0?o.a:o.b,'兵刃','atk');if(hh)ev({type:'skill',side:e.side,i:j,skill:sk.name,kind:sk.kind,tg:[hh]})}}   // 堅忍不拔：反擊
        if(h&&!h.shield)for(const m of e.gens){if(m.troops<=0)continue;for(const s of m.skills){const o=s.fx?.open;if(o?.t==='mikawa'&&(g.k3||0)<8){g.k3=(g.k3||0)+1;for(const k of ST4)g.b[k]-=g.st[k]*o.v/100}}}   // 三河魂：被普攻時攻擊者全屬性降低（最多 8 次）
        if(g.q==='剛柔相濟'&&R()<gr){g.grR=round;gr=.25;const hh=healTo(t,i,g,.6);if(hh)ev({type:'skill',side:t.side,i,skill:'剛柔相濟',kind:BG,tg:[hh]})}
        if(h&&e.gens[j].troops>0)for(const sk of g.skills)if(sk.afterAtk&&R()<sk.afterAtk){const k2=hit(t,ti,i,e,j,sk.dmg,sk.dtype,'被動');if(k2)ev({type:'skill',side:t.side,i,skill:sk.name,kind:sk.kind,tg:[k2]})}   // 天神山殘照：普攻後機率追擊
        if(h&&e.gens[j].troops>0)for(const sk of g.skills)if(sk.kind==='突擊'&&sk.modeled!=='none'&&R()<sk.rate+M(g,'rushRate')/100+(g.hitBy?.round!==round?((sk===g.skills[0]?g.tc.gong:g.tc.meng)||0)/100:0)){
          // 突擊 hits the same target as the normal attack
          const rx=sk.fx?.rush,xt=[],dR=sk.dmg+skUp(g,sk),wasNS=e.gens[j].fx.無策>0;   // 雷刃（雷切專屬，立花道雪攜帶）：雷鳴傷害率提升
          if(rx?.t==='tanki')xt.push(...strip(e,j,2));   // 當機立斷：先解除 2 個增益
          const k2=sk.dmg?hit(t,ti,i,e,j,dR,sk.dtype,'突擊'):{side:e.side,i:j};
          if(sk.rushN&&sk.n[1]>1)for(const q of pickN(aliveIdx(e).filter(x=>x!==j),sk.n[1]-1,R)){const hq=hit(t,ti,i,e,q,dR,sk.dtype,'突擊');if(hq)xt.push(hq)}   // 群體突擊：普攻目標＋另選
          if(rx?.t==='tanki'&&R()<.5){const q=pickN(aliveIdx(e),1,R)[0];if(q!=null){xt.push(...strip(e,q,2));const hq=hit(t,ti,i,e,q,sk.dmg,sk.dtype,'突擊');if(hq)xt.push(hq)}}
          else if(rx?.t==='nouka'){const n=2+Math.floor(R()*3);for(let q=0;q<n;q++){if(R()<.5){const al=aliveIdx(e);if(!al.length)break;const hq=hit(t,ti,i,e,al[Math.floor(R()*al.length)],rx.dmg,'謀略','突擊');if(hq)xt.push(hq)}else{const hq=healTo(t,lowest(t),g,rx.heal);if(hq)xt.push(hq)}}}   // 能鷹隱爪
          else if(rx?.t==='kochu')for(const q of aliveIdx(t)){if(q===i)continue;const m=t.gens[q];   // 孤注一擲：友軍（不含自己）
            if(m.cb===round){const hq=healTo(t,q,g,rx.heal,'統率');if(hq)xt.push(hq)}
            else{const al=aliveIdx(e);if(al.length){const hq=hit(t,ti,q,e,al[Math.floor(R()*al.length)],rx.dmg,'auto','突擊');if(hq)xt.push(hq)}}}
          if(rx?.t==='fall'){const d=e.gens[j];for(const k of['統率','智略']){d.b[k]-=rx.v;d.sb.push({k,v:-rx.v,until:round+1})}t.gens[0].sh+=i===0?1:2}   // 戰意崩壞：目標統率智略-65，大將鐵壁
          else if(rx?.t==='break'){const d=e.gens[j];d.b.統率-=rx.v;d.sb.push({k:'統率',v:-rx.v,until:round+1})}   // 破甲
          else if(rx?.t==='crit')g.tm.push({k:'crit',v:rx.v,until:round+1})   // 猛擊
          else if(rx?.t==='combo')g.cb=round+1   // 荒切
          let stx=null;if(sk.status&&k2&&R()<sk.status.p){const ap=sk.status.k.filter(k=>!resist(e,j,k));for(const k of ap)setFx(e,j,k,sk.status.dur,[ti,i]);stx={side:e.side,i:j,status:ap.length?ap.join('、'):'抵抗了「'+sk.status.k.join('、')+'」'}}
          if(sk.name==='越後二天'&&sk.heal&&wasNS&&k2){const hq=healTo(t,i,g,sk.heal,'武勇');if(hq){xt.push(hq);const p=GP(g,'長驅',2,8);if(p!=null&&R()<.4+.35*g.gc.長驅){timed(g,'taken',p,1+Math.round(g.gc.長驅));xt.push({side:t.side,i,status:`長驅：受傷 -${Math.round(p*10)/10}%`})}}}   // 越後二天：目標已無策 → 恢復自身兵力；長驅（黑穗槍，柿崎景家）
          ev({type:'skill',side:t.side,i,skill:sk.name,kind:'突擊',guess:sk.modeled==='guess',tg:[...(k2&&sk.dmg?[k2]:[]),...xt,...(stx?[stx]:[])]});
          if(g.bx.rushGuard)timed(g,'guard',g.bx.rushGuard,1);   // 膽力
          if(stx)onControl(t,ti,i,e,j)
          if(e.gens[j].troops<=0)break;
        }
        if(routed(e))break;
      }
      if(tmpA){g.tm.splice(g.tm.indexOf(tmpA),1);if(g.ix){if(kn)g.ix.c=0;if(mae)g.ix.enh=false}}
      for(const sk of g.skills){const o=sk.fx?.open;if(o?.t==='akabe'&&g.troops>0&&R()<o.p+(g.cr===round?o.p:0)){   // 武田之赤備：行動後機率赤備突擊（本回合會心過則機率加倍）
        const j=pickN(aliveIdx(e),1,R)[0];if(j!=null){const hh=hit(t,ti,i,e,j,o.rate,'兵刃','被動');if(hh&&e.gens[j].troops>0)timed(e.gens[j],'statDown',o.dec,2);evS(t,i,sk.name,sk.kind,[hh])}}}
      for(const sk of g.skills){const o=sk.fx?.open;if(o?.t==='bisha'&&g.troops>0&&R()<o.p){   // 毘沙門天：行動後機率治療我軍、削弱敵軍傷害
        const hs=pickN(aliveIdx(t),2+Math.floor(R()*2),R).map(j=>healTo(t,j,g,o.heal)).filter(Boolean);
        for(const d of pickN(aliveIdx(e),2+Math.floor(R()*2),R))timed(e.gens[d],'weak',o.weak,2);
        if(hs.length)ev({type:'skill',side:t.side,i,skill:sk.name,kind:sk.kind,tg:hs})}}
      if(g.troops>0){   // 武將特性（條件型）：行動後
        if(g.tc.echigo&&g.dr!==round)timed(g,'guard',22,2);   // 越後之龍：本回合行動後未造成傷害 → 降傷到下次行動
        if(g.tc.kyojitsu&&e.gens.some(m=>m.troops>0&&m.fx.混亂))timed(g,'guard',3,1);   // 虛實
        if(g.tc.mao)e.gens.forEach((m,mj)=>{if(m.troops>1&&!m.maoD&&m.troops<m.max*.5){m.maoD=1;const x=Math.min(m.troops-1,Math.round(R()*.05*m.max));if(x>0){m.troops-=x;aux('魔王',t.side,i,{side:e.side,i:mj,v:x,left:m.troops,dtype:'流失'})}}})   // 魔王
      }
      tick();
      for(const m of t.gens)if(m.troops>0)for(const s of m.skills){const o=s.fx?.open;if(o?.t==='kenshin'&&R()<o.p*2/3){const ix=ixs(m);ix.c=Math.min(12,(ix.c||0)+1)}}   // 軍神：友軍行動時機率蓄力（友軍群體 2 人，約 2/3 的行動算數）
      if(routed(e)){res=ti===0?'W':'L';break outer}
    }
  }
  if(round>K.rounds)round=K.rounds;
  while(pend.length){const x=pend.shift();log.push(x);note(x)}reconcile();
  for(const t of T)for(const g of t.gens){for(const k of['b','fx','prep','bx','q','tm','dots','stBuffs','purged','cnt','lj','first','calmR','grR','sealR','tn','sb','sh','cb','imm','wen','wc','go','pl','ix','lfv','hitBy','cr','k3','baba','rwp','rwu','noPrepR','cz','jogeU','senN','shuR','msN','genEv','cdm','noConf','dong','shc','lh','hz','hzQ','hck','q72','merc','mercU','atkS','amayo','curSk'])delete g[k]}
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
// 特性數值、兵種加成、兵種選擇、勢力、協力都在 slg/rules.js（唯一來源）。
// red：紅度 0–5（預設 5＝滿紅）。特性欄 2～4 在 1／3／5 紅解鎖；自由點數每紅 +10（滿紅 50）。
// red 也可以是 {武將名:紅度}，隊中每人紅度不同時用（沒列的算滿紅）。
// 設施加成（Joe 的設施截圖）：協力-勢力 Lv1～10 = 0.5,1,1.5,2,2.5,3,4,5,6,7%（三人同勢力才生效）、協力-家門 每級 1%（同家門才生效，家門資料沒收，由玩家勾選）、兵種營 每級 +1 兵種等級（×2%）。
// fac = {co, arm, ka, same}；不給就是舊行為（兵種營 Lv5、沒有協力與家門）
export function fullRedStats(D,n,names,arm,lv=50,red=5,fac=null){
  const rd=nm=>typeof red==='object'?(red[nm]??5):red;
  const traits=traitsAtRed(D,n,rd(n));
  const lvArm=fac?.armLv??armLevel(D,names,arm,red,fac?fac.arm:5).lv,team={};   // fac.armLv：直接指定兵種等級（例如照戰報準備階段的「屬性調整為 110%」＝Lv5）
  for(const nm of names)for(const t of traitsAtRed(D,nm,rd(nm))){const x=traitFx(D,nm,t);if(x.team)team[x.team]=(team[x.team]||0)+x.tpct}
  const own={};let extra=0;
  for(const t of traits){const x=traitFx(D,n,t);if(x.stat)own[x.stat]=(own[x.stat]||0)+x.pct;extra+=+(D.traitText?.[n]?.[t]||'').match(/每升10級，獲得(\d+)點自由屬性點/)?.[1]||0}
  const st=statsAt(D,n,lv,D.stats?.[n]?.r),k=st.武勇>=st.智略?'武勇':'智略';
  st[k]+=Math.floor(lv/10)*(10+extra)+10*rd(n);
  let fp=0;if(fac){fp+=coopPct(D,names,fac.co);if(fac.same&&fac.ka)fp+=fac.ka}   // 協力：實際勢力（含老獪／老狐狸）三人相同才生效
  return Object.fromEntries(ST4.map(x=>[x,Math.round(st[x]*(1+(lvArm*2+fp+(own[x]||0)+(team[x]||0))/100)*10)/10]));
}

// 武將特性的戰鬥效果：說明文字能換算成既有戰鬥鍵（造成／受到傷害 %、會心、奇謀、發動率）的都接進來。
// 「我軍全體」的特性加給全隊，其餘只給自己。回傳每位武將 {tr:{鍵:%}, tm:[{k,v,until}]}，tr 併入 g.tr、tm 併入 g.trTm。
// 條件型特性（威勢／奮戰／猛鬥／攻陣「本回合未受到普通攻擊時」、赤備／側擊／近衛齊射等附帶狀態、方圓之器、才德兼備…）目前沒有實作，名單見 TRAIT_TODO。
const TR_KEYS={'造成兵刃傷害':'dmgBlade','造成謀略傷害':'dmgStrat','造成傷害':'dmg','受到兵刃傷害':'takenBlade','受到謀略傷害':'takenStrat','受到傷害':'taken'};
function traitParse(txt){
  let m=txt.match(/^(我軍全體)?(造成兵刃傷害|造成謀略傷害|造成傷害|受到兵刃傷害|受到謀略傷害|受到傷害)(?:增加|減少)([\d.]+)%$/);
  if(m)return{team:!!m[1],tr:{[TR_KEYS[m[2]]]:+m[3]}};
  m=txt.match(/^增加([\d.]+)%奇謀傷害率$/);if(m)return{tr:{critSDmg:+m[1]}};
  m=txt.match(/^增加([\d.]+)%會心傷害率和奇謀傷害率$/);if(m)return{tr:{critSDmg:+m[1],critDmg:+m[1]}};
  m=txt.match(/^增加([\d.]+)%會心傷害率$/);if(m)return{tr:{critDmg:+m[1]}};
  m=txt.match(/^獲得([\d.]+)%會心狀態和奇謀狀態$/);if(m)return{tr:{crit:+m[1],critS:+m[1]}};
  m=txt.match(/^獲得([\d.]+)%會心狀態$/);if(m)return{tr:{crit:+m[1]}};
  m=txt.match(/^我軍全體普通攻擊傷害增加([\d.]+)%/);if(m)return{team:true,tr:{dmgAtk:+m[1]}};
  m=txt.match(/^獲得([\d.]+)%奇謀狀態$/);if(m)return{tr:{critS:+m[1]}};
  m=txt.match(/^前(\d)回合受到的傷害降低([\d.]+)%/);if(m)return{tm:[{k:'taken',v:+m[2],until:+m[1]}]};   // 立山行（山脈地形加士氣沒模擬：沒有地圖地形，士氣 100 以上也沒效果）
  m=txt.match(/^戰鬥中，前(\d)回合主動、突擊戰法發動率提升([\d.]+)%/);if(m)return{tm:[{k:'rateAct',v:+m[2],until:+m[1]},{k:'rushRate',v:+m[2],until:+m[1]}]};
  return null}
export const TRAIT_TODO=(D)=>{const o={};for(const n in D.traitText||{})for(const t in D.traitText[n]){if(/^(馬|弓|槍|炮|器)+術|^(武威|智慧|領兵|靈巧)I+$|大將$|等級上升/.test(t)||/^部隊的|^我軍全體(武勇|智略|統率|速度)提高|自由屬性點/.test(D.traitText[n][t]))continue;if(!traitParse(D.traitText[n][t])&&!TC[t])o[t]=D.traitText[n][t]}return o};
const TC={威勢II:{wei:2.8},威勢III:{wei:3.5},奮戰II:{fen:2.5},奮戰III:{fen:3},猛鬥I:{meng:2},猛鬥III:{meng:3},攻陣III:{gong:3.5},
  三河武士:{mikawa:1},四州稱雄:{shishu:6},劍豪:{kengo:1},赤備:{akabe:1},側擊:{sokugeki:14},近衛齊射:{konoe:20},姬武者:{himemusha:1},勇烈:{yuretsu:14},首先立功:{shosen:1},
  破釜沉舟:{hafu:1},獨眼龍:{dokugan:1},魯莽武者:{rash:1},無形之位:{muke:1},方圓之器:{hoen:1},老功古實:{rokou:1},紅爐點雪:{kouro:1},姬城督:{hime:1},魔王:{mao:1},霸王:{hao:1},
  金城鐵壁:{kinjo:1},花枝招展:{hanae:1},清濁併吞:{seida:1},鳳凰:{phx:1},手足之愛:{teashi:1},深諳人心:{shinjin:1},坂東太郎:{bando:1},才德兼備:{caide:1},三矢家訓:{mitsuya:1},
  // 說明沒有寫數值的特性（Joe 2026-11-23：官方沒寫、他也沒有數值）→ 依「略微／提高／大幅」排序給假設值，之後有真實數字再改這裡
  剛猛I:{tw:1.25},剛猛II:{tw:1.5},剛猛III:{tw:2},隱忍I:{tw:.8},隱忍II:{tw:.65},隱忍III:{tw:.5},   // 受到普通攻擊的機率權重（假設）
  死守:{shishu2:.3},不死身:{fushi:5},無傷雄師:{fushi:5},雷電化身:{raiden:.1},   // 死守＝首次低於 50% 恢復 30% 最大兵力；不死身／無傷雄師＝受到傷害 −5%；雷電化身＝受普攻 10% 使攻擊者麻痺（皆為假設）
  絕世雄略:{zessei:1},波風:{namikaze:1},心腹之智:{shinfuku:1},越後之龍:{echigo:1},虛實:{kyojitsu:1},
  // 2026-11-24 補齊（④）：照說明實作；說明沒寫數值的標「假設」
  玄謀:{genbou:1},傾奇者:{kabuki:12},先驅:{senku:1},義將:{gisho:.5},威迫II:{tw:1.3},連歌百韻:{renga:1},謀神:{moushin:1},公家嗜好:{kuge:1},懸待表裡:{kentai:1},
  淑德:{shukutoku:1},短刀之契:{tanto:1},上下一心:{},求道:{},老狐狸:{},老獪:{},   // 義將「不易受到混亂影響」假設 50% 抵抗；威迫II 被選中權重假設 1.3；後四個在下面全隊／勢力判定處理
  守財術:{stAdd:{武勇:16}},築城名手:{stAdd:{統率:24}},   // 設施全滿：銀錢產量取上限 16；天守假設 10 級 ×2.4
  土佐基石:{tosa:1},親民鑑月集:{stAdd:{智略:16}},   // 新賽季預告；親民鑑月集照守財術取上限（兵糧產量全滿）
  甲斐之虎:{},祿壽應穩:{}};   // 行軍／士氣，不影響戰鬥
export const NONBATTLE_TRAITS=['甲斐之虎','祿壽應穩'];
export function traitBattle(D,names,red=5){
  const rd=nm=>typeof red==='object'?(red[nm]??5):red;
  const eff=names.map(n=>traitsAtRed(D,n,rd(n)).map(t=>traitParse(D.traitText?.[n]?.[t]||'')).filter(Boolean));
  return names.map((n,i)=>{const tr={},tm=[],tc={};eff.forEach((l,j)=>l.forEach(e=>{if(j!==i&&!e.team)return;for(const k in e.tr||{})tr[k]=Math.round(((tr[k]||0)+e.tr[k])*100)/100;if(j===i)for(const x of e.tm||[])tm.push({...x})}));
    for(const t of traitsAtRed(D,n,rd(n)))Object.assign(tc,TC[t]||{});
    {const fr=facRule(D,n);if(fr)tc.facRule=fr}   // 老獪／老狐狸：戰鬥裡判定合盟用實際勢力
    // 全隊型條件特性：隊友有就全隊生效
    names.forEach((m,j)=>{for(const t of traitsAtRed(D,m,rd(m))){if(t==='三河武士')tc.mikawa=1;if(t==='三矢家訓')tc.mitsuya=1;if(t==='四州稱雄')tc.shishu=6;if(t==='上下一心')tc.joge=1;if(t==='求道')tr.takenStrat=Math.round(((tr.takenStrat||0)+5)*100)/100}});   // 上下一心：全隊首回合免疫、30% 抵抗控制一次；求道：雜賀本願寺沒有標籤資料，取「未生效」那條（全隊受謀略傷害 −5%）
    if(traitsAtRed(D,n,rd(n)).includes('老獪')&&(i===0||D.stats?.[n]?.f===D.stats?.[names[0]]?.f))tc.lj=8;   // 老獪：勢力本來就和大將一樣（沒改變）時 8% 攻心
    return{tr,tm,tc}});
}
export const innateOf=(D,n)=>D.stats?.[n]?.inn||D.innate?.[n]||'';
