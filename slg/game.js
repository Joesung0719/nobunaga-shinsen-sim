// 真戰 Q版戰棋：設定 → 地圖（每格一支部隊）→ 接觸時 8 回合自動戰鬥（engine.js）並播放。
import {battle,parseSkill,statsAt,innateOf,K,COUNTER,ST4} from './engine.js?v=8';
import {chibi,SIDE_COL} from './chibi.js?v=8';
import {isoTerrain,isoGeom} from './iso.js?v=8';
import {compile as bgCompile,summary as bgSummary} from './bingaku.js?v=8';
import {SCENARIOS} from './scenarios.js?v=8';
import {play,sfx,unlock,setAudio,audioSettings} from './audio.js?v=8';

// 網站剛更新時，瀏覽器可能拿到舊的 slg.html 配新的 js（或反過來），版面會整個跑掉。
// 兩邊各記一個版本號，不一致就強制重新載入。每次改動 slg/ 或 slg.html 都要把版本號一起加 1：
// slg.html 的 --slg-ver 與 script 的 ?v=、這裡的 VER、以及 game.js／engine.js 的 import 網址 ?v=。
// 網址帶版本號，新頁面一定抓到新程式，不會配到瀏覽器快取裡的舊 js。
const VER='8';
if(getComputedStyle(document.documentElement).getPropertyValue('--slg-ver').replace(/['"\s]/g,'')!==VER){
  let n=0;try{n=+sessionStorage.getItem('slg-reload')||0;sessionStorage.setItem('slg-reload',n+1)}catch{}
  if(n<2){location.reload();await new Promise(()=>{})}
}else try{sessionStorage.removeItem('slg-reload')}catch{}
const D=await (await fetch('land.json',{cache:'no-cache'})).json();
const CARDS=await (await fetch('data.json',{cache:'no-cache'})).json();
const $=id=>document.getElementById(id);
const el=(t,a={},...kids)=>{const e=document.createElement(t);for(const[k,v]of Object.entries(a)){if(k==='class')e.className=v;else if(k==='html')e.innerHTML=v;else if(k.startsWith('on'))e[k]=v;else e.setAttribute(k,v)}for(const c of kids)if(c!=null)e.append(c);return e};
const fmt=n=>Math.round(n).toLocaleString('en-US');
const pick=a=>a[Math.floor(Math.random()*a.length)];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// ---- roster ----
const ROSTER=new Map();
for(const c of CARDS)ROSTER.set(c.n,{n:c.n,r:c.r,c:c.c,f:c.f});
for(const[n,x]of Object.entries(D.stats))ROSTER.set(n,Object.assign({n,r:5},ROSTER.get(n),{c:x.c,f:x.f}));
for(const t of Object.values(D.teams))for(const g of t)if(!ROSTER.has(g.n))ROSTER.set(g.n,{n:g.n,r:g.r,c:g.c,f:''});
const facOf=n=>ROSTER.get(n)?.f||'';
// 武將頭像：沿用武將資料庫的卡圖（img/），沒有卡圖的武將用 Q 版人物
const ART=new Map(Object.entries(D.art||{}));for(const c of CARDS)ART.set(c.n,c.id);
const artSrc=i=>typeof i==='number'?`img/c${String(i).padStart(3,'0')}.webp`:`img/${i}.webp`;
const portrait=(n,fallback)=>ART.has(n)?`<img class="pt" src="${artSrc(ART.get(n))}" alt="${n}">`:fallback;
const costOf=n=>+ROSTER.get(n)?.c||0;
const POOL5=Object.entries(D.stats).filter(([,x])=>x.season).map(([n])=>n);
const INNATE=new Set([...Object.values(D.innate),...Object.values(D.stats).map(x=>x.inn).filter(Boolean)]);
const PSK=new Map();const ps=n=>{if(!PSK.has(n))PSK.set(n,parseSkill(n,D));return PSK.get(n)};
const GOOD=Object.keys(D.skillText).filter(n=>!INNATE.has(n)&&ps(n).modeled==='text'&&['主動','突擊','指揮','被動'].includes(ps(n).kind));
const ARMS=[['騎','騎兵'],['弓','弓兵'],['槍','足輕'],['鐵炮','鐵炮'],['器械','器械']];
const MOVE={騎:3,器械:1},RANGE={弓:2,鐵炮:2};
const W=7,H=9,DAYS=20,DRAW_DAYS=3;

// ---- setup state ----
const KEY='shinsen-slg-v1';
function load(){try{return JSON.parse(localStorage.getItem(KEY))||{}}catch{return{}}}
function save(){try{localStorage.setItem(KEY,JSON.stringify(SET))}catch{}}
function randomTeam(){
  for(let k=0;k<400;k++){
    const ns=[];while(ns.length<3){const n=pick(POOL5);if(!ns.includes(n))ns.push(n)}
    const c=ns.reduce((a,n)=>a+costOf(n),0);
    if(c>20||c<16)continue;
    const sk=[];while(sk.length<6){const s=pick(GOOD);if(!sk.includes(s))sk.push(s)}
    return{src:'random',arm:pick(['騎','弓','槍','鐵炮']),gens:ns.map((n,i)=>({n,s:sk.slice(i*2,i*2+2),t:10000}))};
  }
}
function builderTeam(){
  let S;try{S=JSON.parse(localStorage.getItem('shinsen-land-v1'))}catch{}
  if(!S?.my?.gens)return null;
  return{src:'builder',arm:S.my.arm||'槍',gens:S.my.gens.map((m,i)=>({n:m.n,s:(m.s||[]).filter(Boolean),t:m.t||10000,st:S.my.calc?.[i]||null,red:m.red||0,bg:m.bg||null}))};
}
const SET=Object.assign({mode:'land',lv:6,foe:'ai',gar:'hold',mine:[],enemy:[]},load());
for(const k of['mine','enemy'])for(let i=0;i<3;i++)if(!SET[k][i])SET[k][i]=randomTeam();
setAudio(SET.audio||{});
document.addEventListener('pointerdown',unlock);
function renderSound(){
  const A=audioSettings(),box=$('snd');
  const tg=(k,l)=>{const b=el('button',{type:'button',class:'chip','aria-pressed':String(A[k])},l);b.onclick=()=>{setAudio({[k]:!A[k]});SET.audio={...audioSettings()};save();renderSound()};return b};
  const v=el('input',{type:'range',min:'0',max:'1',step:'0.05',value:String(A.vol),'aria-label':'音量'});
  v.oninput=()=>{setAudio({vol:+v.value});SET.audio={...audioSettings()};save()};
  box.replaceChildren(tg('music','音樂'),tg('sfx','音效'),el('label',{class:'vol'},'音量',v));
}
renderSound();

// ---- 標題畫面：按一下開始（同時解鎖聲音），法螺貝＋太鼓開場，之後設定畫面放標題曲 ----
function titleScreen(){
  const t=$('title');
  t.querySelector('.tfigs').innerHTML=chibi({n:'織田信長',f:facOf('織田信長')},{arm:'騎',side:0,boss:true})+chibi({n:'今川義元',f:facOf('今川義元')},{arm:'弓',side:1,boss:true,flip:true});
  const mute=$('titleMute');
  const drawMute=()=>{const on=audioSettings().music||audioSettings().sfx;mute.textContent=on?'聲音：開':'聲音：關';mute.setAttribute('aria-pressed',String(on))};
  mute.onclick=e=>{e.stopPropagation();const on=!(audioSettings().music||audioSettings().sfx);setAudio({music:on,sfx:on});SET.audio={...audioSettings()};save();drawMute();renderSound()};
  drawMute();
  let gone=false;
  const go=()=>{
    if(gone)return;gone=true;unlock();sfx('opening');t.classList.add('out');
    try{sessionStorage.setItem('slg-title','1')}catch{}
    removeEventListener('keydown',key);
    setTimeout(()=>{t.hidden=true;if(!G)play('title')},1100);
  };
  const key=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}};
  t.onclick=go;addEventListener('keydown',key);
}
let seen=false;try{seen=!!sessionStorage.getItem('slg-title')}catch{}
if(seen){$('title').hidden=true;document.addEventListener('pointerdown',()=>{if(!G)play('title')},{once:true})}else titleScreen();

