// 戰役平衡自動模擬（不開瀏覽器）：用 slg/ 的同一套戰鬥引擎、劇本與戰役數值，
// 由電腦代替玩家從第 1 關打到關原，統計各關勝率、等級、銀與商店購買。
// 用法：node tools/campaign-sim.mjs [跑幾輪=40] [玩家策略=gear|recruit|none] [主角兵種=騎]
//       node tools/campaign-sim.mjs stage <關卡序 0 起> <主角等級> [輪數] [夥伴1,夥伴2]   單關勝率
// 地圖規則照 game.js：每格一隊、移動／射程、敵軍 AI（hold/guard/advance）、豪雨、事件、隱藏條件與評價。
// 玩家 AI：每隊先試算每個可攻擊目標（複製兩隊模擬 3 次），期望值划算或是勝利目標才打；大將（lord）不主動衝前。
import fs from 'node:fs';
import {battle,parseSkill,statsAt,innateOf,fullRedStats,bestArm} from '../slg/engine.js';
import * as C from '../slg/campaign.js';
import {SCENARIOS} from '../slg/scenarios.js';

const D=JSON.parse(fs.readFileSync(new URL('../land.json',import.meta.url)));
const CARDS=JSON.parse(fs.readFileSync(new URL('../data.json',import.meta.url)));
const ROSTER=new Map();
for(const c of CARDS)ROSTER.set(c.n,{n:c.n,r:c.r});
for(const n of Object.keys(D.stats))ROSTER.set(n,Object.assign({n,r:5},ROSTER.get(n)));
for(const t of Object.values(D.teams))for(const g of t)if(!ROSTER.has(g.n))ROSTER.set(g.n,{n:g.n,r:g.r});
const INNATE=new Set([...Object.values(D.innate),...Object.values(D.stats).map(x=>x.inn).filter(Boolean)]);
const PSK=new Map();const ps=n=>{if(!PSK.has(n))PSK.set(n,parseSkill(n,D));return PSK.get(n)};
const GOOD=Object.keys(D.skillText).filter(n=>!INNATE.has(n)&&ps(n).modeled==='text'&&['主動','突擊','指揮','被動'].includes(ps(n).kind));
const fixedSkills=n=>{const h=[...n].reduce((a,c)=>(a*31+c.codePointAt(0))>>>0,7);return[GOOD[h%GOOD.length],GOOD[(h>>>7)%GOOD.length]]};
const MOVE={騎:3,器械:1},RANGE={弓:2,鐵炮:2},W=7,H=9;
const RANKV={S:4,A:3,B:2,C:1};

const team=(arm,gens,side)=>({name:gens[0].n+'隊',side,arm,terrain:'平',
  gens:gens.map(g=>({n:g.n,f:'',st:{...g.st},troops:g.t,max:g.t,skills:[innateOf(D,g.n),...g.s].filter(Boolean).map(ps),bg:null}))});
const armOfUnit=u=>bestArm(D,u.gens)||u.arm;
function mkUnit(u,id,ctx){
  const arm=armOfUnit(u),lv=u.side===0?ctx.lvA:ctx.lvB,m=u.side===0?C.gearMul(ctx.h):null;
  return{id,side:u.side,key:u.key,x:u.x,y:u.y,ai:u.ai,anchor:u.anchor||(u.ai==='guard'?[u.x,u.y]:undefined),r:u.r,lord:u.lord,target:u.target,onRainEnd:u.onRainEnd,
    team:team(arm,u.gens.map(n=>{let st=fullRedStats(D,n,u.gens,arm,lv);if(m)st=Object.fromEntries(Object.entries(st).map(([k,v])=>[k,v*(m[k]||1)]));
      return{n,s:u.s?.[n]||fixedSkills(n),t:u.t+(u.side===0?1000*ctx.h.shop.supply:0),st}}),u.side)};
}
function compStats(n,h){
  const r=ROSTER.get(n)?.r||4,m=C.gearMul(h);
  const st=D.stats[n]?fullRedStats(D,n,[n],h.arm,h.lv):statsAt(D,n,h.lv,r);
  return Object.fromEntries(Object.entries(st).map(([k,v])=>[k,v*(m[k]||1)]));
}
const mkHero=(h,id,x,y)=>({id,side:0,key:'hero',hero:true,x,y,team:team(h.arm,[
  {n:h.name,s:fixedSkills(h.name),t:C.heroTroops(h),st:C.heroStats(h)},
  ...h.party.slice(0,C.PARTY_MAX).map(n=>({n,s:fixedSkills(n),t:Math.round(C.heroTroops(h)*.8),st:compStats(n,h)}))],0)});

