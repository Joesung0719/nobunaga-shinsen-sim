// 真戰 Q版戰棋：8 回合自動戰鬥。
// 官方公式沒有公開，這裡的傷害公式、相剋倍率、地形加成都是推估值（集中在 K 裡，方便之後用戰報對照調整）。
// 戰法效果從 land.json 的 skillText 說明文字讀出（發動率、傷害率、目標數、治療率、控制狀態、自身屬性加點），
// 沒有說明文字的戰法依類型與等級給通用值，並標成「推估」。
import {bingakuHooks} from './bingaku.js';

export const K={
  rounds:8,
  base:5.2,          // 傷害基數 = √兵力 × base × 傷害率 × 屬性差係數
  statDiv:110,       // 屬性差係數 = 1 + (攻方屬性 − 守方屬性) / statDiv，夾在 0.3～3
  counter:[1.15,0.87],   // 兵種相剋：剋制方兵刃傷害 ×1.15，被剋方 ×0.87
  terrain:{},        // 地形對傷害的倍率，例如 {林:0.9}；遊戲內地形沒有攻防加成（Joe），只有這一季的火炬有，數值到了再補
  guess:{主動:{S:[.35,1.7],A:[.35,1.45],B:[.4,1.2]},突擊:{S:[.3,1.9],A:[.3,1.6],B:[.3,1.3]}},
};
// 兵種相剋（Joe 確認）：槍兵剋騎兵、騎兵剋弓兵、弓兵剋鐵炮、鐵炮剋槍兵；鐵炮剋器械是更早 Joe 提到的。
export const COUNTER={槍:['騎'],騎:['弓'],弓:['鐵炮'],鐵炮:['槍','器械']};
export const ST4=['武勇','智略','統率','速度'];
const STATUS={威壓:'無法行動',麻痺:'30% 機率無法行動',混亂:'50% 機率無法行動',無策:'無法發動主動戰法',封擊:'無法普通攻擊'};

const num=s=>s==null?null:+s;
const hi=(a,b)=>num(b)??num(a);   // 「Lv1→滿級」取滿級
function targetCount(s){
  if(!s)return[1,1];
  if(/全體/.test(s))return[3,3];
  const m=s.match(/(\d)(?:-(\d))?人/);if(m)return[+m[1],+(m[2]||m[1])];
  return[1,1];
}
// one skill → what the engine can run
export function parseSkill(name,D){
  const t=D.skillText?.[name],kind=t?.kind||D.kind?.[name]||(t?'?':'主動'),g=t?.g||D.skills?.[name]||'B';
  const sk={name,kind,g,modeled:'none',text:t?.text||''};
  if(kind==='內政'||kind==='兵種')return sk;
  if(!t){
    const gs=K.guess[kind]?.[g];
    if(gs)Object.assign(sk,{modeled:'guess',rate:gs[0],dmg:gs[1],dtype:'auto',n:[1,1]});
    return sk;
  }
  const x=t.text;
  // 「戰鬥中／每回合，有 a%→b% 機率對敵軍…造成傷害」 → 指揮／被動也在每回合行動時判定
  const pm=x.match(/有([\d.]+)%(?:→([\d.]+)%)?(?:（受\S{2}影響）)?機率(?:（受\S{2}影響）)?對敵軍/);
  // reactive skills (受到普通攻擊時…) are not simulated yet
  if(!pm&&/受到(普通攻擊|傷害|戰法)時|首次受到/.test(x)&&kind!=='主動'&&kind!=='突擊')return sk;
  const rm=(t.rate||'').match(/([\d.]+)%(?:→([\d.]+)%)?/);let rate=rm?hi(rm[1],rm[2])/100:1;
  const dm=x.match(/傷害率([\d.]+)%(?:→([\d.]+)%)?/)||x.match(/造成([\d.]+)%(?:→([\d.]+)%)?(?:兵刃|謀略)傷害/);
  const hm=x.match(/(?:治療率|恢復率)([\d.]+)%(?:→([\d.]+)%)?/);
  const ib=x.indexOf('兵刃傷害'),im=x.indexOf('謀略傷害');
  sk.dtype=ib<0?'謀略':im<0?'兵刃':ib<im?'兵刃':'謀略';
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
  if(kind==='指揮'||kind==='被動'){
    if(pm&&dm){rate=hi(pm[1],pm[2])/100;sk.each=true}
    else if(!sm){return sk}
  }
  sk.rate=rate;
  if(sk.dmg||sk.heal||sk.status||sk.self)sk.modeled='text';
  return sk;
}

