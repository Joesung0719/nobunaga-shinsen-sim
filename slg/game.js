// 真戰 Q版戰棋：設定 → 地圖（每格一支部隊）→ 接觸時 8 回合自動戰鬥（engine.js）並播放。
import {battle,parseSkill,statsAt,innateOf,fullRedStats,bestArm,K,COUNTER,ST4} from './engine.js?v=34';
import {chibi,SIDE_COL,setSpec} from './chibi.js?v=34';
import {ATTRS,ATTR_NAME,ATTR_HINT,ARMS as HARMS,COLORS,CHAIN,MAXLV,expNeed,stageExp,routExp,enemyLv,newHero,addExp,heroStats,heroTroops,charmDmg,heroSpec,SCENES,generic,SHOP,ensureHero,price,gearMul,stageSilver,banditScenario,banditSilver,banditExp,STARTERS,JOIN,RECRUIT,recruitPrice,PARTY_MAX} from './campaign.js?v=34';
import {FAV_NEED,FAVS,spotTile,dirText} from './favor.js?v=34';
import {isoGeom} from './iso.js?v=34';
import {createPhaserBoard,createBattleStage,setPerf,isLight} from './board-phaser.js?v=34';
import {compile as bgCompile,summary as bgSummary} from './bingaku.js?v=34';
import {SCENARIOS} from './scenarios.js?v=34';
import {play,sfx,unlock,setAudio,audioSettings} from './audio.js?v=34';

// 網站剛更新時，瀏覽器可能拿到舊的 slg.html 配新的 js（或反過來），版面會整個跑掉。
// 兩邊各記一個版本號，不一致就強制重新載入。每次改動 slg/ 或 slg.html 都要把版本號一起加 1：
// slg.html 的 --slg-ver 與 script 的 ?v=、這裡的 VER、以及 game.js／engine.js 的 import 網址 ?v=。
// 網址帶版本號，新頁面一定抓到新程式，不會配到瀏覽器快取裡的舊 js。
const VER='25';
if(getComputedStyle(document.documentElement).getPropertyValue('--slg-ver').replace(/['"\s]/g,'')!==VER){
  let n=0;try{n=+sessionStorage.getItem('slg-reload')||0;sessionStorage.setItem('slg-reload',n+1)}catch{}
  if(n<2){location.reload();await new Promise(()=>{})}
}else try{sessionStorage.removeItem('slg-reload')}catch{}
const D=await (await fetch('land.json',{cache:'no-cache'})).json();
const CARDS=await (await fetch('data.json',{cache:'no-cache'})).json();
const $=id=>document.getElementById(id);
const el=(t,a={},...kids)=>{const e=document.createElement(t);for(const[k,v]of Object.entries(a)){if(k==='class')e.className=v;else if(k==='html')e.innerHTML=v;else if(k.startsWith('on'))e[k]=v;else if(v===false)continue;else e.setAttribute(k,v===true?'':v)}for(const c of kids)if(c!=null)e.append(c);return e};
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
    return{src:'random',arm:bestArm(D,ns)||pick(['騎','弓','槍','鐵炮']),gens:ns.map((n,i)=>({n,s:sk.slice(i*2,i*2+2),t:10000}))};
  }
}
function builderTeam(){
  let S;try{S=JSON.parse(localStorage.getItem('shinsen-land-v1'))}catch{}
  if(!S?.my?.gens)return null;
  return{src:'builder',arm:S.my.arm||'槍',gens:S.my.gens.map((m,i)=>({n:m.n,s:(m.s||[]).filter(Boolean),t:m.t||10000,st:S.my.calc?.[i]||null,red:m.red||0,bg:m.bg||null}))};
}
const SET=Object.assign({mode:'land',lv:6,foe:'2p',gar:'hold',mine:[],enemy:[]},load());
if(SET.hero){ensureHero(SET.hero);setSpec(SET.hero.name,heroSpec(SET.hero))}   // 戰役主角的外觀
// 戰役串連：之前打贏某一關且評價夠高，這一關開場就有加成（記在 SET.camp，存在瀏覽器）
const RANKV={S:4,A:3,B:2,C:1};
const carryOk=c=>(RANKV[SET.camp?.[c.from]?.rank]||0)>=RANKV[c.min||'B'];
const scName=id=>SCENARIOS.find(x=>x.id===id)?.name||id;
// 對戰模擬平時是對人（Joe 2026-10-31）：舊存檔的「對電腦」改回對人一次
if(!SET.v2){SET.v2=1;SET.foe='2p';save()}
for(const k of['mine','enemy'])for(let i=0;i<3;i++)if(!SET[k][i])SET[k][i]=randomTeam();
setAudio(SET.audio||{});
// 戰場畫面：Phaser 畫布（slg/board-phaser.js）。舊版 SVG 戰場已移除（第四批）；舊存檔與舊網址的 engine 參數直接忽略。
delete SET.engine;setPerf(SET.perf);
let VIEW=null;
const vid=u=>G.gid+':'+u.id;
document.addEventListener('pointerdown',unlock);
function renderSound(){
  const A=audioSettings(),box=$('snd');
  const tg=(k,l)=>{const b=el('button',{type:'button',class:'chip','aria-pressed':String(A[k])},l);b.onclick=()=>{setAudio({[k]:!A[k]});SET.audio={...audioSettings()};save();renderSound()};return b};
  const v=el('input',{type:'range',min:'0',max:'1',step:'0.05',value:String(A.vol),'aria-label':'音量'});
  v.oninput=()=>{setAudio({vol:+v.value});SET.audio={...audioSettings()};save()};
  box.replaceChildren(tg('music','音樂'),tg('rec','錄音配樂'),tg('sfx','音效'),el('label',{class:'vol'},'音量',v));
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
      bg:bgCompile(g.bg,ROSTER.get(g.n)?.r,g.red||0,g.n),bgs:bgSummary(g.bg,ROSTER.get(g.n)?.r,g.n)}))};
}
const teamsAt=lv=>Object.keys(D.teams).filter(k=>new RegExp(`^l${lv}[a-z]$`).test(k));
function armOfGarrison(k){const r=D.reports.find(r=>r.t===k&&r.ty);return r?r.ty:pick(['騎','弓','槍','鐵炮'])}
function garrisonTeam(k,lv){
  const L=D.levels[lv],t=D.teams[k];
  return{name:t[2].n+'隊',side:1,arm:armOfGarrison(k),terrain:'城',key:k,
    gens:[t[2],t[0],t[1]].map(g=>({n:g.n,f:facOf(g.n),st:statsAt(D,g.n,L.glv,g.r),troops:L.per,max:L.per,skills:g.s.map(ps)}))};
}