const alive=u=>u.team.gens[0].troops>0;
const total=t=>t.gens.reduce((a,g)=>a+Math.max(0,g.troops),0);
const totalMax=t=>t.gens.reduce((a,g)=>a+g.max,0);
const dist=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const clone=t=>({...t,gens:t.gens.map(g=>({...g,st:{...g.st}}))});

function play(sc,ctx,carries,ai={}){
  const bold=ai.bold;
  let id=0;
  const units=sc.units.map(u=>{let t=u.t;for(const c of carries)if(c.troops&&u.side===c.troops.side&&(!c.troops.keys||c.troops.keys.includes(u.key)))t=Math.round(t*(1+c.troops.pct));return mkUnit({...u,t},id++,ctx)});
  {const base=units.find(u=>u.side===0&&u.lord)||units.find(u=>u.side===0);
   const free=(x,y)=>x>=0&&y>=0&&x<W&&y<H&&!units.some(o=>o.x===x&&o.y===y);
   const spot=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[2,0],[-2,0],[0,2]].map(([a,b])=>[base.x+a,base.y+b]).find(([a,b])=>free(a,b))||[base.x,base.y];
   units.push(mkHero(ctx.h,id++,spot[0],spot[1]))}
  const G={units,buffs:carries.filter(c=>c.buff).map(c=>c.buff),fired:new Set(),day:1,st:{killDay:0,killRain:false,finisher:null,routed:[],foeRouted:[],hitBy:{},said:new Set()},over:null,heroBattles:0};
  const unitAt=(x,y)=>G.units.find(u=>u.x===x&&u.y===y&&alive(u));
  const raining=()=>sc.rain&&G.day>=sc.rain[0]&&G.day<=sc.rain[1];
  const mv=u=>MOVE[u.team.arm]||2,rg=u=>RANGE[u.team.arm]||1;
  function reach(u){
    const out=new Map([[u.x+','+u.y,0]]),q=[[u.x,u.y,0]];
    while(q.length){q.sort((a,b)=>a[2]-b[2]);const[x,y,c]=q.shift();
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=W||ny>=H)continue;const nc=c+1;if(nc>mv(u))continue;
        const o=unitAt(nx,ny);if(o&&o.side!==u.side)continue;const k=nx+','+ny;if(out.has(k)&&out.get(k)<=nc)continue;out.set(k,nc);q.push([nx,ny,nc])}}
    for(const k of[...out.keys()]){const[x,y]=k.split(',').map(Number);const o=unitAt(x,y);if(o&&o!==u)out.delete(k)}
    return out;
  }
  const targets=(u,from=u)=>G.units.filter(o=>alive(o)&&o.side!==u.side&&dist(from,o)<=rg(u));
  const mulFor=a=>{const charm=a.side===0&&G.units.some(u=>u.hero&&alive(u))?C.charmDmg(ctx.h):1;
    return charm*(raining()&&a.side===0?sc.surprise:1)*G.buffs.filter(b=>b.side===a.side&&G.day>=b.days[0]&&G.day<=b.days[1]&&(!b.arm||b.arm===a.team.arm)).reduce((m,b)=>m*b.dmg,1)};
  function runEvents(on){
    for(const ev of sc.events||[]){
      const eid=ev.id||JSON.stringify([ev.day,ev.on]);
      if(G.fired.has(eid)||(on==='day'?ev.day!==G.day:ev.on!==on))continue;
      G.fired.add(eid);
      for(const d of ev.spawn||[]){const free=(x,y)=>x>=0&&y>=0&&x<W&&y<H&&!unitAt(x,y);let[x,y]=[d.x,d.y];
        if(!free(x,y)){const c=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1],[2,0],[-2,0],[0,2],[0,-2]].map(([a,b])=>[d.x+a,d.y+b]).find(([a,b])=>free(a,b));if(c)[x,y]=c}
        G.units.push(mkUnit({...d,x,y},Math.max(...G.units.map(u=>u.id))+1,ctx))}
      for(const[k,v]of Object.entries(ev.ai||{}))for(const u of G.units)if(u.key===k&&alive(u)){Object.assign(u,v);if(u.ai==='guard'&&!u.anchor)u.anchor=[u.x,u.y]}
      if(ev.buff)G.buffs.push(ev.buff);
      if(ev.heal)for(const u of G.units)if(u.side===ev.heal.side&&alive(u))for(const g of u.team.gens)if(g.troops>0)g.troops=Math.min(g.max,g.troops+Math.round(g.max*ev.heal.pct));
    }
  }
  function fight(a,d){
    a.team.mods={dmg:mulFor(a)};d.team.mods=null;
    if(a.hero||d.hero)G.heroBattles++;
    battle(a.team,d.team);
    if(process.env.TRACE)console.log(`D${G.day} ${a.team.name}(${a.x},${a.y}) → ${d.team.name}(${d.x},${d.y})  ${total(a.team)} / ${total(d.team)}`);
    const st=G.st;
    if(a.side===0&&d.key)st.hitBy[d.key]=(st.hitBy[d.key]||0)+1;
    for(const u of[a,d])if(!alive(u)){
      if(u.target&&!st.killDay){st.killDay=G.day;st.killRain=!!raining();st.finisher=(u===d?a:d).key}
      if(u.side===0&&u.key&&!st.routed.includes(u.key))st.routed.push(u.key);
      if(u.side===1&&u.key&&!st.foeRouted.includes(u.key))st.foeRouted.push(u.key);
    }
    a.acted=true;check();
    if(!G.over)for(const u of[a,d])if(!alive(u)&&u.key)runEvents('rout:'+u.key);
  }
  const left=s=>G.units.filter(u=>u.side===s&&alive(u)).length;
  function check(){
    if(G.over)return;
    const lordDown=G.units.some(u=>u.lord&&!alive(u)),timeUp=G.day>sc.days;
    const win=G.units.some(u=>u.target&&!alive(u))||(sc.annihilate&&!left(1))||(sc.survive&&timeUp&&!lordDown&&left(0)>0);
    const lose=!win&&(lordDown||!left(0)||timeUp);
    if(win&&!G.st.killDay)G.st.killDay=sc.survive&&timeUp?sc.days:G.day;
    if(win)G.over='W';else if(lose)G.over=lordDown?'Llord':!left(0)?'Lall':'Ltime';
  }
  // 玩家試算：期望（打掉的敵兵 − 自己損失），擊破目標另加分
  function evalAtk(a,d){
    let s=0;const N=3;
    for(let k=0;k<N;k++){const A=clone(a.team),B=clone(d.team);A.mods={dmg:mulFor(a)};B.mods=null;
      const b0=total(B),a0=total(A);battle(A,B);
      let v=(b0-total(B))-(a0-total(A))*(a.lord&&!bold?1.6:1.1);
      if(B.gens[0].troops<=0)v+=d.target?1e6:3000;
      if(A.gens[0].troops<=0)v-=a.lord?(bold?3e4:1e6):4000;
      s+=v}
    return s/N;
  }
  function playerTurn(){
    const mine=()=>G.units.filter(u=>u.side===0&&alive(u)&&!u.acted);
    // 非大將先動、大將最後
    for(const u of mine().sort((a,b)=>(a.lord?1:0)-(b.lord?1:0))){
      if(G.over)return;if(!alive(u))continue;
      const R=reach(u);let best=null;
      for(const k of R.keys()){const[x,y]=k.split(',').map(Number);const ox=u.x,oy=u.y;u.x=x;u.y=y;
        for(const o of targets(u)){const v=evalAtk(u,o);if(!best||v>best.v)best={x,y,o,v}}
        u.x=ox;u.y=oy}
      const thr=u.lord&&!bold?0:-0.12*total(u.team);
      if(best&&(best.v>thr||best.o.target&&best.v>-0.3*total(u.team))){u.x=best.x;u.y=best.y;fight(u,best.o);continue}
      // 不打：往勝利目標（全滅關則最近的敵軍）前進；大將跟在後面，離不會動的敵軍以外的敵人至少 2 格
      const foes=G.units.filter(o=>o.side===1&&alive(o));if(!foes.length)break;
      const goal=foes.find(o=>o.target)||[...foes].sort((a,b)=>dist(a,u)-dist(b,u))[0];
      const lordU=G.units.find(o=>o.lord&&alive(o));
      // 下回合可能打到這格的敵軍數（雨天不動、hold 不動、guard 只在 anchor 附近）
      const threat=(x,y)=>foes.filter(o=>{if(raining()||o.ai==='hold')return dist({x,y},o)<=rg(o);
        if(o.ai==='guard')return dist({x,y},{x:o.anchor[0],y:o.anchor[1]})<=o.r+rg(o);return dist({x,y},o)<=mv(o)+rg(o)}).length;
      let bk=null;
      for(const k of R.keys()){const[x,y]=k.split(',').map(Number);let d;
        if(u.lord&&!bold)d=threat(x,y)*100+(sc.survive?-Math.min(...foes.map(o=>dist({x,y},o))):dist({x,y},goal));
        else if(sc.survive&&lordU){const near=[...foes].sort((a,b)=>dist(a,lordU)-dist(b,lordU))[0];d=dist({x,y},near)+dist({x,y},lordU)*.5}
        else d=dist({x,y},goal);
        if(!bk||d<bk.d)bk={x,y,d}}
      u.x=bk.x;u.y=bk.y;u.acted=true;
    }
  }
  function aiTurn(){
    for(const u of G.units.filter(u=>u.side===1&&alive(u))){
      if(G.over)return;if(!alive(u))continue;
      const stay=u.ai==='hold'||raining();
      let R=stay?new Map([[u.x+','+u.y,0]]):reach(u);
      if(u.ai==='guard'&&!stay)R=new Map([...R].filter(([k])=>{const[x,y]=k.split(',').map(Number);return dist({x,y},{x:u.anchor[0],y:u.anchor[1]})<=u.r}));
      let best=null;
      for(const k of R.keys()){const[x,y]=k.split(',').map(Number);
        for(const o of targets(u,{x,y})){const s=-total(o.team)/totalMax(o.team)*10000-total(o.team);if(!best||s>best.s)best={x,y,o,s}}}
      if(best){u.x=best.x;u.y=best.y;fight(u,best.o);continue}
      if(stay||u.ai==='guard')continue;
      const foes=G.units.filter(o=>o.side===0&&alive(o));if(!foes.length)return;
      let bk=null;for(const k of R.keys()){const[x,y]=k.split(',').map(Number);const d=Math.min(...foes.map(o=>dist({x,y},o)));if(!bk||d<bk.d)bk={x,y,d}}
      u.x=bk.x;u.y=bk.y;
    }
  }
  runEvents('day');
  while(!G.over){
    for(const u of G.units)u.acted=false;
    playerTurn();if(G.over)break;
    aiTurn();if(G.over)break;
    const wasRain=raining();G.day++;
    if(!raining()&&wasRain)for(const u of G.units)if(u.onRainEnd&&alive(u)){Object.assign(u,u.onRainEnd);if(u.ai==='guard'&&!u.anchor)u.anchor=[u.x,u.y]}
    check();if(G.over)break;
    runEvents('day');
  }
  const win=G.over==='W';
  let rank=null;
  if(win){const n=(sc.hidden||[]).filter(h=>h.test(G.st)).length;rank=(sc.rank||[]).find(r=>n>=r.n)?.rank||'C'}
  const foes=G.units.filter(u=>u.side===1&&!alive(u)).length;
  const hero=G.units.find(u=>u.hero);
  return{win,why:G.over,rank,day:G.day,foes,heroAlive:alive(hero),heroBattles:G.heroBattles};
}

