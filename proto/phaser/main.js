// Q版戰棋 Phaser 4 原型（桶狹間）：只示範「換引擎後演出能做到什麼」，不是正式版。
// 美術全部沿用正式版自己畫的 SVG（slg/iso.js 地圖、slg/chibi.js 武將），音效沿用 slg/audio.js 即時合成；
// Phaser 負責：鏡頭拖曳縮放、粒子（紅葉、豪雨、篝火、火花）、補間動畫、鏡頭濾鏡（移軸、暗角）、戰鬥演出。
// 傷害是示意亂數，不是 slg/engine.js 的戰鬥公式。
import {isoTerrain,isoGeom,TW,TH} from '../../slg/iso.js?v=11';
import {chibi} from '../../slg/chibi.js?v=10';
import {SCENARIOS} from '../../slg/scenarios.js?v=10';
import {COUNTER} from '../../slg/engine.js?v=10';
import {play,sfx,unlock,setAudio} from '../../slg/audio.js?v=10';

const Phaser=window.Phaser;
const SC=SCENARIOS[0],T=SC.map,H=T.length,W=T[0].length;
const GEO=isoGeom(W,H),at=(x,y)=>GEO.at(x,y,T);
const FONT='"LXGW WenKai TC","Noto Serif TC",serif';
const DATA=window.FAC_DATA||await fetch('../../data.json').then(r=>r.json()).catch(()=>[]);
const FAC=new Map(DATA.map(g=>[g.n,g.f]));
const facOf=n=>FAC.get(n)||(n.startsWith('今川')?'群雄':'群雄');

// ---- SVG → Image（地圖與武將都用正式版的 SVG 產生器，放大 2 倍再交給 Phaser 當貼圖）----
const NS='xmlns="http://www.w3.org/2000/svg"';
const svgImg=svg=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)});
const MAP_SVG=`<svg ${NS} width="${GEO.vw*2}" height="${GEO.vh*2}" viewBox="0 0 ${GEO.vw} ${GEO.vh}">${isoTerrain(T)}</svg>`;
const chibiSvg=(n,arm,side)=>chibi({n,f:facOf(n)},{arm,side,boss:true}).replace('<svg ',`<svg ${NS} width="128" height="164" `);
const UNITS=SC.units.map((u,i)=>({...u,i,name:u.gens[0],max:u.t,troops:u.t,acted:false,ai:u.ai||'advance'}));
const IMGS={map:await svgImg(MAP_SVG)};
for(const u of UNITS)IMGS['u'+u.i]=await svgImg(chibiSvg(u.name,u.arm,u.side));
await Promise.race([document.fonts.load(`32px ${FONT}`),new Promise(r=>setTimeout(r,2500))]);

// ---- 規則（原型用，簡化）----
const COST={平:1,城:1,橋:1,林:2,山:2};
const MOVE=a=>a==='騎'?4:3,RANGE=a=>a==='弓'||a==='鐵炮'?2:1;
const SKILLS=['乘敵不虞','霹靂一擊','所向披靡','奇策縱橫','千軍辟易','電光石火'];
const dist=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const alive=()=>UNITS.filter(u=>u.troops>0);
const unitAt=(x,y)=>alive().find(u=>u.x===x&&u.y===y);
function reach(u){
  const best=new Map([[u.x+','+u.y,{c:0,prev:null}]]),q=[[u.x,u.y]];
  while(q.length){const[x,y]=q.shift(),c=best.get(x+','+y).c;
    for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,t=T[ny]?.[nx],k=nx+','+ny;
      if(!t||!(t in COST))continue;const o=unitAt(nx,ny);if(o&&o!==u)continue;
      const nc=c+COST[t];if(nc>MOVE(u.arm))continue;
      if(!best.has(k)||best.get(k).c>nc){best.set(k,{c:nc,prev:x+','+y});q.push([nx,ny])}}}
  return best;
}
const pathTo=(R,k)=>{const p=[];while(k){p.unshift(k.split(',').map(Number));k=R.get(k).prev}return p.slice(1)};
const targets=u=>alive().filter(o=>o.side!==u.side&&dist(o,u)<=RANGE(u.arm));

