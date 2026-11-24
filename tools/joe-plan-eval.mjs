// Joe 四隊的「配點主屬性／兵學方向」回測：用 Joe 實際戰法當輸入，看引擎（advisePoints／adviseBingaku）推導是否與 Joe 一致。
import {FAC_FULL} from '../slg/rules.js';
import * as L from './recommend-lib.mjs';
import {fullRedStats} from '../slg/engine.js';
import {adviseBingaku,advisePoints} from '../slg/advisor.js';
import {JOE,kit} from './joe-teams.mjs';
import {planPoints,planBingaku} from '../slg/playbook.js';
const {D}=L,FULL=FAC_FULL;
// 配點主屬性（Joe 截圖）；兵學方向（Joe 口述＋卡面色；政宗為推定）
export const TRUTH={
 明智光秀:{pt:['智略'],bg:'機略',qi:'詭計百出'},阿松:{pt:['智略'],bg:'臨戰',qi:'掎手之策'},堀直政:{pt:['智略'],bg:'臨戰',qi:'鼓舞奮迅'},
 立花誾千代:{pt:['武勇'],bg:'陣立',qi:'挫其銳氣'},立花道雪:{pt:['武勇'],bg:'陣立',qi:'勇猛果敢'},北條氏康:{pt:['統率'],bg:'陣立',qi:'生生不息'},
 伊達政宗:{pt:['智略','武勇'],bg:'陣立',qi:'反討之計'},龍造寺隆信:{pt:['統率'],bg:'陣立',qi:'先陣誘敵'},三好實休:{pt:['智略'],bg:'臨戰',qi:'鼓舞奮迅'},
 武田信玄:{pt:['智略'],bg:'武略',qi:'虛實自在'},山本勘助:{pt:['智略'],bg:'機略',qi:'軍律擾亂'},飯富虎昌:{pt:['武勇'],bg:'機略',qi:'軍律擾亂'}};
export function evalPlan(planFn){
  let pt=0,bg=0,qi=0,nq=0,n=0,rows=[];
  for(const t of JOE){const names=t.gens.map(g=>g[0]);
    const st=names.map(x=>({n:x,red:0,st:fullRedStats(D,x,names,t.arm,50,0,FULL)}));
    t.gens.forEach(([x,sk],i)=>{const tr=TRUTH[x],p=planFn({kit,D,n:x,st:st[i].st,skills:sk,team:t,names,i});
      const okp=tr.pt.includes(p.pt),okb=p.bg===tr.bg,okq=tr.qi?p.qi===tr.qi:null;n++;pt+=okp;bg+=okb;if(tr.qi){nq++;qi+=okq}rows.push(`${x.padEnd(6,'　')} 配點 ${p.pt}${okp?'✓':'✗(Joe:'+tr.pt.join('/')+')'}  兵學 ${p.bg}${okb?'✓':'✗(Joe:'+tr.bg+')'}  奇 ${p.qi||'-'}${okq==null?'':okq?'✓':'✗(Joe:'+tr.qi+')'}`)})}
  return{pt,bg,qi,nq,n,rows};
}
// 引擎實際輸出（advisor 內部呼叫 playbook）。改規則前的舊版結果：配點 10/12、兵學方向 3/12、奇節點 0/9。
const engine=({kit,D,n,st,skills,names,team})=>{const tc={names,skillsOf:Object.fromEntries(team.gens.map(g=>[g[0],g[1]]))};
  const a=advisePoints(st,10,{kit,D,n,skills,team:tc}),b=adviseBingaku(kit,D,n,5,skills,st,tc);
  const pts=Object.entries(a.pts).sort((x,y)=>y[1]-x[1]);return{pt:pts[0][0],bg:b?.sel.d||'無',qi:b?.sel.q||null}};
export const playbook=({kit,D,n,st,skills,names,team})=>{
  const tc={names,skillsOf:Object.fromEntries(team.gens.map(g=>[g[0],g[1]]))};
  const a=planPoints(kit,D,n,skills,st,10,tc),b=planBingaku(kit,D,n,skills,st,tc);
  return{pt:a.main,bg:b.dir,qi:b.qi}};
if(process.argv[1]?.endsWith('joe-plan-eval.mjs')){
  for(const [nm,fn] of [['advisor 實際輸出',engine],['playbook 直接輸出',playbook]]){const r=evalPlan(fn);console.log('\n== '+nm);if(nm.startsWith('advisor'))console.log(r.rows.join('\n'));console.log(`配點主屬性 ${r.pt}/${r.n}　兵學方向 ${r.bg}/${r.n}　奇節點 ${r.qi}/${r.nq}`)}}
