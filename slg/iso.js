// 2.5D 斜視角地圖：程式畫的 SVG 地塊（不使用遊戲素材）。
// 每格是一塊有厚度的菱形地塊（頂面漸層＋細雜訊、受光邊、側面漸層）；山、森林、軍營、河、橋畫在地塊上，依 x+y 由後往前畫，前面的會遮住後面的。
export const TW=96,TH=48;                       // 菱形的寬、高（SVG 單位）
const LIFT={平:12,林:14,山:16,城:18,水:4,橋:6};    // 地塊厚度（水面較低）
export function isoGeom(W,H){
  const OX=H*TW/2,OY=100;
  const vw=(W+H)*TW/2,vh=OY+(W+H-2)*TH/2+TH+24;
  // 地塊頂面菱形的中心（部隊站的位置）
  const at=(x,y,T)=>{const cx=OX+(x-y)*TW/2,cy=OY+(x+y)*TH/2-(LIFT[T?.[y]?.[x]]??12);return[cx,cy+TH/2]};
  return{OX,OY,vw,vh,at};
}
const rnd=(x,y,k=0)=>{let h=(x*73856093)^(y*19349663)^(k*83492791);h=Math.imul(h^h>>>13,1274126177);return((h^h>>>16)>>>0)/4294967296};
// 松樹（受光面較亮）與紅葉樹（紅葉季）
const tree=(cx,cy,k=1)=>`<g transform="translate(${cx} ${cy}) scale(${k})"><rect x="-2" y="-4" width="4" height="9" fill="#5a3b22"/><path d="M0 -36 L13 -15 H-13Z M0 -27 L16 -4 H-16Z" fill="url(#iPine)" stroke="#1d4520" stroke-width="1"/><path d="M0 -36 L-6 -25 L-2 -24Z M0 -27 L-9 -12 L-3 -12Z" fill="#7fbf63" opacity=".8"/></g>`;
const maple=(cx,cy,k=1,c='#d4462c')=>`<g transform="translate(${cx} ${cy}) scale(${k})"><rect x="-2" y="-4" width="4" height="9" fill="#5a3b22"/><circle cx="0" cy="-20" r="13" fill="${c}"/><circle cx="-8" cy="-12" r="9" fill="${c}"/><circle cx="8" cy="-12" r="9" fill="${c}"/><circle cx="-3" cy="-24" r="6" fill="#fff4"/><circle cx="6" cy="-8" r="7" fill="#0002"/></g>`;
const mountain=(cx,cy)=>`<g transform="translate(${cx} ${cy})"><path d="M-42 6 L-8 -54 L6 -32 L18 -44 L46 6Z" fill="url(#iMtnL)"/><path d="M-8 -54 L6 -32 L18 -44 L46 6 L2 6 Z" fill="url(#iMtnD)"/><path d="M-8 -54 L3 -36 L-3 -38 L-12 -33 L-15 -40Z" fill="#fbfbf6"/><path d="M18 -44 L27 -29 L21 -31 L14 -28Z" fill="#e8eef4"/></g>`;
// 軍營（地形代號仍是「城」）：一組營地格的最後面那格畫本陣（陣幕＋大帳＋旗＋篝火），其他格畫小帳篷
const tent=(cx,cy,k=1)=>`<g transform="translate(${cx} ${cy}) scale(${k})"><ellipse cx="0" cy="6" rx="26" ry="9" fill="#0003"/>
<path d="M-24 2 L0 -32 L0 14Z" fill="#f1e8d4" stroke="#6b5a3e" stroke-width=".8"/><path d="M0 14 L0 -32 L24 2Z" fill="#cbbd9e" stroke="#6b5a3e" stroke-width=".8"/>
<path d="M-24 2 L0 14 L24 2 L24 -2 L0 10 L-24 -2Z" fill="#2c3a5a"/><path d="M-6 11 L0 -6 L6 11Z" fill="#3b2a1c"/>
<line x1="0" y1="-32" x2="0" y2="-42" stroke="#4a3626" stroke-width="1.4"/><path d="M0 -42 l9 3 -9 3z" fill="#c8442c"/></g>`;
const honjin=(cx,cy)=>{
  const curtain=(x1,y1,x2,y2)=>`<polygon points="${x1},${y1} ${x2},${y2} ${x2},${y2-16} ${x1},${y1-16}" fill="#f4efe2" stroke="#5b5448" stroke-width=".8"/><polygon points="${x1},${y1-5} ${x2},${y2-5} ${x2},${y2-11} ${x1},${y1-11}" fill="#2c3a5a"/>`+
    [.25,.5,.75].map(t=>`<circle cx="${x1+(x2-x1)*t}" cy="${y1+(y2-y1)*t-8}" r="3.2" fill="#f4efe2" stroke="#2c3a5a" stroke-width="1"/>`).join('')+
    [0,.5,1].map(t=>`<line x1="${x1+(x2-x1)*t}" y1="${y1+(y2-y1)*t+1}" x2="${x1+(x2-x1)*t}" y2="${y1+(y2-y1)*t-19}" stroke="#4a3626" stroke-width="1.6"/>`).join('');
  const nobori=(x,y,c)=>`<line x1="${x}" y1="${y}" x2="${x}" y2="${y-46}" stroke="#3a2a1a" stroke-width="1.6"/><rect x="${x+1}" y="${y-44}" width="9" height="28" fill="${c}"/><rect x="${x+1}" y="${y-44}" width="9" height="4" fill="#fff"/>`;
  return`<g transform="translate(${cx} ${cy})">${curtain(-44,0,0,-22)}${curtain(0,-22,44,0)}
${nobori(-30,-6,'#c8442c')}${nobori(26,-8,'#e3b75a')}
<ellipse cx="0" cy="8" rx="34" ry="11" fill="#0003"/>
<path d="M-32 2 L-20 -26 L20 -26 L32 2 L0 16Z" fill="#f1e8d4" stroke="#6b5a3e"/><path d="M0 16 L32 2 L20 -26 L8 -26Z" fill="#cbbd9e"/>
<path d="M-32 2 L0 16 L32 2 L32 -3 L0 11 L-32 -3Z" fill="#2c3a5a"/><path d="M-20 -26 L20 -26 L14 -34 L-14 -34Z" fill="#8b2a1c" stroke="#5a1a10"/>
<path d="M-7 13 L-5 -6 H5 L7 13Z" fill="#3b2a1c"/>
<g class="fire" transform="translate(-20 20)"><path d="M-6 3 L6 -1 M-6 -1 L6 3" stroke="#5a3b22" stroke-width="2"/><path d="M0 -14 Q6 -6 3 0 Q0 3 -3 0 Q-6 -6 0 -14Z" fill="#ffb03a"/><path d="M0 -8 Q3 -3 1 0 Q0 1 -1 0 Q-3 -3 0 -8Z" fill="#fff2a8"/></g></g>`;
};
// 地塊頂面漸層、側面漸層、細雜訊（整張地圖共用一份 defs）
const TOP2={平:['#9cc85e','#6f9e3c'],林:['#7aab4a','#4f7f31'],山:['#a8ad78','#7c8456'],城:['#c9b58e','#9c8662'],水:['#5aa6d8','#2d6a9e'],橋:['#5aa6d8','#2d6a9e']};
const DEFS=`<defs><filter id="iTurb" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 -.18"/></filter>
<pattern id="iGrain" width="120" height="120" patternUnits="userSpaceOnUse"><rect width="120" height="120" filter="url(#iTurb)"/></pattern>
<linearGradient id="iPine" x1="0" x2="1"><stop offset="0" stop-color="#4f9a48"/><stop offset="1" stop-color="#2a5e2c"/></linearGradient>
<linearGradient id="iMtnL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b3a68c"/><stop offset="1" stop-color="#7d725d"/></linearGradient>
<linearGradient id="iMtnD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#857a66"/><stop offset="1" stop-color="#564d3f"/></linearGradient>
<linearGradient id="iSideL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a643c"/><stop offset="1" stop-color="#3e2a18"/></linearGradient>
<linearGradient id="iSideR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5c3f24"/><stop offset="1" stop-color="#24170d"/></linearGradient>
<radialGradient id="iSel"><stop offset="0" stop-color="#fff3c4" stop-opacity=".9"/><stop offset=".6" stop-color="#e3b75a" stop-opacity=".45"/><stop offset="1" stop-color="#e3b75a" stop-opacity="0"/></radialGradient>`+
Object.entries(TOP2).map(([k,[a,b]])=>`<linearGradient id="iT${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`).join('')+'</defs>';
// mark: Map 'x,y' → 'mv' | 'atk' | 'sel'
export function isoTerrain(T,mark=new Map()){
  const H=T.length,W=T[0].length,{OX,OY}=isoGeom(W,H);
  const isC=(x,y)=>T[y]?.[x]==='城';
  // 本陣畫在每組營地格（地形代號「城」）的後排那格
  const seen=new Set(),keeps=new Set();
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    if(!isC(x,y)||seen.has(x+','+y))continue;
    const grp=[],q=[[x,y]];seen.add(x+','+y);
    while(q.length){const[a,b]=q.pop();grp.push([a,b]);for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const k=(a+dx)+','+(b+dy);if(isC(a+dx,b+dy)&&!seen.has(k)){seen.add(k);q.push([a+dx,b+dy])}}}
    grp.sort((p,q2)=>(p[0]+p[1])-(q2[0]+q2[1])||Math.abs(p[0]-p[1])-Math.abs(q2[0]-q2[1]));
    keeps.add(grp[Math.min(grp.length-1,grp.length>2?1:0)].join(','));
  }
  const cells=[];for(let y=0;y<H;y++)for(let x=0;x<W;x++)cells.push([x,y]);
  cells.sort((a,b)=>(a[0]+a[1])-(b[0]+b[1])||a[0]-b[0]);
  let s=DEFS;
  for(const[x,y]of cells){
    const t=T[y][x],h=LIFT[t]??12,cx=OX+(x-y)*TW/2,cy=OY+(x+y)*TH/2,ty=cy-h;
    const top=`${cx},${ty} ${cx+TW/2},${ty+TH/2} ${cx},${ty+TH} ${cx-TW/2},${ty+TH/2}`;
    const wet=t==='水'||t==='橋';
    s+=`<g class="tl" data-x="${x}" data-y="${y}">`;
    s+=`<polygon points="${cx-TW/2},${ty+TH/2} ${cx},${ty+TH} ${cx},${cy+TH} ${cx-TW/2},${cy+TH/2}" fill="url(#iSideL)"/>`;
    s+=`<polygon points="${cx},${ty+TH} ${cx+TW/2},${ty+TH/2} ${cx+TW/2},${cy+TH/2} ${cx},${cy+TH}" fill="url(#iSideR)"/>`;
    s+=`<polygon points="${top}" fill="url(#iT${TOP2[t]?t:'平'})"/>`;
    if(!wet){
      s+=`<polygon points="${top}" fill="url(#iGrain)" opacity=".5"/>`;
      s+=`<polyline points="${cx-TW/2},${ty+TH/2} ${cx},${ty} ${cx+TW/2},${ty+TH/2}" fill="none" stroke="#fff6" stroke-width="1.2"/>`;
      if(t!=='城'){
        s+=`<polyline points="${cx-TW/2},${ty+TH/2} ${cx},${ty+TH} ${cx+TW/2},${ty+TH/2}" fill="none" stroke="#3d6a26" stroke-width="3"/>`;
        for(let i=0;i<7;i++){const px=cx-TW/2+8+i*12.5,py=ty+TH/2+(i<4?i:7-i)*TH/8+3,l=5+rnd(x,y,i)*4;s+=`<path d="M${px} ${py} l2 ${l} l2 -${l}" fill="#4f8a32"/>`}
      }
    }else{
      s+=`<polyline points="${cx-TW/2},${ty+TH/2} ${cx},${ty} ${cx+TW/2},${ty+TH/2}" fill="none" stroke="#e6f6ff" stroke-width="2" opacity=".6"/>`;
      s+=`<path class="wave" d="M${cx-24} ${ty+TH/2} q6 -4 12 0 t12 0" stroke="#d9f1ff" stroke-width="1.6" fill="none"/><path class="wave b" d="M${cx-2} ${ty+TH/2+9} q6 -4 12 0 t12 0" stroke="#d9f1ff" stroke-width="1.6" fill="none"/>`;
      s+=`<circle class="glint" style="animation-delay:-${(rnd(x,y)*2.4).toFixed(2)}s" cx="${cx+10}" cy="${ty+TH/2-6}" r="2" fill="#fff"/>`;
    }
    if(t==='橋')s+=`<polygon points="${cx-14},${ty+6} ${cx+34},${ty+30} ${cx+14},${ty+42} ${cx-34},${ty+18}" fill="#b98a55" stroke="#5a3b1e"/><path d="M${cx-24} ${ty+13} l48 24 M${cx-30} ${ty+20} l48 24" stroke="#6e4a2a" stroke-width="1.2"/><path d="M${cx-14} ${ty+4} l48 24" stroke="#8b2a1c" stroke-width="3"/>`;
    const m=mark.get(x+','+y);
    if(m)s+=`<polygon class="hl ${m}" points="${top}"/>`;
    if(m==='sel')s+=`<ellipse class="selring" cx="${cx}" cy="${ty+TH/2}" rx="${TW/2-6}" ry="${TH/2-3}" fill="url(#iSel)" stroke="#ffe9a8" stroke-width="2.5"/>`;
    if(t==='林')s+=tree(cx-18,ty+TH/2+2,.9)+maple(cx+16,ty+TH/2-4,.8,rnd(x,y)>.5?'#d4462c':'#e48a2a')+tree(cx,ty+TH/2+12,1);
    if(t==='山')s+=mountain(cx,ty+TH/2+4);
    if(t==='城')s+=keeps.has(x+','+y)?honjin(cx,ty+TH/2):tent(cx+(rnd(x,y)-.5)*16,ty+TH/2+2,.8);
    if(t==='平'&&rnd(x,y,9)<.4){const fx=cx-14+rnd(x,y,3)*28,fy=ty+TH/2-6+rnd(x,y,4)*12;s+=`<circle cx="${fx}" cy="${fy}" r="1.8" fill="#fff"/><circle cx="${fx+6}" cy="${fy+3}" r="1.6" fill="#ffd34a"/><circle cx="${fx-5}" cy="${fy+4}" r="1.6" fill="#f08cb0"/>`}
    // invisible hit area on top so trees and tents don't swallow taps
    s+=`<polygon class="hit" points="${top}" fill="transparent"/></g>`;
  }
  return s;
}
