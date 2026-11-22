// 掃描所有推薦隊：戰法吃某項能力（受X影響），但同一位武將的固有戰法／另一個戰法會降低自身X
import fs from 'fs';
const L=JSON.parse(fs.readFileSync('land.json','utf8')),T=L.skillText;
const inn=n=>L.stats[n]?.inn;
const conflict=(n,sk)=>{const out=[];for(const s of sk){const ss=T[s]?.text?.match(/受(智略|統率|武勇|速度)影響/)?.[1];if(!ss)continue;
  for(const o of [inn(n),...sk]){if(!o||o===s)continue;if(new RegExp('自身'+ss+'(降低|下降|減少)').test(T[o]?.text||''))out.push(`${n}：${s}（受${ss}影響）× ${o}（降低自身${ss}）`)}}return out};
const src={
  官方編制:JSON.parse(fs.readFileSync('official-rec.json','utf8')).map(t=>t.team.map(n=>[n,t.skills[n]||[]])),
  對戰榜:Object.values(JSON.parse(fs.readFileSync('rank.json','utf8'))).flat().map(t=>t.team.map((n,i)=>[n,t.skills[i]||t.skills[n]||[]])),
  舊推薦:JSON.parse(fs.readFileSync('recommend.json','utf8')).teams.map(t=>t.n.map((n,i)=>[n,t.s[i]||[]]))};
let tot=0;
for(const[k,ts]of Object.entries(src)){const hit=new Set();let c=0;for(const t of ts)for(const[n,sk]of t){const r=conflict(n,sk);if(r.length){c++;r.forEach(x=>hit.add(x))}}
  console.log(`${k}：${ts.length} 隊，有衝突 ${c} 隊`);[...hit].forEach(x=>console.log('  ',x));tot+=c}
process.exit(0)
