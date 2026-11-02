// 出陣設定／組隊頁：左邊三隊（主將＋副將兩位），右邊武將名冊（真戰武將）。
// 把名冊卡拖到隊伍格（或先點武將、再點格子）就換人；隊伍格之間也能互拖交換。主將決定兵種（武將自帶兵種）。
// 編好的隊伍直接寫回戰棋頁存檔（localStorage shinsen-slg-v1 的 mine），打地帶三隊、對戰模擬用第一隊。
// 名冊只列登用模擬抽到的武將（Joe 2026-11-02）；隊伍裡原本就有、但還沒抽到的武將照樣留在格子上，標「未抽到」。
import {chibi} from './slg/chibi.js';   // 與 home.js 同一個網址，才會共用 setSpec 設好的武將外觀
import {statsAt,bestArm} from './slg/engine.js';

const ARM_NAME={騎:'騎兵',槍:'足輕',弓:'弓兵',鐵炮:'鐵炮',器械:'器械'};
const TEAM_NAME=['第一隊','第二隊','第三隊'],TEAM_SHORT=['一隊','二隊','三隊'];
const FILTERS=[['all','全部'],['r5','★5'],['r4','★4'],['r3','★3'],['騎','騎'],['槍','足輕'],['弓','弓'],['鐵炮','鐵炮']];
const SAVE='shinsen-slg-v1';
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=n=>Math.round(n).toLocaleString('en-US');
const read=()=>{try{return JSON.parse(localStorage.getItem(SAVE)||'null')||{}}catch(e){return{}}};
const write=v=>{try{localStorage.setItem(SAVE,JSON.stringify(v))}catch(e){}};

// 只取頭部的圓形頭像：把 Q 版全身 SVG 的 viewBox 裁到頭（騎兵整個人往上移 12）
export const faceSVG=(g,arm,side=0)=>chibi({n:g.n,f:g.f},{arm,side}).replace(/viewBox="[^"]+"/,`viewBox="10 ${arm==='騎'?-8:4} 40 40"`);

