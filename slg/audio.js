// 原創 8-bit 和風音樂與音效：全部用 WebAudio 即時合成（方波主旋律、三角波低音、雜訊太鼓），不使用任何錄音或既有曲目。
// 旋律用日本五聲音階自己寫的：地圖曲用陽音階（D E G A B），戰鬥曲用都節音階（E F A B C）。
// 武將台詞用瀏覽器內建的語音朗讀（speechSynthesis），沒有真人配音。
const NOTE={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
const hz=n=>{const m=n.match(/^([A-G])(#?)(\d)$/);return 440*2**((NOTE[m[1]]+(m[2]?1:0)+(+m[3]+1)*12-69)/12)};
// [音, 八分音符數]，'-' 是休止
const p=s=>s.trim().split(/\s+/).map(x=>{const[n,l]=x.split(':');return[n,+(l||1)]});
const SONGS={
  map:{bpm:112,loop:true,
    lead:p(`A4:2 B4 D5 E5:2 D5:2  B4:2 A4:2 G4:4  E4:2 G4 A4 B4:2 A4 G4  E4:6 -:2
            A4:2 B4 D5 E5:2 G5:2  E5:2 D5 B4 D5:4  B4:2 A4 G4 E4:2 G4 A4  D4:6 -:2`),
    bass:p(`D3:4 A2:4 G2:4 D3:4 E3:4 B2:4 E3:4 E2:4 D3:4 A2:4 G2:4 G2:4 A2:4 E3:4 D3:4 D2:4`),
    drum:'x...o...x.x.o...'},
  battle:{bpm:152,loop:true,
    lead:p(`E5 E5 F5 E5 C5:2 B4:2  A4 B4 C5 B4 A4:2 F4:2  E4 F4 A4 B4 C5:2 E5:2  F5:2 E5:2 B4:4
            E5 E5 F5 E5 C5:2 B4:2  A4 B4 C5 E5 F5:2 E5:2  C5 B4 A4 F4 E4:2 F4:2  E4:4 -:4`),
    bass:p(`E2 E3 E2 E3 E2 E3 E2 E3 A2 A3 A2 A3 F2 F3 F2 F3 E2 E3 E2 E3 A2 A3 B2 B3 F2 F3 F2 F3 E2 E3 E2 E3
            E2 E3 E2 E3 E2 E3 E2 E3 A2 A3 A2 A3 F2 F3 F2 F3 A2 A3 A2 A3 F2 F3 F2 F3 E2 E3 E2 E3 E2 E3 E2 E3`),
    drum:'x..xx.o.x..xx.oo'},
  win:{bpm:150,loop:false,lead:p(`E5 G5 A5 B5 D6:4 B5 D6 E6:6`),bass:p(`E3:4 G3:4 E3:8`),drum:'x...x...x.......'},
  lose:{bpm:80,loop:false,lead:p(`B4:2 A4:2 F4:2 E4:6`),bass:p(`E3:6 E2:6`),drum:''},
};

let ctx=null,master=null,musicBus=null,sfxBus=null,noiseBuf=null;
const S={music:true,sfx:true,voice:false,vol:.6};
let cur=null,timer=null;
export function audioSettings(){return S}
export function setAudio(o){
  Object.assign(S,o);
  if(master)master.gain.value=S.vol;
  if(musicBus)musicBus.gain.value=S.music?.32:0;
  if(sfxBus)sfxBus.gain.value=S.sfx?.5:0;
  if(!S.voice&&'speechSynthesis'in window)speechSynthesis.cancel();
}
// browsers only allow audio after a tap; call this from any click handler
export function unlock(){
  if(ctx){if(ctx.state==='suspended')ctx.resume();return}
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  ctx=new AC();master=ctx.createGain();master.connect(ctx.destination);
  musicBus=ctx.createGain();musicBus.connect(master);sfxBus=ctx.createGain();sfxBus.connect(master);
  noiseBuf=ctx.createBuffer(1,ctx.sampleRate*.5,ctx.sampleRate);const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  setAudio({});
  if(cur){const n=cur;cur=null;play(n)}
}
function tone(bus,type,f,t,dur,vol,slide){
  const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(f,t);
  if(slide)o.frequency.exponentialRampToValueAtTime(slide,t+dur);
  g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);
  o.connect(g);g.connect(bus);o.start(t);o.stop(t+dur+.02);
}
function noise(bus,t,dur,vol,freq=1200){
  const s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();s.buffer=noiseBuf;f.type='lowpass';f.frequency.value=freq;
  g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);s.connect(f);f.connect(g);g.connect(bus);s.start(t);s.stop(t+dur+.02);
}
// ---- music: schedule a little ahead of time ----
export function play(name){
  if(cur===name)return;cur=name;clearInterval(timer);timer=null;
  if(!ctx||!name)return;
  const sg=SONGS[name],e8=60/sg.bpm/2;
  const tracks=[['lead',0],['bass',0]].map(([k])=>({k,notes:sg[k],i:0,t:ctx.currentTime+.08}));
  const len=sg.lead.reduce((a,n)=>a+n[1],0);
  let dt=ctx.currentTime+.08,di=0;
  timer=setInterval(()=>{
    const until=ctx.currentTime+.25;
    for(const tr of tracks){
      while(tr.t<until){
        if(tr.i>=tr.notes.length){if(!sg.loop){tr.t=Infinity;break}tr.i=0}
        const[n,l]=tr.notes[tr.i++],d=l*e8;
        if(n!=='-'){if(tr.k==='lead'){tone(musicBus,'square',hz(n),tr.t,d*.9,.16)}else tone(musicBus,'triangle',hz(n),tr.t,d*.95,.3)}
        tr.t+=d;
      }
    }
    while(sg.drum&&dt<until&&(sg.loop||di<len)){
      const c=sg.drum[di%sg.drum.length];
      if(c==='x')noise(musicBus,dt,.18,.5,180);       // 太鼓
      else if(c==='o')noise(musicBus,dt,.06,.18,4000); // 小鼓
      dt+=e8;di++;
    }
    if(!sg.loop&&tracks.every(t=>t.t===Infinity)){clearInterval(timer);timer=null}
  },50);
}
// ---- effects ----
export function sfx(kind){
  if(!ctx||!S.sfx)return;const t=ctx.currentTime;
  switch(kind){
    case'hit':noise(sfxBus,t,.12,.7,2500);tone(sfxBus,'square',220,t,.08,.15,90);break;
    case'mou':tone(sfxBus,'square',880,t,.18,.12,1760);tone(sfxBus,'square',660,t+.05,.15,.08,1320);break;
    case'skill':[523,659,784,1047].forEach((f,i)=>tone(sfxBus,'square',f,t+i*.05,.12,.12));break;
    case'heal':[784,988,1175].forEach((f,i)=>tone(sfxBus,'triangle',f,t+i*.07,.2,.25));break;
    case'rout':tone(sfxBus,'square',440,t,.5,.18,55);noise(sfxBus,t,.4,.4,600);break;
    case'stun':tone(sfxBus,'square',300,t,.08,.1);tone(sfxBus,'square',300,t+.1,.08,.1);break;
    case'move':tone(sfxBus,'triangle',330,t,.05,.2);tone(sfxBus,'triangle',440,t+.05,.05,.2);break;
    case'select':tone(sfxBus,'square',1320,t,.04,.08);break;
    case'start':noise(sfxBus,t,.3,.8,150);noise(sfxBus,t+.25,.3,.8,150);tone(sfxBus,'square',392,t+.5,.3,.12);tone(sfxBus,'square',523,t+.5,.4,.1);break;
  }
}
// ---- 武將台詞（瀏覽器朗讀；聲音依裝置而定）----
let voices=null;
export function say(text){
  if(!S.voice||!('speechSynthesis'in window))return;
  voices??=speechSynthesis.getVoices();
  const u=new SpeechSynthesisUtterance(text);
  const v=voices.find(v=>/zh[-_](TW|HK)/i.test(v.lang))||voices.find(v=>/^zh/i.test(v.lang));
  if(v)u.voice=v;u.lang=v?.lang||'zh-TW';u.rate=1.05;u.pitch=.8;u.volume=S.vol;
  speechSynthesis.cancel();speechSynthesis.speak(u);
}
if('speechSynthesis'in window)speechSynthesis.onvoiceschanged=()=>{voices=speechSynthesis.getVoices()};