// ---- 程式畫的小貼圖（火花、刀光、紅葉、雨、煙、雲影）----
function makeTextures(s){
  const g=s.make.graphics({x:0,y:0},false);
  const soft=(key,r,col)=>{g.clear();for(let i=r;i>0;i--){g.fillStyle(col,(1-i/r)**1.6*.9);g.fillCircle(r,r,i)}g.generateTexture(key,r*2,r*2)};
  soft('spark',10,0xffffff);soft('smoke',24,0xd8d0c0);soft('cloud',90,0x0b1a10);soft('ember',5,0xffffff);
  g.clear();for(let i=0;i<12;i++){g.lineStyle(14-i,0xffffff,.25+i*.06);g.beginPath();g.arc(70,70,44+i*1.4,-1.15+i*.04,1.15-i*.04);g.strokePath()}
  g.generateTexture('slash',140,140);
  g.clear();g.fillStyle(0xffffff,1);const pts=[];for(let k=0;k<10;k++){const a=-Math.PI/2+k*Math.PI/5,r=k%2?4.4:10;pts.push({x:12+Math.cos(a)*r,y:12+Math.sin(a)*r})}
  g.fillPoints(pts,true);g.fillRect(11,18,2,6);g.generateTexture('leaf',24,26);
  g.clear();g.fillStyle(0xcfe6ff,1);g.fillRect(0,0,2,22);g.generateTexture('drop',2,22);
  g.destroy();
}
const tween=(s,cfg)=>new Promise(r=>s.tweens.add({...cfg,onComplete:r}));
const wait=(s,ms)=>new Promise(r=>s.time.delayedCall(ms,r));

