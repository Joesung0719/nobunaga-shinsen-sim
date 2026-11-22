// 玩家思路「先定位、再配點／兵學」：把 Joe 四隊的判斷順序寫成規則（2026-11-23）。瀏覽器與 node 都能用。
// 順序：①看這位武將的戰法組成（固有＋兩招＋兵種技）→ 定位（輸出／控制／補血／硬）→ ②配點 → ③兵學方向與「奇」節點。
// 規則全由戰法說明文字與能力判斷，不寫死人名；有疑義時回傳備選方向，不硬選。
import {TREES} from './bingaku.js';

const STATS=['武勇','智略','統率','速度'];
const rx={
  ctl:/封擊|威壓|麻痺|混亂|無法行動|無法普通攻擊|恐慌/,
  dot:/持續受到傷害|火傷|水攻|中毒|潰走|消沉|每回合持續/,
  heal:/治療率|恢復率|恢復[^，。]{0,10}兵力|回生|休養/,
  mit:/受到的傷害降低|傷害降低|傷害減少|鐵壁|免受傷害|兵力傷亡降低|傭兵|不屈/,
  hit:/自身每次受到[^，。]{0,6}傷害時|受到普通攻擊時|被打/,
};
const dmgTag=/兵刃|謀略|兵謀/;

// 武將 Lv50 的原始能力（成長制：基礎 + 成長×49），與遊戲分配頁的數字同量級；沒資料時用傳入的 st。
export function rawStats(D,n,st){
  const s=D.stats?.[n]?.st;if(!s)return st||{};
  const o={};for(const k of STATS){const v=s[k];o[k]=v?v[0]+v[1]*49:(st?.[k]||0)}
  return o;
}
const innOf=(D,n)=>D.stats?.[n]?.inn||D.innate?.[n]||'';

// 單一武將的戰法組成特徵。skills = 固有以外的戰法（含兵種技也可）；固有自動併入。
export function featuresOf(kit,D,n,skills){
  const all=[innOf(D,n),...skills].filter((s,i,a)=>s&&a.indexOf(s)===i);
  const f={dmg:0,heal:0,ctl:0,dot:0,mit:0,rush:0,buff:0,hit:0,act:0,cmdBing:false,votes:{武勇:0,智略:0,統率:0,速度:0},skills:all};
  for(const s of all){
    const T=D.skillText?.[s]||{},x=T.text||'',tags=T.tags||'',kind=T.kind||kit.kindOf(s);
    const isArm=kind==='兵種';
    const heal=(/治療/.test(tags)||rx.heal.test(x));
    const dmg=dmgTag.test(tags);
    if(dmg)f.dmg++;
    if(heal)f.heal+=isArm?.5:1;
    if(rx.ctl.test(x)&&!/免疫|解除|淨化/.test(x.split('，')[0]))f.ctl++;
    if(rx.dot.test(x))f.dot++;
    if(rx.mit.test(x))f.mit++;
    if(rx.hit.test(x))f.hit++;
    if(kind==='突擊')f.rush++;
    if(kind==='主動')f.act++;
    if(/增益/.test(tags)&&!dmg&&!heal)f.buff++;
    if(/兵謀/.test(tags)&&kind==='指揮')f.cmdBing=true;
    if(/增加[^，。]{0,6}(武勇|智略)/.test(x)&&/(兵刃|謀略)傷害時/.test(x))f.crossPump=true;   // 造成某類傷害就自己加另一屬性（文武雙全）：不用再分點
    for(const m of x.matchAll(/受(智略|統率|武勇|速度)影響/g))f.votes[m[1]]+=isArm?.5:1;
    if(!/受(智略|武勇)影響/.test(x)){if(/謀略傷害/.test(x))f.votes.智略+=.5;if(/兵刃傷害/.test(x))f.votes.武勇+=.5}
  }
  return f;
}

// 隊伍層級：其他隊友提供的減傷／保護數（鐵壁、傭兵、不屈…），用來判斷「整隊要不要拉存活」。
function teamMit(kit,D,team,n){
  if(!team)return 0;let m=0;
  for(const o of team.names||[]){if(o===n)continue;const sk=team.skillsOf?.[o]||[];m+=featuresOf(kit,D,o,sk).mit}
  return m;
}

