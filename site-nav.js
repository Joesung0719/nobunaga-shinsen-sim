// 全站共用導覽：頂端四項（登用模擬／武將資料庫／組隊分析／Q版戰棋）。
// 「組隊分析」底下是子分頁：組隊戰報估算、隊伍預測、開荒推薦（打地已併入開荒推薦，對戰預設在隊伍預測）；「Q版戰棋」只留戰役。
// 舊網址 slg.html?m=land 導向開荒推薦、?m=pvp 導向隊伍預測。
// 每頁在 <nav class="site"> 裡留著同樣四個連結當備援（這支沒載入也能切頁）。
// 用法：<script src="site-nav.js?v=7" data-page="gacha|slg|land|rec|predict|generals"></script>（放在 </body> 前）。
// 改動這支要把各頁 script 網址的 ?v= 一起加 1，避免瀏覽器拿到快取裡的舊版。
(()=>{
  const page=document.currentScript?.dataset.page||'';
  const TABS=[['gacha','./','登用模擬'],['generals','generals.html','武將資料庫'],['team','land.html','組隊分析'],['slg','slg.html?m=camp','Q版戰棋']];
  // 子分頁：[key, 網址, 名稱, 在戰棋頁內切換的模式]
  const SUB=[['land','land.html','組隊戰報估算'],['predict','predict.html','隊伍預測'],['rec','recommend.html','開荒推薦']];
  const inTeam=p=>['land','predict','rec'].includes(p);
  {const m=new URLSearchParams(location.search).get('m');if(page==='slg'&&(m==='land'||m==='pvp')){location.replace(m==='land'?'recommend.html':'predict.html');return}}
  const css=`
nav.site{display:flex;gap:6px;flex-wrap:wrap}
nav.site a{color:var(--muted);text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:4px 14px;font-size:.85rem;white-space:nowrap}
nav.site a[aria-current]{color:var(--ink);background:var(--gold);border-color:var(--gold)}
nav.sub{display:flex;gap:2px;flex-wrap:wrap;border-bottom:1px solid var(--line);margin-top:-6px}
nav.sub[hidden]{display:none}
nav.sub a{color:var(--muted);text-decoration:none;padding:6px 14px;font-size:.9rem;border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap}
nav.sub a:hover{color:var(--paper)}
nav.sub a[aria-current]{color:var(--gold);border-bottom-color:var(--gold);font-weight:700}
nav.site a:focus-visible,nav.sub a:focus-visible{outline:2px solid var(--paper);outline-offset:2px}
@media (max-width:560px){
  header.top>nav.site{width:100%;order:-1}
  nav.site a{flex:1;text-align:center;padding:6px 6px}
  nav.sub a{flex:1;text-align:center;padding:8px 4px;font-size:.82rem}
}`;
  document.head.append(Object.assign(document.createElement('style'),{textContent:css}));
  const a=(href,label)=>{const e=document.createElement('a');e.href=href;e.textContent=label;return e};
  const setCur=(e,on)=>on?e.setAttribute('aria-current','page'):e.removeAttribute('aria-current');

  const top=TABS.map(([k,h,l])=>{const e=a(h,l);e.dataset.k=k;return e});
  for(const nav of document.querySelectorAll('nav.site'))nav.replaceChildren(...top);
  const header=document.querySelector('header.top');
  const sub=document.createElement('nav');sub.className='sub';sub.setAttribute('aria-label','組隊分析');
  const subs=SUB.map(([k,h,l,m])=>{const e=a(h,l);e.dataset.s=k;if(m)e.dataset.m=m;return e});
  sub.append(...subs);header?.after(sub);

  const h1=header?.querySelector('h1'),desc=header?.querySelector('p');
  const TITLES={team:['組隊分析','組隊、戰報估算、隊伍預測（含對戰預設）、開荒推薦（含打地）'],slg:['Q版戰棋','戰役關卡：每格一支部隊，接觸就打 8 回合自動戰鬥']};
  // mode：戰棋頁目前的模式（camp 屬於 Q版戰棋，land／pvp 屬於組隊分析）
  const mark=mode=>{
    const group=page==='slg'?(mode==='land'||mode==='pvp'?'team':'slg'):inTeam(page)?'team':page;
    for(const e of top)setCur(e,e.dataset.k===group);
    sub.hidden=group!=='team';
    const cur=page==='slg'?(mode==='pvp'?'pvp':'sim'):page;
    for(const e of subs)setCur(e,e.dataset.s===cur);
    if(page==='slg'&&TITLES[group]){if(h1)h1.textContent=TITLES[group][0];if(desc)desc.textContent=TITLES[group][1];document.title=TITLES[group][0]+(document.title.includes('｜')?'｜'+document.title.split('｜').pop():'')}
  };
  const qm=new URLSearchParams(location.search).get('m');
  mark(page==='slg'?(qm||'camp'):'');
  if(page!=='slg')return;

  // slg/game.js 載入後送出 slg:mode（目前模式），並接收 slg:setmode 切換（不重新載入）
  document.addEventListener('slg:mode',e=>mark(e.detail));
  document.addEventListener('click',e=>{
    const t=e.target.closest('nav.site a[data-k="slg"],nav.sub a[data-m]');
    if(!t||!document.documentElement.dataset.slgReady||e.metaKey||e.ctrlKey||e.shiftKey)return;
    e.preventDefault();
    document.dispatchEvent(new CustomEvent('slg:setmode',{detail:t.dataset.m||'camp'}));
  });
  // 戰棋頁上的「組隊分析」頂端按鈕預設去組隊戰報估算頁（land.html），不切模式
})();