// ======================= 地圖場景 =======================
class MapScene extends Phaser.Scene{
  constructor(){super('map')}
  create(){
    makeTextures(this);
    for(const[k,img]of Object.entries(IMGS))this.textures.addImage(k,img);
    this.day=1;this.sel=null;this.busy=false;this.rain=false;
    this.add.image(0,0,'map').setOrigin(0).setScale(.5).setDepth(0);
    this.hl=this.add.graphics().setDepth(1);
    this.tweens.add({targets:this.hl,alpha:{from:1,to:.55},duration:700,yoyo:true,repeat:-1});
    this.ambient();
    for(const u of UNITS)this.spawn(u);
    // 鏡頭：拖曳、滾輪、雙指縮放，濾鏡（移軸讓地圖像模型沙盤、暗角）
    const cam=this.cameras.main;cam.setBounds(-200,-160,GEO.vw+400,GEO.vh+320);
    this.fit();this.scale.on('resize',()=>this.fit());
    try{this.tilt=cam.filters.internal.addTiltShift(.75,.3,.1,1,1,.25);this.tilt.active=false;this.tiltOn=false;cam.filters.external.addVignette(.5,.5,.95,.3)}catch(e){console.warn('filters',e)}
    this.input.addPointer(1);
    let drag=null,pinch=null;
    this.input.on('pointerdown',p=>{unlock();drag={x:p.x,y:p.y,sx:cam.scrollX,sy:cam.scrollY,moved:false}});
    this.input.on('pointermove',p=>{
      const a=this.input.pointer1,b=this.input.pointer2;
      if(a.isDown&&b.isDown){const d=Phaser.Math.Distance.Between(a.x,a.y,b.x,b.y);if(!pinch)pinch={d,z:cam.zoom};else this.zoom(pinch.z*d/pinch.d);if(drag)drag.moved=true;return}
      pinch=null;if(!drag||!p.isDown)return;
      const dx=p.x-drag.x,dy=p.y-drag.y;if(Math.hypot(dx,dy)>8)drag.moved=true;
      if(drag.moved){cam.scrollX=drag.sx-dx/cam.zoom;cam.scrollY=drag.sy-dy/cam.zoom}});
    this.input.on('pointerup',p=>{if(drag&&!drag.moved&&!pinch)this.tap(p.worldX,p.worldY);drag=null});
    this.input.on('wheel',(p,o,dx,dy)=>this.zoom(cam.zoom*(dy>0?.9:1.1)));
    play('map');
  }
  fit(){const cam=this.cameras.main,zw=this.scale.width/(GEO.vw+40),zh=(this.scale.height-170)/(GEO.vh+20);
    // 直式手機：地圖不硬塞進寬度，放大到約 1.8 倍寬，左右用拖曳看
    this.baseZoom=Phaser.Math.Clamp(Math.min(zh,zw*1.8),.45,1.6);cam.setZoom(this.baseZoom);cam.centerOn(GEO.vw/2,GEO.vh/2+10)}
  zoom(z){this.cameras.main.setZoom(Phaser.Math.Clamp(z,this.baseZoom*.8,2.6))}
  // 環境：雲影飄過、本陣篝火、水面閃光
  ambient(){
    for(let i=0;i<3;i++){const c=this.add.image(Phaser.Math.Between(0,GEO.vw),GEO.vh*(.2+i*.3),'cloud').setScale(3.2,1.6).setAlpha(.16).setDepth(2);
      this.tweens.add({targets:c,x:{from:-260,to:GEO.vw+260},duration:52000,delay:-i*17000,repeat:-1})}
    const isC=(x,y)=>T[y]?.[x]==='城',seen=new Set();
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(!isC(x,y)||seen.has(x+','+y))continue;
      const grp=[],q=[[x,y]];seen.add(x+','+y);
      while(q.length){const[a,b]=q.pop();grp.push([a,b]);for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const k=(a+dx)+','+(b+dy);if(isC(a+dx,b+dy)&&!seen.has(k)){seen.add(k);q.push([a+dx,b+dy])}}}
      grp.sort((p,q2)=>(p[0]+p[1])-(q2[0]+q2[1])||Math.abs(p[0]-p[1])-Math.abs(q2[0]-q2[1]));
      const[kx,ky]=grp[Math.min(grp.length-1,grp.length>2?1:0)],[cx,cy]=at(kx,ky);
      this.add.particles(cx-20,cy+12,'ember',{speedY:{min:-40,max:-18},speedX:{min:-6,max:6},scale:{start:.9,end:0},lifespan:{min:500,max:900},frequency:70,
        tint:[0xffd34a,0xff8a2a,0xffb03a],blendMode:'ADD'}).setDepth(cy+40)}
    for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(T[y][x]==='水'||T[y][x]==='橋'){const[cx,cy]=at(x,y);
      const s=this.add.image(cx+Phaser.Math.Between(-18,18),cy+Phaser.Math.Between(-6,6),'spark').setScale(.35).setBlendMode('ADD').setDepth(2).setAlpha(0);
      this.tweens.add({targets:s,alpha:{from:0,to:.9},duration:600,yoyo:true,repeat:-1,repeatDelay:Phaser.Math.Between(800,2400),delay:Phaser.Math.Between(0,2000)})}
  }
  spawn(u){
    const[cx,cy]=at(u.x,u.y),box=this.add.container(cx,cy+6).setDepth(cy+10);
    const spr=this.add.image(0,0,'u'+u.i).setOrigin(.515,.963).setScale(.5).setFlipX(u.side===1);
    const plate=this.add.text(0,8,u.name,{fontFamily:FONT,fontSize:'13px',color:'#fff',backgroundColor:u.side?'#7d2b20e6':'#23477de6',padding:{x:5,y:1}}).setOrigin(.5,0).setResolution(3);
    const bar=this.add.graphics();box.add([spr,bar,plate]);
    Object.assign(u,{box,spr,bar,plate,lag:u.troops});this.drawBar(u);
    this.tweens.add({targets:spr,scaleY:{from:.5,to:.515},duration:900+u.i*37,yoyo:true,repeat:-1,ease:'Sine.easeInOut',delay:u.i*120});
  }
  drawBar(u){const g=u.bar,w=46;g.clear();g.fillStyle(0x000000,.65).fillRect(-w/2-1,-2,w+2,6);
    g.fillStyle(0xffffff,.85).fillRect(-w/2,-1,w*u.lag/u.max,4);
    g.fillStyle(u.side?0xe0533e:0x4f9bff,1).fillRect(-w/2,-1,w*u.troops/u.max,4)}
  mark(){
    const g=this.hl;g.clear();const s=this.sel;if(!s)return;
    const dia=(x,y,col,a)=>{const[cx,cy]=at(x,y);g.fillStyle(col,a).lineStyle(2,col,.95).fillPoints([{x:cx,y:cy-TH/2},{x:cx+TW/2,y:cy},{x:cx,y:cy+TH/2},{x:cx-TW/2,y:cy}],true).strokePoints([{x:cx,y:cy-TH/2},{x:cx+TW/2,y:cy},{x:cx,y:cy+TH/2},{x:cx-TW/2,y:cy}],true)};
    if(!s.moved)for(const k of this.R.keys()){const[x,y]=k.split(',').map(Number);dia(x,y,0x7fc8ff,.28)}
    for(const o of targets(s))dia(o.x,o.y,0xff5a3c,.4);
    dia(s.x,s.y,0xffe9a8,.45);
  }
  select(u){
    if(this.sel?.glow){this.sel.spr.filters?.internal.remove(this.sel.glow);this.sel.glow=null}
    this.sel=u;if(!u){this.mark();return}
    this.R=reach(u);sfx('select');
    try{u.spr.enableFilters();u.glow=u.spr.filters.internal.addGlow(0xffe9a8,3,0,1)}catch(e){}
    this.mark();
  }
  pick(wx,wy){
    // 先看有沒有點到武將（站在後面的武將會被前面的蓋住，所以從最前面的找起）
    const us=alive().sort((a,b)=>b.box.depth-a.box.depth);
    for(const u of us){const b=u.spr.getBounds();if(b.contains(wx,wy))return{u,x:u.x,y:u.y}}
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){const[cx,cy]=at(x,y);if(Math.abs(wx-cx)/(TW/2)+Math.abs(wy-cy)/(TH/2)<=1)return{x,y,u:unitAt(x,y)}}
    return null;
  }
  async tap(wx,wy){
    if(this.busy)return;const p=this.pick(wx,wy),s=this.sel;if(!p){this.select(null);return}
    if(s&&p.u&&p.u.side!==s.side&&targets(s).includes(p.u)){await this.fight(s,p.u);return}
    if(p.u&&p.u.side===0&&!p.u.acted){this.select(p.u);return}
    if(s&&!s.moved&&!p.u&&this.R.has(p.x+','+p.y)){await this.walk(s,pathTo(this.R,p.x+','+p.y));s.moved=true;
      if(!targets(s).length)this.done(s);else this.mark();return}
    this.select(null);
  }
  async walk(u,path){
    this.busy=true;this.hl.clear();
    for(const[x,y]of path){const[cx,cy]=at(x,y);sfx('move');u.x=x;u.y=y;
      u.box.setDepth(cy+10);await tween(this,{targets:u.box,x:cx,y:cy+6,duration:170,ease:'Sine.easeInOut'});
      this.tweens.add({targets:u.spr,y:{from:0,to:-7},duration:85,yoyo:true})}
    this.busy=false;
  }
  done(u){u.acted=true;u.spr.setTint(0x8a8a8a);if(this.sel===u)this.select(null)}
  // ---------- 戰鬥演出 ----------
  async fight(a,d,enemyTurn=false){
    this.busy=true;this.hl.clear();if(this.sel?.glow)this.select(null);
    const cam=this.cameras.main,z0=cam.zoom,mx=(a.box.x+d.box.x)/2,my=(a.box.y+d.box.y)/2-30;
    const dim=this.add.rectangle(GEO.vw/2,GEO.vh/2,GEO.vw*4,GEO.vh*4,0x000000,0).setDepth(5000);
    const dep=[a.box.depth,d.box.depth];a.box.setDepth(6001);d.box.setDepth(6000);
    if(this.tilt)this.tilt.active=false;
    cam.pan(mx,my,380,'Sine.easeInOut');cam.zoomTo(Math.min(z0*1.7,2.4),380,'Sine.easeInOut');
    await tween(this,{targets:dim,fillAlpha:.5,duration:380});
    play('battle');
    const first=!this.shown;this.shown=true;
    if(first||Math.random()<.5){const sk=a.s?.[a.name]?.[0]||SKILLS[(a.i*7+this.day)%SKILLS.length];
      sfx('skill');await this.scene.get('ui').cutin(a,sk)}
    await this.strike(a,d,1);
    if(d.troops>0&&dist(a,d)<=RANGE(d.arm)){await wait(this,250);await this.strike(d,a,.6)}
    await wait(this,350);
    const routed=[a,d].filter(u=>u.troops<=0);
    for(const u of routed)await this.rout(u);
    await tween(this,{targets:dim,fillAlpha:0,duration:300});dim.destroy();
    if(a.troops>0)a.box.setDepth(dep[0]);if(d.troops>0)d.box.setDepth(dep[1]);
    cam.zoomTo(z0,420,'Sine.easeInOut');cam.pan(mx,my+30,420,'Sine.easeInOut');
    if(this.tilt)this.time.delayedCall(420,()=>this.tilt.active=this.tiltOn!==false);
    play('map');
    if(!enemyTurn&&a.troops>0)this.done(a);
    this.busy=false;this.checkEnd();
  }
  async strike(a,d,mul){
    const ranged=RANGE(a.arm)>1&&dist(a,d)>1,dir=Math.sign(d.box.x-a.box.x)||1;
    const adv=COUNTER[a.arm]?.includes(d.arm),crit=Math.random()<.25;
    const dmg=Math.min(d.troops,Math.round((700+Math.random()*700)*mul*(adv?1.15:1)*(crit?1.5:1)));
    if(ranged){
      const shot=this.add.image(a.box.x,a.box.y-40,'spark').setScale(a.arm==='鐵炮'?.6:.4,.25).setBlendMode('ADD').setDepth(6100).setTint(a.arm==='鐵炮'?0xffd080:0xffffff);
      sfx('hit',a.arm);
      await tween(this,{targets:shot,x:d.box.x,y:d.box.y-30,duration:a.arm==='鐵炮'?120:320,ease:a.arm==='弓'?'Quad.easeIn':'Linear'});shot.destroy();
    }else{
      await tween(this,{targets:a.box,x:a.box.x+(d.box.x-a.box.x)*.45,y:a.box.y+(d.box.y-a.box.y)*.45,duration:140,ease:'Back.easeIn'});
      sfx('hit',a.arm);
    }
    // 命中：刀光、火花、閃白、鏡頭震動、擊退、數字
    const hx=d.box.x,hy=d.box.y-34;
    const sl=this.add.image(hx,hy,'slash').setBlendMode('ADD').setDepth(6200).setTint(crit?0xffd34a:0xdfefff).setRotation(dir>0?-.5:2.6).setScale(.3).setAlpha(1);
    this.tweens.add({targets:sl,scale:crit?1.25:.95,alpha:0,duration:320,ease:'Cubic.easeOut',onComplete:()=>sl.destroy()});
    const burst=this.add.particles(0,0,'spark',{speed:{min:120,max:crit?420:300},angle:{min:0,max:360},scale:{start:.7,end:0},lifespan:{min:250,max:520},
      tint:[0xfff3c4,0xffb03a,0xffffff],blendMode:'ADD',emitting:false}).setDepth(6300);
    burst.explode(crit?36:22,hx,hy);this.time.delayedCall(700,()=>burst.destroy());
    this.cameras.main.shake(crit?260:160,crit?.012:.007);
    if(crit)this.cameras.main.flash(90,255,240,200);
    d.spr.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);this.time.delayedCall(70,()=>{d.spr.setTintMode(Phaser.TintModes.MULTIPLY);d.spr.setTint(d.acted?0x8a8a8a:0xffffff)});
    this.tweens.add({targets:d.box,x:d.box.x+dir*8,duration:70,yoyo:true});
    if(!ranged)this.tweens.add({targets:a.box,x:at(a.x,a.y)[0],y:at(a.x,a.y)[1]+6,duration:220,ease:'Sine.easeOut'});
    d.troops-=dmg;this.drawBar(d);this.pop(hx,hy-10,dmg,crit,adv);
    this.tweens.addCounter({from:d.lag,to:d.troops,delay:380,duration:420,onUpdate:t=>{d.lag=t.getValue();this.drawBar(d)}});
    this.scene.get('ui').log(`${a.name}隊 → ${d.name}隊　${crit?'會心！':''}${adv?'兵種相剋 ':''}損兵 ${dmg}`);
    await wait(this,420);
  }
  pop(x,y,n,crit,adv){
    const t=this.add.text(x,y,(crit?'會心 ':'')+'-'+n,{fontFamily:FONT,fontStyle:'bold',fontSize:crit?'30px':'24px',color:crit?'#ffd34a':'#ffffff',stroke:'#5a1208',strokeThickness:6}).setOrigin(.5).setDepth(6400).setResolution(3).setScale(1.8);
    this.tweens.add({targets:t,scale:1,duration:180,ease:'Back.easeOut'});
    this.tweens.add({targets:t,y:y-46,alpha:0,delay:520,duration:600,ease:'Cubic.easeIn',onComplete:()=>t.destroy()});
    if(adv){const b=this.add.text(x,y+20,'剋制',{fontFamily:FONT,fontSize:'14px',color:'#fff',backgroundColor:'#c8442c',padding:{x:4,y:1}}).setOrigin(.5).setDepth(6400).setResolution(3);
      this.tweens.add({targets:b,y:y+4,alpha:0,delay:500,duration:600,onComplete:()=>b.destroy()})}
  }
  async rout(u){
    sfx('rout');this.scene.get('ui').log(`${u.name}隊 潰走`);
    const sm=this.add.particles(u.box.x,u.box.y-20,'smoke',{speed:{min:20,max:70},angle:{min:200,max:340},scale:{start:.6,end:1.6},alpha:{start:.7,end:0},lifespan:900,emitting:false}).setDepth(6500);
    sm.explode(18);this.time.delayedCall(1000,()=>sm.destroy());
    await tween(this,{targets:u.box,alpha:0,y:u.box.y+14,duration:600});u.box.setVisible(false);
  }
  checkEnd(){
    const y=UNITS.find(u=>u.target),n=UNITS.find(u=>u.lord);
    if(y.troops<=0)this.scene.get('ui').banner('勝利','今川義元隊潰走，桶狹間奇襲成功');
    else if(n.troops<=0||!alive().some(u=>u.side===0))this.scene.get('ui').banner('敗北','織田軍潰走');
  }
  // 結束這天：敵方行動（豪雨時不移動，只打射程內的）
  async endDay(){
    if(this.busy)return;this.select(null);this.busy=true;
    for(const e of alive().filter(u=>u.side===1)){
      if(e.ai==='advance'&&!this.rain){
        const foes=alive().filter(u=>u.side===0);if(!foes.length)break;
        const R=reach(e);let best=null;
        for(const k of R.keys()){const[x,y]=k.split(',').map(Number),d=Math.min(...foes.map(f=>dist({x,y},f)));if(!best||d<best.d)best={k,d}}
        if(best&&best.k!==e.x+','+e.y){this.busy=true;await this.walk(e,pathTo(R,best.k))}
      }
      const t=targets(e)[0];if(t){this.busy=true;await this.fight(e,t,true)}
    }
    this.day++;for(const u of alive()){u.acted=false;u.moved=false;u.spr.setTint(0xffffff)}
    this.busy=false;document.getElementById('day').textContent=`第 ${this.day} 天`+(this.rain?'（豪雨）':'');
    this.scene.get('ui').log(`—— 第 ${this.day} 天 ——`);
  }
}

