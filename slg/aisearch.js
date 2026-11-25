// AI 配隊搜尋（2026-11-24 重做）：瀏覽器主執行緒、Web Worker、node 都能用。
//
// Joe 2026-11-24 的四點：①一百多位金將卻每次都是同幾位 ②兵種亂配（今川義元「弓兵大將」被改成鐵炮）
// ③太愛用合盟之陣、幾乎不用同勢力 ④兵種等級加成只能算一次（阿市「炮術II」顯示兩次）。
// 新做法：
//  · 先把 Cost 內「所有」三人組列出來，分成 同勢力／三勢力皆不同（可合盟）／兩勢力混搭 三層，每層各有配額，
//    層內再做「覆蓋取樣」：每位金將出現的次數盡量一樣多（沒有人被漏掉），不是均勻亂抽（亂抽時同勢力三人組極少）。
//  · 粗篩→逐輪加場淘汰（每層各自保留前段，同勢力不會在第一輪就被合盟隊擠掉）→鄰近搜尋（換掉一人，含同勢力補位）→最後獨立重打。
//  · 兵種只在「特性給的兵種」裡選：大將有「X兵大將」就用那個兵種；否則用全隊特性兵種等級最高的（同分才比模擬）；全隊都沒有兵種特性才四種都試。
//  · 結果分開列：整體最佳、同勢力最佳、合盟最佳、盲點隊（官方編制與戰報很少出現的武將），兩條路線並排比，不再只給同幾位。
//  · 戰鬥很耗時，主執行緒把工作切給多個 Worker 平行跑（slg/aiworker.js），每隊固定給同一個 Worker，建好的隊伍可快取。
import {battle,statsAt,fullRedStats,traitBattle,innateOf,MAX_SKILL_LV} from './engine.js?v=60';
import {adviseBingaku} from './advisor.js?v=4';
import {compile as bgCompile} from './bingaku.js?v=10';

import {ARMS,armTraits,chooseArm,FAC_FULL} from './rules.js?v=2';
export const AI_ARMS=ARMS;
const clone=o=>typeof structuredClone==='function'?structuredClone(o):JSON.parse(JSON.stringify(o));
export {armTraits};
// 這一隊可以用的兵種（names[0]＝大將）：規則在 slg/rules.js chooseArm（和一鍵推薦、對手、劇本同一套）
export const allowedArms=chooseArm;
export function makeAI(D,KIT,{rOf=n=>D.stats?.[n]?.r||5,fac=FAC_FULL,banditSk={}}={}){
  const cache=new Map();
  // 我方 AI 隊：Lv50、紅度 red、戰法依組隊建議補滿（須通過搭配品質檢查）、戰法 Lv10、兵學依建議配滿、每人 1 萬兵
  function buildMe(names,arm,red,tr=10000){
    const k=names.join('|')+'|'+arm+'|'+red;if(cache.has(k))return cache.get(k);
    let t=null;
    try{
      const rd=Object.fromEntries(names.map(n=>[n,red]));
      const stt=names.map(n=>({n,red,st:fullRedStats(D,n,names,arm,50,rd,fac)}));
      const pl=KIT.pick(stt,names.map(()=>[]),{},{arm}),q=KIT.quality(stt,pl.sel,arm);
      // 品質檢查只擋「戰法根本不會生效」的硬傷；220、成員兵種特性對不上、勢力混搭、主動偏多是經驗提醒（teamlib check 的 note），交給模擬勝率判斷
      if(q.ok){
        const tb=traitBattle(D,names,rd),so=Object.fromEntries(names.map((n,j)=>[n,[innateOf(D,n),...pl.sel[j]].filter(Boolean)]));
        t={name:names[0],side:0,arm,terrain:'平',gens:names.map((n,i)=>{const sk=so[n];let bg=null;
          try{const b=adviseBingaku(KIT,D,n,rOf(n),sk,stt[i].st,{names,skillsOf:so});bg=b?bgCompile(b.sel,rOf(n),red,n):null}catch{}
          return{n,tr:tb[i].tr,trTm:tb[i].tm,tcIn:tb[i].tc,f:D.stats?.[n]?.f,st:stt[i].st,troops:tr,max:tr,skills:sk.map(x=>KIT.ps(x,MAX_SKILL_LV)),bg}}),sel:pl.sel};
      }
    }catch{t=null}
    cache.set(k,t);return t;
  }
  const armOfG=k=>D.reports?.find(r=>r.t===k&&r.ty)?.ty||'騎';
  function garrison(k,L){const t=D.teams[k];   // 守軍戰法等級沒有資料，用滿級
    return{name:t[2].n+'隊',side:1,arm:armOfG(k),terrain:'城',key:k,gens:[t[2],t[0],t[1]].map(g=>({n:g.n,st:statsAt(D,g.n,L.glv,g.r),troops:L.per,max:L.per,skills:(L.bandit&&banditSk[g.n]||g.s).map(x=>KIT.ps(x)),bg:null}))}}
  const sumT=t=>t.gens.reduce((a,g)=>a+Math.max(0,g.troops),0),sumM=t=>t.gens.reduce((a,g)=>a+g.max,0);
  // target：{tgt:'land', L:等級資料, keys:[守軍隊代號]} 或 {tgt:'opp', team:已建好的對手隊}
  function oneTry(me,target,R=Math.random){
    if(target.tgt==='land'){const w=target.L.waves||1,ks=[...target.keys].sort(()=>R()-.5).slice(0,w);
      for(const k of ks){const r=battle(me,garrison(k,target.L),R);if(r.res!=='W')return{r:r.res,left:sumT(me)/sumM(me)}}
      return{r:'W',left:sumT(me)/sumM(me)}}
    const r=battle(me,clone(target.team),R);return{r:r.res,left:sumT(me)/sumM(me)};
  }
  // 一份工作：{key,names,arm,k}；回 {key,ok,w,d,n,lf}
  function evalJob(j,target,red){
    const t=buildMe(j.names,j.arm,red);if(!t)return{key:j.key,ok:false,w:0,d:0,n:0,lf:0};
    let w=0,d=0,lf=0;for(let i=0;i<j.k;i++){const r=oneTry(clone(t),target);if(r.r==='W'){w++;lf+=r.left}else if(r.r==='D')d++}
    return{key:j.key,ok:true,w,d,n:j.k,lf};
  }
  return{buildMe,garrison,oneTry,evalJob,armOfG};
}

