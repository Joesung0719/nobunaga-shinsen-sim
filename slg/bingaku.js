// 兵學：每位 5★／4★ 武將各自配點（Joe，2026-10-31）。
// - 5★ 最多 5 點、4★ 最多 3 點，3★ 以下沒有兵學。
// - 四個方向（武略／陣立／機略／臨戰）只能選 1 個。
// - 每個方向有「兵學・奇」3 項與「兵學・正」6 項。說明文字取自阿初的兵學畫面（封存 10.zip）；
//   目前假設所有武將的兵學樹都一樣，其他武將的畫面到了再確認。
// 還沒確認的規則（集中在 RULE，之後照遊戲改）：
// - 「兵學・奇」三選一、不花點（推估）。
// - 「兵學・正」每項 2 級，每級 1 點（說明有「下級效果」與兩顆菱形）。
// - 選了方向後，「武將每進階1次，可使自身造成的傷害及治療提高2%，所受的傷害降低2%」依紅度計算。
export const RULE={cap:{5:5,4:3},qiCost:0,zMax:2,perRed:2};
export const capOf=r=>RULE.cap[r]||0;

// fx 欄位（數值都是 %，除了 spd 是點數）：
//  dmg 造成傷害、dmgAtk 普通攻擊、dmgAct 主動戰法、dmgPrep 準備主動戰法、dmgStrat 謀略傷害、dmgRush 突擊戰法
//  taken 受到傷害、takenBlade 兵刃、takenStrat 謀略、takenAct 主動戰法、takenAtkRush 普攻＋突擊、takenCmd 指揮＋被動
//  crit 會心機率、critS 奇謀機率、critSDmg 奇謀傷害率、evade 規避、healIn 受到治療、spd 速度、spd1 首回合速度、rushRate 突擊發動率
//  ally 隨機友軍單體造成傷害、shield 每回合行動前受到兵刃／謀略傷害降低
// 文字被截斷、第 2 級數值推估的項目標 g2:true；sim:false 是戰棋還沒模擬的效果。
const z=(n,t1,t2,fx,o={})=>({n,t:[t1,t2],fx,...o});
export const DIRS=[
  {id:'武略',sub:'普通攻擊強化',col:'#c4544c',
    qi:[
      {n:'虛實自在',t:'每回合行動前，有10%機率獲得連擊狀態（受智略影響）'},
      {n:'剛柔相濟',t:'普通攻擊後，有50%機率恢復自身兵力（恢復率60%），每回合首次觸發後，本回合內觸發機率減半'},
      {n:'冷靜沉著',t:'行動後若處於封擊狀態，使自身有80%機率免疫封擊，持續1回合'},
    ],
    zheng:[
      z('剛力','普通攻擊造成的傷害提高3%','普通攻擊造成的傷害提高6%',[{dmgAtk:3},{dmgAtk:6}]),
      z('豪勇','獲得2%會心狀態','獲得4%會心狀態',[{crit:2},{crit:4}]),
      z('妙策','獲得2%奇謀狀態（受智略影響）','獲得4%奇謀狀態（受智略影響）',[{critS:2},{critS:4}]),
      z('奇謀','奇謀傷害率增加2.5%','奇謀傷害率增加5%',[{critSDmg:2.5},{critSDmg:5}]),
      z('膽力','發動突擊戰法後，使自身受到的傷害降低3%，持續1回合','發動突擊戰法後，使自身受到的傷害降低6%，持續1回合',[{rushGuard:3},{rushGuard:6}],{g2:true}),
      z('活路','突擊戰法發動機率增加1%，突擊戰法造成的傷害減少2%','突擊戰法發動機率增加2%，突擊戰法造成的傷害減少4%',[{rushRate:1,dmgRush:-2},{rushRate:2,dmgRush:-4}],{g2:true}),
    ]},
  {id:'陣立',sub:'防禦能力強化',col:'#c9973f',
    qi:[
      {n:'挫其銳氣',t:'施加控制狀態時，使目標造成傷害降低8%，持續2回合'},
      {n:'反討之計',t:'受到控制狀態時，有90%機率對敵軍單體造成一次傷害（傷害率85%，類型取決於武勇或智略較高一項），每場戰鬥觸發3次'},
      {n:'生生不息',t:'行動開始時，有40%的機率恢復兵力（治療率50%）'},
    ],
    zheng:[
      z('俊才','受到的兵刃傷害降低1%','受到的兵刃傷害降低2%',[{takenBlade:1},{takenBlade:2}]),
      z('才氣','受到的謀略傷害降低1.8%','受到的謀略傷害降低3.6%',[{takenStrat:1.8},{takenStrat:3.6}]),
      z('逆境','受到來自普通攻擊及突擊戰法的傷害降低3%','受到來自普通攻擊及突擊戰法的傷害降低6%',[{takenAtkRush:3},{takenAtkRush:6}]),
      z('不敵','受到來自主動戰法的傷害降低3.5%','受到來自主動戰法的傷害降低7%',[{takenAct:3.5},{takenAct:7}]),
      z('兵心','受到來自指揮及被動戰法的傷害降低3.5%','受到來自指揮及被動戰法的傷害降低7%',[{takenCmd:3.5},{takenCmd:7}]),
      z('恩顧','受到的治療提高4%','受到的治療提高8%',[{healIn:4},{healIn:8}]),
    ]},
  {id:'機略',sub:'戰法能力強化',col:'#8f6fc4',
    qi:[
      {n:'臨機應變',t:'發動需要準備的主動戰法時，有40%概率使自身獲得先攻狀態，持續1回合'},
      {n:'軍律擾亂',t:'施加控制狀態後，有60%機率降低目標8%統率和智略，持續2回合'},
      {n:'離間之計',t:'發動主動戰法後，獲得1.25%離反和攻心狀態，最多可疊加4次'},
    ],
    zheng:[
      z('神算','主動戰法造成傷害提高1.25%','主動戰法造成傷害提高2.5%',[{dmgAct:1.25},{dmgAct:2.5}]),
      z('鬼氣','造成的傷害提高1%','造成的傷害提高2%',[{dmg:1},{dmg:2}]),
      z('大勇','準備主動戰法傷害提高1.5%','準備主動戰法傷害提高3%',[{dmgPrep:1.5},{dmgPrep:3}]),
      z('早驅','首回合增加自身20點速度','首回合增加自身40點速度',[{spd1:20},{spd1:40}]),
      z('神祕','每回合行動前，使自身受到的兵刃或謀略傷害降低3%，持續1回合','每回合行動前，使自身受到的兵刃或謀略傷害降低6%，持續1回合',[{shield:3},{shield:6}],{g2:true}),
      z('多謀','造成的謀略傷害提高1%（受智略影響）','造成的謀略傷害提高2%（受智略影響）',[{dmgStrat:1},{dmgStrat:2}]),
    ]},
  {id:'臨戰',sub:'輔助能力強化',col:'#4fa58c',
    qi:[
      {n:'救援心得',t:'戰法治療我軍兵力最低單體時，使其受到的傷害降低6%，持續1回合'},
      {n:'達人大觀',t:'戰鬥第4回合，淨化友軍單體2個減益狀態'},
      {n:'掎手之策',t:'施加控制狀態時，有60%機率使目標受到的傷害提高8%，持續2回合'},
    ],
    zheng:[
      z('機動','自身速度增加10點','自身速度增加20點',[{spd:10},{spd:20}]),
      z('協同','隨機友軍單體造成的傷害提高1.5%','隨機友軍單體造成的傷害提高3%',[{ally:1.5},{ally:3}]),
      z('地利','增加自身1.5%規避','增加自身3%規避',[{evade:1.5},{evade:3}]),
      z('天時','造成及受到的傷害降低2%','造成及受到的傷害降低4%',[{dmg:-2,taken:2},{dmg:-4,taken:4}]),
      z('不惑','友軍單體受到控制狀態時，使其受到的傷害降低4.5%，持續1回合，每回合最多觸發一次','友軍單體受到控制狀態時，使其受到的傷害降低9%，持續1回合，每回合最多觸發一次',[{calm:4.5},{calm:9}],{g2:true}),
      z('明鏡','從第一回合開始，自身受到控制時，回復友軍單體（治療率25%），只生效2次','從第一回合開始，自身受到控制時，回復友軍單體（治療率50%），只生效2次',[{mirror:25},{mirror:50}],{g2:true}),
    ]},
];
export const dirOf=id=>DIRS.find(d=>d.id===id)||null;
export const BASE_TEXT='武將每進階1次，可使自身造成的傷害及治療提高2%，所受的傷害降低2%';