// ======================= 畫面最上層：紅葉、豪雨、戰法 cut-in、戰況、勝敗 =======================
class UI extends Phaser.Scene{
  constructor(){super({key:'ui',active:true})}
  create(){
    const W0=()=>this.scale.width,H0=()=>this.scale.height;
    this.leafZone=new Phaser.Geom.Rectangle(-40,-30,W0()+80,4);
    this.add.particles(0,0,'leaf',{emitZone:{type:'random',source:this.leafZone},speedY:{min:28,max:60},speedX:{min:-8,max:34},rotate:{start:0,end:540},
      scale:{min:.45,max:.8},lifespan:{min:9000,max:15000},frequency:650,tint:[0xd4462c,0xe48a2a,0xc2361f,0xf0b03c],alpha:.9});
    this.rainShade=this.add.rectangle(0,0,10,10,0x0c1830,.32).setOrigin(0).setVisible(false);
    this.rainZone=new Phaser.Geom.Rectangle(-100,-40,W0()+200,4);
    this.rainFx=this.add.particles(0,0,'drop',{emitZone:{type:'random',source:this.rainZone},speedY:{min:900,max:1200},speedX:-160,rotate:8,
      lifespan:900,quantity:5,frequency:16,alpha:{start:.55,end:.2},emitting:false});
    this.logBox=this.add.text(12,0,'',{fontFamily:FONT,fontSize:'13px',color:'#efe3c8',backgroundColor:'#0009',padding:{x:8,y:6},lineSpacing:3}).setResolution(2).setOrigin(0,1);
    this.lines=['桶狹間：等待豪雨，突襲今川本陣。'];this.log();
    const lay=()=>{this.leafZone.width=W0()+80;this.rainZone.width=W0()+200;this.rainShade.setSize(W0(),H0());this.logBox.setPosition(12,H0()-(W0()<600?78:40))};
    lay();this.scale.on('resize',lay);
  }
  log(s){if(s)this.lines.push(s);this.lines=this.lines.slice(-4);this.logBox.setText(this.lines.join('\n'))}
  setRain(on){this.rainShade.setVisible(on);this.rainFx.emitting=on;
    clearInterval(this.thunder);if(on)this.thunder=setInterval(()=>{if(Math.random()<.5)this.cameras.main.flash(120,220,230,255)},4200)}
  // 戰法 cut-in：斜帶從左滑入、武將大頭、戰法名（毛筆感字型），停一下再往右滑出
  async cutin(u,skill){
    const w=this.scale.width,h=this.scale.height,cy=h*.42,col=u.side?0x7d2b20:0x1f3f72;
    const c=this.add.container(-w,0);
    const band=this.add.graphics();band.fillStyle(0x000000,.55).fillPoints([{x:0,y:cy-70},{x:w,y:cy-90},{x:w,y:cy+70},{x:0,y:cy+90}],true);
    band.fillStyle(col,.95).fillPoints([{x:0,y:cy-58},{x:w,y:cy-76},{x:w,y:cy+58},{x:0,y:cy+76}],true);
    band.lineStyle(3,0xe3b75a,1).strokePoints([{x:0,y:cy-58},{x:w,y:cy-76}]).strokePoints([{x:0,y:cy+76},{x:w,y:cy+58}]);
    const face=this.add.image(Math.min(w*.26,190),cy+70,'u'+u.i).setOrigin(.5,1).setScale(1.25).setFlipX(u.side===1);
    const big=Math.max(34,Math.min(64,w/9));
    const name=this.add.text(Math.min(w*.26,190)+Math.min(w*.2,150),cy-34,u.name,{fontFamily:FONT,fontSize:Math.round(big*.42)+'px',color:'#efe3c8'}).setResolution(2);
    const sk=this.add.text(Math.min(w*.26,190)+Math.min(w*.2,150),cy-8,'「'+skill+'」',{fontFamily:FONT,fontStyle:'bold',fontSize:big+'px',color:'#fff3c4',stroke:'#2a0d06',strokeThickness:7}).setResolution(2);
    const shine=this.add.rectangle(0,cy,60,200,0xffffff,.35).setAngle(14).setBlendMode('ADD');
    c.add([band,face,name,sk,shine]);
    await tween(this,{targets:c,x:0,duration:230,ease:'Cubic.easeOut'});
    this.tweens.add({targets:shine,x:w+60,duration:520,ease:'Sine.easeInOut'});
    await wait(this,720);
    await tween(this,{targets:c,x:w,alpha:.2,duration:200,ease:'Cubic.easeIn'});c.destroy();
  }
  banner(t,sub){
    const w=this.scale.width,h=this.scale.height,c=this.add.container(w/2,h/2).setAlpha(0);
    c.add([this.add.rectangle(0,0,w,150,0x000000,.7),this.add.text(0,-18,t,{fontFamily:FONT,fontStyle:'bold',fontSize:'64px',color:t==='勝利'?'#ffd34a':'#d9d2c4',stroke:'#3a1005',strokeThickness:8}).setOrigin(.5).setResolution(2),
      this.add.text(0,40,sub,{fontFamily:FONT,fontSize:'18px',color:'#efe3c8'}).setOrigin(.5).setResolution(2)]);
    this.tweens.add({targets:c,alpha:1,scale:{from:1.4,to:1},duration:400,ease:'Back.easeOut'});
    play(t==='勝利'?'win':'lose');
  }
}

const game=new Phaser.Game({type:Phaser.WEBGL,parent:'stage',transparent:true,antialias:true,
  scale:{mode:Phaser.Scale.RESIZE,width:innerWidth,height:innerHeight},scene:[MapScene,UI],
});
window.__game=game;window.__units=UNITS;
const $=id=>document.getElementById(id),mapS=()=>game.scene.getScene('map');
$('endDay').onclick=()=>mapS().endDay();
$('rain').onclick=e=>{const on=e.currentTarget.getAttribute('aria-pressed')!=='true';e.currentTarget.setAttribute('aria-pressed',on);
  mapS().rain=on;game.scene.getScene('ui').setRain(on);$('day').textContent=`第 ${mapS().day} 天`+(on?'（豪雨）':'')};
$('tilt').onclick=e=>{const on=e.currentTarget.getAttribute('aria-pressed')!=='true';e.currentTarget.setAttribute('aria-pressed',on);const m=mapS();m.tiltOn=on;if(m.tilt)m.tilt.active=on};
$('mute').onclick=e=>{unlock();const on=e.currentTarget.getAttribute('aria-pressed')!=='true';e.currentTarget.setAttribute('aria-pressed',on);setAudio({sfx:!on,music:!on})};