// ---- 搜尋流程（主執行緒）----
// run(jobs) → Promise<結果陣列>：由呼叫端提供（Worker 池或同步後備）。
export async function aiSearch({D,KIT,pool,locked=[],cap,costOf,run,say=()=>{},popular={},budget=1800}){
  const facT=ns=>KIT.facType(ns.map(n=>({n})));
  const costOk=ns=>ns.reduce((a,n)=>a+costOf(n),0)<=cap&&new Set(ns).size===3;
  const free=pool.filter(n=>!locked.includes(n));
  const ents=new Map();
  const ent=(ns0,arm,keep)=>{const ns=keep?ns0:KIT.leaderFirst(ns0),aa=allowedArms(D,ns);arm=arm||aa.arms[0];if(!aa.arms.includes(arm))return null;
    const k=ns.join('|')+'|'+arm;let e=ents.get(k);if(!e){e={key:k,names:ns,arm,armWhy:aa.why,arms:aa.arms,type:facT(ns),w:0,d:0,n:0,lf:0,ok:true};ents.set(k,e)}return e};
  const sc=e=>e.n?(e.w+e.d/2)/e.n+.05*(e.w?e.lf/e.w:0):-1;
  const okE=a=>a.filter(e=>e&&e.ok);
  const best=(arr,k)=>okE(arr).sort((a,b)=>sc(b)-sc(a)||b.n-a.n).slice(0,k);
  let battles=0;
  async function play(list,k,label){
    list=okE([...new Set(list)]);if(!list.length)return;
    const res=await run(list.map(e=>({key:e.key,names:e.names,arm:e.arm,k})),(done,all)=>say(`${label} ${done}/${all} 隊…`));
    const by=new Map(list.map(e=>[e.key,e]));
    for(const r of res){const e=by.get(r.key);if(!e)continue;if(!r.ok){e.ok=false;continue}e.w+=r.w;e.d+=r.d;e.n+=r.n;e.lf+=r.lf;battles+=r.n}
  }
  // 階段 0：列出 Cost 內所有三人組，分層＋覆蓋取樣
  say('列出所有可能的三人組…');
  const all=[];
  if(locked.length===2){for(const x of free)all.push([...locked,x])}
  else if(locked.length===1){for(let i=0;i<free.length;i++)for(let j=i+1;j<free.length;j++)all.push([locked[0],free[i],free[j]])}
  else{for(let i=0;i<free.length;i++)for(let j=i+1;j<free.length;j++)for(let k=j+1;k<free.length;k++)all.push([free[i],free[j],free[k]])}
  const valid=all.filter(costOk);
  const strata={same:[],alliance:[],mixed:[]};for(const ns of valid)strata[facT(ns)].push(ns);
  const quota={same:.4,alliance:.4,mixed:.2};   // 同勢力與合盟各四成（公平比較），混搭兩成
  const seeds=[];
  for(const[ty,arr]of Object.entries(strata)){
    const want=Math.min(arr.length,Math.round(budget*quota[ty]));
    if(arr.length<=want){seeds.push(...arr);continue}
    // 覆蓋取樣：每輪門檻 t，三人用量都 < t 才收；門檻逐步放寬 → 每位武將出現次數接近
    const sh=[...arr].sort(()=>Math.random()-.5),use={},got=new Set();let t=1;
    while(got.size<want&&t<500){for(let i=0;i<sh.length&&got.size<want;i++){if(got.has(i))continue;const ns=sh[i],fr=ns.filter(n=>!locked.includes(n));if(fr.every(n=>(use[n]||0)<t)){got.add(i);fr.forEach(n=>use[n]=(use[n]||0)+1)}}t++}
    for(const i of got)seeds.push(sh[i]);
  }
  // 少了某層的配額就由別層補（例如指定兩位不同勢力 → 不可能同勢力）
  const cand=okE(seeds.map(ns=>ent(ns)));
  // 階段 1：粗篩，每隊 4 場
  await play(cand,4,'粗篩');
  const covered=new Set(okE(cand).filter(e=>e.n>0).flatMap(e=>e.names).filter(n=>!locked.includes(n)));
  // 階段 2：每層各取前 25%（至少 30 隊）加 8 場
  const layer=(arr,ty,k)=>best(arr.filter(e=>e.type===ty),k);
  let r2=[];for(const ty of['same','alliance','mixed']){const a=okE(cand).filter(e=>e.type===ty);r2.push(...layer(a,ty,Math.max(30,Math.ceil(a.length/4))))}
  await play(r2,8,'第二輪');
  // 階段 3：鄰近搜尋：整體前 6 名＋每層前 3 名，各位置換掉一人（候選：隨機 25 位＋與另兩人同勢力者）
  say('鄰近搜尋…');
  const anchors=[...new Set([...best(r2,6),...['same','alliance','mixed'].flatMap(ty=>layer(r2,ty,3))])];
  const nb=[];
  for(const e of anchors)for(let i=0;i<3;i++){if(locked.includes(e.names[i]))continue;
    const others=e.names.filter((_,j)=>j!==i),fo=others.map(n=>D.stats[n]?.f);
    const sameF=free.filter(x=>fo[0]&&fo.every(f=>f===D.stats[x]?.f));
    const rnd=[...free].sort(()=>Math.random()-.5).slice(0,25);
    for(const x of new Set([...sameF,...rnd])){if(e.names.includes(x))continue;const ns=[...others,x];if(!costOk(ns))continue;const v=ent(ns);if(v&&v.n===0)nb.push(v)}}
  await play(nb,4,'鄰近搜尋');
  await play(best(nb,40),8,'鄰近複賽');
  // 階段 4：前段加場＋兵種變體（只在特性允許的兵種內）
  let pool3=[...new Set([...best([...ents.values()],16),...['same','alliance','mixed'].flatMap(ty=>layer([...ents.values()],ty,5))])];
  const vs=[];for(const e of pool3)for(const a of e.arms)if(a!==e.arm){const v=ent(e.names,a,true);if(v&&v.n===0)vs.push(v)}
  await play([...pool3.filter(e=>e.n<24),...vs],12,'加場與兵種比較');
  // 階段 5：入圍者重新獨立打 150 場（不沿用前面的結果，避免挑選偏差）
  const allE=[...ents.values()].filter(e=>e.ok&&e.n>=12);
  const pop=e=>e.names.reduce((a,n)=>a+(popular[n]||0),0)/3;
  const medPop=(()=>{const v=pool.map(n=>popular[n]||0).sort((a,b)=>a-b);return v[Math.floor(v.length/2)]||0})();
  const blind=e=>e.names.filter(n=>(popular[n]||0)<=medPop).length>=2;
  // 多元（Joe：每次都是那幾位）：每多挑一隊，都盡量和已挑的隊伍不共用（指定的武將不算）；類別隊最多共用 1 位、整體備選完全不共用，找不到才放寬
  const finals=new Map(),chosen=[];
  const ov=e=>Math.max(0,...chosen.map(o=>o.names.filter(n=>!locked.includes(n)&&e.names.includes(n)).length));
  const pickDiv=(arr,lim)=>{const r=best(arr,arr.length);return r.find(e=>!finals.has([...e.names].sort().join('|'))&&ov(e)<=lim)||r.find(e=>ov(e)<=lim+1)||r[0]};
  const addF=(e,tag)=>{if(!e)return;const s=[...e.names].sort().join('|');if(!finals.has(s)){finals.set(s,{e,tags:[]});chosen.push(e)}if(tag)finals.get(s).tags.push(tag)};
  addF(best(allE,1)[0],null);
  addF(pickDiv(allE.filter(e=>e.type==='same'),1),'同勢力最佳');
  addF(pickDiv(allE.filter(e=>e.type==='alliance'),1),'三勢力（合盟）最佳');
  addF(pickDiv(allE.filter(e=>e.type==='mixed'),1),'兩勢力混搭最佳');
  addF(pickDiv(allE.filter(blind),1),'盲點隊（少見武將）');
  for(let i=0;i<2;i++)addF(pickDiv(allE,0),null);
  const fin=[...finals.values()].map(({e,tags})=>({key:'F|'+e.key,names:e.names,arm:e.arm,armWhy:e.armWhy,type:e.type,tags,w:0,d:0,n:0,lf:0,ok:true,pop:pop(e)}));
  say('最後驗證…');
  const res=await run(fin.map(f=>({key:f.key,names:f.names,arm:f.arm,k:150})),(d,a)=>say(`最後驗證 ${d}/${a}…`));
  for(const r of res){const f=fin.find(x=>x.key===r.key);if(f){f.w=r.w;f.d=r.d;f.n=r.n;f.lf=r.lf;battles+=r.n}}
  fin.sort((a,b)=>sc(b)-sc(a));
  if(fin[0])fin[0].tags.unshift('整體最佳');
  for(const f of fin)if(!f.tags.length)f.tags.push('備選');
  fin.forEach(f=>{f.score=sc(f)});
  const tried=[...ents.values()].filter(e=>e.n>0);
  const st={};for(const ty of['same','alliance','mixed'])st[ty]={all:strata[ty].length,tried:tried.filter(e=>e.type===ty).length};
  return{res:fin,tried:tried.length,battles,poolN:pool.length,covered:covered.size,freeN:free.length,strata:st,validN:valid.length};
}