const SCN=Object.fromEntries(SCENARIOS.map(s=>[s.id,s]));
// 對話選擇數：每關 pre/post 的選擇點，玩家都選自己的傾向（沒有就選第一項）
function choicePts(id,lean){let p=0;const sc=C.SCENES[id];for(const ln of[...(sc?.pre||[]),...(sc?.post||[])])if(ln.choose){const o=ln.choose.find(o=>o.a===lean)||ln.choose[0];if(o.a===lean)p+=o.pts||1}return p}
const starOf=n=>ROSTER.get(n)?.r||3;

export function runCampaign({policy='gear',arm='騎',lean='武',party=['織田信雄','筒井順慶'],side='u',maxTry=5}={}){
  const h=C.newHero({name:'測試',arm,lean,party});
  const camp={};const log=[];
  for(let i=0;i<C.CHAIN.length;i++){
    const c=C.CHAIN[i];if(c.finale){C.addExp(h,C.stageExp(i,'A'));h.silver+=C.stageSilver(i,'A',0);break}
    const id=c.ids.length>1?(side==='u'?c.ids[0]:c.ids[1]):c.ids[0],sc=SCN[id];
    // 配點：全部加在傾向
    h.pts[lean]+=h.free;h.free=0;
    // 夥伴：名簿裡挑最高星的兩位
    h.party=[...h.roster].sort((a,b)=>starOf(b)-starOf(a)).slice(0,C.PARTY_MAX);
    // 購物
    shop(h,policy,i);
    const carries=(sc.carry||[]).filter(cc=>(RANKV[camp[cc.from]]||0)>=RANKV[cc.min||'B']);
    const lv0=h.lv,silver0=h.silver;
    let r,tries=0;
    // 開場對話先加點（pre），勝利後才有 post；這裡簡化成第一次出陣時一起加
    h.pts[lean]+=choicePts(id,lean);
    do{tries++;r=play(sc,{h,lvA:h.lv,lvB:C.enemyLv(i)},carries,{bold:tries%2===0});
      if(!r.win)log.push({i,id,lv:h.lv,try:tries,lose:r.why})}while(!r.win&&tries<maxTry);
    if(!r.win){log.push({i,id,stuck:true,lv:h.lv});return{h,log,stuck:i}}
    camp[id]=camp[id]&&RANKV[camp[id]]>=RANKV[r.rank]?camp[id]:r.rank;
    C.addExp(h,C.stageExp(i,r.rank)+C.routExp(i)*r.foes);
    h.silver+=C.stageSilver(i,r.rank,r.foes);
    const open=C.SHOP.filter(it=>h.shop[it.k]<it.max);h.sale=open.length?open[Math.floor(Math.random()*open.length)].k:null;
    if(C.JOIN[id]&&!h.roster.includes(C.JOIN[id]))h.roster.push(C.JOIN[id]);
    // 盜賊（60%）：打贏拿經驗與銀
    if(Math.random()<.6){
      h.pts[lean]+=h.free;h.free=0;
      const b=play(C.banditScenario(i,h),{h,lvA:h.lv,lvB:C.enemyLv(i)},[]);
      if(b.win){C.addExp(h,C.banditExp(i));h.silver+=C.banditSilver(i)}else h.silver-=Math.round(h.silver*.05);
      log.push({i,bandit:b.win});
    }
    log.push({i,id,lv:lv0,lvB:C.enemyLv(i),tries,rank:r.rank,day:r.day,days:sc.days,silverIn:h.silver-silver0,silver:h.silver,shop:{...h.shop},party:[...h.party],hero:r.heroAlive});
  }
  return{h,log,stuck:null};
}
function shop(h,policy,i){
  if(policy==='none')return;
  const avail=C.RECRUIT.filter(([n,at])=>at<i&&!h.roster.includes(n));
  const non5=h.party.filter(n=>starOf(n)<5).length;
  if(policy==='recruit'){   // 先存錢招募 5★（同隊還有非 5★ 時），招滿兩位才買裝備
    let need=non5;while(avail.length&&need&&h.silver>=C.recruitPrice(h)){const[n]=avail.shift();h.silver-=C.recruitPrice(h);h.roster.push(n);h.party=[...h.roster].sort((a,b)=>starOf(b)-starOf(a)).slice(0,2);need--;h.recruits=(h.recruits||[]).concat(i)}
    if(need&&C.RECRUIT.some(([n,at])=>at<i+2&&!h.roster.includes(n)))return}
  for(;;){const its=C.SHOP.filter(it=>h.shop[it.k]<it.max).map(it=>({it,p:C.price(h,it)})).filter(x=>x.p<=h.silver).sort((a,b)=>a.p-b.p);
    if(!its.length)break;h.silver-=its[0].p;h.shop[its[0].it.k]++}
}
// 單關勝率：主角 lv 級、配點全在傾向（等級−1＋每關約 3 點對話），商店各項 shopLv 級。兩種玩家打法各跑 n 場，取較好的一種
export function stageWin(i,lv,n=40,{arm='騎',lean='武',party=['織田信雄','筒井順慶'],ptsLean=null,shopLv=0,lvB=null}={}){
  const h=C.newHero({name:'測試',arm,lean,party});h.lv=lv;h.pts[lean]+=ptsLean??(lv-1+3*i);
  for(const k in h.shop)h.shop[k]=Math.min(k==='supply'?10:5,shopLv);
  const id=C.CHAIN[i].ids[0],sc=SCN[id];let best=null;
  for(const bold of[false,true]){let w=0;const why={},ranks={};
    for(let k=0;k<n;k++){const r=play(sc,{h,lvA:lv,lvB:lvB??C.enemyLv(i)},[],{bold});if(r.win){w++;ranks[r.rank]=(ranks[r.rank]||0)+1}else why[r.why]=(why[r.why]||0)+1}
    if(!best||w>best.w)best={w,why,ranks,bold}}
  return{id,name:sc.name,lv,lvB:lvB??C.enemyLv(i),win:best.w/n,why:best.why,ranks:best.ranks,bold:best.bold};
}

