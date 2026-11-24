// AI 配隊的平行運算 Worker：載入資料、建隊、打模擬。由 slg/aisearch.js 的 makePool 驅動。
import {makeKit} from './teamlib.js?v=8';
import {makeAI} from './aisearch.js?v=1';
let AI=null,T=null,RED=5,ready=null;
const J=f=>fetch(new URL('../'+f,import.meta.url),{cache:'no-cache'}).then(r=>r.json()).catch(()=>null);
self.onmessage=async ev=>{
  const m=ev.data;
  try{
    if(m.type==='init'){ready=(async()=>{
      const[D,POWER,FIELD,EX,OFFICIAL]=await Promise.all(['land.json','skillpower.json','field.json','generals_extra.json','official.json'].map(J));
      if(m.levels)Object.assign(D.levels,m.levels);
      const KIT=makeKit(D,{power:POWER||{},tags:Object.fromEntries(Object.entries(EX||{}).map(([k,v])=>[k,v.tags||[]])),field:FIELD||{},official:OFFICIAL||[]});
      AI=makeAI(D,KIT,{rOf:n=>m.rmap?.[n]??D.stats?.[n]?.r??5,fac:m.fac,banditSk:m.banditSk||{}});T=m.target;RED=m.red;})();return}
    if(m.type==='eval'){await ready;self.postMessage({type:'res',id:m.id,res:m.jobs.map(j=>AI.evalJob(j,T,RED))})}
  }catch(e){self.postMessage({type:'error',msg:String(e?.message||e)})}
};