// ②配點：回傳 {main,split?,pts,why}
export function planPoints(kit,D,n,skills,st,pool,team){
  const f=featuresOf(kit,D,n,skills),raw=rawStats(D,n,st);
  const top=k=>raw[k]||0,mx=Math.max(top('武勇'),top('智略'));
  let main,why;
  const vote=STATS.slice(0,3).map(k=>[k,f.votes[k]+(raw[k]||0)/1000]).sort((a,b)=>b[1]-a[1]);
  main=vote[0][0];
  if(f.mit>=2&&top('統率')>=.9*Math.max(top('武勇'),top('智略'),top('統率'))&&f.votes.統率>=f.votes.武勇){main='統率';why='防禦型：減傷／護盾類戰法多，統率不輸輸出屬性，點統率讓他更硬'}
  else if(f.votes.統率>f.votes.武勇&&f.votes.統率>f.votes.智略&&top('統率')>=.95*Math.max(top('武勇'),top('智略'),top('統率'))){main='統率';why='戰法效果（治療、減傷）多受統率影響且統率是最高屬性，點統率'}
  else if(f.cmdBing&&!f.crossPump&&Math.abs(top('武勇')-top('智略'))<=.15*mx){
    const h=Math.round(pool/2);return{main:'武勇',pts:{武勇:h,智略:pool-h},why:`指揮技是兵謀（同時造成兵刃與謀略傷害），武勇與智略接近，各點一半（${h}／${pool-h}）`}}
  else why=`戰法效果以${main}為主（說明文字「受${main}影響」與傷害類型），能力也相符，全點${main}`;
  return{main,pts:{[main]:pool},why};
}

// ③兵學方向（決策順序見 README／四隊口述）：補血≥2→臨戰；持續傷害／控制輸出→機略；減傷／反擊／被打型→陣立；突擊輸出→武略。
const DIRN={武略:'普通攻擊強化',陣立:'防禦能力強化',機略:'戰法能力強化',臨戰:'輔助能力強化'};
export function planBingaku(kit,D,n,skills,st,team){
  const f=featuresOf(kit,D,n,skills),raw=rawStats(D,n,st),tm=teamMit(kit,D,team,n);
  const topRaw=Math.max(raw.武勇||0,raw.智略||0,raw.統率||0);
  const tank=(raw.統率||0)>=Math.max(raw.武勇||0,raw.智略||0)*1.08?1:0;   // 統率明顯高於輸出屬性才算「硬」
  const sc={
    臨戰:1.5*Math.max(0,f.heal-.5)+(f.dmg===0?1:0)+(f.dmg===0&&f.buff?.3:0)-.3*f.dmg,
    機略:1.6*f.dot+.9*f.ctl,
    陣立:.3+f.mit+.5*tm+.8*tank+.4*f.hit,
    武略:f.rush*1.6*(f.rush&&f.dmg>=2?1:.6),
  };
  const rank=Object.entries(sc).sort((a,b)=>b[1]-a[1]);
  const dir=rank[0][0];
  // 奇節點
  const qis=(TREES[n]?.[dir]?.qi||[]).map(q=>q.n),has=x=>qis.includes(x);
  let qi=null,qiWhy='';
  if(dir==='機略'){if(f.dot&&has('詭計百出')){qi='詭計百出';qiWhy='持續性狀態傷害 +18%（戰法以持續傷害為主）'}else if(f.ctl&&has('軍律擾亂')){qi='軍律擾亂';qiWhy='施加控制後降低目標統率與智略（戰法能造成控制）'}}
  else if(dir==='臨戰'){if(f.heal>=1.5&&has('鼓舞奮迅')){qi='鼓舞奮迅';qiWhy='治療友軍時使其傷害提高（多招補血）'}else if(f.ctl&&has('掎手之策')){qi='掎手之策';qiWhy='施加控制時使目標受傷提高（戰法能造成封擊等控制）'}else if(f.heal>=1&&has('救援心得')){qi='救援心得';qiWhy='治療最低兵力友軍時使其減傷'}}
  else if(dir==='陣立'){if(f.hit&&has('先陣誘敵')){qi='先陣誘敵';qiWhy='前3回合提高被普攻機率，讓被打觸發型戰法（反擊）多發動'}else if(has('反討之計')){qi='反討之計';qiWhy='被控制時反擊一次'}else if(has('生生不息')){qi='生生不息';qiWhy='行動開始時有機率回血'}}
  else if(dir==='武略'){if(f.rush&&has('虛實自在')){qi='虛實自在';qiWhy='每回合有機率連擊，連擊多一次普攻就多一次突擊判定'}else if(f.rush&&has('兵勢連鎖')){qi='兵勢連鎖';qiWhy='突擊戰法傷害逐次提高'}}
  const REASON={臨戰:'補血／輔助戰法為主，兵學補強輔助效果',機略:'戰法以持續傷害或控制為主，兵學強化戰法效果',陣立:'減傷、護盾或被打觸發型戰法為主（或隊友提供護盾），兵學拉高存活',武略:'靠突擊輸出，兵學強化普攻與連擊'};
  const why=`定位：${[f.dot?`持續傷害 ${f.dot}`:'',f.ctl?`控制 ${f.ctl}`:'',f.heal?`補血 ${f.heal}`:'',f.mit?`減傷／護盾 ${f.mit}`:'',f.rush?`突擊 ${f.rush}`:'',f.dmg?`傷害戰法 ${f.dmg}`:''].filter(Boolean).join('、')||'輔助型'}${tm?`；隊友提供減傷 ${tm}`:''}`;
  return{dir,qi,qiWhy,why,reason:REASON[dir],alt:rank.slice(1,3).map(x=>x[0]),score:Object.fromEntries(rank.map(([k,v])=>[k,+v.toFixed(2)])),feat:f,sub:DIRN[dir]};
}