// ---- setup UI ----
const MODES=[['pvp','對戰模擬'],['land','打地'],['camp','戰役']];   // 劇本資料（scenarios.js）只給戰役用，不再有獨立分頁
// 模式由頁首的子分頁（site-nav.js）切換：網址 ?m=pvp|land|story|camp 可直接開到該模式
{const m=new URLSearchParams(location.search).get('m');if(MODES.some(([k])=>k===m))SET.mode=m;if(!MODES.some(([k])=>k===SET.mode))SET.mode='camp'}   // 舊存檔停在「劇本」的，改回戰役
function setMode(v){
  if(!MODES.some(([k])=>k===v))return;
  if(G&&!G.over&&v!==G.mode&&!confirm('放棄這場，切換模式？'))return document.dispatchEvent(new CustomEvent('slg:mode',{detail:SET.mode}));
  SET.mode=v;save();
  if(G){G=null;play('title');$('game').hidden=true;$('over').hidden=true;$('setup').hidden=false}
  renderSetup();
}
document.addEventListener('slg:setmode',e=>setMode(e.detail));
function chips(box,opts,cur,on){
  box.replaceChildren(...opts.map(([v,l])=>{const b=el('button',{type:'button',class:'chip','aria-pressed':String(cur===v)},l);b.onclick=()=>on(v);return b}));
}
function teamCard(spec,side,i,list){
  const cost=spec.gens.reduce((a,g)=>a+costOf(g.n),0);
  const figs=el('div',{class:'figs'},...spec.gens.map((g,j)=>el('div',{class:'fig',html:chibi({n:g.n,f:facOf(g.n)},{arm:spec.arm,side,boss:j===0})+`<span>${g.n}</span>`})));
  const arms=el('div',{class:'row arms'});
  chips(arms,ARMS.map(([k,l])=>[k,l]),spec.arm,v=>{spec.arm=v;if(spec.my)spec.my.arm=v;save();renderSetup()});
  // 兵學是每位武將各自的配點，在打地頁組隊設定（按「編輯這隊」）
  const bgl=spec.gens.map(g=>[g.n,bgSummary(g.bg,ROSTER.get(g.n)?.r,g.n)]).filter(x=>x[1]);
  const bg=el('small',{class:'muted'},bgl.length?'兵學：'+bgl.map(x=>`${x[0]} ${x[1]}`).join('｜'):'兵學：未設定（按「編輯這隊」配點）');
  const ed=el('button',{type:'button',class:'btn'},'編輯這隊');
  ed.onclick=()=>{save();location.href=`land.html?slg=${list===SET.mine?'mine':'enemy'}-${i}`};
  const rnd=el('button',{type:'button',class:'btn ghost'},'隨機換一隊');rnd.onclick=()=>{list[i]=randomTeam();save();renderSetup()};
  const imp=el('button',{type:'button',class:'btn ghost'},'帶入組隊頁的隊伍');
  imp.onclick=()=>{const t=builderTeam();if(!t){alert('還沒有組隊資料：請先到「組隊・戰報估算」頁面的「我方組隊」選好武將。');return}list[i]=t;save();renderSetup()};
  const skills=el('div',{class:'sks'},...spec.gens.map(g=>el('div',{},el('b',{},g.n),' ',[innateOf(D,g.n),...g.s].filter(Boolean).map(s=>skillChip(s)).reduce((a,c)=>(a.append(c),a),el('span')))));
  return el('div',{class:'tcard',style:`--side:${SIDE_COL[side]}`},
    el('div',{class:'th'},el('b',{},`第 ${i+1} 隊 · ${spec.gens[0].n}隊`),el('small',{},`Cost ${cost} · ${fmt(spec.gens.reduce((a,g)=>a+g.t,0))} 兵 · ${spec.my?'自選':spec.src==='builder'?'組隊頁組隊':'隨機'}`)),
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
// ---- 戰役畫面：建立角色／角色卡與配點／關卡列表 ----
const campIdx=()=>{const h=SET.hero;return Math.max(0,Math.min(SET.campSel??h.stage,h.stage,CHAIN.length-1))};
function campStageId(){const h=SET.hero,i=campIdx(),ids=CHAIN[i].ids;return ids.length>1?(h.pick[i]&&ids.includes(h.pick[i])?h.pick[i]:ids[0]):ids[0]}
const NEWH={name:'',arm:'騎',color:COLORS[0][0],lean:'武',party:['織田信雄','筒井順慶']};
const starsOf=n=>'★'.repeat(ROSTER.get(n)?.r||3);
const compFig=n=>portrait(n,chibi({n,f:facOf(n)},{arm:'槍',side:0,boss:false}));
const armTxt=n=>{const a=bestArm(D,[n]);return a?`自帶 ${a==='槍'?'足輕':a}`:'兵種依主角'};
const heroFig=h=>chibi({n:h.name,f:''},{arm:h.arm,side:0,boss:true});
function renderCamp(){
  const box=$('campRow'),h=SET.hero;
  $('start').hidden=!h;
  if(!h){
    const name=el('input',{type:'text',maxlength:'6',placeholder:'你的名字（最多 6 字）',value:NEWH.name,'aria-label':'主角名字'});
    name.oninput=()=>{NEWH.name=name.value};
    const armBox=el('div',{class:'row'}),colBox=el('div',{class:'row'}),leanBox=el('div',{class:'row'});
    chips(armBox,HARMS.map(a=>[a,a==='槍'?'足輕':a==='騎'?'騎兵':a==='弓'?'弓兵':a]),NEWH.arm,v=>{NEWH.arm=v;renderCamp()});
    chips(colBox,COLORS.map(([c,l])=>[c,l]),NEWH.color,v=>{NEWH.color=v;renderCamp()});
    chips(leanBox,ATTRS.map(a=>[a,`${a}　${ATTR_NAME[a]}`]),NEWH.lean,v=>{NEWH.lean=v;renderCamp()});
    const pick2=el('div',{class:'mates'},...STARTERS.map(n=>{
      const on=NEWH.party.includes(n);
      const b=el('button',{type:'button',class:'mate','aria-pressed':String(on)},el('div',{class:'fig',html:compFig(n)}),el('span',{},n));
      b.onclick=()=>{if(on)NEWH.party=NEWH.party.filter(x=>x!==n);else NEWH.party=[...NEWH.party,n].slice(-PARTY_MAX);renderCamp()};return b}));
    const go=el('button',{type:'button',class:'btn big'},'開始戰役');
    go.onclick=()=>{
      const nm=NEWH.name.trim();
      if(!nm)return alert('先替你的角色取個名字。');
      if(ROSTER.has(nm)||nm==='旁白'||nm==='我')return alert('這個名字和既有武將重複了，換一個吧。');
      if(NEWH.party.length<PARTY_MAX)return alert('請選兩位 3★ 夥伴。');
      SET.hero=newHero({...NEWH,name:nm});setSpec(SET.hero.name,heroSpec(SET.hero));SET.campSel=0;save();renderSetup();
    };
    const tmp={name:NEWH.name.trim()||'無名',arm:NEWH.arm,color:NEWH.color,lean:NEWH.lean};
    setSpec(tmp.name,heroSpec(tmp));
    box.replaceChildren(el('div',{class:'hcard'},
      el('div',{class:'fig big',html:heroFig(tmp)}),
      el('div',{class:'hbody'},
        el('h3',{},'創造你的客將'),
        el('p',{class:'muted'},'你是一位流浪各國的客將，從桶狹間一路打到天下底定。每個關卡開頭與途中會有對話，你的回答會讓屬性成長；等級最高 50。'),
        el('div',{class:'row'},el('span',{class:'lbl'},'名字'),name),
        el('div',{class:'row'},el('span',{class:'lbl'},'兵種'),armBox),
        el('div',{class:'row'},el('span',{class:'lbl'},'盔甲'),colBox),
        el('div',{class:'row'},el('span',{class:'lbl'},'傾向'),leanBox),
        el('small',{class:'muted'},ATTR_HINT[NEWH.lean]+'（起始 +3 點）'),
        el('div',{class:'row',style:'margin-top:8px'},el('span',{class:'lbl'},'夥伴'),el('small',{class:'muted'},`選兩位 3★ 武將同隊（已選 ${NEWH.party.length}/${PARTY_MAX}），之後會有更強的武將加入`)),pick2,
        el('div',{class:'row',style:'margin-top:10px'},go))));
    return;
  }
  setSpec(h.name,heroSpec(h));
  const st=heroStats(h),need=expNeed(h.lv);
  const stat={武:st.武勇,智:st.智略,統:st.統率,速:st.速度};
  const attrs=el('div',{class:'attrs'},...ATTRS.map(a=>{
    const row=el('div',{class:'attr',title:ATTR_HINT[a]},el('b',{},a),el('span',{class:'muted'},ATTR_NAME[a]),el('span',{},`${h.pts[a]} 點`),
      el('small',{class:'muted'},a==='魅'?`全軍傷害 +${((charmDmg(h)-1)*100).toFixed(1)}%`:`${stat[a]}`));
    if(h.free>0){const b=el('button',{type:'button',class:'btn ghost plus'},'＋');b.onclick=()=>{h.pts[a]++;h.free--;save();renderCamp()};row.append(b)}
    return row}));
  const reset=el('button',{type:'button',class:'btn ghost'},'重新開始戰役');
  reset.onclick=()=>{if(confirm('刪除目前的主角與戰役進度，重新開始？')){delete SET.hero;delete SET.campSel;save();renderSetup()}};
  const sel=campIdx();
  // 沒打過的關卡不預告：只列出已通關的關與「下一關」；下一關只顯示是否要選陣營，打完才揭曉名稱
  const stages=CHAIN.map((c,i)=>{
    if(i>h.stage)return null;
    const id=c.ids.length>1?(h.pick[i]&&c.ids.includes(h.pick[i])?h.pick[i]:c.ids[0]):c.ids[0],sc=c.finale?{name:c.name,year:`${c.era}年`,brief:c.brief}:SCENARIOS.find(x=>x.id===id);
    const done=h.done[i],next=i===h.stage&&!done&&!(i<h.stage);
    const b=next
      ?el('button',{type:'button',class:'scard','aria-pressed':String(sel===i)},
          el('b',{},`第 ${i+1} 關・？？？`,el('span',{class:'tag'},'下一關')),
          el('small',{},c.ids.length>1?'需要先選擇陣營':'尚未揭曉'))
      :el('button',{type:'button',class:'scard','aria-pressed':String(sel===i)},
          el('b',{},`第 ${i+1} 關・${sc.name}`,done?el('span',{class:'tag'},`${done.rank}`):null),
          el('small',{},c.finale?`${sc.year}　劇情終章`:`${sc.year}　敵軍 Lv${enemyLv(i)}`),
          el('p',{},sc.brief));
    b.onclick=()=>{SET.campSel=i;save();renderCamp()};
    if(c.ids.length>1&&sel===i){
      const alt=el('div',{class:'row'},el('small',{class:'muted'},'選邊：'));
      for(const x of c.ids){const a=el('button',{type:'button',class:'chip','aria-pressed':String(id===x)},SCENARIOS.find(y=>y.id===x).lordName+'陣營');a.onclick=e=>{e.stopPropagation();h.pick[i]=x;save();renderCamp()};alt.append(a)}
      b.append(alt);
    }
    return b;
  }).filter(Boolean);
  const done=h.stage>=CHAIN.length;
  box.replaceChildren(el('div',{class:'hcard'},
    el('div',{class:'fig big',html:heroFig(h)}),
    el('div',{class:'hbody'},
      el('h3',{},h.name,el('small',{class:'muted'},`　${h.arm==='槍'?'足輕':h.arm}・傾向 ${h.lean}`)),
      el('div',{class:'row'},el('b',{},`Lv${h.lv}`),h.lv>=MAXLV?el('small',{class:'muted'},'已達上限'):el('div',{class:'bar'},el('i',{style:`width:${Math.round(h.exp/need*100)}%`})),
        h.lv<MAXLV?el('small',{class:'muted'},`經驗 ${h.exp} / ${need}`):null),
      h.free?el('div',{class:'ok'},`自由點數 ${h.free}：按 ＋ 分配到喜歡的屬性`):null,
      attrs,
      el('small',{class:'muted'},`帶兵 ${fmt(heroTroops(h))}；我方名將的等級跟著你走（Lv${h.lv}），敵軍每關固定。`),
      el('div',{class:'row',style:'margin-top:8px'},reset))),
    el('div',{class:'shop'},el('h3',{},'夥伴',el('small',{class:'muted'},`　同隊 ${PARTY_MAX} 位，點選名簿裡的武將換人`)),
      el('div',{class:'mates'},...h.roster.map(n=>{
        const on=h.party.includes(n),r=ROSTER.get(n)?.r||3;
        const b=el('button',{type:'button',class:'mate','aria-pressed':String(on),title:on?'同隊中（再點一次移出）':'點一下加入隊伍'},el('div',{class:'fig',html:compFig(n)}),el('span',{},n),el('small',{class:'muted'},`${starsOf(n)}${on?'・同隊':''}`));
        b.onclick=()=>{if(on){if(h.party.length>1)h.party=h.party.filter(x=>x!==n)}else h.party=[...h.party,n].slice(-PARTY_MAX);save();renderCamp()};return b}))),
    el('div',{class:'shop'},el('h3',{},'武將招募',el('small',{class:'muted'},`　5★ 每位 ${fmt(recruitPrice(h))} 銀；通關新的關卡後，會出現新的人選`)),
      ...RECRUIT.filter(([n,at])=>at<h.stage||h.roster.includes(n)).map(([n,at])=>{
        const have=h.roster.includes(n),locked=false,p=recruitPrice(h);
        const b=el('button',{type:'button',class:'btn',disabled:have||locked||h.silver<p},have?'已加入':locked?`第 ${at+1} 關後開放`:`招募 ${fmt(p)} 銀`);
        b.onclick=()=>{if(h.silver<p)return;h.silver-=p;h.roster.push(n);if(h.party.length<PARTY_MAX)h.party.push(n);save();sfx('select');renderCamp()};
        return el('div',{class:'shopRow'},el('b',{},n),el('span',{class:'muted'},starsOf(n)),el('small',{class:'muted'},`${armTxt(n)}`),el('span'),b)})),
    h.bandit?(()=>{const go=el('button',{type:'button',class:'btn'},'討伐盜賊（限 4 回合）');go.onclick=()=>startStory(null,true);
      return el('div',{class:'bandit'},el('b',{},'盜賊出沒！'),el('small',{class:'muted'},`獎勵 ${fmt(banditSilver(h.bandit.i))} 銀與經驗；不理會的話，下一關開場被偷走 5% 的銀。`),go)})():'',
    el('div',{class:'shop'},el('h3',{},'商店',el('small',{class:'muted'},`　銀 ${fmt(h.silver)}${h.pts.魅?`・魅力折扣 ${Math.min(15,h.pts.魅*.3).toFixed(1)}%`:''}`)),
      ...SHOP.map(it=>{
        const lv=h.shop[it.k],maxed=lv>=it.max,p=price(h,it);
        const b=el('button',{type:'button',class:'btn',disabled:maxed||h.silver<p},maxed?'已滿級':`購買 ${fmt(p)} 銀`);
        b.onclick=()=>{if(h.silver<p)return;h.silver-=p;h.shop[it.k]++;save();sfx('select');renderCamp()};
        return el('div',{class:'shopRow'},el('b',{},it.n),el('span',{class:'muted'},`Lv${lv}/${it.max}`),el('small',{class:'muted'},it.fx),
          h.sale===it.k&&!maxed?el('span',{class:'tag'},'特價 7 折'):el('span'),b)})),
    done?el('p',{class:'ok'},'戰役通關！你見證了戰國的終結、江戶時代的開始。可以回頭重打舊關，賺銀買裝備。'):'',
    el('div',{class:'teams',style:'margin-top:12px'},...stages));
}
function renderSetup(){
  chips($('modeChips'),MODES,SET.mode,setMode);
  {const u=new URL(location.href);   // 網址只留模式；舊的 ?engine= 參數去掉
   if(u.searchParams.get('m')!==SET.mode||u.searchParams.has('engine')){u.searchParams.set('m',SET.mode);u.searchParams.delete('engine');history.replaceState(history.state,'',u)}}
  // 畫面效果：自動（手機等低階裝置用省電）／完整／省電（降解析度與幀率，關濾鏡、紅葉、雲影等裝飾）
  chips($('perfChips'),[['auto','自動'],['full','完整'],['light','省電']],SET.perf||'auto',v=>{
    SET.perf=v;save();setPerf(v);if(VIEW){VIEW.destroy();VIEW=null}renderSetup()});
  $('perfNote').textContent=(SET.perf||'auto')==='auto'?(isLight()?'目前裝置偵測為低階，使用省電模式。':'目前裝置使用完整效果。'):'';
  document.dispatchEvent(new CustomEvent('slg:mode',{detail:SET.mode}));
  $('lvRow').hidden=$('garRow').hidden=SET.mode!=='land';$('foeRow').hidden=SET.mode!=='pvp';
  chips($('garChips'),[['hold','固守（同遊戲）'],['guard','出擊（練習用）']],SET.gar,v=>{SET.gar=v;save();renderSetup()});
  chips($('lvChips'),[3,4,5,6,7,8,9,10].map(v=>[v,`Lv${v}`]),SET.lv,v=>{SET.lv=v;save();renderSetup()});
  // 平時對人（同一支手機輪流）；一個按鈕切換成對 NPC
  {const b=el('b',{class:'foeNow'},SET.foe==='ai'?'對 NPC（電腦操作紅方）':'對人（同一支手機輪流）');
   const t=el('button',{type:'button',class:'btn ghost'},SET.foe==='ai'?'切換為對人':'切換為對 NPC');
   t.onclick=()=>{SET.foe=SET.foe==='ai'?'2p':'ai';save();renderSetup()};$('foeChips').replaceChildren(b,t)}
  const L=D.levels[SET.lv];
  $('lvNote').textContent=SET.mode==='land'?`守將 Lv${L.glv}・每人 ${fmt(L.per)} 兵・${L.waves||1} 隊守軍・${L.note}`:'';
  const noTeam=SET.mode==='story'||SET.mode==='camp';
  $('storyRow').hidden=SET.mode!=='story';$('mineWrap').hidden=noTeam;$('mineNote').hidden=noTeam;$('legend').hidden=noTeam;
  $('campRow').hidden=SET.mode!=='camp';if(SET.mode==='camp')renderCamp();else $('start').hidden=false;
  SET.sc=SCENARIOS.find(x=>x.id===SET.sc)?.id||SCENARIOS[0].id;
  $('storyList').replaceChildren(...SCENARIOS.map(sc=>{
    const b=el('button',{type:'button',class:'scard','aria-pressed':String(SET.sc===sc.id)},
      el('b',{},sc.name,SET.camp?.[sc.id]?el('span',{class:'tag'},`${SET.camp[sc.id].rank} ${SET.camp[sc.id].title}`):null),el('small',{},sc.year),el('p',{},sc.brief),
      ...(sc.carry||[]).map(c=>el('small',{class:carryOk(c)?'ok':'muted'},`${carryOk(c)?'✓':'○'} 戰役加成：${c.text}${carryOk(c)?'（已啟用）':`（需先在「${scName(c.from)}」拿到 ${c.min||'B'} 評價以上）`}`)),
      el('div',{class:'figs'},...sc.units.filter(u=>u.side===0).map(u=>el('div',{class:'fig',html:chibi({n:u.gens[0],f:facOf(u.gens[0])},{arm:armOfUnit(u),side:0,boss:true})+`<span>${u.gens[0]}</span>`}))));
    b.onclick=()=>{SET.sc=sc.id;save();renderSetup()};return b}));
  // 對戰模擬是一隊對一隊；打地仍可帶 3 隊
  const n=SET.mode==='pvp'?1:3;
  $('setup').classList.toggle('duel',SET.mode==='pvp');
  $('mineTitle').textContent=SET.mode==='pvp'?'藍方部隊':'我方部隊（藍）';
  $('mine').replaceChildren(...SET.mine.slice(0,n).map((t,i)=>teamCard(t,0,i,SET.mine)));
  $('enemyWrap').hidden=SET.mode!=='pvp';
  $('enemyTitle').textContent=SET.foe==='ai'?'紅方部隊（NPC）':'紅方部隊';
  $('enemy').replaceChildren(...SET.enemy.slice(0,n).map((t,i)=>teamCard(t,1,i,SET.enemy)));
}

// ---- map ----
let G=null;
// 遊戲內地形不擋路也沒有攻防加成（Joe），目前地形只是裝飾；之後有數值（例如火炬）再加移動耗費
const TER={平:{c:1},林:{c:1},山:{c:1},水:{c:1},橋:{c:1},城:{c:1},寺:{c:1},柵:{c:1},田:{c:1},村:{c:1}};
function genMap(mode){
  for(let tries=0;tries<200;tries++){
    const T=Array.from({length:H},()=>Array(W).fill('平'));
    for(const y of[1,2,3,4,5,6,7])for(let x=0;x<W;x++){const r=Math.random();T[y][x]=r<.17?'林':r<.25?'山':'平'}
    if(mode==='land')for(const[x,y]of[[2,0],[3,0],[4,0],[2,1],[3,1],[4,1]])T[y][x]='城';
    const spawn0=mode==='pvp'?[[3,7]]:[[1,8],[3,8],[5,8]],spawn1=mode==='land'?[[3,1],[2,0],[4,0]]:[[3,1]];
    for(const[x,y]of[...spawn0,...spawn1])if(T[y][x]==='山'||T[y][x]==='林')T[y][x]='平';
    // every spawn must reach the other side
    const s0=spawn0[0],seen=new Set([s0.join(',')]),q=[s0];
    while(q.length){const[x,y]=q.shift();for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,k=nx+','+ny;if(nx<0||ny<0||nx>=W||ny>=H||seen.has(k)||TER[T[ny][nx]].c>9)continue;seen.add(k);q.push([nx,ny])}}
    if([...spawn0,...spawn1].every(([x,y])=>seen.has(x+','+y)))return{T,spawn0,spawn1};
  }
}
// skills for scenario generals: innate + 2 picked from the modelled pool by name (same every time)
function fixedSkills(n){const h=[...n].reduce((a,c)=>(a*31+c.codePointAt(0))>>>0,7);return[GOOD[h%GOOD.length],GOOD[(h>>>7)%GOOD.length]]}
const armOfUnit=u=>bestArm(D,u.gens)||u.arm;   // 劇本的兵種：以隊伍滿紅時自帶的兵種為主，沒有兵種特性才用劇本寫的
let CAMP=null;   // 戰役進行中：{h 玩家, i 關卡序, lvA 我方等級, lvB 敵方等級}
const gearSt=(st,side)=>{if(!CAMP||side!==0)return st;const m=gearMul(CAMP.h);return Object.fromEntries(Object.entries(st).map(([k,v])=>[k,Math.round(v*(m[k]||1)*10)/10]))};
const mkUnit=(u,id)=>({id,side:u.side,key:u.key,x:u.x,y:u.y,ai:u.ai,anchor:u.anchor||(u.ai==='guard'?[u.x,u.y]:undefined),r:u.r,lord:u.lord,target:u.target,onRainEnd:u.onRainEnd,
  team:battleTeam({arm:armOfUnit(u),gens:u.gens.map(n=>({n,s:u.s?.[n]||fixedSkills(n),t:u.t+(CAMP&&u.side===0?1000*CAMP.h.shop.supply:0),st:gearSt(fullRedStats(D,n,u.gens,armOfUnit(u),CAMP?(u.side===0?CAMP.lvA:CAMP.lvB):50),u.side)}))},u.side)});   // 劇本的武將一律滿紅
// 夥伴的數值：5★ 一律滿紅；3★、4★ 用該等級的基礎成長。等級都跟著玩家，再套用裝備加成
function compStats(n,h){
  const r=ROSTER.get(n)?.r||4;
  const st=r>=5&&D.stats[n]?fullRedStats(D,n,[n],h.arm,h.lv):statsAt(D,n,h.lv,r);
  return gearSt(st,0);
}
const mkHero=(h,id,x,y)=>({id,side:0,key:'hero',hero:true,x,y,team:battleTeam({arm:h.arm,gens:[
  {n:h.name,s:fixedSkills(h.name),t:heroTroops(h),st:heroStats(h)},
  ...(h.party||[]).slice(0,PARTY_MAX).map(n=>({n,s:fixedSkills(n),t:Math.round(heroTroops(h)*.8),st:compStats(n,h)}))]},0)});
// 劇本事件：ev.day 到了那天（我方回合開始）或 ev.on='rout:部隊代號'（該隊潰走）時觸發一次。
//   say 對話；log 戰報文字；spawn 增援部隊（格子被占住就往旁邊找空格）；ai {部隊代號:{ai,r}} 改變行動；
//   buff {side,dmg,days:[起,迄],arm?,label}：期間內該陣營（可限兵種）造成的傷害乘以 dmg；heal {side,pct} 補兵
async function runEvents(on){
  const sc=G.sc;
  for(const ev of sc.events||[]){
    const id=ev.id||JSON.stringify([ev.day,ev.on]);
    if(G.fired.has(id)||(on==='day'?ev.day!==G.day:ev.on!==on))continue;
    G.fired.add(id);
    if(ev.log)addLog(ev.log);
    for(const d of ev.spawn||[]){
      const free=(x,y)=>x>=0&&y>=0&&x<W&&y<H&&!unitAt(x,y);
      let[x,y]=[d.x,d.y];
      if(!free(x,y)){const c=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1],[2,0],[-2,0],[0,2],[0,-2]].map(([a,b])=>[d.x+a,d.y+b]).find(([a,b])=>free(a,b));if(c)[x,y]=c}
      G.units.push({...mkUnit({...d,x,y},Math.max(...G.units.map(u=>u.id))+1),acted:false,moved:false});
    }
    for(const[k,v]of Object.entries(ev.ai||{}))for(const u of G.units)if(u.key===k&&alive(u)){Object.assign(u,v);if(u.ai==='guard'&&!u.anchor)u.anchor=[u.x,u.y]}
    if(ev.buff)G.buffs.push(ev.buff);
    if(ev.heal)for(const u of G.units)if(u.side===ev.heal.side&&alive(u))for(const g of u.team.gens)if(g.troops>0)g.troops=Math.min(g.max,g.troops+Math.round(g.max*ev.heal.pct));
    renderBoard();
    if(ev.say)await talk(ev.say);
  }
}
// 終章：只有劇情，沒有戰鬥。看完拿一筆經驗，戰役通關
async function startFinale(){
  const h=SET.hero,i=campIdx(),first=i>=h.stage;
  G=null;$('setup').hidden=true;$('game').hidden=true;play('title');
  await talk([...SCENES.edo.pre,...SCENES.edo.post]);
  const gain=first?stageExp(i,'A'):0,lv0=h.lv,up=addExp(h,gain);
  if(first){h.stage=CHAIN.length;h.done[i]={rank:'S'};h.silver+=stageSilver(i,'A',0)}
  save();
  $('overMsg').textContent='戰役通關！';
  $('overSub').replaceChildren(el('div',{},first?`終章：獲得經驗 ${gain}${up?`，Lv${lv0} → Lv${h.lv}`:''}、${fmt(stageSilver(i,'A',0))} 銀`:'重溫終章'),el('div',{},`${h.name} Lv${h.lv}・走完了從桶狹間到江戶開幕的路。`));
  $('again').hidden=true;$('toSetup').textContent='回戰役畫面';$('over').hidden=false;
}
function startStory(scId,bandit){
  const hero=SET.mode==='camp'?SET.hero:null,ci=hero?(bandit?hero.bandit.i:campIdx()):0;
  const sc=bandit?banditScenario(ci,hero):SCENARIOS.find(x=>x.id===(scId||SET.sc));let id=0;
  CAMP=hero?{h:hero,i:ci,lvA:hero.lv,lvB:enemyLv(ci)}:null;
  if(hero&&!bandit&&hero.bandit){   // 沒去打的盜賊，下一關開場偷走 5% 的銀
    const lost=Math.round(hero.silver*.05);hero.silver-=lost;hero.bandit=null;save();
    if(lost)setTimeout(()=>addLog(`上一關留下的盜賊趁夜偷走了 ${fmt(lost)} 銀。`),0);
  }
  const T=sc.map.map(r=>[...r]);
  const carries=(sc.carry||[]).filter(carryOk);
  const units=sc.units.map(u=>{let t=u.t;for(const c of carries)if(c.troops&&u.side===c.troops.side&&(!c.troops.keys||c.troops.keys.includes(u.key)))t=Math.round(t*(1+c.troops.pct));return mkUnit({...u,t},id++)});
  if(hero){   // 主角當作額外一隊，放在大將旁邊的空格
    const base=units.find(u=>u.side===0&&u.lord)||units.find(u=>u.side===0)||{x:3,y:8};
    const free=(x,y)=>x>=0&&y>=0&&x<W&&y<H&&!units.some(o=>o.x===x&&o.y===y);
    const spot=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[2,0],[-2,0],[0,2]].map(([a,b])=>[base.x+a,base.y+b]).find(([a,b])=>free(a,b))||[base.x,base.y];
    units.push(mkHero(hero,id++,spot[0],spot[1]));
  }
  G={T,units,buffs:carries.filter(c=>c.buff).map(c=>c.buff),fired:new Set(),day:1,phase:0,sel:null,mode:'story',sc,foe:'ai',over:null,busy:false,log:[],
    camp:hero?{h:hero,i:ci,lvA:hero.lv,lvB:CAMP.lvB,bandit:!!bandit}:null,
    st:{killDay:0,killRain:false,finisher:null,routed:[],foeRouted:[],hitBy:{},said:new Set()},gid:Date.now()};play('map');
  $('setup').hidden=true;$('game').hidden=false;
  addLog(`${hero?(bandit?'關間・':`戰役第 ${ci+1} 關・`):''}${bandit?'':'劇本'}「${sc.name}」：${sc.brief}`);
  if(hero)addLog(`${hero.name} Lv${hero.lv} 出陣（我方名將 Lv${hero.lv}，敵軍 Lv${CAMP.lvB}）`);
  for(const c of carries)addLog(`戰役加成（${scName(c.from)}）：${c.text}`);
  renderObj();renderBoard();
  $('board').scrollIntoView({behavior:'smooth',block:'start'});
  const scene=hero&&!bandit?(SCENES[sc.id]||generic(sc.lordName)):null;
  const fv=hero&&!bandit?FAVS[sc.id]:null;
  if(fv&&!hero.roster.includes(fv.n)&&fv.how==='spot'){
    const hu=G.units.find(u=>u.hero),t=hu&&spotTile(sc.id,T,G.units,hu);
    if(t){G.spot={x:t[0],y:t[1],fv,done:false};G.favHint=`${fv.hint}（大概在主角的${dirText(hu,t)}方向）`;renderObj()}
  }else if(fv&&!hero.roster.includes(fv.n))G.favHint=fv.hint;
  if(G.favHint)renderObj();
  talk([...(scene?.pre||[]),...(fv&&fv.how==='talk'&&!hero.roster.includes(fv.n)?fv.pre:[]),...(sc.talk.start||[])]).then(()=>runEvents('day'));
}
// 勝敗條件與隱藏條件（隱藏條件開打時只給提示）
function renderObj(){
  const box=$('obj');box.hidden=G.mode!=='story';if(box.hidden)return;
  const sc=G.sc;
  box.replaceChildren(
    el('div',{},el('b',{class:'ok'},'勝利'),' '+(sc.win||[]).join('、')),
    el('div',{},el('b',{class:'ng'},'敗北'),' '+(sc.lose||[]).join('、')),
    sc.hidden?.length?el('details',{},el('summary',{},`隱藏條件 ×${sc.hidden.length}（結算時揭曉，達成越多評價越高）`),
      el('ul',{},...sc.hidden.map(h=>el('li',{},'？？？ ',el('span',{class:'muted'},h.hint))))):'',
    G.favHint?el('div',{class:'muted'},'？？？ 人物傳聞：'+G.favHint):'');
}
const raining=()=>G.mode==='story'&&G.sc.rain&&G.day>=G.sc.rain[0]&&G.day<=G.sc.rain[1];
// story dialogue: one line per tap。{choose:[…]} 是選擇點（戰役主角的選項，選了加屬性）；who '我' 是主角、'旁白' 沒有人像
async function talk(lines){
  if(!lines?.length)return;
  const dlg=$('talk'),hn=SET.hero?.name||'你',sub=t=>t.replaceAll('{名}',hn);
  for(const ln of lines){
    if(ln.choose){await choose(ln.choose,sub,ln.fav);continue}
    const who=ln.who==='我'?hn:ln.who,nar=who==='旁白';
    const f=facOf(who),side=G?.units?.find(u=>u.team.gens.some(g=>g.n===who))?.side??0;
    dlg.replaceChildren(el('div',{class:'tk'},el('div',{class:'fig',html:nar?'':portrait(who,chibi({n:who,f},{side,boss:true}))}),
      el('div',{class:'tx'},el('b',{style:`color:${nar?'var(--muted)':SIDE_COL[side]}`},nar?'':who),el('p',{},sub(ln.text)),
        ln.tag?el('small',{class:'ok'},ln.tag):null,el('small',{class:'muted'},'點一下繼續'))));
    if(!dlg.open)dlg.showModal();
    sfx('select');
    await new Promise(r=>{dlg.onclick=r;dlg.oncancel=e=>{e.preventDefault();r()}});
  }
  dlg.close();
}
async function choose(opts,sub,favN){
  const dlg=$('talk');
  const k=await new Promise(res=>{
    dlg.onclick=null;dlg.oncancel=e=>e.preventDefault();
    dlg.replaceChildren(el('div',{class:'ch'},el('small',{class:'muted'},'你要怎麼回答？'),
      ...opts.map((o,j)=>{const b=el('button',{type:'button',class:'opt',title:ATTR_HINT[o.a]},el('b',{class:'at'},o.a),' '+sub(o.text));b.onclick=e=>{e.stopPropagation();res(j)};return b})));
    if(!dlg.open)dlg.showModal();
  });
  const o=opts[k],h=SET.hero,p=o.pts||1;
  if(h){h.pts[o.a]+=p;save();if(G)addLog(`選擇「${o.a}」：${ATTR_NAME[o.a]} +${p}`)}
  let tag=`${ATTR_NAME[o.a]} +${p}`;
  if(h&&favN&&o.fav){h.fav[favN]=(h.fav[favN]||0)+o.fav;save();tag+=`・${favN}好感度 +${o.fav}`}
  sfx('select');
  await talk([{who:'我',text:o.text,tag},...(o.reply||[])]);
}
function startGame(){
  if(SET.mode==='camp'){if(!SET.hero)return;if(CHAIN[campIdx()].finale&&!(G?.camp?.bandit&&SET.hero.bandit))return startFinale();return G?.camp?.bandit&&SET.hero.bandit?startStory(null,true):startStory(campStageId())}
  if(SET.mode==='story')return startStory();
  const m=genMap(SET.mode);let id=0;
  const units=[];
  SET.mine.slice(0,SET.mode==='pvp'?1:3).forEach((s,i)=>units.push({id:id++,side:0,x:m.spawn0[i][0],y:m.spawn0[i][1],team:battleTeam(s,0)}));
  if(SET.mode==='land'){
    const keys=[...teamsAt(SET.lv)].sort(()=>Math.random()-.5).slice(0,D.levels[SET.lv].waves||1);
    // 遊戲裡的守軍不會離開土地；「出擊」是練習用：守軍會主動前進攻擊
    keys.forEach((k,i)=>units.push({id:id++,side:1,x:m.spawn1[i][0],y:m.spawn1[i][1],team:garrisonTeam(k,SET.lv),garrison:true,
      ...(SET.gar==='guard'?{ai:'advance'}:{})}));
  }else SET.enemy.slice(0,1).forEach((s,i)=>units.push({id:id++,side:1,x:m.spawn1[i][0],y:m.spawn1[i][1],team:battleTeam(s,1)}));
  G={T:m.T,units,day:1,phase:0,sel:null,mode:SET.mode,foe:SET.foe,garAi:SET.mode==='land'&&SET.gar==='guard',over:null,busy:false,log:[],gid:Date.now()};play('map');
  $('setup').hidden=true;$('game').hidden=false;
  addLog(SET.mode==='land'?`出征 Lv${SET.lv} 土地：擊破全部 ${units.filter(u=>u.side).length} 隊守軍即可佔領（${DAYS} 天內）。`:'對戰模擬：一隊對一隊，擊潰對方部隊獲勝。');
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
  // 盤面交給 Phaser 畫（slg/board-phaser.js），規則與點擊處理在這裡
  if(!VIEW){VIEW=createPhaserBoard(box,{onTap:(x,y)=>tap(x,y)});const v=VIEW;v.lost=()=>{if(VIEW!==v)return;v.destroy();VIEW=null;if(G)setTimeout(renderBoard,50)}}
  VIEW.render({gid:G.gid,T:G.T,rain:raining(),mark,units:G.units.map(u=>{const b=u.team.gens[0],dn=u.drawUntil&&u.drawUntil>=G.day;
    return{id:vid(u),side:u.side,x:u.x,y:u.y,alive:alive(u),name:b.n,f:b.f,arm:u.team.arm,ratio:total(u.team)/totalMax(u.team),
      cnt:u.team.gens.filter(g=>g.troops>0).length,done:!!u.acted,on:u===sel,tgt:!!u.target,lord:!!u.lord,draw:dn?u.drawUntil-G.day+1:0}})});
  const who=G.mode==='pvp'&&G.foe==='2p'?(G.phase?'紅方':'藍方'):G.phase?'敵軍':'我方';
  const lim=G.mode==='land'?DAYS:G.mode==='story'?G.sc.days:0;
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
    el('small',{},`${ARMS.find(a=>a[0]===t.arm)?.[1]||t.arm}・兵力 ${fmt(total(t))}・移動 ${mv(u)}・射程 ${rg(u)}・地形 ${G.T[u.y][u.x]==="城"?"軍營":G.T[u.y][u.x]}${u.garrison?'・守軍':''}`)),...rows,el('div',{class:'row'},...acts));
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
  if(s&&!s.moved&&!u){const R=reach(s);if(R.has(x+','+y)){s.x=x;s.y=y;s.moved=true;sfx('move');if(!targets(s).length){s.acted=true;G.sel=null}renderBoard();if(G.spot&&!G.spot.done&&s.side===0&&x===G.spot.x&&y===G.spot.y){spotMeet();return}autoEnd();return}}
  if(u&&u.side===me&&!u.acted){G.sel=u===s?null:u;G.peek=null;sfx('select');renderBoard();return}
  G.sel=null;G.peek=u||null;renderBoard();
}