// stats used for a team: builder teams carry the builder's totals (Lv50 + 配點 + 加成);
// random teams use Lv50 + 50 free points on the higher of 武勇／智略 + 兵種營 Lv5 (10%)
function genStats(g){
  if(g.st)return{...g.st};
  const s=statsAt(D,g.n,50,ROSTER.get(g.n)?.r);
  const k=s.武勇>=s.智略?'武勇':'智略';s[k]+=50;
  for(const x of ST4)s[x]=Math.round(s[x]*1.1*10)/10;
  return s;
}
function battleTeam(spec,side){
  return{name:spec.gens[0].n+'隊',side,arm:spec.arm,terrain:'平',
    gens:spec.gens.map(g=>({n:g.n,f:facOf(g.n),st:genStats(g),troops:g.t,max:g.t,skills:[innateOf(D,g.n),...g.s].filter(Boolean).map(ps),
      bg:bgCompile(g.bg,ROSTER.get(g.n)?.r,g.red||0),bgs:bgSummary(g.bg,ROSTER.get(g.n)?.r)}))};
}
const teamsAt=lv=>Object.keys(D.teams).filter(k=>new RegExp(`^l${lv}[a-z]$`).test(k));
function armOfGarrison(k){const r=D.reports.find(r=>r.t===k&&r.ty);return r?r.ty:pick(['騎','弓','槍','鐵炮'])}
function garrisonTeam(k,lv){
  const L=D.levels[lv],t=D.teams[k];
  return{name:t[2].n+'隊',side:1,arm:armOfGarrison(k),terrain:'城',key:k,
    gens:[t[2],t[0],t[1]].map(g=>({n:g.n,f:facOf(g.n),st:statsAt(D,g.n,L.glv,g.r),troops:L.per,max:L.per,skills:g.s.map(ps)}))};
}

