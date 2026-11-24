// AI 配隊搜尋（slg/aisearch.js）的 node 測試：同步跑完整流程，印出結果與各層覆蓋。
// 用法：node tools/ai-search-test.mjs [cost上限=20] [指定武將,逗號分隔] [對手：land:10 | 三人名逗號]
import fs from 'node:fs';
import {makeKit} from '../slg/teamlib.js';
import {makeAI,aiSearch,allowedArms} from '../slg/aisearch.js';
import {innateOf} from '../slg/engine.js';
const J=f=>JSON.parse(fs.readFileSync(new URL('../'+f,import.meta.url)));
const D=J('land.json'),CARDS=J('data.json'),OFF=J('official.json'),RANK=J('rank.json');
const KIT=makeKit(D,{power:J('skillpower.json'),field:J('field.json'),official:OFF});
const rmap=Object.fromEntries(CARDS.map(c=>[c.n,D.stats?.[c.n]?.r||c.r]));const rOf=n=>rmap[n]??D.stats[n]?.r??5;
const [CAP='20',LOCK='',TGT='land:10']=process.argv.slice(2);
const AI=makeAI(D,KIT,{rOf});
let target;
if(TGT.startsWith('land:')){const lv=TGT.slice(5);target={tgt:'land',L:D.levels[lv],keys:Object.keys(D.teams).filter(k=>new RegExp(`^l${lv}[a-z]$`).test(k))}}
else{const ns=KIT.leaderFirst(TGT.split(','));target={tgt:'opp',team:{...AI.buildMe(ns,allowedArms(D,ns).arms[0],5),side:1}}}
const costOf=n=>+D.stats[n]?.c||0;
const pool=Object.keys(D.stats).filter(n=>D.stats[n].c&&rOf(n)===5&&innateOf(D,n)&&!['限定','PK'].includes(D.stats[n].season));
const locked=LOCK?LOCK.split(','):[];for(const n of locked)if(!pool.includes(n))pool.push(n);
const popular={};for(const t of OFF)for(const g of t.gens)popular[g.n]=(popular[g.n]||0)+1;for(const k of['0','5'])for(const t of RANK[k]||[])for(const n of t.team)popular[n]=(popular[n]||0)+1;
const t0=performance.now();
const r=await aiSearch({D,KIT,pool,locked,cap:+CAP,costOf,popular,run:async jobs=>jobs.map(j=>AI.evalJob(j,target,5)),say:()=>{}});
console.log(`池 ${r.poolN}、可行三人組 ${r.validN}、試 ${r.tried} 隊、覆蓋 ${r.covered}/${r.freeN} 位、${r.battles} 場、${((performance.now()-t0)/1000).toFixed(1)}s`,JSON.stringify(r.strata));
for(const f of r.res)console.log(`[${f.tags.join('/')}] ${f.names.join('、')} ${f.arm}兵 ${f.type} 勝${Math.round(f.w/f.n*100)}% 平${Math.round(f.d/f.n*100)}% 人氣${f.pop.toFixed(1)} | ${f.armWhy}`);
