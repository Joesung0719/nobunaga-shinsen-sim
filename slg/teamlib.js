// 組隊共用：戰法使用規則（數量）與「推薦戰法」評估。瀏覽器與 node 都能用（不碰 fs）。
//
// 戰法規則（Joe 2026-11-20）：每個可傳授戰法有「數量」，一份只能裝在一位武將身上，同隊最多用到「數量」個人。
// 庫存：百煉成鋼、奮鬥 2，B 級 3，其餘 1，跨隊共用（reserved 參數＝其他隊已用掉的份數）。
// 固有戰法只有該武將自己有，不能傳授。這裡的數量 = D.teach 裡「以這招當傳授戰法的武將」人數。
//
// 推薦戰法（全部是推估，不是遊戲官方算法）：
//   基礎分 = 用戰鬥引擎模擬出來的「這招裝在武勇型／智略型武將身上平均多贏多少兵力」（skillpower.json，tools/skill-power.mjs 產生，
//            已含發動機率、傷害率、目標數、控制、增益）；
//   再依這一隊調整：干擾（控制狀態隊內補位、同種重複打折、快手優先）、受哪項屬性影響（本隊該屬性最高者加成）、
//   勢力／一門（來源武將同勢力、同標籤略加分）、等級紅度（紅度低偏好發動率高、不用準備；紅度高才吃準備型）。
import {parseSkill,innateOf} from './engine.js?v=47';