// ---- setup UI ----
const MODES=[['land','打地'],['pvp','打人'],['story','劇本']];
function chips(box,opts,cur,on){
  box.replaceChildren(...opts.map(([v,l])=>{const b=el('button',{type:'button',class:'chip','aria-pressed':String(cur===v)},l);b.onclick=()=>on(v);return b}));
}
function teamCard(spec,side,i,list){
  const cost=spec.gens.reduce((a,g)=>a+costOf(g.n),0);
  const figs=el('div',{class:'figs'},...spec.gens.map((g,j)=>el('div',{class:'fig',html:chibi({n:g.n,f:facOf(g.n)},{arm:spec.arm,side,boss:j===0})+`<span>${g.n}</span>`})));
  const arms=el('div',{class:'row arms'});
  chips(arms,ARMS.map(([k,l])=>[k,l]),spec.arm,v=>{spec.arm=v;if(spec.my)spec.my.arm=v;save();renderSetup()});
  // 兵學是每位武將各自的配點，在打地頁組隊設定（按「編輯這隊」）
  const bgl=spec.gens.map(g=>[g.n,bgSummary(g.bg,ROSTER.get(g.n)?.r)]).filter(x=>x[1]);
  const bg=el('small',{class:'muted'},bgl.length?'兵學：'+bgl.map(x=>`${x[0]} ${x[1]}`).join('｜'):'兵學：未設定（按「編輯這隊」配點）');
  const ed=el('button',{type:'button',class:'btn'},'編輯這隊');
  ed.onclick=()=>{save();location.href=`land.html?slg=${list===SET.mine?'mine':'enemy'}-${i}`};
  const rnd=el('button',{type:'button',class:'btn ghost'},'隨機換一隊');rnd.onclick=()=>{list[i]=randomTeam();save();renderSetup()};
  const imp=el('button',{type:'button',class:'btn ghost'},'帶入打地頁的組隊');
  imp.onclick=()=>{const t=builderTeam();if(!t){alert('還沒有組隊資料：請先到「打地模擬」頁面的「我方組隊」選好武將。');return}list[i]=t;save();renderSetup()};
  const skills=el('div',{class:'sks'},...spec.gens.map(g=>el('div',{},el('b',{},g.n),' ',[innateOf(D,g.n),...g.s].filter(Boolean).map(s=>skillChip(s)).reduce((a,c)=>(a.append(c),a),el('span')))));
  return el('div',{class:'tcard',style:`--side:${SIDE_COL[side]}`},
    el('div',{class:'th'},el('b',{},`第 ${i+1} 隊 · ${spec.gens[0].n}隊`),el('small',{},`Cost ${cost} · ${fmt(spec.gens.reduce((a,g)=>a+g.t,0))} 兵 · ${spec.my?'自選':spec.src==='builder'?'打地頁組隊':'隨機'}`)),
    figs,arms,skills,bg,el('div',{class:'row'},ed,rnd,imp));
}
const MOD_LABEL={text:['依說明','t'],guess:['推估','g'],none:['未模擬','n']};
function skillChip(n){
  const s=ps(n),[l,c]=MOD_LABEL[s.modeled];
  const b=el('button',{type:'button',class:`sk ${c}`,title:`${n}（${s.kind}／${l}）`},n);
  b.onclick=()=>showSkill(n);return b;
}
function showSkill(n){
  const s=ps(n),[l]=MOD_LABEL[s.modeled];
  const parts=[];
  if(s.rate!=null&&s.modeled!=='none')parts.push(`發動率 ${Math.round(s.rate*100)}%${s.each?'（每回合判定）':''}`);
  if(s.dmg)parts.push(`${s.dtype==='auto'?'兵刃／謀略':s.dtype}傷害率 ${Math.round(s.dmg*100)}%，${s.n[0]===s.n[1]?s.n[0]:s.n.join('–')} 個目標`);
  if(s.heal)parts.push(`治療率 ${Math.round(s.heal*100)}%`);
  if(s.status)parts.push(`${Math.round(s.status.p*100)}% 使目標${s.status.k.join('、')} ${s.status.dur} 回合`);
  if(s.self)parts.push(`自身${s.self.ks.join('、')} +${s.self.v}`);
  if(s.prep)parts.push('準備 1 回合後發動');
  $('skDlg').replaceChildren(el('div',{class:'skd'},
    el('h3',{},n,el('small',{},` ${s.kind}・${s.g}・${l}`)),
    el('p',{},s.text||'（還沒有收錄這個戰法的說明文字）'),
    el('p',{class:'muted'},s.modeled==='none'?'戰棋模擬目前不計算這個戰法的效果。':s.modeled==='guess'?`沒有說明文字，用通用值推估：${parts.join('；')}`:`模擬採用：${parts.join('；')}（數值取滿級）`),
    el('form',{method:'dialog'},el('button',{class:'btn'},'關閉'))));
  $('skDlg').showModal();
}
function renderSetup(){
  chips($('modeChips'),MODES,SET.mode,v=>{SET.mode=v;save();renderSetup()});
  $('lvRow').hidden=$('garRow').hidden=SET.mode!=='land';$('foeRow').hidden=SET.mode!=='pvp';
  chips($('garChips'),[['hold','固守（同遊戲）'],['guard','出擊（練習用）']],SET.gar,v=>{SET.gar=v;save();renderSetup()});
  chips($('lvChips'),[3,4,5,6,7,8,9,10].map(v=>[v,`Lv${v}`]),SET.lv,v=>{SET.lv=v;save();renderSetup()});
  chips($('foeChips'),[['ai','對電腦'],['2p','雙人輪流（同一支手機）']],SET.foe,v=>{SET.foe=v;save();renderSetup()});
  const L=D.levels[SET.lv];
  $('lvNote').textContent=SET.mode==='land'?`守將 Lv${L.glv}・每人 ${fmt(L.per)} 兵・${L.waves||1} 隊守軍・${L.note}`:'';
  $('storyRow').hidden=SET.mode!=='story';$('mineWrap').hidden=SET.mode==='story';$('mineNote').hidden=SET.mode==='story';
  SET.sc=SCENARIOS.find(x=>x.id===SET.sc)?.id||SCENARIOS[0].id;
  $('storyList').replaceChildren(...SCENARIOS.map(sc=>{
    const b=el('button',{type:'button',class:'scard','aria-pressed':String(SET.sc===sc.id)},
      el('b',{},sc.name),el('small',{},sc.year),el('p',{},sc.brief),
      el('div',{class:'figs'},...sc.units.filter(u=>u.side===0).map(u=>el('div',{class:'fig',html:chibi({n:u.gens[0],f:facOf(u.gens[0])},{arm:u.arm,side:0,boss:true})+`<span>${u.gens[0]}</span>`}))));
    b.onclick=()=>{SET.sc=sc.id;save();renderSetup()};return b}));
  $('mine').replaceChildren(...SET.mine.map((t,i)=>teamCard(t,0,i,SET.mine)));
  $('enemyWrap').hidden=SET.mode!=='pvp';
  $('enemy').replaceChildren(...SET.enemy.map((t,i)=>teamCard(t,1,i,SET.enemy)));
}

