// Q版戰棋戰場：Phaser 4 版（網址加 ?engine=phaser 切換；舊版 SVG 戰場仍是預設）。
// 只負責「畫」與「點」：規則、AI、戰鬥公式、存檔都在 game.js／engine.js，兩版共用。
// game.js 每次 renderBoard 把目前盤面（地形、部隊、標記格、是否下雨）交給 render()，這裡比對差異後做動畫；
// 點擊換算成格子座標後呼叫 onTap(x,y)，和舊版點 SVG 地塊一樣。
// 美術沿用自己畫的 SVG（iso.js 地塊、chibi.js 武將）轉成貼圖；粒子、刀光等小貼圖用 Phaser Graphics 現場畫，不用任何外部素材。
import {isoTerrain,isoGeom,TW,TH} from './iso.js?v=17';
import {chibi,SIDE_COL} from './chibi.js?v=17';

const FONT='"LXGW WenKai TC","Noto Serif TC",serif';
const NS='xmlns="http://www.w3.org/2000/svg"';
const loadImg=src=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src});
const REDUCE=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
const hex=c=>parseInt(c.slice(1),16);
const svgImg=svg=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)});

// Phaser 本體只在選了新版戰場時才載入（約 1.4 MB）
let phaserP=null;
function loadPhaser(){
  if(window.Phaser)return Promise.resolve(window.Phaser);
  return phaserP??=new Promise((res,rej)=>{const s=document.createElement('script');s.src='vendor/phaser/phaser-4.2.1.min.js';
    s.onload=()=>res(window.Phaser);s.onerror=()=>{phaserP=null;rej(new Error('Phaser 載入失敗'))};document.head.append(s)});
}

// Kenney 素材（CC0，見 assets/kenney/CREDITS.md 與根目錄 CREDITS.md）：刀光、火花、煙、火焰、碎土與介面框。
// 原圖 512×512，載入後縮成小圖再交給 Phaser；任何一張載入失敗就退回下面程式畫的小貼圖，不影響遊戲。
const KDIR=new URL('../assets/kenney/',import.meta.url).href;
const KFILES={   // key → [路徑, 輸出邊長, 轉角度]
  spark:['particle-pack/png/star_06.png',24],
  smoke:['particle-pack/png/smoke_06.png',48],
  slash:['particle-pack/png/slash_03.png',140,Math.PI],   // 原圖開口向右，轉 180° 配合原本的弧形方向
  flame:['particle-pack/png/flame_05.png',48],
  dirt:['particle-pack/png/dirt_02.png',32],
  panel:['ui-pack-rpg-expansion/png/panel_brown.png',0],   // 介面框：0 表示維持原尺寸（9 宮格用）
};
let kenP=null;
function loadKenney(){
  return kenP??=Promise.all(Object.entries(KFILES).map(async([key,[path,size,rot]])=>{
    try{
      const img=await loadImg(KDIR+path),c=document.createElement('canvas');c.width=size||img.width;c.height=size||img.height;
      const x=c.getContext('2d');x.translate(c.width/2,c.height/2);if(rot)x.rotate(rot);x.drawImage(img,-c.width/2,-c.height/2,c.width,c.height);
      return[key,c]}
    catch(e){console.warn('Kenney 素材載入失敗，改用程式畫的貼圖：',path);return null}
  })).then(a=>Object.fromEntries(a.filter(Boolean)));
}
// 程式畫的小貼圖：火花、煙、雲影、篝火火星、紅葉、雨滴、刀光（Kenney 素材載入後會蓋掉其中幾張）
function makeTextures(s,ken={}){
  const g=s.make.graphics({x:0,y:0},false);
  const soft=(key,r,col)=>{g.clear();for(let i=r;i>0;i--){g.fillStyle(col,(1-i/r)**1.6*.9);g.fillCircle(r,r,i)}g.generateTexture(key,r*2,r*2)};
  soft('spark',10,0xffffff);soft('smoke',24,0xd8d0c0);soft('cloud',90,0x0b1a10);soft('ember',5,0xffffff);
  g.clear();g.fillStyle(0xffffff,1);const pts=[];for(let k=0;k<10;k++){const a=-Math.PI/2+k*Math.PI/5,r=k%2?4.4:10;pts.push({x:12+Math.cos(a)*r,y:12+Math.sin(a)*r})}
  g.fillPoints(pts,true);g.fillRect(11,18,2,6);g.generateTexture('leaf',24,26);
  g.clear();for(let i=0;i<12;i++){g.lineStyle(14-i,0xffffff,.25+i*.06);g.beginPath();g.arc(70,70,44+i*1.4,-1.15+i*.04,1.15-i*.04);g.strokePath()}
  g.generateTexture('slash',140,140);
  g.clear();g.fillStyle(0xcfe6ff,1);g.fillRect(0,0,2,22);g.generateTexture('drop',2,22);
  g.destroy();
  for(const[k,c]of Object.entries(ken)){if(s.textures.exists(k))s.textures.remove(k);s.textures.addCanvas(k,c)}
}