export function makeKit(D,{power={},tags={},pulls=()=>1000,field={}}={}){
  const PS=new Map(),ps=(n,lv=null)=>{const k=n+'|'+lv;if(!PS.has(k))PS.set(k,parseSkill(n,D,lv));return PS.get(k)};
  const SRC={};for(const[g,s]of Object.entries(D.teach))(SRC[s]??=[]).push(g);
  const INN=new Set([...Object.values(D.innate),...Object.values(D.stats).map(x=>x.inn).filter(Boolean)]);
  // 數量＝全帳號共用的戰法庫存（Joe 2026-11-20）：A 級百煉成鋼、奮鬥 2，B 級全部 3，其餘所有戰法 1。
  // 不論有幾隊、每隊三人，只要有人裝上，庫存就減 1，用完就不能再裝給別人（跨隊也算）；固有戰法不受此限。
  const grade=s=>D.skillText?.[s]?.g||D.skills?.[s];
  const A2=new Set(['百煉成鋼','奮鬥']);
  const count=s=>{const g=grade(s);return g==='B'?3:A2.has(s)?2:1};
  const usable=s=>{const p=ps(s);return p.modeled==='text'&&['主動','突擊','指揮','被動','兵種'].includes(p.kind)&&!INN.has(s)};
  // 兵種技有些（三河武士、越後先手組…）資料裡沒有傳授來源武將，仍列入候選（來源待補，不計抽數）
  const POOL=[...new Set([...Object.keys(SRC),...Object.keys(D.skillText||{}).filter(s=>D.skillText[s].kind==='兵種')])].filter(usable);
  // 戰報歸納（tools/report-patterns.py，67 場）：隊伍實際發動的突擊戰法 0 / 1 / 2 種 → 勝率 40% / 61% / 68%；主動戰法 3 種的隊勝率只有 37%（0～1 種 53～56%）。
  // 突擊戰法只在「普通攻擊命中後」判定，所以：自帶突擊的武將，其他戰法要選突擊（每次普攻多一次觸發機會）或能多打普攻／提高突擊發動率的戰法；
  // 純主動戰法（要準備、機率低）對他沒有加成。
  const kindOf=s=>ps(s)?.kind;
  const feedsAtk=s=>{const p=ps(s),x=p.text||'';return p.kind==='突擊'||/連擊|普通攻擊(後|造成的傷害)|突擊戰法的?發動機率|額外[^。]{0,12}普通攻擊|普通攻擊[^。]{0,8}(兩|2)次/.test(x)||(p.buf||[]).some(b=>b.k==='rushRate'||b.k==='dmgAtk')};
  const fallback=s=>{const x=ps(s);return((x.rate||0)*((x.dmg||0)*(x.n?(x.n[0]+x.n[1])/2:1)+(x.heal||0)*.5+(x.status?.p||0)*.6))*.1};
  const pw=(s,role)=>{const p=power[s];return p?(role==='phys'?p.p:p.m):fallback(s)};
  const srcPull=s=>SRC[s]?Math.min(...SRC[s].map(pulls),1e9):0;
  const scaleStat=s=>ps(s).text.match(/受(智略|統率|武勇|速度)影響/)?.[1]||null;
  const roleOf=st=>st.武勇>=st.智略?'phys':'mag';
  const facOf=n=>D.stats[n]?.f;
  const tagsOf=n=>tags[n]||[];

  // team: [{n, red, st:{武勇,智略,統率,速度}}]  picks: [[skill..],..]（已選，其餘由評估補滿到每人 2 個）
  function pick(team,picks=null,reserved={},ctx={}){
    const arm=ctx.arm||null;
    const N=team.length,sel=team.map((_,i)=>[...(picks?.[i]||[])].filter(Boolean).slice(0,2));
    const used=s=>(reserved[s]||0)+sel.reduce((a,l)=>a+l.filter(x=>x===s).length,0);
    const sts=team.map(g=>g.st),avg=k=>sts.reduce((a,x)=>a+x[k],0)/N;
    const fastest=sts.reduce((b,x,i)=>x.速度>sts[b].速度?i:b,0);
    const statusKinds=()=>new Set(sel.flat().flatMap(s=>ps(s).status?.k||[]));
    const why=team.map(()=>[]);
    function score(i,s){
      const g=team[i],p=ps(s),role=roleOf(g.st);let v=Math.max(0,pw(s,role)),tips=[];
      const sk=p.status?.k||[];
      if(sk.length){
        const have=statusKinds();const fresh=sk.filter(k=>!have.has(k));
        if(fresh.length){v*=1.15;tips.push(`干擾：補上${fresh.join('、')}（隊內其他戰法沒有）`)}
        else{v*=.8;tips.push(`與隊內干擾重複（${sk.join('、')}），已降權`)}
        if(i===fastest){v*=1.1;tips.push('速度最快，先手施放干擾')}
      }
      const ss=scaleStat(s);
      if(ss){const r=g.st[ss]/avg(ss),m=Math.max(.9,Math.min(1.15,1+.2*(r-1)));v*=m;if(m>1.03)tips.push(`受${ss}影響，${g.n}的${ss}是本隊偏高`)}
      const sources=SRC[s]||[],fo=facOf(g.n);
      if(sources.some(x=>x!==g.n&&facOf(x)===fo)){v*=1.04;tips.push(`來源武將與${g.n}同勢力（${fo}）`)}
      const sh=tagsOf(g.n).filter(t=>sources.some(x=>tagsOf(x).includes(t)));
      if(sh.length){v*=1.03;tips.push(`一門／標籤相同（${sh[0]}）`)}
      const seen=field.skill?.[g.n]?.[s]||0;
      if(seen){v*=1+.2*Math.min(1,seen/3);tips.push(`戰報裡${g.n}實際用過（${seen} 場${seen<3?'，樣本少':''}）`)}
      else if((field.skillUse?.[s]||0)>=4){v*=1.05;tips.push(`戰報裡別的武將常用（${field.skillUse[s]} 場）`)}
      // —— 戰報歸納出的搭配規則 ——
      const innK=kindOf(innateOf(D,g.n)),mine=sel[i];
      const teamKinds=sel.flatMap((l,j)=>[kindOf(innateOf(D,team[j].n)),...l.map(kindOf)]);
      const nRush=teamKinds.filter(k=>k==='突擊').length,nAct=teamKinds.filter(k=>k==='主動').length;
      if(p.kind==='兵種'){
        if(!arm||(p.arm&&p.arm!==arm))return{v:0,tips:[]};
        if(mine.some(x=>kindOf(x)==='兵種')||sel.some(l=>l.some(x=>kindOf(x)==='兵種')))return{v:0,tips:[]};
        v=Math.max(v,fallback(s)*.4)*1.12;tips.push(`兵種技：開場直接生效、整隊吃到（隊伍是${arm}兵）`);
      }
      if(p.kind==='突擊'){
        if(innK==='突擊'){v*=1.35;tips.push('自帶突擊，再配突擊戰法：每次普攻命中都多一次觸發機會（戰報：突擊技傷害占贏方輸出 18%、輸方 10%）')}
        else if(nRush===0){v*=1.2;tips.push('隊內還沒有突擊戰法，補一個（戰報：實際發動 0 種突擊勝率 40%，1 種 61%）')}
        else if(nRush===1){v*=1.08;tips.push('隊內第二個突擊戰法（戰報：2 種突擊勝率 68%）')}
        else{v*=.8;tips.push('隊內突擊戰法已經夠多，邊際效益低')}
      }else if(innK==='突擊'||mine.some(x=>kindOf(x)==='突擊')){
        if(feedsAtk(s)){v*=1.25;tips.push('能多打普攻／提高突擊發動率，幫自帶突擊多觸發')}
        else if(p.kind==='主動'){v*=.6;tips.push('自帶突擊卻選純主動戰法：主動戰法不會觸發突擊，已降權（戰報：這類組合多半輸）')}
      }
      if(p.kind==='主動'&&nAct>=2){v*=nAct>=3?.5:.8;tips.push(`隊內已有 ${nAct} 個主動戰法（含自帶），再加邊際效益低（戰報：3 種主動以上勝率 37%）`)}
      for(const b of p.buf||[]){
        if(b.k==='rateAct'){if(nAct>0){v*=1+.06*Math.min(3,nAct);tips.push('增益：提高主動戰法發動率，隊內有主動戰法可吃到')}else v*=.7}
        if(b.k==='rushRate'){if(nRush>0){v*=1+.08*Math.min(3,nRush);tips.push('增益：提高突擊發動率，隊內有突擊戰法可吃到')}else v*=.7}
      }
      if(p.kind==='指揮'&&(p.buf||[]).length&&!(p.dmg||p.heal)){tips.push('指揮技：開場直接生效，不用等發動')}
      const sw=field.skillWin?.[s];
      if(sw&&sw[0]>=5){const wr=(sw[1]+1.5)/(sw[0]+3),m=Math.max(.9,Math.min(1.12,1+.6*(wr-.5)));v*=m;if(Math.abs(m-1)>.03)tips.push(`戰報：出現在 ${sw[0]} 隊，勝率 ${Math.round(sw[1]/sw[0]*100)}%（樣本少，只微調）`)}
      const red=g.red||0;
      if(p.prep){const m=.9+.02*red;v*=m;if(red<=1)tips.push('紅度低，準備型戰法降權')}
      else if(p.rate!=null&&red<=2&&p.rate>=.4){v*=1+.08*(p.rate-.4)*(5-red)/5;tips.push('紅度低，偏好發動率高的戰法')}
      return{v,tips};
    }
    for(let round=0;round<N*2;round++){
      let best=null;
      for(let i=0;i<N;i++){
        if(sel[i].length>=2)continue;
        for(const s of POOL){
          if(s===innateOf(D,team[i].n)||sel[i].includes(s)||used(s)>=count(s))continue;
          const r=score(i,s);
          if(!best||r.v>best.v)best={i,s,...r};
        }
      }
      if(!best)break;
      sel[best.i].push(best.s);why[best.i].push({s:best.s,tips:best.tips});
    }
    // 使用者已指定的戰法也附上說明
    team.forEach((g,i)=>{const have=new Set(why[i].map(x=>x.s));for(const s of sel[i])if(!have.has(s))why[i].unshift({s,tips:['自選']})});
    return{sel,why:why.map((l,i)=>l.map(x=>describe(team[i],x.s,x.tips)))};
  }
  function describe(g,s,tips){
    const p=ps(s),role=roleOf(g.st);
    const bits=[`${s}（${p.kind}）`];
    if(p.rate!=null&&p.rate<1)bits.push(`發動 ${Math.round(p.rate*100)}%`);
    if(p.dmg)bits.push(`${p.dtype==='auto'?'兵刃／謀略':p.dtype}傷害率 ${Math.round(p.dmg*100)}%${p.n&&p.n[1]>1?`×${p.n[1]}人`:''}`);
    else if(p.status)bits.push(`${p.status.k.join('、')}`);
    else if(p.heal)bits.push(`治療 ${Math.round(p.heal*100)}%`);
    else if(p.buf)bits.push('增益');
    const out=[];
    if(p.dtype==='兵刃'||p.dtype==='謀略'){
      const fit=(p.dtype==='兵刃')===(role==='phys');
      out.push(fit?`${g.n}${role==='phys'?'武勇':'智略'}偏高，吃${p.dtype}傷害`:`${p.dtype}傷害與${g.n}的${role==='phys'?'武勇':'智略'}偏向不同，但模擬仍有增益`);
    }
    if(count(s)>1)out.push(`數量${count(s)}戰法`);
    return`${bits.join('・')}：${[...out,...tips.filter(t=>t!=='自選')].join('；')||'模擬增益最高'}`+(tips.includes('自選')?'（自選）':'');
  }
  // 驗證／篩選用：某位武將目前的選單能列哪些戰法（排除其他人已用完數量的）
  function options(team,i,reserved={}){
    const used=s=>(reserved[s]||0)+team.reduce((a,g,j)=>a+(j===i?0:(g.s||[]).filter(x=>x===s).length),0);
    return POOL.filter(s=>s!==innateOf(D,team[i].n)&&used(s)<count(s));
  }
  // 戰報實戰分：每位武將勝率（勝 1 平 .5，先驗 6 場 0.5 收縮）＋同隊兩兩搭配勝率；n = 最少樣本場數。樣本通常很少，只當參考。
  const PRIOR=6,shr=([n,w])=>(w+PRIOR*.5)/(n+PRIOR);
  function fieldScore(names){
    const gs=names.map(n=>field.gen?.[n]||[0,0]),base=gs.reduce((a,x)=>a+shr(x),0)/names.length;
    let pb=0,pn=0;const pairs=[];
    for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){
      const k=[names[i],names[j]].sort().join('|'),x=field.pair?.[k];
      if(x){pb+=shr(x)-.5;pn+=x[0];pairs.push(`${names[i]}×${names[j]} ${x[0]}場${Math.round(x[1]/x[0]*100)}%`)}}
    const tr=field.trio?.[[...names].sort().join('|')];
    return{score:base+pb*.5+(tr?(shr(tr)-.5)*.5:0),n:Math.min(...gs.map(x=>x[0])),each:gs.map(x=>x[0]),pairs,trio:tr||null};
  }
  // 組好之後的檢查：回傳 [{lv:'warn'|'ok', t}]，給畫面顯示「這組搭配有沒有問題」
  function check(team,sel,arm){
    const out=[],K=n=>kindOf(n),inn=team.map(g=>K(innateOf(D,g.n)));
    team.forEach((g,i)=>{
      const mine=sel[i].filter(Boolean),all=[innateOf(D,g.n),...mine].filter(Boolean);
      if(inn[i]==='突擊'||mine.some(x=>K(x)==='突擊')){
        const sup=mine.filter(x=>K(x)==='突擊'||feedsAtk(x)).length;
        if(inn[i]==='突擊'&&!sup)out.push({lv:'warn',t:`${g.n}自帶突擊，但第 2、3 戰法沒有突擊或能觸發普攻的技能，突擊只靠普攻觸發，威力用不滿`});
        else out.push({lv:'ok',t:`${g.n}：突擊 ${all.filter(x=>K(x)==='突擊').length} 個，普攻命中後會連續判定`});
      }
      for(const x of mine){const p=ps(x);if(p.kind==='兵種'&&p.arm&&p.arm!==arm)out.push({lv:'warn',t:`${g.n}的「${x}」需要${p.arm}兵，隊伍是${arm}兵，這招不會生效`})}
    });
    const nAct=[...inn,...sel.flat().filter(Boolean).map(K)].filter(k=>k==='主動').length;
    if(nAct>=4)out.push({lv:'warn',t:`整隊有 ${nAct} 個主動戰法，戰報裡主動戰法堆太多的隊勝率偏低`});
    return out;
  }
  return{kindOf,feedsAtk,check,ps,SRC,INN,POOL,count,usable,pick,options,roleOf,srcPull,pw,fieldScore,TWO:POOL.filter(s=>count(s)>1),MULTI:POOL.filter(s=>count(s)>1).map(s=>[s,count(s)])};
}