function aliveIdx(team){return team.gens.map((g,i)=>g.troops>0?i:-1).filter(i=>i>=0)}
function pickN(arr,n,R){const a=[...arr],o=[];while(a.length&&o.length<n)o.push(a.splice(Math.floor(R()*a.length),1)[0]);return o}

// A: attacker team, B: defender team. team = {name, side, arm, terrain:'平'|'林'|'城', bingaku, gens:[{n, st:{武勇…}, troops, max, skills:[parsed]}]}
// gens[0] is 大將. Troops are changed in place. Returns {res:'W'|'D'|'L' (for A), log:[events], rounds}
export function battle(A,B,R=Math.random){
  const T=[A,B],log=[];
  const hooks=bingakuHooks([A,B]);
  // per-battle state: stat buffs, statuses, prepared skills
  for(const t of T)for(const g of t.gens){
    g.b={...g.st};g.fx={};g.prep=null;g.start=g.troops;
    for(const s of g.skills)if(s.self&&s.modeled==='text')for(const k of s.self.ks)g.b[k]+=s.self.v;
  }
  hooks.start?.({A,B,log});
  const ev=(e)=>log.push(e);
  const routed=t=>t.gens[0].troops<=0;
  function hit(src,st,s,dst,dt,rate,dtype){
    const g=src.gens[s],d=dst.gens[dt];
    if(d.troops<=0)return null;
    if(dtype==='auto')dtype=g.b.武勇>=g.b.智略?'兵刃':'謀略';
    const a=dtype==='兵刃'?g.b.武勇:g.b.智略,df=dtype==='兵刃'?d.b.統率:d.b.智略;
    let f=Math.min(3,Math.max(.3,1+(a-df)/K.statDiv));
    if(dtype==='兵刃'){if(COUNTER[src.arm]?.includes(dst.arm))f*=K.counter[0];else if(COUNTER[dst.arm]?.includes(src.arm))f*=K.counter[1]}
    f*=K.terrain[dst.terrain]??1;
    f*=src.mods?.dmg??1;   // 劇本效果（例如豪雨奇襲）
    let v=Math.sqrt(g.troops)*K.base*rate*f*(0.94+R()*0.12);
    if(hooks.dmg)v=hooks.dmg({src,dst,g,d,dtype,v});
    v=Math.max(1,Math.min(d.troops,Math.round(v)));
    d.troops-=v;
    return{side:dst.side,i:dt,v,left:d.troops,dtype,rout:d.troops<=0};
  }
  function useSkill(t,ti,i,sk,o){
    const g=t.gens[i],e=T[1-ti],tg=[];
    if(sk.dmg){
      const ids=pickN(aliveIdx(e),sk.n[0]+Math.floor(R()*(sk.n[1]-sk.n[0]+1)),R);
      for(const j of ids){const h=hit(t,ti,i,e,j,sk.dmg,sk.dtype);if(h)tg.push(h)}
    }
    if(sk.status){
      for(const j of (tg.length?tg.map(x=>x.i):pickN(aliveIdx(e),sk.n[1],R)))if(e.gens[j].troops>0&&R()<sk.status.p){
        for(const k of sk.status.k)e.gens[j].fx[k]=Math.max(e.gens[j].fx[k]||0,sk.status.dur);
        tg.push({side:e.side,i:j,status:sk.status.k.join('、')});
      }
    }
    if(sk.heal){
      const al=aliveIdx(t);let j=i;
      if(!sk.healSelf)j=al.sort((a,b)=>t.gens[a].troops/t.gens[a].max-t.gens[b].troops/t.gens[b].max)[0];
      const m=t.gens[j],v=Math.round(Math.min(m.max-m.troops,Math.sqrt(g.troops)*K.base*sk.heal*(1+(g.b.智略-80)/220)));
      if(v>0){m.troops+=v;tg.push({side:t.side,i:j,heal:v,left:m.troops})}
    }
    ev({type:'skill',side:t.side,i,skill:sk.name,kind:sk.kind,guess:sk.modeled==='guess',tg,...o});
  }
  let round=0,res='D';
  outer:for(round=1;round<=K.rounds;round++){
    ev({type:'round',round});
    const order=[];
    T.forEach((t,ti)=>t.gens.forEach((g,i)=>{if(g.troops>0)order.push([ti,i,g.b.速度+R()*4])}));
    order.sort((a,b)=>b[2]-a[2]);
    for(const[ti,i]of order){
      const t=T[ti],g=t.gens[i],e=T[1-ti];
      if(g.troops<=0)continue;
      const fx=g.fx;
      const tick=()=>{for(const k in fx)if(--fx[k]<=0)delete fx[k]};
      if(fx.威壓||(fx.麻痺&&R()<.3)||(fx.混亂&&R()<.5)){ev({type:'stun',side:t.side,i,why:fx.威壓?'威壓':fx.麻痺?'麻痺':'混亂'});tick();continue}
      if(g.prep){useSkill(t,ti,i,g.prep,{prepared:true});g.prep=null}
      for(const sk of g.skills){
        if(sk.modeled==='none'||sk.self&&!sk.dmg&&!sk.heal&&!sk.status)continue;
        const act=sk.kind==='主動'||sk.each;
        if(!act||(sk.kind==='主動'&&fx.無策))continue;
        if(R()<sk.rate){
          if(sk.prep){g.prep=sk;ev({type:'prep',side:t.side,i,skill:sk.name})}
          else useSkill(t,ti,i,sk);
          if(routed(e))break;
        }
      }
      if(routed(e)){res=ti===0?'W':'L';break outer}
      if(!fx.封擊){
        const al=aliveIdx(e);if(!al.length)break;
        const j=al[Math.floor(R()*al.length)],h=hit(t,ti,i,e,j,1,'兵刃');
        ev({type:'atk',side:t.side,i,tg:h?[h]:[]});
        if(h&&e.gens[j].troops>0)for(const sk of g.skills)if(sk.kind==='突擊'&&sk.modeled!=='none'&&R()<sk.rate){
          // 突擊 hits the same target as the normal attack
          const k2=sk.dmg?hit(t,ti,i,e,j,sk.dmg,sk.dtype):{side:e.side,i:j,status:sk.status?.k.join('、')||''};
          ev({type:'skill',side:t.side,i,skill:sk.name,kind:'突擊',guess:sk.modeled==='guess',tg:k2?[k2]:[]});
          if(sk.status&&k2&&R()<sk.status.p)for(const k of sk.status.k)e.gens[j].fx[k]=Math.max(e.gens[j].fx[k]||0,sk.status.dur);
          if(e.gens[j].troops<=0)break;
        }
      }
      tick();
      if(routed(e)){res=ti===0?'W':'L';break outer}
    }
  }
  if(round>K.rounds)round=K.rounds;
  for(const t of T)for(const g of t.gens){delete g.b;delete g.fx;delete g.prep}
  hooks.end?.({A,B,res,log});
  ev({type:'end',res});
  return{res,log,rounds:round};
}

// stats of a general at level lv from land.json stats (Lv1 + 成長率 × (lv−1)); fallback by rarity when not collected
export function statsAt(D,n,lv,r=4){
  const x=D.stats?.[n];
  if(!x){const b={5:[82,1.6],4:[72,1.3],3:[62,1.0]}[r]||[70,1.2];return Object.fromEntries(ST4.map(k=>[k,Math.round(b[0]+b[1]*(lv-1))]))}
  return Object.fromEntries(ST4.map(k=>{const[b,g]=x.st[k];return[k,Math.round((b+g*(lv-1))*10)/10]}));
}
export const innateOf=(D,n)=>D.stats?.[n]?.inn||D.innate?.[n]||'';
