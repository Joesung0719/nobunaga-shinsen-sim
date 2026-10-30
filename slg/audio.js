// 原創和風音樂與音效：全部用 WebAudio 即時合成，不使用任何錄音或既有曲目。
// 樂器：三味線式撥弦（主旋律）、低音弦、太鼓（低頻正弦下滑＋鼓皮雜訊）、締太鼓、法螺貝。
// 旋律用日本五聲音階自己寫的：標題曲與戰鬥曲用都節音階（陰暗、肅殺），地圖曲用陽音階。
const NOTE={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
const hz=n=>{const m=n.match(/^([A-G])([#b]?)(\d)$/);return 440*2**((NOTE[m[1]]+(m[2]==='#'?1:m[2]==='b'?-1:0)+(+m[3]+1)*12-69)/12)};
// [音, 八分音符數]，'-' 是休止
const p=s=>s.trim().split(/\s+/).map(x=>{const[n,l]=x.split(':');return[n,+(l||1)]});
// drum: x 大太鼓、o 締太鼓、k 太鼓邊（カッ）、. 休止
const SONGS={
  // 標題：都節音階 D Eb G A Bb，慢板開場
  title:{bpm:92,loop:true,
    lead:p(`D5:3 Eb5 D5:2 A4:2  Bb4:2 A4 G4 A4:4  D4:2 G4:2 A4:2 Bb4:2  A4:6 -:2
            D5:3 Eb5 G5:2 Eb5:2  D5:2 Bb4 A4 G4:4  A4:2 Bb4 A4 G4:2 Eb4:2  D4:6 -:2`),
    bass:p(`D2:8 G2:8 D2:8 A2:8 D2:8 G2:8 Eb2:8 D2:8`),
    drum:'x.......x...o.o.x.......x..ko.o.'},
  map:{bpm:112,loop:true,
    lead:p(`A4:2 B4 D5 E5:2 D5:2  B4:2 A4:2 G4:4  E4:2 G4 A4 B4:2 A4 G4  E4:6 -:2
            A4:2 B4 D5 E5:2 G5:2  E5:2 D5 B4 D5:4  B4:2 A4 G4 E4:2 G4 A4  D4:6 -:2`),
    bass:p(`D3:4 A2:4 G2:4 D3:4 E3:4 B2:4 E3:4 E2:4 D3:4 A2:4 G2:4 G2:4 A2:4 E3:4 D3:4 D2:4`),
    drum:'x...o...x.k.o...'},
  battle:{bpm:152,loop:true,
    lead:p(`E5 E5 F5 E5 C5:2 B4:2  A4 B4 C5 B4 A4:2 F4:2  E4 F4 A4 B4 C5:2 E5:2  F5:2 E5:2 B4:4
            E5 E5 F5 E5 C5:2 B4:2  A4 B4 C5 E5 F5:2 E5:2  C5 B4 A4 F4 E4:2 F4:2  E4:4 -:4`),
    bass:p(`E2 E3 E2 E3 E2 E3 E2 E3 A2 A3 A2 A3 F2 F3 F2 F3 E2 E3 E2 E3 A2 A3 B2 B3 F2 F3 F2 F3 E2 E3 E2 E3
            E2 E3 E2 E3 E2 E3 E2 E3 A2 A3 A2 A3 F2 F3 F2 F3 A2 A3 A2 A3 F2 F3 F2 F3 E2 E3 E2 E3 E2 E3 E2 E3`),
    drum:'x..xx.o.x..xx.ok'},
  win:{bpm:150,loop:false,lead:p(`E5 G5 A5 B5 D6:4 B5 D6 E6:6`),bass:p(`E3:4 G3:4 E3:8`),drum:'x...x...x.x.x...'},
  lose:{bpm:80,loop:false,lead:p(`B4:2 A4:2 F4:2 E4:6`),bass:p(`E3:6 E2:6`),drum:'x.......'},
};

let ctx=null,master=null,musicBus=null,sfxBus=null,noiseBuf=null;
const S={music:true,sfx:true,vol:.6};
let cur=null,timer=null;
export function audioSettings(){return S}
export function setAudio(o){
  Object.assign(S,o);delete S.voice;
  if(master)master.gain.value=S.vol;
  if(musicBus)musicBus.gain.value=S.music?.4:0;
  if(sfxBus)sfxBus.gain.value=S.sfx?.55:0;
}
// browsers only allow audio after a tap; call this from any click handler
export function unlock(){
  if(ctx){if(ctx.state==='suspended')ctx.resume();return}
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  ctx=new AC();master=ctx.createGain();master.connect(ctx.destination);
  musicBus=ctx.createGain();musicBus.connect(master);sfxBus=ctx.createGain();sfxBus.connect(master);
  noiseBuf=ctx.createBuffer(1,ctx.sampleRate*.6,ctx.sampleRate);const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  setAudio({});
  if(cur){const n=cur;cur=null;play(n)}
}
function tone(bus,type,f,t,dur,vol,slide){
  const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(f,t);
  if(slide)o.frequency.exponentialRampToValueAtTime(slide,t+dur);
  g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);
  o.connect(g);g.connect(bus);o.start(t);o.stop(t+dur+.02);
}
function noise(bus,t,dur,vol,freq=1200,type='lowpass',to){
  const s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();s.buffer=noiseBuf;f.type=type;f.frequency.setValueAtTime(freq,t);
  if(to)f.frequency.exponentialRampToValueAtTime(to,t+dur);
  g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);s.connect(f);f.connect(g);g.connect(bus);s.start(t);s.stop(t+dur+.02);
}
// 三味線式撥弦：極短起音、快速衰減，鋸齒波經過逐漸關閉的低通濾波器（撥弦的「錚」）
function pluck(bus,f,t,dur,vol){
  const o=ctx.createOscillator(),o2=ctx.createOscillator(),lp=ctx.createBiquadFilter(),g=ctx.createGain();
  o.type='sawtooth';o2.type='triangle';o.frequency.setValueAtTime(f,t);o2.frequency.setValueAtTime(f*2.005,t);
  lp.type='lowpass';lp.Q.value=4;lp.frequency.setValueAtTime(f*9,t);lp.frequency.exponentialRampToValueAtTime(f*1.5,t+Math.min(dur,.5));
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+.006);g.gain.exponentialRampToValueAtTime(.001,t+Math.max(.18,Math.min(dur,.9)));
  o.connect(lp);o2.connect(lp);lp.connect(g);g.connect(bus);
  const end=t+Math.max(.2,Math.min(dur,.9))+.02;o.start(t);o2.start(t);o.stop(end);o2.stop(end);
}
// 大太鼓：低頻正弦從 ~120Hz 下滑到 ~42Hz，加一點鼓皮雜訊
function taiko(bus,t,vol=1,f=120){
  tone(bus,'sine',f,t,.45,vol,42);
  noise(bus,t,.08,vol*.5,900);
}
function horagai(bus,t,dur=1.6,f=233){
  // 法螺貝：鋸齒波＋顫音，慢起音、低通，像吹海螺的號角
  const o=ctx.createOscillator(),lfo=ctx.createOscillator(),lg=ctx.createGain(),lp=ctx.createBiquadFilter(),g=ctx.createGain();
  o.type='sawtooth';o.frequency.setValueAtTime(f*.94,t);o.frequency.linearRampToValueAtTime(f,t+.25);o.frequency.setValueAtTime(f,t+dur*.7);o.frequency.linearRampToValueAtTime(f*.9,t+dur);
  lfo.frequency.value=5.5;lg.gain.value=f*.012;lfo.connect(lg);lg.connect(o.frequency);
  lp.type='lowpass';lp.frequency.value=1100;lp.Q.value=2;
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.35,t+.28);g.gain.setValueAtTime(.35,t+dur*.7);g.gain.exponentialRampToValueAtTime(.001,t+dur);
  o.connect(lp);lp.connect(g);g.connect(bus);o.start(t);lfo.start(t);o.stop(t+dur+.05);lfo.stop(t+dur+.05);
}
// ---- music: schedule a little ahead of time ----
export function play(name){
  if(cur===name)return;cur=name;clearInterval(timer);timer=null;
  if(!ctx||!name)return;
  const sg=SONGS[name],e8=60/sg.bpm/2;
  const tracks=['lead','bass'].map(k=>({k,notes:sg[k],i:0,t:ctx.currentTime+.08}));
  const len=sg.lead.reduce((a,n)=>a+n[1],0);
  let dt=ctx.currentTime+.08,di=0;
  timer=setInterval(()=>{
    const until=ctx.currentTime+.25;
    for(const tr of tracks){
      while(tr.t<until){
        if(tr.i>=tr.notes.length){if(!sg.loop){tr.t=Infinity;break}tr.i=0}
        const[n,l]=tr.notes[tr.i++],d=l*e8;
        if(n!=='-'){if(tr.k==='lead')pluck(musicBus,hz(n),tr.t,d,.22);else pluck(musicBus,hz(n),tr.t,d*1.2,.3)}
        tr.t+=d;
      }
    }
    while(sg.drum&&dt<until&&(sg.loop||di<len)){
      const c=sg.drum[di%sg.drum.length];
      if(c==='x')taiko(musicBus,dt,.9);
      else if(c==='o')taiko(musicBus,dt,.35,260);              // 締太鼓
      else if(c==='k')noise(musicBus,dt,.04,.35,3500,'bandpass'); // 鼓邊
      dt+=e8;di++;
    }
    if(!sg.loop&&tracks.every(t=>t.t===Infinity)){clearInterval(timer);timer=null}
  },50);
}
// ---- effects ----
// hit 依攻擊方兵種：槍／騎 刀槍斬擊、弓 箭矢破空、鐵炮 槍響、器械 撞擊
export function sfx(kind,arm){
  if(!ctx||!S.sfx)return;const t=ctx.currentTime;
  switch(kind){
    case'hit':
      if(arm==='弓'){noise(sfxBus,t,.25,.5,5000,'highpass',1200);noise(sfxBus,t+.2,.06,.6,1500)}
      else if(arm==='鐵炮'){noise(sfxBus,t,.35,1,2500,'lowpass',200);tone(sfxBus,'sine',90,t,.2,.6,40)}
      else if(arm==='器械'){taiko(sfxBus,t,1.2,80);noise(sfxBus,t,.3,.6,600)}
      else{noise(sfxBus,t,.16,.8,7000,'bandpass',1800);tone(sfxBus,'triangle',1900,t,.12,.12,1300)}
      break;
    case'mou':[880,1175,1568].forEach((f,i)=>tone(sfxBus,'sine',f,t+i*.06,.35,.18));noise(sfxBus,t,.4,.15,6000,'highpass');break;
    case'skill':taiko(sfxBus,t,.9);[294,311,392,440,466].forEach((f,i)=>pluck(sfxBus,f*2,t+.02+i*.03,.5,.28));break;   // 三味線「錚」
    case'heal':[587,698,880].forEach((f,i)=>tone(sfxBus,'triangle',f*2,t+i*.08,.3,.22));break;
    case'rout':taiko(sfxBus,t,1.2,100);taiko(sfxBus,t+.18,1,90);noise(sfxBus,t,.5,.4,500);break;
    case'stun':tone(sfxBus,'sine',600,t,.08,.15);tone(sfxBus,'sine',600,t+.12,.08,.15);break;
    case'move':noise(sfxBus,t,.05,.4,900,'bandpass');noise(sfxBus,t+.09,.05,.3,700,'bandpass');break;   // 腳步
    case'select':tone(sfxBus,'sine',1050,t,.07,.25);break;                                                 // 拍子木
    case'confirm':tone(sfxBus,'sine',1050,t,.07,.25);tone(sfxBus,'sine',1400,t+.09,.1,.25);break;
    case'start':horagai(sfxBus,t,1.4);taiko(sfxBus,t+.9,1);taiko(sfxBus,t+1.15,1);taiko(sfxBus,t+1.4,1.1);break;
    case'opening':horagai(sfxBus,t,2.2,220);horagai(sfxBus,t+.05,2.2,330);[1.6,1.9,2.2,2.35,2.5].forEach((d,i)=>taiko(sfxBus,t+d,.8+i*.08));break;
  }
}
