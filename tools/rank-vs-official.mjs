// 推薦榜前 20 隊 vs 最接近的官方編制：列出每隊差在哪（大將、兵種、武將、戰法、勢力型態）。用法：node tools/rank-vs-official.mjs > audit/rank-vs-official.md
import fs from 'node:fs';
const J=f=>JSON.parse(fs.readFileSync(new URL('../'+f,import.meta.url)));
const R=J('rank.json'),O=J('official.json'),D=J('land.json'),S=D.stats;
const AR={足輕:'槍',弓兵:'弓',騎兵:'騎',鐵炮:'鐵炮'};
const ty=t=>{const f=new Set(t.map(n=>S[n].f));return f.size===1?'同勢力':f.size===3?'三勢力合盟':'兩勢力混搭'};
console.log('# 推薦榜前 20 隊 vs 最接近的官方編制\n\n每隊找「共有武將最多、其次戰法重疊最多」的官方編制；「—」＝官方該隊沒有這位武將或戰法欄位看不清。\n');
for(const k of['0','5']){
  const top=R[k].slice(0,20),cnt={};for(const t of top){const x=ty(t.team);cnt[x]=(cnt[x]||0)+1}
  console.log(`## ${k} 紅　前 20 隊勢力型態：${Object.entries(cnt).map(([a,b])=>a+' '+b).join('、')}\n`);
  top.forEach((t,i)=>{
    const sc=o=>o.gens.filter(g=>t.team.includes(g.n)).length*10+o.gens.reduce((a,g)=>a+g.s.filter(s=>s&&(t.skills[g.n]||[]).includes(s)).length,0);
    const b=O.slice().sort((a,c)=>sc(c)-sc(a))[0],bn=b.gens.map(g=>g.n),same=t.team.filter(n=>bn.includes(n));
    console.log(`**${i+1}. ${t.team.join('、')}**（${ty(t.team)}／${t.arm}／Cost ${t.cost}）　最接近官方：${bn.join('、')}（${b.sec}${b.arm?'／'+b.arm:''}），共有 ${same.length} 位`);
    const diffs=[];
    if(b.gens[0].n!==t.team[0])diffs.push(`大將：推薦${t.team[0]}，官方${b.gens[0].n}`);
    if(b.arm&&AR[b.arm]!==t.arm)diffs.push(`兵種：推薦${t.arm}，官方${AR[b.arm]}`);
    const out=bn.filter(n=>!t.team.includes(n)),inn=t.team.filter(n=>!bn.includes(n));if(out.length)diffs.push(`武將：官方的${out.join('、')} → 換成${inn.join('、')}`);
    for(const n of same){const og=b.gens.find(g=>g.n===n).s.filter(Boolean),mine=(t.skills[n]||[]).slice(1);
      if(og.length&&og.slice().sort().join()!==mine.slice().sort().join())diffs.push(`${n}戰法：推薦${mine.join('／')}，官方${og.join('／')}`)}
    console.log('  - '+(diffs.join('\n  - ')||'與官方完全一致')+'\n');
  });
}