// ---- map ----
let G=null;
// 遊戲內地形不擋路也沒有攻防加成（Joe），目前地形只是裝飾；之後有數值（例如火炬）再加移動耗費
const TER={平:{c:1},林:{c:1},山:{c:1},水:{c:1},橋:{c:1},城:{c:1}};
function genMap(mode){
  for(let tries=0;tries<200;tries++){
    const T=Array.from({length:H},()=>Array(W).fill('平'));
    for(const y of[1,2,3,4,5,6,7])for(let x=0;x<W;x++){const r=Math.random();T[y][x]=r<.17?'林':r<.25?'山':'平'}
    if(mode==='land')for(const[x,y]of[[2,0],[3,0],[4,0],[2,1],[3,1],[4,1]])T[y][x]='城';
    const spawn0=[[1,8],[3,8],[5,8]],spawn1=mode==='land'?[[3,1],[2,0],[4,0]]:[[1,0],[3,0],[5,0]];
    for(const[x,y]of[...spawn0,...spawn1])if(T[y][x]==='山'||T[y][x]==='林')T[y][x]='平';
    // every spawn must reach the other side
    const seen=new Set(['3,8']),q=[[3,8]];
    while(q.length){const[x,y]=q.shift();for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,k=nx+','+ny;if(nx<0||ny<0||nx>=W||ny>=H||seen.has(k)||TER[T[ny][nx]].c>9)continue;seen.add(k);q.push([nx,ny])}}
    if([...spawn0,...spawn1].every(([x,y])=>seen.has(x+','+y)))return{T,spawn0,spawn1};
  }
}
// skills for scenario generals: innate + 2 picked from the modelled pool by name (same every time)
function fixedSkills(n){const h=[...n].reduce((a,c)=>(a*31+c.codePointAt(0))>>>0,7);return[GOOD[h%GOOD.length],GOOD[(h>>>7)%GOOD.length]]}
function startStory(){
  const sc=SCENARIOS.find(x=>x.id===SET.sc);let id=0;
  const T=sc.map.map(r=>[...r]);
  const units=sc.units.map(u=>({id:id++,side:u.side,key:u.key,x:u.x,y:u.y,ai:u.ai,anchor:u.anchor,r:u.r,lord:u.lord,target:u.target,onRainEnd:u.onRainEnd,
    team:battleTeam({arm:u.arm,gens:u.gens.map(n=>({n,s:u.s?.[n]||fixedSkills(n),t:u.t}))},u.side)}));
  G={T,units,day:1,phase:0,sel:null,mode:'story',sc,foe:'ai',over:null,busy:false,log:[],
    st:{killDay:0,killRain:false,finisher:null,routed:[],hitBy:{},said:new Set()}};play('map');
  $('setup').hidden=true;$('game').hidden=false;
  addLog(`劇本「${sc.name}」：${sc.brief}`);
  renderObj();renderBoard();
  $('board').scrollIntoView({behavior:'smooth',block:'start'});
  talk(sc.talk.start);
}
// 勝敗條件與隱藏條件（隱藏條件開打時只給提示）
function renderObj(){
  const box=$('obj');box.hidden=G.mode!=='story';if(box.hidden)return;
  const sc=G.sc;
  box.replaceChildren(
    el('div',{},el('b',{class:'ok'},'勝利'),' '+(sc.win||[]).join('、')),
    el('div',{},el('b',{class:'ng'},'敗北'),' '+(sc.lose||[]).join('、')),
    sc.hidden?.length?el('details',{},el('summary',{},`隱藏條件 ×${sc.hidden.length}（結算時揭曉，達成越多評價越高）`),
      el('ul',{},...sc.hidden.map(h=>el('li',{},'？？？ ',el('span',{class:'muted'},h.hint))))):'');
}
const raining=()=>G.mode==='story'&&G.sc.rain&&G.day>=G.sc.rain[0]&&G.day<=G.sc.rain[1];
// story dialogue: one line per tap
async function talk(lines){
  if(!lines?.length)return;
  const dlg=$('talk');
  for(const ln of lines){
    const f=facOf(ln.who),side=G.units.find(u=>u.team.gens.some(g=>g.n===ln.who))?.side??0;
    dlg.replaceChildren(el('div',{class:'tk'},el('div',{class:'fig',html:portrait(ln.who,chibi({n:ln.who,f},{side,boss:true}))}),
      el('div',{class:'tx'},el('b',{style:`color:${SIDE_COL[side]}`},ln.who),el('p',{},ln.text),el('small',{class:'muted'},'點一下繼續'))));
    if(!dlg.open)dlg.showModal();
    sfx('select');
    await new Promise(r=>{dlg.onclick=r;dlg.oncancel=e=>{e.preventDefault();r()}});
  }
  dlg.close();
}
function startGame(){
  if(SET.mode==='story')return startStory();
  const m=genMap(SET.mode);let id=0;
  const units=[];
  SET.mine.forEach((s,i)=>units.push({id:id++,side:0,x:m.spawn0[i][0],y:m.spawn0[i][1],team:battleTeam(s,0)}));
  if(SET.mode==='land'){
    const keys=[...teamsAt(SET.lv)].sort(()=>Math.random()-.5).slice(0,D.levels[SET.lv].waves||1);
    // 遊戲裡的守軍不會離開土地；「出擊」是練習用：守軍會主動前進攻擊
    keys.forEach((k,i)=>units.push({id:id++,side:1,x:m.spawn1[i][0],y:m.spawn1[i][1],team:garrisonTeam(k,SET.lv),garrison:true,
      ...(SET.gar==='guard'?{ai:'advance'}:{})}));
  }else SET.enemy.forEach((s,i)=>units.push({id:id++,side:1,x:m.spawn1[i][0],y:m.spawn1[i][1],team:battleTeam(s,1)}));
  G={T:m.T,units,day:1,phase:0,sel:null,mode:SET.mode,foe:SET.foe,garAi:SET.mode==='land'&&SET.gar==='guard',over:null,busy:false,log:[]};play('map');
  $('setup').hidden=true;$('game').hidden=false;
  addLog(SET.mode==='land'?`出征 Lv${SET.lv} 土地：擊破全部 ${units.filter(u=>u.side).length} 隊守軍即可佔領（${DAYS} 天內）。`:'打人：擊潰對方全部部隊獲勝。');
  renderObj();renderBoard();
  $('board').scrollIntoView({behavior:'smooth',block:'start'});
}
const alive=u=>u.team.gens[0].troops>0;
const unitAt=(x,y)=>G.units.find(u=>u.x===x&&u.y===y&&alive(u));
const total=t=>t.gens.reduce((a,g)=>a+Math.max(0,g.troops),0);
const totalMax=t=>t.gens.reduce((a,g)=>a+g.max,0);
const mv=u=>MOVE[u.team.arm]||2,rg=u=>RANGE[u.team.arm]||1;
const dist=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
function reach(u){   // tiles u can move to this turn: Map "x,y" → cost
  const out=new Map([[u.x+','+u.y,0]]),q=[[u.x,u.y,0]];
  while(q.length){
    q.sort((a,b)=>a[2]-b[2]);const[x,y,c]=q.shift();
    for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=W||ny>=H)continue;
      const nc=c+TER[G.T[ny][nx]].c;if(nc>mv(u))continue;
      const o=unitAt(nx,ny);if(o&&o.side!==u.side)continue;   // allies can be passed, enemies block
      const k=nx+','+ny;if(out.has(k)&&out.get(k)<=nc)continue;
      out.set(k,nc);q.push([nx,ny,nc]);
    }
  }
  for(const k of[...out.keys()]){const[x,y]=k.split(',').map(Number);const o=unitAt(x,y);if(o&&o!==u)out.delete(k)}
  return out;
}
const targets=(u,from=u)=>G.units.filter(o=>alive(o)&&o.side!==u.side&&dist(from,o)<=rg(u));
const ctrl=()=>G.mode==='pvp'&&G.foe==='2p'?G.phase:0;
const aiPhase=()=>G.phase===1&&(G.mode==='story'||G.mode==='pvp'&&G.foe==='ai'||G.garAi);

function addLog(s){G.log.unshift({d:G.day,s});renderLog()}
function renderLog(){$('mapLog').replaceChildren(...G.log.slice(0,40).map(x=>el('li',{},el('small',{},`第${x.d}天 `),x.s)))}