export function createPhaserBoard(box,{onTap}){
  box.classList.add('ph');
  const st={latest:null,running:false,dirty:false,scene:null,game:null,failed:null};
  const view={
    ready:null,
    render(s){st.latest=s;if(!st.scene)return;
      // 從設定頁回到戰場時容器大小可能變了（隱藏時是 0），重新量一次
      if(box.clientWidth!==st.w){st.w=box.clientWidth;st.game.scale.refresh()}
      apply()},
    async focus(aid,did){if(st.scene)await st.scene.focus(aid,did)},
    async unfocus(){if(st.scene)await st.scene.unfocus()},
  };
  // 一次只跑一個 apply；期間又有新盤面就跑完再補一次
  async function apply(){
    if(st.running){st.dirty=true;return}
    st.running=true;
    try{do{st.dirty=false;await st.scene.sync(st.latest)}while(st.dirty)}
    catch(e){console.error(e)}
    finally{st.running=false}
  }
  view.ready=(async()=>{
    const Phaser=await loadPhaser();
    const ken=await loadKenney();
    await Promise.race([document.fonts?.load(`16px ${FONT}`),new Promise(r=>setTimeout(r,2000))]).catch(()=>{});
    const geo0=isoGeom(st.latest?.T[0].length||7,st.latest?.T.length||9);
    // 畫布解析度：依螢幕像素密度放大（最多 2 倍），手機上字和線條才清楚
    const k=Math.max(1,Math.min(2,(devicePixelRatio||1)*(box.clientWidth||640)/geo0.vw));
    let created;const createdP=new Promise(r=>created=r);
    class Board extends Phaser.Scene{
      constructor(){super('board')}
      create(){
        makeTextures(this,ken);
        this.k=k;this.units=new Map();this.mapKey=null;this.focusing=null;
        this.cameras.main.setZoom(k);
        try{this.cameras.main.filters.external.addVignette(.5,.5,.95,.25)}catch(e){}
        this.hl=this.add.graphics().setDepth(1);
        this.tweens.add({targets:this.hl,alpha:{from:1,to:.55},duration:700,yoyo:true,repeat:-1});
        this.amb=[];
        // 紅葉（整個戰場）、豪雨
        if(!REDUCE()){
          this.leafZone=new Phaser.Geom.Rectangle(-40,-20,900,4);
          this.leaves=this.add.particles(0,0,'leaf',{emitZone:{type:'random',source:this.leafZone},speedY:{min:20,max:42},speedX:{min:-6,max:26},rotate:{start:0,end:540},
            scale:{min:.35,max:.6},lifespan:{min:12000,max:18000},frequency:900,tint:[0xd4462c,0xe48a2a,0xc2361f,0xf0b03c],alpha:.9}).setDepth(9000);
        }
        this.rainShade=this.add.rectangle(0,0,10,10,0x0c1830,.3).setOrigin(0).setDepth(9001).setVisible(false);
        this.rainZone=new Phaser.Geom.Rectangle(-100,-40,1000,4);
        this.rainFx=this.add.particles(0,0,'drop',{emitZone:{type:'random',source:this.rainZone},speedY:{min:700,max:900},speedX:-120,rotate:8,
          lifespan:1000,quantity:3,frequency:16,alpha:{start:.55,end:.2},emitting:false}).setDepth(9002);
        // 手機上一次點擊會先送觸控、再補送一次滑鼠事件，只算第一次；手指滑動（捲頁面）不算點擊
        let down=null,lastUp=0;
        this.input.on('pointerdown',p=>{down={x:p.x,y:p.y}});
        this.input.on('pointerup',p=>{
          const now=performance.now(),moved=down&&Math.hypot(p.x-down.x,p.y-down.y)>12*this.k;down=null;
          if(now-lastUp<450||moved)return;lastUp=now;
          if(this.focusing)return;
          const c=this.pick(p.worldX,p.worldY);if(c)onTap(c.x,c.y);
        });
        this.input.on('pointermove',p=>{const c=this.pick(p.worldX,p.worldY);this.input.setDefaultCursor(c?'pointer':'default')});
        created(this);
      }
      // ---- 地圖 ----
      async setMap(T){
        const key='map:'+T.map(r=>r.join?r.join(''):r).join('/');
        if(key===this.mapKey)return;
        const W=T[0].length,H=T.length,geo=isoGeom(W,H);
        if(!this.textures.exists(key)){
          const img=await svgImg(`<svg ${NS} width="${Math.round(geo.vw*this.k)}" height="${Math.round(geo.vh*this.k)}" viewBox="0 0 ${geo.vw} ${geo.vh}">${isoTerrain(T)}</svg>`);
          if(!this.textures.exists(key))this.textures.addImage(key,img);
        }
        this.mapImg?.destroy();
        for(const o of this.amb)o.destroy();this.amb=[];
        this.mapKey=key;this.T=T;this.W=W;this.H=H;this.geo=geo;
        this.mapImg=this.add.image(0,0,key).setOrigin(0).setScale(1/this.k).setDepth(0);
        const cam=this.cameras.main;cam.centerOn(geo.vw/2,geo.vh/2);this.home={x:geo.vw/2,y:geo.vh/2};
        this.rainShade.setSize(geo.vw,geo.vh);this.rainZone.width=geo.vw+200;if(this.leafZone)this.leafZone.width=geo.vw+80;
        if(!REDUCE())this.ambient();
      }
      at(x,y){return this.geo.at(x,y,this.T)}
      // 雲影、本陣篝火、水面閃光
      ambient(){
        const{T,W,H,geo}=this;
        for(let i=0;i<2;i++){const c=this.add.image(0,geo.vh*(.3+i*.35),'cloud').setScale(3,1.5).setAlpha(.14).setDepth(2);
          this.tweens.add({targets:c,x:{from:-260,to:geo.vw+260},duration:56000,delay:-i*26000,repeat:-1});this.amb.push(c)}
        const isC=(x,y)=>T[y]?.[x]==='城',seen=new Set();
        for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(!isC(x,y)||seen.has(x+','+y))continue;
          const grp=[],q=[[x,y]];seen.add(x+','+y);
          while(q.length){const[a,b]=q.pop();grp.push([a,b]);for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const kk=(a+dx)+','+(b+dy);if(isC(a+dx,b+dy)&&!seen.has(kk)){seen.add(kk);q.push([a+dx,b+dy])}}}
          grp.sort((p,q2)=>(p[0]+p[1])-(q2[0]+q2[1])||Math.abs(p[0]-p[1])-Math.abs(q2[0]-q2[1]));
          const[kx,ky]=grp[Math.min(grp.length-1,grp.length>2?1:0)],[cx,cy]=this.at(kx,ky);
          this.amb.push(this.add.particles(cx-20,cy+12,this.textures.exists('flame')?'flame':'ember',{speedY:{min:-40,max:-18},speedX:{min:-6,max:6},scale:this.textures.exists('flame')?{start:.3,end:0}:{start:.8,end:0},lifespan:{min:500,max:900},frequency:90,
            tint:[0xffd34a,0xff8a2a,0xffb03a],blendMode:'ADD'}).setDepth(cy+40))}
        for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(T[y][x]==='水'||T[y][x]==='橋'){const[cx,cy]=this.at(x,y);
          const s=this.add.image(cx+Phaser.Math.Between(-18,18),cy+Phaser.Math.Between(-6,6),'spark').setScale(.35).setBlendMode('ADD').setDepth(2).setAlpha(0);
          this.tweens.add({targets:s,alpha:{from:0,to:.9},duration:600,yoyo:true,repeat:-1,repeatDelay:Phaser.Math.Between(800,2400),delay:Phaser.Math.Between(0,2000)});this.amb.push(s)}
      }
      // ---- 部隊 ----
      async tex(u){
        const key=`u:${u.name}|${u.f}|${u.arm}|${u.side}`;
        if(!this.textures.exists(key)){
          const img=await svgImg(chibi({n:u.name,f:u.f},{arm:u.arm,side:u.side,boss:true}).replace('<svg ',`<svg ${NS} width="${Math.round(64*this.k*1.5)}" height="${Math.round(82*this.k*1.5)}" `));
          if(!this.textures.exists(key))this.textures.addImage(key,img);
        }
        return key;
      }
      spawn(u,key){
        const[cx,cy]=this.at(u.x,u.y),col=hex(SIDE_COL[u.side]);
        const box=this.add.container(cx,cy+6).setDepth(cy+10);
        const base=this.add.graphics();base.fillStyle(0x000000,.35).fillEllipse(0,-2,46,16);base.fillStyle(col,.75).fillEllipse(0,-3,38,12);base.lineStyle(1.5,u.side?0x1a1a1a:0xe3b75a,.9).strokeEllipse(0,-3,38,12);
        const spr=this.add.image(0,0,key).setOrigin(.515,.963).setScale(1/(this.k*1.5)).setFlipX(u.side===1);
        const bar=this.add.graphics();
        const plate=this.add.text(0,9,u.name,{fontFamily:FONT,fontStyle:'bold',fontSize:'12px',color:'#fff',backgroundColor:u.side?'#7d2b20e6':'#23477de6',padding:{x:4,y:1}}).setOrigin(.5,0).setResolution(this.k*2);
        const arm=this.add.text(22,-14,u.arm[0],{fontFamily:FONT,fontStyle:'bold',fontSize:'11px',color:'#2b1d0c',backgroundColor:'#e3b75a',padding:{x:3,y:1}}).setOrigin(.5).setResolution(this.k*2);
        const cnt=this.add.text(-24,-66,'',{fontFamily:FONT,fontStyle:'bold',fontSize:'11px',color:'#fff',backgroundColor:SIDE_COL[u.side],padding:{x:4,y:1}}).setOrigin(.5).setResolution(this.k*2);
        const tag=this.add.text(0,-80,'',{fontFamily:FONT,fontStyle:'bold',fontSize:'11px',color:'#fff',padding:{x:4,y:1}}).setOrigin(.5).setResolution(this.k*2);
        const draw=this.add.text(24,-66,'',{fontFamily:FONT,fontSize:'10px',color:'#111',backgroundColor:'#c9d1d9',padding:{x:3,y:1}}).setOrigin(.5).setResolution(this.k*2);
        box.add([base,spr,bar,plate,arm,cnt,draw,tag]);
        const o={id:u.id,box,spr,bar,plate,arm,cnt,tag,draw,side:u.side,x:u.x,y:u.y,ratio:u.ratio,lag:u.ratio,key,on:false,done:false};
        const n=[...String(u.id)].reduce((h,c)=>h*31+c.charCodeAt(0)>>>0,7)%1000;   // id 是字串，換成數字錯開呼吸節奏
        this.tweens.add({targets:spr,scaleY:{from:spr.scaleY,to:spr.scaleY*1.03},duration:900+n%400,yoyo:true,repeat:-1,ease:'Sine.easeInOut',delay:n});
        if(!REDUCE()){box.setAlpha(0);this.tweens.add({targets:box,alpha:1,duration:300})}
        return o;
      }
      drawBar(o){const g=o.bar,w=44;g.clear();g.fillStyle(0x000000,.7).fillRect(-w/2-1,3,w+2,6);
        g.fillStyle(0xffffff,.85).fillRect(-w/2,4,w*o.lag,4);
        g.fillStyle(o.side?0xd65a3e:0x3fae74,1).fillRect(-w/2,4,w*o.ratio,4)}
      // 走格子：依 4 方向最短路一格一格走（敵軍擋路，友軍可穿過），每格小跳步
      path(o,x,y,units){
        const block=new Set(units.filter(u=>u.side!==o.side).map(u=>u.x+','+u.y));
        const prev=new Map([[o.x+','+o.y,null]]),q=[[o.x,o.y]];
        while(q.length){const[a,b]=q.shift();if(a===x&&b===y)break;
          for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=a+dx,ny=b+dy,kk=nx+','+ny;
            if(nx<0||ny<0||nx>=this.W||ny>=this.H||prev.has(kk)||block.has(kk))continue;prev.set(kk,a+','+b);q.push([nx,ny])}}
        const out=[];let kk=x+','+y;if(!prev.has(kk))return[[x,y]];
        while(kk&&kk!==o.x+','+o.y){out.unshift(kk.split(',').map(Number));kk=prev.get(kk)}
        return out;
      }
      walk(o,steps){
        o.walking=(o.walking||Promise.resolve()).then(async()=>{
          for(const[x,y]of steps){const[cx,cy]=this.at(x,y);o.box.setDepth(cy+10);
            if(REDUCE()){o.box.setPosition(cx,cy+6);continue}
            await new Promise(r=>this.tweens.add({targets:o.box,x:cx,y:cy+6,duration:150,ease:'Sine.easeInOut',onComplete:r}));
            this.tweens.add({targets:o.spr,y:{from:0,to:-6},duration:75,yoyo:true})}
        });
      }
      rout(o){
        this.units.delete(o.id);
        if(REDUCE()){o.box.destroy();return}
        const sm=this.add.particles(o.box.x,o.box.y-20,'smoke',{speed:{min:20,max:70},angle:{min:200,max:340},scale:{start:.6,end:1.6},alpha:{start:.7,end:0},lifespan:900,emitting:false}).setDepth(8000);
        sm.explode(16);this.time.delayedCall(1000,()=>sm.destroy());
        this.tweens.add({targets:o.box,alpha:0,y:o.box.y+14,duration:600,onComplete:()=>o.box.destroy()});
      }
      setSel(o,on){
        if(o.on===on)return;o.on=on;
        if(on){try{o.spr.enableFilters();o.glow=o.spr.filters.internal.addGlow(0xffe9a8,3,0,1)}catch(e){}
          if(!REDUCE())o.bob=this.tweens.add({targets:o.spr,y:{from:0,to:-4},duration:300,yoyo:true,repeat:-1,ease:'Sine.easeInOut'})}
        else{try{if(o.glow)o.spr.filters.internal.remove(o.glow)}catch(e){}o.glow=null;o.bob?.remove();o.bob=null;o.spr.y=0}
      }
      // ---- 盤面同步 ----
      async sync(s){
        if(!s)return;this.last=s;
        // 新的一場：舊部隊直接清掉（不播潰走）
        if(s.gid!==this.gid){this.gid=s.gid;for(const o of this.units.values())o.box.destroy();this.units.clear();this.focusing=null;
          if(this.dim)this.dim.fillAlpha=0;const cam=this.cameras.main;cam.setZoom(this.k);if(this.home)cam.centerOn(this.home.x,this.home.y)}
        await this.setMap(s.T);
        const live=s.units.filter(u=>u.alive);
        const keys=await Promise.all(live.map(u=>this.tex(u)));
        const seen=new Set();
        live.forEach((u,i)=>{
          seen.add(u.id);
          let o=this.units.get(u.id);
          if(o&&o.key!==keys[i]){o.box.destroy();this.units.delete(u.id);o=null}
          if(!o){o=this.spawn(u,keys[i]);this.units.set(u.id,o)}
          else if(o.x!==u.x||o.y!==u.y)this.walk(o,this.path(o,u.x,u.y,live));
          o.x=u.x;o.y=u.y;
          if(o.ratio!==u.ratio){const from=o.lag;o.ratio=u.ratio;
            if(u.ratio<from&&!REDUCE())this.tweens.addCounter({from,to:u.ratio,delay:250,duration:450,onUpdate:t=>{o.lag=t.getValue();this.drawBar(o)}});else o.lag=u.ratio}
          this.drawBar(o);
          o.cnt.setText(String(u.cnt));
          o.draw.setText(u.draw?`平${u.draw}`:'').setVisible(!!u.draw);
          const tg=u.tgt?['目標','#c8442c','#fff']:u.lord?['總大將','#e3b75a','#111']:null;
          o.tag.setVisible(!!tg);if(tg)o.tag.setText(tg[0]).setBackgroundColor(tg[1]).setColor(tg[2]);
          if(o.done!==u.done){o.done=u.done;o.spr.setTint(u.done?0x8a8a8a:0xffffff)}
          this.setSel(o,u.on);
        });
        for(const[id,o]of[...this.units])if(!seen.has(id))this.rout(o);
        // 標記格：藍＝可移動、紅＝攻擊目標、金＝選取中
        const g=this.hl;g.clear();
        const COL={mv:[0x7fc8ff,.3],atk:[0xff5a3c,.42],sel:[0xffe9a8,.45]};
        for(const[kk,m]of s.mark){const[x,y]=kk.split(',').map(Number),[cx,cy]=this.at(x,y),[c,a]=COL[m]||COL.mv;
          const P=[{x:cx,y:cy-TH/2},{x:cx+TW/2,y:cy},{x:cx,y:cy+TH/2},{x:cx-TW/2,y:cy}];
          g.fillStyle(c,a).fillPoints(P,true).lineStyle(2,c,.95).strokePoints(P,true)}
        this.rainShade.setVisible(s.rain);this.rainFx.emitting=s.rain&&!REDUCE();
      }
      // 點擊：先看點到哪位武將（前面的蓋住後面的，從最前面找起），再看菱形格
      pick(wx,wy){
        if(!this.geo)return null;
        const us=[...this.units.values()].sort((a,b)=>b.box.depth-a.box.depth);
        const o=us.find(o=>o.spr.getBounds().contains(wx,wy)),hit=o&&{x:o.x,y:o.y};
        let best=null;
        for(let y=0;y<this.H;y++)for(let x=0;x<this.W;x++){const[cx,cy]=this.at(x,y),d=Math.abs(wx-cx)/(TW/2)+Math.abs(wy-cy)/(TH/2);if(d<=1&&(!best||d<best.d))best={x,y,d}}
        // 武將會蓋住後面那格：點到的武將是攻擊目標就打它；否則點的位置落在可移動／可攻擊的格子上，就以格子為準
        const mk=this.last?.mark,m=k=>mk?.get(k.x+','+k.y);
        if(hit&&m(hit)==='atk')return hit;
        if(best&&(m(best)==='mv'||m(best)==='atk'))return best;
        return hit||best;
      }
      // 開戰：鏡頭推近交戰雙方、周圍變暗、攻方衝上前；戰鬥視窗結束後拉回
      async focus(aid,did){
        const A=this.units.get(aid),Dd=this.units.get(did);if(!A||!Dd)return;
        await Promise.all([A.walking,Dd.walking]);
        this.focusing={A,Dd,dep:[A.box.depth,Dd.box.depth]};
        if(REDUCE())return;
        const cam=this.cameras.main,mx=(A.box.x+Dd.box.x)/2,my=(A.box.y+Dd.box.y)/2-30;
        this.dim??=this.add.rectangle(0,0,10,10,0x000000,0).setOrigin(0).setDepth(7000);
        this.dim.setSize(this.geo.vw*3,this.geo.vh*3).setPosition(-this.geo.vw,-this.geo.vh);
        A.box.setDepth(7101);Dd.box.setDepth(7100);
        cam.pan(mx,my,360,'Sine.easeInOut');cam.zoomTo(this.k*1.6,360,'Sine.easeInOut');
        this.tweens.add({targets:this.dim,fillAlpha:.45,duration:360});
        await new Promise(r=>this.time.delayedCall(380,r));
        const[ax,ay]=[A.box.x,A.box.y];
        await new Promise(r=>this.tweens.add({targets:A.box,x:ax+(Dd.box.x-ax)*.35,y:ay+(Dd.box.y-ay)*.35,duration:140,ease:'Back.easeIn',onComplete:r}));
        this.cameras.main.shake(140,.006);
        const sp=this.add.particles(0,0,'spark',{speed:{min:120,max:300},angle:{min:0,max:360},scale:{start:.6,end:0},lifespan:{min:200,max:450},tint:[0xfff3c4,0xffb03a,0xffffff],blendMode:'ADD',emitting:false}).setDepth(7200);
        sp.explode(18,Dd.box.x,Dd.box.y-34);this.time.delayedCall(600,()=>sp.destroy());
        this.tweens.add({targets:A.box,x:ax,y:ay,duration:200,ease:'Sine.easeOut'});
        await new Promise(r=>this.time.delayedCall(220,r));
      }
      async unfocus(){
        const f=this.focusing;if(!f)return;this.focusing=null;
        if(f.A.box.active)f.A.box.setDepth(f.dep[0]);if(f.Dd.box.active)f.Dd.box.setDepth(f.dep[1]);
        if(REDUCE())return;
        const cam=this.cameras.main;
        cam.pan(this.home.x,this.home.y,380,'Sine.easeInOut');cam.zoomTo(this.k,380,'Sine.easeInOut');
        if(this.dim)this.tweens.add({targets:this.dim,fillAlpha:0,duration:300});
        await new Promise(r=>this.time.delayedCall(390,r));
      }
    }
    const geo=geo0;
    st.game=new Phaser.Game({type:Phaser.WEBGL,parent:box,transparent:true,antialias:true,
      scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH,width:Math.round(geo.vw*k),height:Math.round(geo.vh*k)},
      input:{touch:{capture:false}},scene:[Board],banner:false});
    st.scene=await createdP;st.w=box.clientWidth;
    // 戰場捲出畫面或切回設定頁時暫停繪圖，省電
    if('IntersectionObserver'in window)new IntersectionObserver(es=>{const v=es[es.length-1].isIntersecting;if(v)st.game.loop.wake();else st.game.loop.sleep()}).observe(box);
    window.__slgPhaser=st.game;
    if(st.latest)apply();
  })().catch(e=>{st.failed=e;console.error(e);
    box.replaceChildren(Object.assign(document.createElement('p'),{className:'phfail',textContent:'新版戰場載入失敗，請拿掉網址的 ?engine=phaser 改用舊版。'}))});
  return view;
}

