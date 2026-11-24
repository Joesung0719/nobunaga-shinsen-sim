// 回歸檢查（2026-11-24 起，每一步修正都要跑）：node tools/regress.mjs [--save]
// 指標：全庫檢查錯誤數、戰法命中率（官方 123 隊規則版／含先驗、Joe 四隊）、官方大將命中率、官方戰法 vs 推薦戰法的模擬強度。
// --save 把結果寫成 tools/regress-baseline.json；不加則和基準比較，變差就標 ✗。
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {makeKit} from '../slg/teamlib.js';
const here=new URL('.',import.meta.url).pathname;
const J=f=>JSON.parse(fs.readFileSync(new URL('../'+f,import.meta.url)));
const run=(f,ok=false)=>{try{return execFileSync('node',[here+f],{encoding:'utf8',maxBuffer:1<<26,stdio:['ignore','pipe','ignore']})}catch(e){if(ok)return e.stdout;throw e}};
const r={};
r.auditErr=+run('audit.mjs',true).match(/錯誤 (\d+) 筆/)[1];
const h=JSON.parse(run('eval-hits.mjs').trim().split('\n').pop());r.hitRule=h['official規則版'];r.hitPrior=h['official含先驗'];r.hitJoe=h['Joe四隊'];
const D=J('land.json'),OFF=J('official.json');const kit=makeKit(D,{official:OFF.map(t=>({...t,gens:[]}))});   // 不給官方先驗，只靠規則猜大將
const T=OFF.filter(t=>t.gens.length===3&&t.gens.every(g=>D.stats[g.n]));r.leadHit=+(T.filter(t=>kit.leaderFirst(t.gens.map(g=>g.n))[0]===t.gens[0].n).length/T.length).toFixed(3);
const ob=JSON.parse(run('official-backtest.mjs'));const m=ob['戰力'].match(/官方戰法 ([\d.]+)%｜推薦戰法 ([\d.]+)%/);r.powOfficial=+m[1];r.powRec=+m[2];
const B=new URL('./regress-baseline.json',import.meta.url);
if(process.argv.includes('--save')){fs.writeFileSync(B,JSON.stringify(r,null,1));console.log('已存基準',r);process.exit(0)}
const b=fs.existsSync(B)?JSON.parse(fs.readFileSync(B)):{};
const lower=new Set(['auditErr']);let bad=0;
for(const k in r){const d=b[k]==null?null:r[k]-b[k],worse=d!=null&&(lower.has(k)?d>0:d< -0.015*Math.max(1,Math.abs(b[k])));if(worse)bad++;console.log(`${worse?'✗':'✓'} ${k}: ${r[k]}${d==null?'':`（基準 ${b[k]}，${d>=0?'+':''}${+d.toFixed(3)}）`}`)}
process.exit(bad?1:0);