async function spotMeet(){
  const sp=G.spot,h=SET.hero,fv=sp.fv;sp.done=true;G.busy=true;
  h.fav[fv.n]=(h.fav[fv.n]||0)+FAV_NEED;save();addLog(`遇見了 ${fv.n}！好感度 +${FAV_NEED}`);
  await talk(fv.say);G.busy=false;autoEnd();
}
// 結算時：好感度夠高、或達成條件，就讓隱藏武將加入
function favEnd(win,lines,sub){
  const sc=G.sc,fv=FAVS[sc.id],h=G.camp.h;
  if(!fv||h.roster.includes(fv.n))return;
  if(fv.how==='win'&&win&&fv.cond(G.st)){h.fav[fv.n]=(h.fav[fv.n]||0)+FAV_NEED;sub.push(`隱藏人物條件達成：${fv.text}`)}
  if(fv.how==='lose'&&!win){h.fav[fv.n]=(h.fav[fv.n]||0)+FAV_NEED}
  if((h.fav[fv.n]||0)>=FAV_NEED){
    h.roster.push(fv.n);if(h.party.length<PARTY_MAX)h.party.push(fv.n);save();
    lines.push(...fv.join);sub.push(`隱藏夥伴加入：${fv.n}（${starsOf(fv.n)}）`);
  }else if((h.fav[fv.n]||0)>0&&fv.how==='talk')sub.push('似乎有人對你有些好感……也許再來一次，會有不一樣的答案。');
  save();
}
async function fight(a,d){
  const was=G.busy;G.busy=true;G.sel=null;
  d.team.terrain=G.T[d.y][d.x]==='城'?'城':G.T[d.y][d.x];
  const charm=G.camp&&a.side===0&&G.units.some(u=>u.hero&&alive(u))?charmDmg(G.camp.h):1;
  const mul=charm*(raining()&&a.side===0?G.sc.surprise:1)*(G.buffs||[]).filter(b=>b.side===a.side&&G.day>=b.days[0]&&G.day<=b.days[1]&&(!b.arm||b.arm===a.team.arm)).reduce((m,b)=>m*b.dmg,1);
  a.team.mods=mul!==1?{dmg:mul}:null;d.team.mods=null;
  const before=[a.team.gens.map(g=>g.troops),d.team.gens.map(g=>g.troops)];
  const r=battle(a.team,d.team);
  const st=G.st,lines=[];
  if(st){
    if(a.side===0&&d.key)st.hitBy[d.key]=(st.hitBy[d.key]||0)+1;
    for(const u of[a,d])if(!alive(u)){
      if(u.target&&!st.killDay){st.killDay=G.day;st.killRain=raining();st.finisher=(u===d?a:d).key}
      if(u.side===0&&u.key&&!st.routed.includes(u.key))st.routed.push(u.key);
      if(u.side===1&&u.key&&!st.foeRouted.includes(u.key))st.foeRouted.push(u.key);
      if(u.key)lines.push(...(G.sc.talk['rout_'+u.key]||[]));
    }
    const lord=G.units.find(u=>u.lord);
    if(lord&&alive(lord)&&total(lord.team)<=totalMax(lord.team)/2&&!st.said.has('lordLow')){st.said.add('lordLow');lines.push(...(G.sc.talk.lordLow||[]))}
  }
  a.acted=true;a.moved=true;
  if(VIEW)await VIEW.focus(vid(a),vid(d));
  await playBattle(a,d,before,r);
  const res={W:'勝利',D:'平局',L:'敗北'}[r.res];
  const lost=(i,u)=>{const v=before[i].reduce((s,x)=>s+x,0)-total(u.team);return v<0?`回復 ${fmt(-v)}`:`損失 ${fmt(v)}`};
  addLog(`${a.team.name} 攻擊 ${d.team.name}：${res}（${r.rounds} 回合；攻方${lost(0,a)}，守方${lost(1,d)}）`);
  if(d.garrison){
    if(r.res==='D'){d.drawUntil=G.day+DRAW_DAYS-1;addLog(`平局：${d.team.name} 保留剩餘兵力 ${DRAW_DAYS} 天，之後恢復滿兵。`)}
    else if(alive(d)){d.team.gens.forEach(g=>g.troops=g.max);d.drawUntil=null}   // garrison is full again after a loss
  }
  if(a.team.mods)addLog(`${raining()&&a.side===0?'豪雨奇襲':'戰場加成'}：${a.team.name} 造成的傷害 ×${+a.team.mods.dmg.toFixed(2)}`);
  if(!alive(d))addLog(`${d.team.name} 潰走！`);
  if(!alive(a))addLog(`${a.team.name} 潰走！`);
  checkOver();renderBoard();
  if(VIEW)await VIEW.unfocus();
  if(!G.over&&lines.length)await talk(lines);
  if(!G.over&&G.mode==='story')for(const u of[a,d])if(!alive(u)&&u.key)await runEvents('rout:'+u.key);
  G.busy=was;renderBoard();
}
function checkOver(){
  const left=s=>G.units.filter(u=>u.side===s&&alive(u)).length;
  if(G.mode==='story'){
    if(G.camp&&G.over)return;
    const sc=G.sc,lordDown=G.units.some(u=>u.lord&&!alive(u)),timeUp=G.day>sc.days;
    const win=G.units.some(u=>u.target&&!alive(u))||(sc.annihilate&&!left(1))||(sc.survive&&timeUp&&!lordDown&&left(0)>0);
    const lose=!win&&(lordDown||!left(0)||timeUp);
    if(win&&!G.st.killDay)G.st.killDay=sc.survive&&timeUp?sc.days:G.day;
    if(!win&&!lose)return;
    let lines,sub=[];
    if(win){
      const got=(sc.hidden||[]).map(h=>({h,ok:!!h.test(G.st)})),n=got.filter(x=>x.ok).length;
      const rk=(sc.rank||[]).find(r=>n>=r.n);
      const rank=rk?.rank||'C',old=SET.camp?.[sc.id];
      if(!G.camp?.bandit&&(!old||RANKV[rank]>RANKV[old.rank])){(SET.camp||={})[sc.id]={rank,title:rk?.title||'',day:G.day};save()}
      G.over=`${sc.name}：勝利！${rk?`評價 ${rk.rank}「${rk.title}」`:''}`;
      sub=[`第 ${G.day} 天取勝・隱藏條件 ${n}/${got.length}`,...got.map(({h,ok})=>`${ok?'✓':'✗'} ${h.name}：${h.desc}`)];
      lines=[...sc.talk.win,...(rk?.ending||[])];
      if(G.camp?.bandit){   // 盜賊小戰：固定經驗與銀，不推進關卡
        const{h,i}=G.camp,lv0=h.lv,up=addExp(h,banditExp(i)),sv=banditSilver(i);h.silver+=sv;h.bandit=null;save();
        G.over=`盜賊討伐：勝利！`;sub=[`第 ${G.day} 天取勝`,`戰役：獲得經驗 ${banditExp(i)}、${fmt(sv)} 銀${up?`，Lv${lv0} → Lv${h.lv}，自由點數 +${up}`:''}`];
        lines=[...sc.talk.win];
      }else if(G.camp){   // 戰役：結算經驗，第一次通關才推進到下一關；重打舊關只拿 25%
        const{h,i}=G.camp,first=i>=h.stage,foes=G.units.filter(u=>u.side===1&&!alive(u)).length;
        const gain=Math.round((stageExp(i,rank)+routExp(i)*foes)*(first?1:.25)),lv0=h.lv,up=addExp(h,gain);
        if(first)h.stage=Math.min(CHAIN.length,i+1);
        const od=h.done[i];if(!od||RANKV[rank]>RANKV[od.rank])h.done[i]={rank};
        const ag=first?1:.25,silver=Math.round(stageSilver(i,rank,foes)*ag);h.silver+=silver;
        const open=SHOP.filter(it=>h.shop[it.k]<it.max);h.sale=open.length?pick(open).k:null;
        save();
        if(first&&Math.random()<.6)h.bandit={i};save();
        sub.splice(1,0,`戰役：獲得 ${fmt(silver)} 銀${h.sale?`；商店本期特價：${SHOP.find(x=>x.k===h.sale).n}（7 折）`:''}`);
        sub.splice(1,0,`戰役：獲得經驗 ${gain}（擊潰敵軍 ${foes} 隊${first?'':'，重打舊關只拿 25%'}）${up?`，Lv${lv0} → Lv${h.lv}，自由點數 +${up}`:''}`);
        lines.push(...(SCENES[sc.id]||generic(sc.lordName)).post);
        const jn=JOIN[sc.id];
        if(first&&jn&&!h.roster.includes(jn)){
          h.roster.push(jn);if(h.party.length<PARTY_MAX)h.party.push(jn);save();
          lines.push({who:jn,text:'{名}，這一仗我都看在眼裡。若不嫌棄，請讓我也加入你的隊伍。'});
          sub.push(`夥伴加入：${jn}（${starsOf(jn)}）`);
        }
        favEnd(true,lines,sub);
        if(h.bandit)sub.push('路上有盜賊出沒！回戰役畫面可以選擇討伐，不理會的話下一關開場會被偷走 5% 的銀。');
      }
    }else{
      G.over=`${sc.name}：敗北（${lordDown?(sc.lordName||'總大將')+'隊潰走':timeUp?`${sc.days} 天內沒有擊破目標`:'全軍潰走'}）`;
      lines=[...((lordDown?sc.talk.loseLord:timeUp?sc.talk.loseTime:null)||sc.talk.lose||[])];
      if(G.camp&&!G.camp.bandit)favEnd(false,lines,sub);
    }
    addLog(G.over);sub.slice(1).forEach(x=>addLog(x));play(win?'win':'lose');
    overButtons(win);
    talk(lines).then(()=>{$('overMsg').textContent=G.over;$('overSub').replaceChildren(...sub.map(x=>el('div',{},x)));$('over').hidden=false});
    return;
  }
  if(!left(1))G.over=G.mode==='land'?'佔領成功！':G.foe==='2p'?'藍方獲勝！':'勝利！';
  else if(!left(0))G.over=G.mode==='land'?'出征失敗：全軍潰走':G.foe==='2p'?'紅方獲勝！':'敗北';
  else if(G.mode==='land'&&G.day>DAYS)G.over=`出征失敗：${DAYS} 天內沒有攻下`;
  if(G.over){overButtons(true);addLog(G.over);$('overSub').replaceChildren();const good=!/失敗|敗北|紅方/.test(G.over);play(good?'win':'lose');$('overMsg').textContent=G.over;$('over').hidden=false}
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
      addLog(G.sc.rainEndLog||'雨停了，敵軍恢復行動。');
      for(const u of G.units)if(u.onRainEnd&&alive(u)){Object.assign(u,u.onRainEnd);if(u.ai==='guard'&&!u.anchor)u.anchor=[u.x,u.y];addLog(`${u.team.name} 開始${u.ai==='advance'?'出擊':'戒備'}。`)}
      await talk(G.sc.talk.rainEnd);
    }
    if(!G.over)await runEvents('day');
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
const REDUCE=matchMedia('(prefers-reduced-motion:reduce)').matches;
// 戰鬥背景：程式畫的天空、遠山、草地與雙方旗指物（不使用遊戲素材）
const BATTLE_BG=`<svg class="bbg" viewBox="0 0 560 430" preserveAspectRatio="none" aria-hidden="true"><defs>
<linearGradient id="bSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b3f66"/><stop offset=".45" stop-color="#d9875a"/><stop offset=".62" stop-color="#f2c48a"/></linearGradient>
<linearGradient id="bGr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d9a4a"/><stop offset="1" stop-color="#2f4422"/></linearGradient>
<radialGradient id="bSun"><stop offset="0" stop-color="#fff2c4"/><stop offset="1" stop-color="#fff2c4" stop-opacity="0"/></radialGradient></defs>
<rect width="560" height="430" fill="url(#bSky)"/><circle cx="280" cy="190" r="120" fill="url(#bSun)" opacity=".7"/>
<path d="M0 190 L70 150 L140 180 L230 130 L320 175 L400 140 L480 170 L560 145 V260 H0Z" fill="#6c6f8c" opacity=".75"/>
<path d="M0 220 Q140 185 280 215 T560 205 V300 H0Z" fill="#4d5a5e"/><rect y="235" width="560" height="200" fill="url(#bGr)"/>
${Array.from({length:9},(_,i)=>`<g transform="translate(${196+i*9} ${226+(i%3)*5}) scale(.7)"><line y2="-34" stroke="#3a2a1a" stroke-width="1.5"/><rect x="1" y="-34" width="8" height="20" fill="#3f7fd9"/><rect x="1" y="-34" width="8" height="3" fill="#fff"/></g><g transform="translate(${364-i*9} ${226+(i%3)*5}) scale(.7)"><line y2="-34" stroke="#3a2a1a" stroke-width="1.5"/><rect x="-9" y="-34" width="8" height="20" fill="#d24a3a"/><rect x="-9" y="-34" width="8" height="3" fill="#fff"/></g>`).join('')}
<rect width="560" height="430" fill="#000" opacity=".25"/></svg>`;
const KCOL={指揮:'#5b8fd8',主動:'#d0573c',突擊:'#e3923a',被動:'#4fae7f',兵種:'#a771f0',兵學:'#3f7f86'};
async function playBattle(a,d,before,r){
  // 吞食天地式的版面：藍方在左一列、紅方在右一列，下方是說話框（目前出手武將的頭像＋訊息）
  const dlg=$('bt');
  const sides=[a.side===0?a:d,a.side===0?d:a];   // blue on the left
  const pre=t=>t===a?before[0]:before[1];
  const rd=el('div',{class:'rd'},'戰鬥開始');
  let PV=null;   // 中間的武將列是 Phaser 畫布（createBattleStage）；建立失敗時整塊隱藏，只剩說話框與戰報
  const field=el('div',{class:'field pfield'});
  const setBanner=(t,bg)=>PV?.banner(t,bg);
  const setRes=(t,cls)=>PV?.result(t,cls);
  const closeDlg=()=>{PV?.destroy();PV=null;dlg.close()};
  const face=el('div',{class:'face'}),msg=el('div',{class:'msgtx'});
  const logBox=el('ol',{class:'blog'}),statBox=el('div',{class:'bstat',hidden:''});
  const sp=el('div',{class:'row'});
  const drawSp=()=>chips(sp,SPEEDS.map(s=>[s[0],s[2]?`×${s[0]} ${s[1]}`:s[1]]),String(speed),v=>{speed=+v;SET.speed=speed;save();drawSp()});drawSp();
  let skip=false;
  const skipB=el('button',{type:'button',class:'btn ghost'},'跳過');skipB.onclick=()=>{skip=true};
  const done=el('button',{type:'button',class:'btn',hidden:''},'返回地圖');
  dlg.replaceChildren(el('div',{class:'bt'},
    el('div',{class:'stage',html:BATTLE_BG},
      el('div',{class:'shd'},el('b',{style:`color:${SIDE_COL[sides[0].side]}`},sides[0].team.name),rd,el('b',{style:`color:${SIDE_COL[sides[1].side]}`},sides[1].team.name)),
      field,
      el('div',{class:'msg'},face,msg)),
    el('div',{class:'row',style:'justify-content:space-between'},sp,el('div',{class:'row'},skipB,done)),
    statBox,el('details',{},el('summary',{},'戰報'),logBox)));
  dlg.showModal();
  {
    try{PV=await createBattleStage(field,{faceSrc:n=>ART.has(n)?artSrc(ART.get(n)):null,
      units:sides.flatMap((u,si)=>u.team.gens.map((g,i)=>({side:u.side,i,n:g.n,f:g.f,arm:u.team.arm,boss:i===0,max:g.max,troops:pre(u)[i],left:si===0})))})}
    catch(e){console.error(e);PV=null;field.hidden=true}
  }
  play('battle');sfx('start');
  const nm=(s,i)=>(s===a.side?a:d).team.gens[i].n;
  const gen=(s,i)=>(s===a.side?a:d).team.gens[i];
  let typing=0;
  const speak=(side,i,txt)=>{const g=gen(side,i),u=side===a.side?a:d;face.innerHTML=portrait(g.n,chibi({n:g.n,f:g.f},{arm:u.team.arm,side,boss:i===0}));face.style.setProperty('--side',SIDE_COL[side]);
    // 打字機效果：普通速度才逐字出現
    clearInterval(typing);const nm=g.n,body=txt.startsWith(nm)?txt.slice(nm.length):txt,head=txt.startsWith(nm)?nm:'';
    const put=k=>{msg.replaceChildren(head?el('b',{},head):'',body.slice(0,k),el('span',{class:'cur'},'▼'))};
    if(skip||speed>1||REDUCE){put(body.length);return}
    let k=0;put(0);typing=setInterval(()=>{k+=2;put(k);if(k>=body.length)clearInterval(typing)},16)};
  const slash=(side,i,mo)=>{if(!skip&&!REDUCE)PV?.slash(side,i,mo)};
  const cutin=async(side,i,name)=>{sfx('skill');if(PV)await PV.cutin(side,i,name,speed>1?560:980)};
  const healFx=(side,i)=>{if(!skip&&!REDUCE)PV?.heal(side,i)};
  const bigRound=n=>{if(!REDUCE)PV?.bigRound(n)};
  speak(a.side,0,`${a.team.gens[0].n}：「全軍，突擊！」`);
  const setT=(side,i,v)=>PV?.setT(side,i,v);
  const float=(side,i,txt,cls,sub)=>{if(!skip)PV?.float(side,i,txt,cls,sub)};
  const flash=(side,i,cls)=>{if(!skip&&!REDUCE){if(cls==='shake')PV?.shake(side,i);else PV?.lunge(side,i)}};
  const lg=s=>logBox.append(el('li',{},s));
  const ms=()=>SPEEDS.find(s=>+s[0]===speed)[2];
  for(const e of r.log){
    if(e.type==='round'){rd.textContent=`第 ${e.round} 回合`;lg(`— 第 ${e.round} 回合 —`);if(!skip){if(speed<4)bigRound(e.round);await sleep(ms()*(speed<4?1.2:.6))}continue}
    if(e.type==='end')break;
    const who=e.side!=null?nm(e.side,e.i):'';
    if(e.type==='stun'){float(e.side,e.i,e.why,'st');lg(`${who} ${e.why}，無法行動`);if(!skip){speak(e.side,e.i,`${who} ${e.why}，無法行動！`);sfx('stun')}}
    if(e.type==='prep'){setBanner(`【${e.skill}】準備中`,'#555555');lg(`${who} 準備【${e.skill}】`);if(!skip)speak(e.side,e.i,`${who} 正在準備【${e.skill}】……`)}
    if(e.type==='atk'||e.type==='skill'){
      flash(e.side,e.i,'lunge');
      if(e.type==='skill'&&!skip&&speed<4&&(e.kind==='主動'||e.kind==='突擊')&&e.tg.some(t=>t.v!=null||t.heal))await cutin(e.side,e.i,e.skill);
      if(e.type==='skill'){setBanner(`【${e.skill}】${e.guess?'（推估）':''}`,KCOL[e.kind]||'#666666');if(!skip&&!REDUCE)PV?.whiteFlash()}
      else setBanner('');
      const parts=[];let snd=e.type==='skill'?'skill':'hit',rout=false;
      for(const t of e.tg){
        const tn=nm(t.side,t.i);
        if(t.evade){float(t.side,t.i,'規避','st');parts.push(`${tn} 規避`);continue}
        if(t.v!=null){setT(t.side,t.i,t.left);slash(t.side,t.i,t.dtype==='謀略');float(t.side,t.i,'-'+fmt(t.v),(t.dtype==='謀略'?'mo':'hit')+(t.crit?' crit':''),t.crit?(t.dtype==='謀略'?'奇謀':'會心'):'');flash(t.side,t.i,'shake');if(t.crit&&!skip&&!REDUCE)PV?.quake(true);parts.push(`${tn} -${fmt(t.v)}${t.crit?'（'+(t.dtype==='謀略'?'奇謀':'會心')+'）':''}${t.rout?'（潰敗）':''}`);if(t.rout)rout=true;if(e.type==='atk'&&t.dtype==='謀略')snd='mou'}
        if(t.heal){setT(t.side,t.i,t.left);float(t.side,t.i,'+'+fmt(t.heal),'heal');healFx(t.side,t.i);parts.push(`${tn} +${fmt(t.heal)}`);if(e.type!=='skill')snd='heal'}
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
  const resText=`${a.team.name}${verdict}`;setRes(resText,r.res);
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
  speak(a.side,0,resText);
  play(mine==='W'?'win':mine==='L'?'lose':null);
  await new Promise(fin=>{done.onclick=()=>{closeDlg();fin()};dlg.oncancel=e=>{e.preventDefault();closeDlg();fin()}});
  if(!G.over)play('map');
}

// ---- wiring ----
$('start').onclick=startGame;
$('endTurn').onclick=endTurn;
$('reset').onclick=()=>{if(G&&!G.over&&!confirm('放棄這場，回到設定？'))return;G=null;play('title');$('game').hidden=true;$('setup').hidden=false;$('over').hidden=true;renderSetup()};
const AGAIN0=$('again').textContent,SETUP0=$('toSetup').textContent;
function overButtons(win){   // 戰役：勝利後只留「回戰役畫面」（升級配點、選下一關），失敗可重打本關
  const camp=!!G?.camp;
  $('again').hidden=camp&&win;$('again').textContent=camp?'重打本關':AGAIN0;$('toSetup').textContent=camp?'回戰役畫面':SETUP0;
}
$('again').onclick=()=>{$('over').hidden=true;startGame()};
$('toSetup').onclick=()=>{$('over').hidden=true;G=null;play('title');$('game').hidden=true;$('setup').hidden=false;renderSetup()};
$('skDlg').addEventListener('click',e=>{if(e.target===$('skDlg'))$('skDlg').close()});
$('formula').textContent=`傷害 = √兵力 × ${K.base} × 傷害率 × (1 + (攻方屬性 − 守方屬性) ÷ ${K.statDiv})，兵刃用武勇對統率、謀略用智略對智略；兵種相剋（騎兵剋弓兵、弓兵剋鐵炮、鐵炮剋足輕、足輕剋騎兵；器械被其他兵種剋制）兵刃傷害 ×${K.counter[0]}／×${K.counter[1]}；地形不影響傷害。`;
renderSetup();
document.documentElement.dataset.slgReady='1';
// 除錯／自動測試用（網址加 ?debug 才開）
if(new URLSearchParams(location.search).has('debug'))window.SLG={get G(){return G},SET,tap,startGame,endTurn,reach,targets,fight,alive,dist,save:()=>{},setSpeed:v=>{speed=v}};