// ======================= 戰鬥演出（第二批）=======================
// 戰鬥視窗保留吞食天地式的版面（上方雙方名稱、下方說話框、速度與跳過按鈕都還是 HTML），
// 中間那塊「藍方在左、紅方在右」的武將列換成一張 Phaser 畫布：武將、兵力條殘影、刀光、火花、閃白、
// 彈出數字、回合大字、戰法 cut-in。畫的內容完全由 game.js 依 engine.battle() 的紀錄驅動，數字與舊版一致。
const LW=400,LH=290,ROWS=[64,152,240];
const fmtN=n=>Math.round(n).toLocaleString('en-US');
const FLOAT={hit:['#ffffff','#7a1208'],mo:['#e3c9ff','#3b1a66'],heal:['#b9ffd0','#0f5a2e'],st:['#ffe9a8','#4a3206']};

// units: [{side,i,n,f,arm,boss,max,troops,left}]；faceSrc(name) → 卡圖網址或 null
export async function createBattleStage(host,{units,faceSrc}){
  const Phaser=await loadPhaser();
  const ken=await loadKenney();
  await Promise.race([document.fonts?.load(`16px ${FONT}`),new Promise(r=>setTimeout(r,1500))]).catch(()=>{});
  const k=Math.max(1,Math.min(2,(devicePixelRatio||1)*(host.clientWidth||340)/LW));
  const imgs=Object.fromEntries(await Promise.all(units.map(async u=>[`${u.side}-${u.i}`,await svgImg(chibi({n:u.n,f:u.f},{arm:u.arm,side:u.side,boss:u.boss}).replace('<svg ',`<svg ${NS} width="${Math.round(64*k)}" height="${Math.round(82*k)}" `))])));
  let created;const createdP=new Promise(r=>created=r);
  const U={};
  class Battle extends Phaser.Scene{
    constructor(){super('battle')}
    create(){
      makeTextures(this,ken);this.cameras.main.setZoom(k).centerOn(LW/2,LH/2);
      const res=k*2;
      for(const u of units){
        const key=`${u.side}-${u.i}`,x0=u.left?34:LW-34,y=ROWS[u.i],tx=u.left?62:LW-62,al=u.left?0:1,bx=u.left?62:LW-62-112;
        this.textures.addImage('g'+key,imgs[key]);
        if(this.textures.exists('panel')){const pw=134;
          const pl=this.add.nineslice(u.left?58+pw/2:LW-58-pw/2,y+1,'panel',undefined,pw,60,12,12,12,12).setDepth(3).setAlpha(.82);pl.setTint(u.left?0xb8c8ff:0xffc8b8)}
        const spr=this.add.image(x0,y+30,'g'+key).setOrigin(.5,1).setScale(1/k*.95).setFlipX(!u.left).setDepth(5);
        const sh=this.add.ellipse(x0,y+31,40,10,0x000000,.35).setDepth(4);
        const name=this.add.text(tx,y-24,u.n,{fontFamily:FONT,fontStyle:'bold',fontSize:'14px',color:'#fff',stroke:'#000',strokeThickness:3}).setOrigin(al,0).setResolution(res).setDepth(6);
        const tag=u.boss?this.add.text(u.left?tx+name.width+4:tx-name.width-4,y-22,'大將',{fontFamily:FONT,fontStyle:'bold',fontSize:'10px',color:'#2b1d0c',backgroundColor:'#e3b75a',padding:{x:3,y:1}}).setOrigin(al,0).setResolution(res).setDepth(6):null;
        const bar=this.add.graphics().setDepth(6);
        const tv=this.add.text(tx,y+14,fmtN(u.troops),{fontFamily:FONT,fontStyle:'bold',fontSize:'14px',color:'#fff3c4',stroke:'#000',strokeThickness:3}).setOrigin(al,0).setResolution(res).setDepth(6);
        const o=U[key]={...u,key,spr,sh,name,tag,bar,tv,bx,y,x0,lag:Math.max(0,u.troops)/u.max,ratio:Math.max(0,u.troops)/u.max,out:false};
        this.drawBar(o);
        if(u.troops<=0)this.knockOut(o,true);
        else if(!REDUCE())this.tweens.add({targets:spr,scaleY:spr.scaleY*1.03,duration:900+u.i*130,yoyo:true,repeat:-1,ease:'Sine.easeInOut',delay:u.i*200});
      }
      this.bannerBg=this.add.rectangle(LW/2,12,10,18,0x555555).setDepth(9).setVisible(false);
      this.bannerTx=this.add.text(LW/2,12,'',{fontFamily:FONT,fontStyle:'bold',fontSize:'13px',color:'#fff'}).setOrigin(.5).setResolution(res).setDepth(10);
      this.resTx=this.add.text(LW/2,LH/2,'',{fontFamily:FONT,fontStyle:'bold',fontSize:'26px',color:'#e3b75a',stroke:'#2a1204',strokeThickness:6}).setOrigin(.5).setResolution(res).setDepth(30).setVisible(false);
      created(this);
    }
    drawBar(o){
      const g=o.bar,w=112,h=9,x=o.bx,y=o.y+3;g.clear();
      g.fillStyle(0x000000,.85).fillRect(x-1.5,y-1.5,w+3,h+3);g.lineStyle(1,0xc9a253,1).strokeRect(x-1.5,y-1.5,w+3,h+3);
      const fill=(r,c1,c2)=>{const ww=w*r;if(ww<=0)return;const fx=o.left?x:x+w-ww;g.fillStyle(c1,1).fillRect(fx,y,ww,h);g.fillStyle(c2,.55).fillRect(fx,y,ww,h/2)};
      fill(o.lag,0xffffff,0xffffff);
      fill(o.ratio,o.left?0xf39c12:0x8e7cc3,o.left?0xffd27a:0xd3c6ff);
      g.fillStyle(0x000000,.35);for(let i=7;i<w;i+=8)g.fillRect(x+i,y,1,h);
    }
    knockOut(o,instant){
      if(o.out)return;o.out=true;o.tag?.setAlpha(.45);o.name.setAlpha(.45);o.tv.setAlpha(.45);
      o.spr.setTint(0x777777);
      if(instant||REDUCE()){o.spr.setAngle(o.left?-80:80).setAlpha(.35)}
      else this.tweens.add({targets:o.spr,angle:o.left?-80:80,alpha:.35,x:o.x0+(o.left?-8:8),duration:420,ease:'Cubic.easeIn'});
      o.sh.setAlpha(.15);
    }
    setT(side,i,v){
      const o=U[side+'-'+i];if(!o)return;
      o.ratio=Math.max(0,v)/o.max;o.tv.setText(fmtN(Math.max(0,v)));
      if(o.ratio<o.lag&&!REDUCE()){o.lagT?.remove();o.lagT=this.tweens.addCounter({from:o.lag,to:o.ratio,delay:350,duration:450,onUpdate:t=>{o.lag=t.getValue();this.drawBar(o)}})}
      else o.lag=Math.min(o.lag,o.ratio)||o.ratio;
      this.drawBar(o);
      if(v<=0)this.knockOut(o);
    }
    float(side,i,txt,cls,sub){
      const o=U[side+'-'+i];if(!o)return;
      const crit=/crit/.test(cls),[col,stk]=FLOAT[cls.split(' ')[0]]||FLOAT.hit,x=o.x0,y=o.y-6;
      const t=this.add.text(x,y,txt,{fontFamily:FONT,fontStyle:'bold',fontSize:crit?'26px':'20px',color:crit?'#ffd34a':col,stroke:crit?'#5a1208':stk,strokeThickness:5}).setOrigin(.5).setResolution(this.cameras.main.zoom*2).setDepth(40).setScale(1.6);
      this.tweens.add({targets:t,scale:1,duration:160,ease:'Back.easeOut'});
      this.tweens.add({targets:t,y:y-34,alpha:0,delay:480,duration:520,ease:'Cubic.easeIn',onComplete:()=>t.destroy()});
      if(sub){const s=this.add.text(x,y+16,sub,{fontFamily:FONT,fontSize:'11px',color:'#fff',backgroundColor:'#c8442c',padding:{x:3,y:1}}).setOrigin(.5).setResolution(this.cameras.main.zoom*2).setDepth(40);
        this.tweens.add({targets:s,y:y+6,alpha:0,delay:450,duration:550,onComplete:()=>s.destroy()})}
    }
    lunge(side,i){const o=U[side+'-'+i];if(!o||o.out||REDUCE())return;this.tweens.add({targets:o.spr,x:o.x0+(o.left?22:-22),duration:110,yoyo:true,ease:'Back.easeIn'})}
    shake(side,i){
      const o=U[side+'-'+i];if(!o||o.out)return;
      o.spr.setTintMode(Phaser.TintModes.FILL).setTint(0xffffff);this.time.delayedCall(70,()=>{o.spr.setTintMode(Phaser.TintModes.MULTIPLY).setTint(0xffffff)});
      if(!REDUCE())this.tweens.add({targets:o.spr,x:o.x0+(o.left?-7:7),duration:50,yoyo:true,repeat:2});
    }
    slash(side,i,mo){
      const o=U[side+'-'+i];if(!o)return;const x=o.x0,y=o.y-14,dir=o.left?1:-1;
      const sl=this.add.image(x,y,'slash').setBlendMode('ADD').setTint(mo?0xc79bff:0xffe08a).setRotation(dir>0?-.5:2.6).setScale(.18).setDepth(20);
      this.tweens.add({targets:sl,scale:.6,alpha:0,duration:320,ease:'Cubic.easeOut',onComplete:()=>sl.destroy()});
      const p=this.add.particles(0,0,'spark',{speed:{min:80,max:220},angle:{min:0,max:360},scale:{start:.5,end:0},lifespan:{min:200,max:450},tint:mo?[0xe3c9ff,0xa771f0]:[0xfff3c4,0xffb03a,0xffffff],blendMode:'ADD',emitting:false}).setDepth(21);
      p.explode(14,x,y);this.time.delayedCall(600,()=>p.destroy());
      if(!mo&&this.textures.exists('dirt')){const d=this.add.particles(0,0,'dirt',{speed:{min:60,max:150},angle:{min:200,max:340},gravityY:260,scale:{start:.5,end:.1},alpha:{start:.9,end:0},lifespan:520,emitting:false}).setDepth(19);
        d.explode(5,x,o.y+16);this.time.delayedCall(700,()=>d.destroy())}
    }
    heal(side,i){
      const o=U[side+'-'+i];if(!o)return;
      const p=this.add.particles(0,0,'spark',{speedY:{min:-70,max:-30},speedX:{min:-20,max:20},scale:{start:.35,end:0},lifespan:900,tint:[0xb9ffd0,0x6fe3a0],blendMode:'ADD',emitting:false}).setDepth(20);
      p.explode(12,o.x0,o.y+8);this.time.delayedCall(1000,()=>p.destroy());
    }
    banner(text,col){
      this.bannerTx.setText(text||'');this.bannerBg.setVisible(!!text);
      if(!text)return;
      this.bannerBg.setSize(this.bannerTx.width+20,20).setFillStyle(parseInt((col||'#555555').slice(1),16));
      if(!REDUCE()){this.bannerTx.setScale(1.3);this.bannerBg.setScale(1.3);this.tweens.add({targets:[this.bannerTx,this.bannerBg],scale:1,duration:220,ease:'Back.easeOut'})}
    }
    result(text,cls){
      const col={W:'#e3b75a',D:'#c9d1d9',L:'#d9604a'}[cls]||'#e3b75a';
      this.bannerTx.setVisible(false);this.bannerBg.setVisible(false);
      this.resTx.setText(text).setColor(col).setVisible(true).setY(20).setFontSize(22);
      const bg=this.add.rectangle(LW/2,20,this.resTx.width+36,this.resTx.height+8,0x000000,.6).setDepth(29);
      if(!REDUCE()){this.resTx.setScale(1.6).setAlpha(0);bg.setAlpha(0);this.tweens.add({targets:this.resTx,scale:1,alpha:1,duration:300,ease:'Back.easeOut'});this.tweens.add({targets:bg,alpha:.6,duration:300})}
    }
    bigRound(n){
      const t=this.add.text(LW/2,LH/2,`第 ${n} 回合`,{fontFamily:FONT,fontStyle:'bold',fontSize:'34px',color:'#fff',stroke:'#1a0e06',strokeThickness:7}).setOrigin(.5).setResolution(this.cameras.main.zoom*2).setDepth(50).setAlpha(0).setScale(1.5);
      this.tweens.add({targets:t,alpha:1,scale:1,duration:220,ease:'Back.easeOut'});
      this.tweens.add({targets:t,alpha:0,delay:650,duration:300,onComplete:()=>t.destroy()});
    }
    quake(big){this.cameras.main.shake(big?260:160,big?.014:.008)}
    whiteFlash(){this.cameras.main.flash(120,255,250,235)}
    // 戰法 cut-in：畫面變暗，斜帶從發動方那一側切入，帶卡圖（沒有卡圖就用 Q版人物）與戰法名；回傳在動畫結束時解開
    async cutin(side,i,name,ms){
      const o=U[side+'-'+i];if(!o)return;
      let fk=null;const src=faceSrc?.(o.n);
      if(src){fk='f:'+o.n;if(!this.textures.exists(fk)){try{this.textures.addImage(fk,await loadImg(src))}catch{fk=null}}}
      const left=o.left,cy=LH/2,c=this.add.container(left?-LW:LW,0).setDepth(100);
      const dim=this.add.rectangle(LW/2,LH/2,LW,LH,0x000000,.55).setDepth(99).setAlpha(0);
      const g=this.add.graphics();
      g.fillStyle(0x000000,.5).fillPoints([{x:0,y:cy-52},{x:LW,y:cy-66},{x:LW,y:cy+52},{x:0,y:cy+66}],true);
      g.fillStyle(left?0x1f52b8:0xb8362a,.96).fillPoints([{x:0,y:cy-44},{x:LW,y:cy-58},{x:LW,y:cy+44},{x:0,y:cy+58}],true);
      g.lineStyle(3,0xf3d48a,1).strokePoints([{x:0,y:cy-44},{x:LW,y:cy-58}]).strokePoints([{x:0,y:cy+58},{x:LW,y:cy+44}]);
      c.add(g);
      const fx=left?78:LW-78;
      if(fk){const f=this.textures.get(fk).getSourceImage(),w=f.width,s=92/w,ch=Math.min(f.height,w),im=this.add.image(fx,cy,fk).setOrigin(.5,.5).setCrop(0,0,w,ch).setScale(s);im.y=cy-(f.height-ch)*s/2;c.add(im)}
      else c.add(this.add.image(fx,cy+44,'g'+o.key).setOrigin(.5,1).setScale(1/k*1.5).setFlipX(!left));
      const tx=left?LW-28:28,al=left?1:0;
      c.add([this.add.text(tx,cy-30,'戰法發動',{fontFamily:FONT,fontSize:'12px',color:'#fff3c4'}).setOrigin(al,0).setResolution(k*2),
        this.add.text(tx,cy-10,`【${name}】`,{fontFamily:FONT,fontStyle:'bold',fontSize:Math.min(34,Math.floor(236/(name.length+2)))+'px',color:'#fff',stroke:'#2a0a04',strokeThickness:6}).setOrigin(al,0).setResolution(k*2)]);
      const shine=this.add.rectangle(0,cy,40,160,0xffffff,.3).setAngle(12).setBlendMode('ADD');c.add(shine);
      const inT=Math.round(ms*.22),hold=Math.round(ms*.55),outT=Math.round(ms*.2);
      this.tweens.add({targets:dim,alpha:1,duration:inT});
      await new Promise(r=>this.tweens.add({targets:c,x:0,duration:inT,ease:'Cubic.easeOut',onComplete:r}));
      this.tweens.add({targets:shine,x:LW+40,duration:Math.round(hold*.8),ease:'Sine.easeInOut'});
      await new Promise(r=>this.time.delayedCall(hold,r));
      this.tweens.add({targets:dim,alpha:0,duration:outT});
      await new Promise(r=>this.tweens.add({targets:c,x:left?LW:-LW,alpha:.2,duration:outT,ease:'Cubic.easeIn',onComplete:r}));
      c.destroy();dim.destroy();
    }
  }
  const game=new Phaser.Game({type:Phaser.WEBGL,parent:host,transparent:true,antialias:true,
    scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH,width:Math.round(LW*k),height:Math.round(LH*k)},
    input:{touch:{capture:false}},scene:[Battle],banner:false});
  const sc=await createdP;
  const call=m=>(...a)=>sc[m](...a);
  return{
    setT:call('setT'),float:call('float'),lunge:call('lunge'),shake:call('shake'),slash:call('slash'),heal:call('heal'),
    banner:call('banner'),result:call('result'),bigRound:call('bigRound'),quake:call('quake'),whiteFlash:call('whiteFlash'),cutin:call('cutin'),
    destroy(){try{game.destroy(true)}catch(e){}},
  };
}
