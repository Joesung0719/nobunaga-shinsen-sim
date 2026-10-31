// 地圖氣氛：紅葉飄落（一張 Canvas），系統設定「減少動態效果」時不播。
const reduce=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
const COLS=['#d4462c','#e48a2a','#c2361f','#f0b03c'];
export function leaves(cv){
  if(cv._raf||reduce())return;
  const ctx=cv.getContext('2d'),L=[];
  for(let i=0;i<18;i++)L.push({x:Math.random(),y:Math.random(),s:.6+Math.random()*.7,v:.0005+Math.random()*.0007,r:Math.random()*6,w:Math.random()*6,c:COLS[i%4]});
  const leaf=(c,s)=>{ctx.beginPath();for(let k=0;k<5;k++){const a=-Math.PI/2+k*Math.PI*2/5;ctx.lineTo(Math.cos(a)*5*s,Math.sin(a)*5*s);const b=a+Math.PI/5;ctx.lineTo(Math.cos(b)*2.2*s,Math.sin(b)*2.2*s)}ctx.closePath();ctx.fillStyle=c;ctx.fill()};
  const tick=t=>{
    if(!cv.isConnected){cv._raf=0;return}
    const k=devicePixelRatio||1,W=Math.round(cv.clientWidth*k),H=Math.round(cv.clientHeight*k);
    if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H}
    ctx.clearRect(0,0,W,H);
    if(!document.hidden)for(const p of L){
      p.y+=p.v;p.x+=Math.sin(t/900+p.w)*.0006+.0003;p.r+=.02;if(p.y>1.05||p.x>1.05){p.y=-.05;p.x=Math.random()*.9}
      ctx.save();ctx.translate(p.x*W,p.y*H);ctx.rotate(p.r);ctx.scale(k,k*(Math.abs(Math.cos(p.r*.7))+.2));ctx.globalAlpha=.9;leaf(p.c,p.s);ctx.restore();
    }
    cv._raf=requestAnimationFrame(tick)};
  cv._raf=requestAnimationFrame(tick);
}