export function mountFormation({root,W,POOL,owned=()=>new Set(POOL.map(g=>g.n)),sfx=()=>{}}){
  const byN=new Map(POOL.map(g=>[g.n,g]));
  const armOf=n=>bestArm(W,[n])||'槍';   // 武將特性帶的兵種（騎練、弓練…），沒有就足輕
  const rOf=n=>byN.get(n)?.r||W.stats?.[n]?.r||3;
  let teams=[],filter='all',sel=null,active=0,justDragged=false;

  function load(){
    const sv=read();
    teams=[0,1,2].map(i=>{const t=sv.mine?.[i];return t&&t.gens?.length===3?structuredClone(t):null});
    // 還沒開過戰棋頁（沒有存檔）：用 5★ 武將補滿，三隊不重複
    const used=new Set(teams.flatMap(t=>t?t.gens.map(g=>g.n):[]));
    const own=owned(),byR=a=>a.sort((x,y)=>y.r-x.r||x.id-y.id);   // 先用抽到的武將（星級高的先），不夠再用 5★ 補
    const free=[...byR(POOL.filter(g=>own.has(g.n)&&!used.has(g.n))),...POOL.filter(g=>g.r===5&&!own.has(g.n)&&!used.has(g.n))].map(g=>g.n);
    teams=teams.map(t=>{if(t)return t;const ns=free.splice(0,3);return{src:'custom',my:true,arm:armOf(ns[0]),gens:ns.map(n=>({n,s:[],t:10000,red:0,bg:null}))}});
  }
  function store(){
    const sv=read();sv.mine=sv.mine||[];
    teams.forEach((t,i)=>{sv.mine[i]=t});
    write(sv);
  }
  const where=n=>{for(let t=0;t<3;t++){const i=teams[t].gens.findIndex(g=>g.n===n);if(i>=0)return[t,i]}return null};
  // src: {n} 名冊卡、{t,i} 隊伍格；放到隊伍格 (t,i)
  function place(src,t,i){
    const tgt=teams[t].gens[i];
    let from=src.t!=null?[src.t,src.i]:where(src.n);
    if(from&&from[0]===t&&from[1]===i)return false;
    if(from){   // 已在隊伍裡：兩格交換（武技、覺醒、軍略跟著人走）
      const[t2,i2]=from;teams[t].gens[i]=teams[t2].gens[i2];teams[t2].gens[i2]=tgt;touch(t2,i2);
    }else teams[t].gens[i]={n:src.n,s:[],t:tgt?.t||10000,red:0,bg:null};
    touch(t,i);active=t;store();sfx('select');return true;
  }
  function touch(t,i){const T=teams[t];T.src='custom';T.my=true;if(i===0)T.arm=armOf(T.gens[0].n)}   // 主將決定兵種

  const ringCls=n=>'r'+rOf(n);
  let own=new Set();
  function teamHTML(T,t){
    const lead=T.gens[0],st=statsAt(W,lead.n,50,rOf(lead.n)),cost=T.gens.reduce((a,g)=>a+(+W.stats?.[g.n]?.c||0),0);
    return `<div class="fTeam${t===active?' on':''}" data-team="${t}">
      <div class="fTh"><b>${TEAM_NAME[t]}</b><span>兵力 ${fmt(T.gens.reduce((a,g)=>a+(g.t||0),0))}</span></div>
      <div class="fSlots">${T.gens.map((g,i)=>{const on=sel&&sel.t===t&&sel.i===i;
        return `<button type="button" class="fSlot" data-slot="${t}-${i}" aria-pressed="${!!on}" aria-label="${TEAM_NAME[t]}${i?'副將':'主將'} ${esc(g.n)}">
          <span class="face ${ringCls(g.n)}">${faceSVG({n:g.n,f:byN.get(g.n)?.f||W.stats?.[g.n]?.f||''},T.arm)}</span>
          <span class="pos">${i?'副將':'主將'}${own.has(g.n)?'':' · 未抽到'}</span><span class="nm">${esc(g.n)}</span></button>`}).join('')}
        <div class="fStat"><b>${ARM_NAME[T.arm]||T.arm}</b><span>統率 ${Math.round(st.統率)}</span><span>速度 ${Math.round(st.速度)}</span><span>Cost ${cost}</span></div>
      </div></div>`;
  }
  function rosterList(){
    return POOL.filter(g=>own.has(g.n)).filter(g=>filter==='all'||(filter[0]==='r'&&filter.length===2?g.r===+filter[1]:armOf(g.n)===filter))
      .sort((a,b)=>b.r-a.r||a.id-b.id);
  }
  function render(){
    own=owned();
    const sv=read(),L=W.levels?.[sv.lv||6]||W.levels?.['6'];
    root.querySelector('.fTitle').textContent=`打地 · 守將 Lv ${L?.glv??'?'} · 守軍 ${L?.waves||1} 隊 · 可出 3 隊`;
    root.querySelector('.fTeams').innerHTML=teams.map(teamHTML).join('');
    root.querySelector('.fRh h2').textContent=`武將名冊 ${own.size}/${POOL.length}`;
    root.querySelector('.fFilters').innerHTML=FILTERS.map(([k,l])=>`<button type="button" class="chip" data-f="${k}" aria-pressed="${filter===k}">${l}</button>`).join('');
    const list=rosterList();
    root.querySelector('.fGrid').innerHTML=!own.size?`<p class="fEmpty">還沒有抽到的武將。<br>先到登用模擬抽卡，抽到的武將會出現在這裡。<br><a class="btn" href="./">前往登用模擬</a></p>`
      :!list.length?`<p class="fEmpty">這個篩選下沒有抽到的武將。</p>`:list.map(g=>{const w=where(g.n),on=sel&&sel.n===g.n;
      return `<button type="button" class="fCard ${ringCls(g.n)}${w?' used':''}" data-n="${esc(g.n)}" aria-pressed="${!!on}" title="${esc(g.n)} ${g.r}★ ${ARM_NAME[armOf(g.n)]}${w?'（'+TEAM_NAME[w[0]]+'）':''}">
        <span class="face ${ringCls(g.n)}">${faceSVG(g,armOf(g.n))}</span><span class="nm">${esc(g.n)}</span>
        <span class="st">${'★'.repeat(g.r)}</span>${w?`<span class="tag">${TEAM_SHORT[w[0]]}</span>`:''}</button>`}).join('');
    root.querySelector('.fHint').textContent=sel?`已選 ${sel.n||teams[sel.t].gens[sel.i].n}：點一個隊伍格放上去（再點一次取消）`:'把名冊武將拖到隊伍格，或先點武將、再點格子。隊伍格之間互拖可交換。主將決定兵種。';
  }

  // ---- 點選（滑鼠、觸控點一下、鍵盤 Enter 都走 click） ----
  root.addEventListener('click',e=>{
    if(justDragged){justDragged=false;return}
    const f=e.target.closest('[data-f]');if(f){filter=f.dataset.f;sfx('select');render();return}
    const c=e.target.closest('.fCard'),s=e.target.closest('.fSlot');
    if(c){const n=c.dataset.n;sel=sel?.n===n?null:{n};render();return}
    if(s){const[t,i]=s.dataset.slot.split('-').map(Number);
      if(sel&&!(sel.t===t&&sel.i===i)){place(sel,t,i);sel=null}
      else sel=sel?null:{t,i};
      render();
      root.querySelector(`[data-slot="${t}-${i}"]`)?.focus();
    }
  });
  root.querySelector('.fGo').onclick=()=>{store();try{sessionStorage.setItem('slg-title','1')}catch(e){}location.href='slg.html?m=land'};   // 從這裡出陣不再播戰棋頁的標題畫面

  // ---- 拖曳（Pointer Events：滑鼠與觸控共用；名冊可上下滑動捲動，橫向拖出才算拖曳） ----
  let drag=null;
  root.addEventListener('pointerdown',e=>{
    const c=e.target.closest('.fCard,.fSlot');if(!c||e.button>0)return;
    drag={el:c,x:e.clientX,y:e.clientY,id:e.pointerId,on:false,
      src:c.classList.contains('fCard')?{n:c.dataset.n}:(([t,i])=>({t,i}))(c.dataset.slot.split('-').map(Number))};
  });
  addEventListener('pointermove',e=>{
    if(!drag||e.pointerId!==drag.id)return;
    if(!drag.on){
      if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<8)return;
      drag.on=true;
      const face=drag.el.querySelector('.face'),r=face.getBoundingClientRect();
      drag.ghost=Object.assign(face.cloneNode(true),{className:face.className+' fGhost'});
      Object.assign(drag.ghost.style,{width:r.width+'px',height:r.height+'px'});
      document.body.append(drag.ghost);drag.el.classList.add('dragging');root.classList.add('isDrag');
    }
    e.preventDefault();
    drag.ghost.style.transform=`translate(${e.clientX}px,${e.clientY}px) translate(-50%,-50%) scale(1.1)`;
    const over=document.elementFromPoint(e.clientX,e.clientY)?.closest('.fSlot');
    root.querySelectorAll('.fSlot.over').forEach(s=>s!==over&&s.classList.remove('over'));
    over?.classList.add('over');
  },{passive:false});
  const end=e=>{
    if(!drag||e.pointerId!==drag.id)return;
    const d=drag;drag=null;
    if(!d.on)return;
    d.ghost.remove();d.el.classList.remove('dragging');root.classList.remove('isDrag');justDragged=true;setTimeout(()=>{justDragged=false},0);
    const over=e.type==='pointerup'&&document.elementFromPoint(e.clientX,e.clientY)?.closest('.fSlot');
    if(over){const[t,i]=over.dataset.slot.split('-').map(Number);place(d.src,t,i);sel=null}
    render();
  };
  addEventListener('pointerup',end);addEventListener('pointercancel',end);

  return{show(){load();sel=null;render()},teams:()=>teams,place:(src,t,i)=>{const r=place(src,t,i);render();return r}};
}