function renderBoard(){
  const box=$('board');
  const sel=G.sel,R=sel&&!sel.moved?reach(sel):null,A=sel?targets(sel):[];
  const mark=new Map();
  if(R)for(const k of R.keys())mark.set(k,'mv');
  for(const o of A)mark.set(o.x+','+o.y,'atk');
  if(sel)mark.set(sel.x+','+sel.y,'sel');
  const g=isoGeom(W,H);
  box.style.setProperty('--ar',`${g.vw}/${g.vh}`);
  // keep the unit elements between renders so a move slides instead of jumping
  const old=new Map([...box.querySelectorAll('.unit')].map(e=>[e.dataset.id,e]));
  const svg=`<svg class="iso" viewBox="0 0 ${g.vw} ${g.vh}" xmlns="http://www.w3.org/2000/svg">${isoTerrain(G.T,mark)}</svg>`;
  const map=box.querySelector('svg.iso');if(map)map.outerHTML=svg;else box.insertAdjacentHTML('afterbegin',svg);
  box.querySelector('svg.iso').onclick=e=>{const t=e.target.closest('.tl');if(t)tap(+t.dataset.x,+t.dataset.y)};
  const pct=(v,of)=>`${v/of*100}%`;
  for(const u of G.units){
    const prev=old.get(String(u.id));old.delete(String(u.id));
    if(!alive(u)){prev?.remove();continue}
    const b=u.team.gens[0],tot=total(u.team),mx=totalMax(u.team);
    const dn=u.drawUntil&&u.drawUntil>=G.day;
    const[cx,cy]=g.at(u.x,u.y,G.T);
    const pos=`--x:${u.x};--y:${u.y};--w:${pct(64,g.vw)};--h:${pct(82,g.vh)};--l:${pct(cx-32,g.vw)};--t:${pct(cy+10-82,g.vh)};z-index:${10+u.x+u.y};`;
    const n=el('div',{class:'unit'+(u.acted?' done':'')+(u===sel?' on':'')+(u.target?' tgt':'')+(u.lord?' lord':''),style:`${pos}--side:${SIDE_COL[u.side]}`,'data-id':u.id,
      html:chibi({n:b.n,f:b.f},{arm:u.team.arm,side:u.side,boss:true})+
        `<i class="base"></i><b class="arm">${u.team.arm[0]}</b><i class="hp"><i style="width:${tot/mx*100}%"></i></i><b class="cnt">${u.team.gens.filter(g=>g.troops>0).length}</b>`+(dn?`<b class="dw">平${u.drawUntil-G.day+1}</b>`:'')});
    n.onclick=()=>tap(u.x,u.y);
    if(prev){prev.className=n.className;prev.setAttribute('style',n.getAttribute('style'));prev.innerHTML=n.innerHTML}else box.append(n);
    (prev||n).onclick=n.onclick;
  }
  for(const e of old.values())e.remove();
  const who=G.mode==='pvp'&&G.foe==='2p'?(G.phase?'紅方':'藍方'):G.phase?'敵軍':'我方';
  const lim=G.mode==='land'?DAYS:G.mode==='story'?G.sc.days:0;
  box.classList.toggle('rain',raining());
  $('turn').innerHTML=`第 <b>${G.day}</b> 天${lim?` / ${lim}`:''}${raining()?'・<span class="wx">豪雨</span>':''}・<span style="color:${SIDE_COL[G.phase]}">${who}行動</span>`;
  $('endTurn').disabled=G.busy||!!G.over;
  renderInfo();
}
function renderInfo(){
  const u=G.sel||G.peek;const box=$('info');
  if(!u||!alive(u)){box.replaceChildren(el('p',{class:'muted'},G.over?'':'點自己的部隊：藍格可移動，紅格是攻擊範圍（弓兵、鐵炮 2 格，其餘 1 格；騎兵移動 3 格、器械 1 格，其他 2 格）。點對方部隊看詳細。'));return}
  const t=u.team;
  const rows=t.gens.map((g,i)=>el('div',{class:'grow'+(g.troops<=0?' out':'')},
    el('div',{class:'mini',html:portrait(g.n,chibi({n:g.n,f:g.f},{arm:t.arm,side:u.side,boss:i===0}))}),
    el('div',{},el('div',{class:'gn'},el('b',{},g.n),i===0?el('span',{class:'tag'},'大將'):null,el('small',{},`${fmt(Math.max(0,g.troops))} / ${fmt(g.max)}`)),
      el('i',{class:'hp big'},el('i',{style:`width:${Math.max(0,g.troops)/g.max*100}%`})),
      el('div',{class:'st'},ST4.map(k=>`${k[0]} ${Math.round(g.st[k])}`).join('　')),
      el('div',{class:'sks'},...g.skills.map(s=>skillChip(s.name))),g.bgs?el('div',{class:'st'},'兵學 '+g.bgs):null)));
  const acts=[];
  if(u===G.sel&&!u.acted){const w=el('button',{type:'button',class:'btn ghost'},'待命（結束這隊行動）');w.onclick=()=>{u.acted=true;G.sel=null;renderBoard();autoEnd()};acts.push(w)}
  box.replaceChildren(el('div',{class:'ih'},el('b',{style:`color:${SIDE_COL[u.side]}`},t.name),
    el('small',{},`${ARMS.find(a=>a[0]===t.arm)?.[1]||t.arm}・兵力 ${fmt(total(t))}・移動 ${mv(u)}・射程 ${rg(u)}・地形 ${G.T[u.y][u.x]}${u.garrison?'・守軍':''}`)),...rows,el('div',{class:'row'},...acts));
}

// 目前操作的一方全部部隊都行動完，就自動結束這一方的行動（不用再按「結束這天」）
function autoEnd(){
  if(!G||G.busy||G.over||aiPhase())return;
  const side=ctrl();
  if(G.units.some(u=>u.side===side&&alive(u)&&!u.acted))return;
  addLog(G.phase||G.mode==='land'&&!G.garAi?'全部部隊行動完畢，進入下一天。':'我方全部行動完畢，換敵軍行動。');
  clearTimeout(G.autoT);G.autoT=setTimeout(endTurn,500);
}
async function tap(x,y){
  if(!G||G.busy||G.over)return;
  const u=unitAt(x,y),s=G.sel,me=ctrl();
  if(aiPhase())return;
  if(s&&u&&u.side!==s.side&&targets(s).includes(u)){await fight(s,u);autoEnd();return}
  if(s&&!s.moved&&!u){const R=reach(s);if(R.has(x+','+y)){s.x=x;s.y=y;s.moved=true;sfx('move');if(!targets(s).length){s.acted=true;G.sel=null}renderBoard();autoEnd();return}}
  if(u&&u.side===me&&!u.acted){G.sel=u===s?null:u;G.peek=null;sfx('select');renderBoard();return}
  G.sel=null;G.peek=u||null;renderBoard();
}

