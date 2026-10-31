// Q版戰棋戰場：Phaser 4 版（網址加 ?engine=phaser 切換；舊版 SVG 戰場仍是預設）。
// 只負責「畫」與「點」：規則、AI、戰鬥公式、存檔都在 game.js／engine.js，兩版共用。
// game.js 每次 renderBoard 把目前盤面（地形、部隊、標記格、是否下雨）交給 render()，這裡比對差異後做動畫；
// 點擊換算成格子座標後呼叫 onTap(x,y)，和舊版點 SVG 地塊一樣。
// 美術沿用自己畫的 SVG（iso.js 地塊、chibi.js 武將）轉成貼圖；粒子、刀光等小貼圖用 Phaser Graphics 現場畫，不用任何外部素材。
import {isoTerrain,isoGeom,TW,TH} from './iso.js?v=13';
import {chibi,SIDE_COL} from './chibi.js?v=13';

const FONT='"LXGW WenKai TC","Noto Serif TC",serif';
const NS='xmlns="http://www.w3.org/2000/svg"';
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

// 程式畫的小貼圖：火花、煙、雲影、篝火火星、紅葉、雨滴、刀光
function makeTextures(s){
  const g=s.make.graphics({x:0,y:0},false);
  const soft=(key,r,col)=>{g.clear();for(let i=r;i>0;i--){g.fillStyle(col,(1-i/r)**1.6*.9);g.fillCircle(r,r,i)}g.generateTexture(key,r*2,r*2)};
  soft('spark',10,0xffffff);soft('smoke',24,0xd8d0c0);soft('cloud',90,0x0b1a10);soft('ember',5,0xffffff);
  g.clear();g.fillStyle(0xffffff,1);const pts=[];for(let k=0;k<10;k++){const a=-Math.PI/2+k*Math.PI/5,r=k%2?4.4:10;pts.push({x:12+Math.cos(a)*r,y:12+Math.sin(a)*r})}
  g.fillPoints(pts,true);g.fillRect(11,18,2,6);g.generateTexture('leaf',24,26);
  g.clear();g.fillStyle(0xcfe6ff,1);g.fillRect(0,0,2,22);g.generateTexture('drop',2,22);
  g.destroy();
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
    await Promise.race([document.fonts?.load(`16px ${FONT}`),new Promise(r=>setTimeout(r,2000))]).catch(()=>{});
    const geo0=isoGeom(st.latest?.T[0].length||7,st.latest?.T.length||9);
    // 畫布解析度：依螢幕像素密度放大（最多 2 倍），手機上字和線條才清楚
    const k=Math.max(1,Math.min(2,(devicePixelRatio||1)*(box.clientWidth||640)/geo0.vw));
    let created;const createdP=new Promise(r=>created=r);
    class Board extends Phaser.Scene{
      constructor(){super('board')}
      create(){
        makeTextures(this);
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
          this.amb.push(this.add.particles(cx-20,cy+12,'ember',{speedY:{min:-40,max:-18},speedX:{min:-6,max:6},scale:{start:.8,end:0},lifespan:{min:500,max:900},frequency:90,
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
