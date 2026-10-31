// 全站共用導覽：三個主分頁（登用模擬／Q版戰棋／武將資料庫），Q版戰棋底下再分打人／打地／劇本／組隊。
// 每頁在 <nav class="site"> 裡留著同樣三個連結當備援（這支沒載入也能切頁），這裡統一重畫並加上子分頁。
// 用法：<script src="site-nav.js?v=1" data-page="gacha|slg|land|generals"></script>（放在 </body> 前）。
// 改動這支要把各頁 script 網址的 ?v= 一起加 1，避免瀏覽器拿到快取裡的舊版。
(()=>{
  const page=document.currentScript?.dataset.page||'';
  const TABS=[['gacha','./','登用模擬'],['slg','slg.html','Q版戰棋'],['generals','generals.html','武將資料庫']];
  const SUB=[['pvp','打人'],['land','打地'],['story','劇本']];
  const inSlg=page==='slg'||page==='land';

  const css=`
nav.site{display:flex;gap:6px;flex-wrap:wrap}
nav.site a{color:var(--muted);text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:4px 14px;font-size:.85rem;white-space:nowrap}
nav.site a[aria-current]{color:var(--ink);background:var(--gold);border-color:var(--gold)}
nav.sub{display:flex;gap:2px;flex-wrap:wrap;border-bottom:1px solid var(--line);margin-top:-6px}
nav.sub a{color:var(--muted);text-decoration:none;padding:6px 14px;font-size:.9rem;border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap}
nav.sub a:hover{color:var(--paper)}
nav.sub a[aria-current]{color:var(--gold);border-bottom-color:var(--gold);font-weight:700}
nav.sub .sep{flex:1}
nav.site a:focus-visible,nav.sub a:focus-visible{outline:2px solid var(--paper);outline-offset:2px}
@media (max-width:560px){
  header.top>nav.site{width:100%;order:-1}
  nav.site a{flex:1;text-align:center;padding:6px 8px}
  nav.sub a{flex:1;text-align:center;padding:8px 6px}
  nav.sub .sep{display:none}
}`;
  document.head.append(Object.assign(document.createElement('style'),{textContent:css}));

  const a=(href,label,cur)=>{const e=document.createElement('a');e.href=href;e.textContent=label;if(cur)e.setAttribute('aria-current','page');return e};
  const cur=page==='land'?'slg':page;
  for(const nav of document.querySelectorAll('nav.site'))
    nav.replaceChildren(...TABS.map(([k,h,l])=>a(h,l,k===cur)));
  if(!inSlg)return;

  // Q版戰棋子分頁：在戰棋頁直接切模式（不重新載入），在組隊頁則是一般連結
  const header=document.querySelector('header.top');if(!header)return;
  const sub=document.createElement('nav');sub.className='sub';sub.setAttribute('aria-label','Q版戰棋');
  const links=SUB.map(([m,l])=>{const e=a(`slg.html?m=${m}`,l,false);e.dataset.m=m;return e});
  const sep=document.createElement('span');sep.className='sep';
  sub.append(...links,sep,a('land.html','組隊・戰報估算',page==='land'));
  header.after(sub);

  if(page!=='slg')return;
  const mark=m=>{for(const e of links)if(e.dataset.m===m)e.setAttribute('aria-current','page');else e.removeAttribute('aria-current')};
  // slg/game.js 載入後送出 slg:mode（目前模式），並接收 slg:setmode 切換
  document.addEventListener('slg:mode',e=>mark(e.detail));
  mark(new URLSearchParams(location.search).get('m'));
  sub.addEventListener('click',e=>{
    const t=e.target.closest('a[data-m]');
    if(!t||!document.documentElement.dataset.slgReady||e.metaKey||e.ctrlKey||e.shiftKey)return;
    e.preventDefault();
    document.dispatchEvent(new CustomEvent('slg:setmode',{detail:t.dataset.m}));
  });
})();