async function fight(a,d){
  const was=G.busy;G.busy=true;G.sel=null;
  d.team.terrain=G.T[d.y][d.x]==='城'?'城':G.T[d.y][d.x];
  a.team.mods=raining()&&a.side===0?{dmg:G.sc.surprise}:null;d.team.mods=null;
  const before=[a.team.gens.map(g=>g.troops),d.team.gens.map(g=>g.troops)];
  const r=battle(a.team,d.team);
  const st=G.st,lines=[];
  if(st){
    if(a.side===0&&d.key)st.hitBy[d.key]=(st.hitBy[d.key]||0)+1;
    for(const u of[a,d])if(!alive(u)){
      if(u.target&&!st.killDay){st.killDay=G.day;st.killRain=raining();st.finisher=(u===d?a:d).key}
      if(u.side===0&&u.key&&!st.routed.includes(u.key))st.routed.push(u.key);
      if(u.key)lines.push(...(G.sc.talk['rout_'+u.key]||[]));
    }
    const lord=G.units.find(u=>u.lord);
    if(lord&&alive(lord)&&total(lord.team)<=totalMax(lord.team)/2&&!st.said.has('lordLow')){st.said.add('lordLow');lines.push(...(G.sc.talk.lordLow||[]))}
  }
  a.acted=true;a.moved=true;
  await playBattle(a,d,before,r);
  const res={W:'勝利',D:'平局',L:'敗北'}[r.res];
  const lost=(i,u)=>{const v=before[i].reduce((s,x)=>s+x,0)-total(u.team);return v<0?`回復 ${fmt(-v)}`:`損失 ${fmt(v)}`};
  addLog(`${a.team.name} 攻擊 ${d.team.name}：${res}（${r.rounds} 回合；攻方${lost(0,a)}，守方${lost(1,d)}）`);
  if(d.garrison){
    if(r.res==='D'){d.drawUntil=G.day+DRAW_DAYS-1;addLog(`平局：${d.team.name} 保留剩餘兵力 ${DRAW_DAYS} 天，之後恢復滿兵。`)}
    else if(alive(d)){d.team.gens.forEach(g=>g.troops=g.max);d.drawUntil=null}   // garrison is full again after a loss
  }
  if(a.team.mods)addLog(`豪雨奇襲：${a.team.name} 造成的傷害 ×${a.team.mods.dmg}`);
  if(!alive(d))addLog(`${d.team.name} 潰走！`);
  if(!alive(a))addLog(`${a.team.name} 潰走！`);
  checkOver();renderBoard();
  if(!G.over&&lines.length)await talk(lines);
  G.busy=was;renderBoard();
}
function checkOver(){
  const left=s=>G.units.filter(u=>u.side===s&&alive(u)).length;
  if(G.mode==='story'){
    const sc=G.sc,win=G.units.some(u=>u.target&&!alive(u)),lordDown=G.units.some(u=>u.lord&&!alive(u)),timeUp=G.day>sc.days;
    const lose=lordDown||!left(0)||timeUp;
    if(!win&&!lose)return;
    let lines,sub=[];
    if(win){
      const got=(sc.hidden||[]).map(h=>({h,ok:!!h.test(G.st)})),n=got.filter(x=>x.ok).length;
      const rk=(sc.rank||[]).find(r=>n>=r.n);
      G.over=`${sc.name}：勝利！${rk?`評價 ${rk.rank}「${rk.title}」`:''}`;
      sub=[`第 ${G.day} 天取勝・隱藏條件 ${n}/${got.length}`,...got.map(({h,ok})=>`${ok?'✓':'✗'} ${h.name}：${h.desc}`)];
      lines=[...sc.talk.win,...(rk?.ending||[])];
    }else{
      G.over=`${sc.name}：敗北（${lordDown?'織田信長隊潰走':timeUp?`${sc.days} 天內沒有擊破目標`:'全軍潰走'}）`;
      lines=(lordDown?sc.talk.loseLord:timeUp?sc.talk.loseTime:null)||sc.talk.lose;
    }
    addLog(G.over);sub.slice(1).forEach(x=>addLog(x));play(win?'win':'lose');
    talk(lines).then(()=>{$('overMsg').textContent=G.over;$('overSub').replaceChildren(...sub.map(x=>el('div',{},x)));$('over').hidden=false});
    return;
  }
  if(!left(1))G.over=G.mode==='land'?'佔領成功！':G.foe==='2p'?'藍方獲勝！':'勝利！';
  else if(!left(0))G.over=G.mode==='land'?'出征失敗：全軍潰走':G.foe==='2p'?'紅方獲勝！':'敗北';
  else if(G.mode==='land'&&G.day>DAYS)G.over=`出征失敗：${DAYS} 天內沒有攻下`;
  if(G.over){addLog(G.over);$('overSub').replaceChildren();const good=!/失敗|敗北|紅方/.test(G.over);play(good?'win':'lose');$('overMsg').textContent=G.over;$('over').hidden=false}
}
async function endTurn(){
  clearTimeout(G?.autoT);
  if(G.busy||G.over)return;
  G.sel=null;G.peek=null;
  if((G.mode!=='land'||G.garAi)&&G.phase===0){
    G.phase=1;for(const u of G.units)if(u.side===1){u.acted=false;u.moved=false}
    renderBoard();
    if(aiPhase()){await aiTurn();if(G.over)return;}
    else return;
  }
  const wasRain=raining();
  G.phase=0;G.day++;
  for(const u of G.units){u.acted=false;u.moved=false;
    if(u.garrison&&u.drawUntil&&G.day>u.drawUntil&&alive(u)){u.team.gens.forEach(g=>g.troops=g.max);u.drawUntil=null;addLog(`${u.team.name} 平局保留時間已過，恢復滿兵。`)}}
  checkOver();renderBoard();
  if(!G.over&&G.mode==='story'){
    if(raining()&&!wasRain){addLog('豪雨！敵軍無法移動，我方進攻傷害提高。');await talk(G.sc.talk.rain)}
    else if(!raining()&&wasRain){
      addLog('雨停了，今川軍恢復行動。');
      for(const u of G.units)if(u.onRainEnd&&alive(u)){Object.assign(u,u.onRainEnd);if(u.ai==='guard'&&!u.anchor)u.anchor=[u.x,u.y];addLog(`${u.team.name} 開始${u.ai==='advance'?'出擊':'戒備'}。`)}
      await talk(G.sc.talk.rainEnd);
    }
  }
}
async function aiTurn(){
  G.busy=true;renderBoard();
  for(const u of G.units.filter(u=>u.side===1&&alive(u))){
    if(G.over)break;
    await sleep(350);
    // hold: never moves; guard: stays within r of its anchor; rain (story) keeps everyone in place
    const stay=u.ai==='hold'||raining();
    let R=stay?new Map([[u.x+','+u.y,0]]):reach(u);
    if(u.ai==='guard'&&!stay)R=new Map([...R].filter(([k])=>{const[x,y]=k.split(',').map(Number);return dist({x,y},{x:u.anchor[0],y:u.anchor[1]})<=u.r}));
    let best=null;
    for(const k of R.keys()){
      const[x,y]=k.split(',').map(Number);
      for(const o of targets(u,{x,y})){
        const sc=-total(o.team)/totalMax(o.team)*10000-total(o.team);
        if(!best||sc>best.sc)best={x,y,o,sc};
      }
    }
    if(best){u.x=best.x;u.y=best.y;sfx('move');renderBoard();await sleep(300);await fight(u,best.o);continue}
    // no target: walk toward the nearest enemy
    if(stay||u.ai==='guard'){u.acted=true;continue}
    const foes=G.units.filter(o=>o.side===0&&alive(o));if(!foes.length)break;
    let bk=null;
    for(const k of R.keys()){const[x,y]=k.split(',').map(Number);const d=Math.min(...foes.map(o=>dist({x,y},o)));if(!bk||d<bk.d)bk={x,y,d}}
    u.x=bk.x;u.y=bk.y;u.acted=true;renderBoard();
  }
  G.busy=false;renderBoard();
}