if(import.meta.url===`file://${process.argv[1]}`){
  const a=process.argv.slice(2);
  if(a[0]==='stage'){
    const i=+a[1],lv=+a[2],n=+(a[3]||40),party=a[4]?a[4].split(','):undefined;
    console.log(JSON.stringify(stageWin(i,lv,n,{party})));
  }else if(a[0]==='stages'){
    // 每關在「預期等級」下的勝率（不買東西、起始夥伴）
    const n=+(a[1]||30),shopLv=+(a[2]||0);
    const offs=(a[3]||'-3,0,3,6').split(',').map(Number);
    console.log(`關\t名稱\t敵Lv\t`+offs.map(o=>`主角${o>=0?'+':''}${o}`).join('\t'));
    for(let i=0;i<C.CHAIN.length-1;i++){const rs=offs.map(o=>stageWin(i,Math.max(1,Math.min(50,C.LV_AT[i]+o)),n,{shopLv}));
      console.log(`${i+1}\t${rs[0].name}\tLv${rs[0].lvB}\t`+rs.map(r=>`${(r.win*100).toFixed(0)}%${r.bold?'*':''}`).join('\t')+`\t${JSON.stringify(rs[1].why)}`)}
  }else{
    const n=+(a[0]||40),policy=a[1]||'gear',arm=a[2]||'騎';
    const rows=Array.from({length:C.CHAIN.length},()=>({tries:0,lv:0,silver:0,in:0,n:0,ranks:{}}));let stuck={},clear=0,finalLv=0;
    const rec=[];
    for(let k=0;k<n;k++){const r=runCampaign({policy,arm});rec.push(r.h.recruits||[]);
      if(r.stuck!=null)stuck[r.stuck]=(stuck[r.stuck]||0)+1;else{clear++;finalLv+=r.h.lv}
      for(const x of r.log)if(x.tries){const o=rows[x.i];o.n++;o.tries+=x.tries;o.lv+=x.lv;o.silver+=x.silver;o.in+=x.silverIn;o.ranks[x.rank]=(o.ranks[x.rank]||0)+1}}
    console.log(`策略 ${policy}，主角 ${arm}，${n} 輪：通關 ${clear}，卡關 ${JSON.stringify(stuck)}，通關時平均 Lv${(finalLv/Math.max(1,clear)).toFixed(1)}`);
    if(policy==='recruit')console.log('招募 5★ 的關卡（0 起）：',rec.slice(0,8).map(x=>x.join(',')).join(' | '));
    rows.forEach((o,i)=>{if(!o.n)return;const id=C.CHAIN[i].ids[0];console.log(`${i+1}\t${SCN[id].name}\t開場 Lv${(o.lv/o.n).toFixed(1)}（敵 Lv${C.enemyLv(i)}）\t平均嘗試 ${(o.tries/o.n).toFixed(2)} 次\t收入 ${Math.round(o.in/o.n)}\t結餘 ${Math.round(o.silver/o.n)}\t${JSON.stringify(o.ranks)}`)});
  }
}
