// 2.5D 斜視角地圖：程式畫的 SVG 地塊（不使用遊戲素材）。
// 每格是一塊有厚度的菱形地塊；山、森林、城、河、橋畫在地塊上，依 x+y 由後往前畫，前面的會遮住後面的。
export const TW=96,TH=48;                       // 菱形的寬、高（SVG 單位）
const LIFT={平:12,林:14,山:16,城:18,水:4,橋:6};    // 地塊厚度（水面較低）
const TOP={平:['#7fae4a','#8fbd55'],林:['#5f9440','#6aa046'],山:['#8a9a5a','#97a865'],城:['#9a8a66','#a89874'],水:['#3d7fb8','#4a8cc4'],橋:['#3d7fb8','#4a8cc4']};
export function isoGeom(W,H){
  const OX=H*TW/2,OY=100;
  const vw=(W+H)*TW/2,vh=OY+(W+H-2)*TH/2+TH+24;
  // 地塊頂面菱形的中心（部隊站的位置）
  const at=(x,y,T)=>{const cx=OX+(x-y)*TW/2,cy=OY+(x+y)*TH/2-(LIFT[T?.[y]?.[x]]??12);return[cx,cy+TH/2]};
  return{OX,OY,vw,vh,at};
}
const tree=(cx,cy,k=1)=>`<g transform="translate(${cx} ${cy}) scale(${k})"><rect x="-2" y="-4" width="4" height="8" fill="#5a3b22"/><path d="M0 -34 L12 -14 H-12Z M0 -26 L15 -4 H-15Z" fill="#2f6a33" stroke="#1d4520" stroke-width="1.2"/><path d="M0 -34 L5 -24 L-3 -22Z" fill="#4f8f45"/></g>`;
const mountain=(cx,cy)=>`<g transform="translate(${cx} ${cy})"><path d="M-40 6 L-8 -50 L6 -30 L18 -42 L44 6Z" fill="#8c8270" stroke="#4d4538" stroke-width="1.5"/><path d="M-8 -50 L6 -30 L18 -42 L44 6 L4 6 Z" fill="#6f6656"/><path d="M-8 -50 L2 -34 L-4 -36 L-12 -32Z" fill="#f4f4f0"/><path d="M18 -42 L26 -28 L20 -30 L14 -27Z" fill="#f4f4f0"/></g>`;
// 天守閣（一組相連的城格只在最後面那格畫）與石垣
const keep=(cx,cy)=>`<g transform="translate(${cx} ${cy})">
<rect x="-22" y="-58" width="44" height="30" fill="#f1ede2" stroke="#5b5448"/><path d="M-32 -56 L0 -72 L32 -56 L22 -54 L0 -64 L-22 -54Z" fill="#2c3a4a"/>
<rect x="-15" y="-86" width="30" height="20" fill="#f1ede2" stroke="#5b5448"/><path d="M-24 -84 L0 -98 L24 -84 L15 -82 L0 -90 L-15 -82Z" fill="#2c3a4a"/>
<rect x="-9" y="-108" width="18" height="16" fill="#f1ede2" stroke="#5b5448"/><path d="M-16 -106 L0 -120 L16 -106Z" fill="#2c3a4a"/><path d="M-3 -122 h6 v4 h-6z" fill="#d9b44a"/>
<path d="M-14 -50 h6 v8 h-6z M8 -50 h6 v8 h-6z M-5 -80 h4 v6 h-4z M3 -80 h4 v6 h-4z" fill="#3b2f25"/></g>`;
const wall=(cx,cy)=>`<g transform="translate(${cx} ${cy})"><path d="M-30 0 L0 -15 L30 0 L0 15Z" fill="#7d7768"/><path d="M-30 0 V-8 L0 -23 V-15Z" fill="#9b9483"/><path d="M30 0 V-8 L0 -23 V-15Z" fill="#857e6e"/><path d="M-30 -8 L0 -23 L30 -8" stroke="#f1ede2" stroke-width="3" fill="none"/></g>`;
// mark: Map 'x,y' → 'mv' | 'atk' | 'sel'
export function isoTerrain(T,mark=new Map()){
  const H=T.length,W=T[0].length,{OX,OY}=isoGeom(W,H);
  const isC=(x,y)=>T[y]?.[x]==='城';
  // the castle keep goes on the back-most tile of each group of 城 tiles
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
  let s='';
  for(const[x,y]of cells){
    const t=T[y][x],h=LIFT[t]??12,cx=OX+(x-y)*TW/2,cy=OY+(x+y)*TH/2,ty=cy-h,[c1,c2]=TOP[t]||TOP.平;
    const top=`${cx},${ty} ${cx+TW/2},${ty+TH/2} ${cx},${ty+TH} ${cx-TW/2},${ty+TH/2}`;
    s+=`<g class="tl" data-x="${x}" data-y="${y}">`;
    s+=`<polygon points="${cx-TW/2},${ty+TH/2} ${cx},${ty+TH} ${cx},${cy+TH} ${cx-TW/2},${cy+TH/2}" fill="#6b4a2e"/>`;
    s+=`<polygon points="${cx},${ty+TH} ${cx+TW/2},${ty+TH/2} ${cx+TW/2},${cy+TH/2} ${cx},${cy+TH}" fill="#4f3621"/>`;
    s+=`<polygon points="${top}" fill="${(x+y)%2?c1:c2}" stroke="#00000033"/>`;
    if(t!=='水'&&t!=='橋')s+=`<polyline points="${cx-TW/2},${ty+TH/2} ${cx},${ty+TH} ${cx+TW/2},${ty+TH/2}" fill="none" stroke="#3d6a26" stroke-width="2"/>`;
    if(t==='水')s+=`<path d="M${cx-20} ${ty+TH/2} q6 -4 12 0 t12 0 M${cx-4} ${ty+TH/2+8} q6 -4 12 0 t12 0" stroke="#bfe0f5" stroke-width="1.6" fill="none"/>`;
    if(t==='橋')s+=`<polygon points="${cx-14},${ty+6} ${cx+34},${ty+30} ${cx+14},${ty+42} ${cx-34},${ty+18}" fill="#a5784a" stroke="#5a3b1e"/><path d="M${cx-24} ${ty+13} l48 24" stroke="#6e4a2a" stroke-width="1.5"/>`;
    const m=mark.get(x+','+y);
    if(m)s+=`<polygon class="hl ${m}" points="${top}"/>`;
    if(t==='林')s+=tree(cx-18,ty+TH/2+2,.9)+tree(cx+16,ty+TH/2-4,.8)+tree(cx,ty+TH/2+12,1);
    if(t==='山')s+=mountain(cx,ty+TH/2+4);
    if(t==='城')s+=keeps.has(x+','+y)?wall(cx,ty+TH/2)+keep(cx,ty+TH/2+2):wall(cx,ty+TH/2);
    if(t==='平'&&(x*7+y*3)%5===0)s+=`<path d="M${cx-8} ${ty+TH/2+2} l3 -6 l3 6 M${cx+10} ${ty+TH/2-6} l3 -6 l3 6" stroke="#5c8f35" stroke-width="1.5" fill="none"/>`;
    // invisible hit area on top so trees and castles don't swallow taps
    s+=`<polygon class="hit" points="${top}" fill="transparent"/></g>`;
  }
  return s;
}