// ---- battle playback ----
const SPEEDS=[['1','普通',650],['2','快',300],['4','很快',120]];
let speed=+(SET.speed||1);
const KCOL={指揮:'#5b8fd8',主動:'#d0573c',突擊:'#e3923a',被動:'#4fae7f',兵種:'#a771f0',兵學:'#3f7f86'};
async function playBattle(a,d,before,r){
  // 吞食天地式的版面：藍方在左一列、紅方在右一列，下方是說話框（目前出手武將的頭像＋訊息）
  const dlg=$('bt');
  const sides=[a.side===0?a:d,a.side===0?d:a];   // blue on the left
  const pre=t=>t===a?before[0]:before[1];
  const cards={};let stage;
  const col=(u,right)=>el('div',{class:'bcol'+(right?' r':'')},...u.team.gens.map((g,i)=>{
    const c=el('div',{class:'bline'+(pre(u)[i]<=0?' out':''),style:`--side:${SIDE_COL[u.side]}`},
      el('div',{class:'fig',html:chibi({n:g.n,f:g.f},{arm:u.team.arm,side:u.side,boss:i===0,flip:right})}),
      el('div',{class:'bi'},el('div',{class:'bn'},el('b',{},g.n),i===0?el('span',{class:'tag'},'大將'):null),
        el('small',{class:'tv'},fmt(pre(u)[i])),el('i',{class:'hp big'},el('i',{style:`width:${pre(u)[i]/g.max*100}%`}))));
    cards[u.side+'-'+i]=c;c._max=g.max;c._right=right;return c}));
  const banner=el('div',{class:'banner'}),rd=el('div',{class:'rd'},'戰鬥開始'),res=el('div',{class:'bres'});
  const face=el('div',{class:'face'}),msg=el('div',{class:'msgtx'});
  const logBox=el('ol',{class:'blog'}),statBox=el('div',{class:'bstat',hidden:''});
  const sp=el('div',{class:'row'});
  const drawSp=()=>chips(sp,SPEEDS.map(s=>[s[0],s[2]?`×${s[0]} ${s[1]}`:s[1]]),String(speed),v=>{speed=+v;SET.speed=speed;save();drawSp()});drawSp();
  let skip=false;
  const skipB=el('button',{type:'button',class:'btn ghost'},'跳過');skipB.onclick=()=>{skip=true};
  const done=el('button',{type:'button',class:'btn',hidden:''},'返回地圖');
  dlg.replaceChildren(el('div',{class:'bt'},
    stage=el('div',{class:'stage'},
      el('div',{class:'shd'},el('b',{style:`color:${SIDE_COL[sides[0].side]}`},sides[0].team.name),rd,el('b',{style:`color:${SIDE_COL[sides[1].side]}`},sides[1].team.name)),
      el('div',{class:'field'},col(sides[0],false),el('div',{class:'mid'},banner,res),col(sides[1],true)),
      el('div',{class:'msg'},face,msg)),
    el('div',{class:'row',style:'justify-content:space-between'},sp,el('div',{class:'row'},skipB,done)),
    statBox,el('details',{},el('summary',{},'戰報'),logBox)));
  dlg.showModal();
  play('battle');sfx('start');
  const nm=(s,i)=>(s===a.side?a:d).team.gens[i].n;
  const gen=(s,i)=>(s===a.side?a:d).team.gens[i];
  const speak=(side,i,txt)=>{const g=gen(side,i),u=side===a.side?a:d;face.innerHTML=portrait(g.n,chibi({n:g.n,f:g.f},{arm:u.team.arm,side,boss:i===0}));face.style.setProperty('--side',SIDE_COL[side]);msg.textContent=txt};
  speak(a.side,0,`${a.team.gens[0].n}：「全軍，突擊！」`);
  const setT=(side,i,v)=>{const c=cards[side+'-'+i];if(!c)return;c.querySelector('.hp>i').style.width=`${Math.max(0,v)/c._max*100}%`;c.querySelector('.tv').textContent=fmt(Math.max(0,v));if(v<=0)c.classList.add('out')};
  const float=(side,i,txt,cls)=>{const c=cards[side+'-'+i];if(!c||skip)return;const f=el('span',{class:'fl '+cls},txt);c.append(f);setTimeout(()=>f.remove(),900)};
  const flash=(side,i,cls)=>{const c=cards[side+'-'+i];if(!c||skip)return;c.classList.remove(cls);void c.offsetWidth;c.classList.add(cls)};
  const lg=s=>logBox.append(el('li',{},s));
  const ms=()=>SPEEDS.find(s=>+s[0]===speed)[2];
  for(const e of r.log){
    if(e.type==='round'){rd.textContent=`第 ${e.round} 回合`;lg(`— 第 ${e.round} 回合 —`);if(!skip)await sleep(ms()*.6);continue}
    if(e.type==='end')break;
    const who=e.side!=null?nm(e.side,e.i):'';
    if(e.type==='stun'){float(e.side,e.i,e.why,'st');lg(`${who} ${e.why}，無法行動`);if(!skip){speak(e.side,e.i,`${who} ${e.why}，無法行動！`);sfx('stun')}}
    if(e.type==='prep'){banner.textContent=`【${e.skill}】準備中`;banner.style.background='#555';lg(`${who} 準備【${e.skill}】`);if(!skip)speak(e.side,e.i,`${who} 正在準備【${e.skill}】……`)}
    if(e.type==='atk'||e.type==='skill'){
      flash(e.side,e.i,cards[e.side+'-'+e.i]?._right?'lunge-l':'lunge-r');
      if(e.type==='skill'){banner.textContent=`【${e.skill}】${e.guess?'（推估）':''}`;banner.style.background=KCOL[e.kind]||'#666';banner.classList.remove('pop');void banner.offsetWidth;banner.classList.add('pop');if(!skip){stage.classList.remove('flashw');void stage.offsetWidth;stage.classList.add('flashw')}}
      else banner.textContent='';
      const parts=[];let snd=e.type==='skill'?'skill':'hit',rout=false;
      for(const t of e.tg){
        const tn=nm(t.side,t.i);
        if(t.evade){float(t.side,t.i,'規避','st');parts.push(`${tn} 規避`);continue}
        if(t.v!=null){setT(t.side,t.i,t.left);float(t.side,t.i,'-'+fmt(t.v),t.dtype==='謀略'?'mo':'hit');flash(t.side,t.i,'shake');parts.push(`${tn} -${fmt(t.v)}${t.crit?'（'+(t.dtype==='謀略'?'奇謀':'會心')+'）':''}${t.rout?'（潰敗）':''}`);if(t.rout)rout=true;if(e.type==='atk'&&t.dtype==='謀略')snd='mou'}
        if(t.heal){setT(t.side,t.i,t.left);float(t.side,t.i,'+'+fmt(t.heal),'heal');parts.push(`${tn} +${fmt(t.heal)}`);if(e.type!=='skill')snd='heal'}
        if(t.status){float(t.side,t.i,t.status,'st');parts.push(`${tn} ${t.status}`)}
      }
      const line=`${who}${e.type==='atk'?(e.combo?' 連擊':' 攻擊'):`【${e.skill}】`}${parts.length?'：'+parts.join('、'):''}`;
      lg(line);
      if(!skip){speak(e.side,e.i,line);sfx(snd,(e.side===a.side?a:d).team.arm);if(rout)setTimeout(()=>sfx('rout'),120)}
    }
    if(!skip)await sleep(ms());
  }
  // final troops (also covers 跳過)
  for(const u of[a,d])u.team.gens.forEach((g,i)=>setT(u.side,i,g.troops));
  const verdict={W:'勝利',D:'平局',L:'敗北'}[r.res];
  res.textContent=`${a.team.name}${verdict}`;res.className='bres '+r.res;
  lg(r.res==='D'?`8 回合結束，雙方大將都沒有潰敗：平局`:`${r.res==='W'?d.team.name:a.team.name} 大將潰敗：${a.team.name}${verdict}`);
  // per-general totals: damage dealt (兵刃／謀略), damage taken, healing — for comparing with real 戰報
  const tot={};const at=(s,i)=>tot[s+'-'+i]??={out:0,bing:0,mou:0,taken:0,heal:0,act:0};
  for(const e of r.log)if(e.type==='atk'||e.type==='skill'){
    const me=at(e.side,e.i);if(e.type==='skill'&&e.kind!=='兵學')me.act++;
    for(const t of e.tg){if(t.v!=null){me.out+=t.v;me[t.dtype==='謀略'?'mou':'bing']+=t.v;at(t.side,t.i).taken+=t.v}if(t.heal)me.heal+=t.heal}
  }
  const trs=[];
  for(const u of[sides[1],sides[0]])u.team.gens.forEach((g,i)=>{const x=at(u.side,i);
    trs.push(`<tr style="--side:${SIDE_COL[u.side]}"><th>${g.n}</th><td>${fmt(x.bing)}</td><td>${fmt(x.mou)}</td><td>${fmt(x.heal)}</td><td>${fmt(x.taken)}</td><td>${x.act}</td></tr>`)});
  statBox.innerHTML=`<table><thead><tr><th>武將</th><th>兵刃</th><th>謀略</th><th>治療</th><th>承傷</th><th>戰法</th></tr></thead><tbody>${trs.join('')}</tbody></table>`;statBox.hidden=false;
  skipB.hidden=true;done.hidden=false;
  const mine=a.side===0?r.res:{W:'L',L:'W',D:'D'}[r.res];   // from the blue side's view
  speak(a.side,0,res.textContent);
  play(mine==='W'?'win':mine==='L'?'lose':null);
  await new Promise(res=>{done.onclick=()=>{dlg.close();res()};dlg.oncancel=e=>{e.preventDefault();dlg.close();res()}});
  if(!G.over)play('map');
}

// ---- wiring ----
$('start').onclick=startGame;
$('endTurn').onclick=endTurn;
$('reset').onclick=()=>{if(G&&!G.over&&!confirm('放棄這場，回到設定？'))return;G=null;play('title');$('game').hidden=true;$('setup').hidden=false;$('over').hidden=true;renderSetup()};
$('again').onclick=()=>{$('over').hidden=true;startGame()};
$('toSetup').onclick=()=>{$('over').hidden=true;G=null;play('title');$('game').hidden=true;$('setup').hidden=false;renderSetup()};
$('skDlg').addEventListener('click',e=>{if(e.target===$('skDlg'))$('skDlg').close()});
$('formula').textContent=`傷害 = √兵力 × ${K.base} × 傷害率 × (1 + (攻方屬性 − 守方屬性) ÷ ${K.statDiv})，兵刃用武勇對統率、謀略用智略對智略；兵種相剋（騎兵剋弓兵、弓兵剋鐵炮、鐵炮剋足輕、足輕剋騎兵；器械被其他兵種剋制）兵刃傷害 ×${K.counter[0]}／×${K.counter[1]}；地形不影響傷害。`;
renderSetup();