// Worker 池：每隊依 key 固定分給同一個 Worker（隊伍建好可快取）。不支援 Worker 時退回主執行緒同步計算。
export function makePool(url,init,{n,fallback}={}){
  const W=[];let ok=typeof Worker!=='undefined';
  const N=Math.max(1,Math.min(8,n||((globalThis.navigator?.hardwareConcurrency||4)-1)));
  if(ok){try{for(let i=0;i<N;i++){const w=new Worker(url,{type:'module'});w.postMessage({type:'init',...init});W.push(w)}}catch{ok=false;W.forEach(w=>w.terminate());W.length=0}}
  const h=s=>{let x=0;for(let i=0;i<s.length;i++)x=(x*31+s.charCodeAt(i))|0;return Math.abs(x)};
  let seq=0;
  async function run(jobs,prog){
    if(!W.length){const out=[];for(let i=0;i<jobs.length;i++){out.push(fallback(jobs[i]));if(i%10===9){prog?.(i+1,jobs.length);await new Promise(r=>setTimeout(r))}}return out}
    const parts=W.map(()=>[]);for(const j of jobs)parts[h(j.key)%W.length].push(j);
    let done=0;const id=++seq;
    const per=await Promise.all(W.map((w,i)=>new Promise((res,rej)=>{
      if(!parts[i].length)return res([]);
      const out=[];const CH=8;let at=0;
      const send=()=>{const c=parts[i].slice(at,at+CH);at+=c.length;w.postMessage({type:'eval',id,jobs:c})};
      w.onmessage=ev=>{const m=ev.data;if(m.type==='error'){rej(new Error(m.msg));return}if(m.id!==id)return;out.push(...m.res);done+=m.res.length;prog?.(done,jobs.length);if(at<parts[i].length)send();else res(out)};
      w.onerror=e=>rej(new Error(e.message||'Worker 失敗'));
      send();
    })));
    return per.flat();
  }
  return{run,close:()=>W.forEach(w=>w.terminate()),n:W.length};
}