// sel = {d:'武略', q:'虛實自在', z:{剛力:2,…}}；回傳整理過、不超過點數上限的選擇
export function cleanSel(sel,r){
  const cap=capOf(r),d=dirOf(sel?.d);
  if(!cap||!d)return null;
  const o={d:d.id,q:d.qi.some(x=>x.n===sel.q)?sel.q:null,z:{}};
  let left=cap-(o.q?RULE.qiCost:0);
  if(left<0){o.q=null;left=cap}
  for(const n of d.zheng.map(x=>x.n)){const v=Math.max(0,Math.min(RULE.zMax,sel.z?.[n]|0,left));if(v){o.z[n]=v;left-=v}}
  return o;
}
export function pointsUsed(sel){if(!sel)return 0;return(sel.q?RULE.qiCost:0)+Object.values(sel.z||{}).reduce((a,v)=>a+v,0)}

// 戰鬥用：把選擇變成一包數值（engine.js 讀 g.bg）
export function compile(sel,r,red=0){
  const s=cleanSel(sel,r);if(!s)return null;
  const d=dirOf(s.d),fx={};
  const add=o=>{for(const[k,v]of Object.entries(o))fx[k]=(fx[k]||0)+v};
  add({dmg:RULE.perRed*red,heal:RULE.perRed*red,taken:RULE.perRed*red});
  for(const[n,lv]of Object.entries(s.z))add(d.zheng.find(x=>x.n===n).fx[lv-1]);
  return{d:s.d,q:s.q,fx};
}
// 一行摘要：「武略・虛實自在・剛力2 豪勇1」
export function summary(sel,r){
  const s=cleanSel(sel,r);if(!s)return'';
  return[s.d,s.q,Object.entries(s.z).map(([n,v])=>n+v).join(' ')].filter(Boolean).join('・');
}
