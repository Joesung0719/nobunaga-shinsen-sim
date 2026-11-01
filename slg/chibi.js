// Q版武將：程式畫的 SVG（不使用遊戲素材）。
// 盔甲顏色依勢力、手上武器依兵種、背旗顏色依陣營並畫上勢力家紋（自繪簡化版）；
// 前立（頭盔裝飾）、髮色、眼睛依名字雜湊，同一位武將每次長得一樣。
export const FAC_COL={織田:'#b8473a',豐臣:'#c99a2e',德川:'#3e8a5c',武田:'#a3352f',上杉:'#3d6db8',群雄:'#7b6650'};
export const SIDE_COL=['#3f7fd9','#d24a3a'];
const HAIR=['#2a211c','#3b2a20','#1d1d24','#4a3526','#5a4a42'];
const SKIN=['#f6d6b6','#f1cba6','#f8dcc2'];
function hash(s){let h=2166136261;for(const c of s)h=Math.imul(h^c.codePointAt(0),16777619);return h>>>0}

// 勢力家紋（簡化自繪，畫在以 0,0 為中心、半徑約 5 的範圍）
const KAMON={
  織田:bg=>[0,72,144,216,288].map(a=>`<circle cx="${(2.6*Math.sin(a*Math.PI/180)).toFixed(2)}" cy="${(-2.6*Math.cos(a*Math.PI/180)).toFixed(2)}" r="2.3"/>`).join('')+`<circle r="1.6" fill="${bg}"/><circle r=".8"/>`,   // 木瓜
  豐臣:()=>`<path d="M0 4.6 Q-4.8 3.4 -4.6 -.4 Q-2 1.2 0 4.6Z M0 4.6 Q4.8 3.4 4.6 -.4 Q2 1.2 0 4.6Z M0 4.6 Q-1.4 1 0 -.8 Q1.4 1 0 4.6Z"/>`+
    [[-3,-1.8],[0,-2.8],[3,-1.8]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r=".9"/><circle cx="${x}" cy="${y-1.9}" r=".8"/><circle cx="${x}" cy="${y-3.6}" r=".65"/>`).join(''),   // 桐
  德川:()=>`<circle r="4.9" fill="none" stroke-width="1"/>`+[0,120,240].map(a=>`<path transform="rotate(${a})" d="M0 0 Q-2.6 -1.2 -1.8 -3.4 Q-.9 -4.3 0 -3.3 Q.9 -4.3 1.8 -3.4 Q2.6 -1.2 0 0Z"/>`).join(''),   // 三葉葵
  武田:()=>[[0,-2.3],[-2.3,0],[2.3,0],[0,2.3]].map(([x,y])=>`<path d="M${x} ${y-2} L${x+2} ${y} L${x} ${y+2} L${x-2} ${y}Z"/>`).join(''),   // 武田菱
  上杉:()=>`<circle r="4.6" fill="none" stroke-width="1"/><path d="M-3 2.6 Q0 -4.4 3 2.6" fill="none" stroke-width=".9"/><path d="M-2.4 -2 l1.2 1 M2.4 -2 l-1.2 1" stroke-width=".8"/><ellipse cx="0" cy="1.2" rx="1.5" ry="1.1"/><circle cx="-.9" cy=".3" r=".7"/>`,   // 竹に雀（簡化）
  群雄:()=>`<circle r="4.7" fill="none" stroke-width="1.1"/><rect x="-3.4" y="-.75" width="6.8" height="1.5"/>`,   // 丸に一
};
export const kamonSvg=(f,cx,cy,scale=1,col='#fff',bg='#000')=>`<g transform="translate(${cx} ${cy}) scale(${scale})" fill="${col}" stroke="${col}" stroke-width="0">${(KAMON[f]||KAMON.群雄)(bg)}</g>`;

function crest(k,y){   // 前立
  switch(k){
    case 0:return`<path d="M24 ${y} Q32 ${y+7} 40 ${y} Q32 ${y+3.5} 24 ${y}Z" fill="#f2c94c" stroke="#8a6a1a" stroke-width=".6"/>`;   // 新月
    case 1:return`<path d="M31 ${y+4} L23 ${y-7} L26 ${y-7} L32 ${y+1} L38 ${y-7} L41 ${y-7} L33 ${y+4}Z" fill="#f2c94c" stroke="#8a6a1a" stroke-width=".6"/>`;   // 鍬形
    case 2:return`<circle cx="32" cy="${y-2}" r="4.2" fill="#f2c94c" stroke="#8a6a1a" stroke-width=".6"/><circle cx="32" cy="${y-2}" r="2" fill="#c8442c"/>`;   // 日輪
    case 3:return`<path d="M32 ${y-9} L35 ${y+2} L29 ${y+2}Z" fill="#f2c94c" stroke="#8a6a1a" stroke-width=".6"/>`;   // 劍形
    default:return`<path d="M27 ${y+1} Q32 ${y-8} 37 ${y+1}Z" fill="#e8e1d1" stroke="#7d7462" stroke-width=".6"/>`;   // 立物
  }
}
function weapon(arm,hy){
  switch(arm){
    case'槍':return`<line x1="13" y1="${hy+18}" x2="13" y2="${hy-30}" stroke="#7a5230" stroke-width="2.2" stroke-linecap="round"/><path d="M13 ${hy-38} L15.6 ${hy-30} L10.4 ${hy-30}Z" fill="#d9dee6" stroke="#6b7480" stroke-width=".6"/>`;
    case'騎':return`<line x1="12" y1="${hy+14}" x2="15" y2="${hy-30}" stroke="#7a5230" stroke-width="2.2" stroke-linecap="round"/><path d="M15.5 ${hy-38} L17.6 ${hy-30} L12.6 ${hy-30.4}Z" fill="#d9dee6" stroke="#6b7480" stroke-width=".6"/><path d="M15 ${hy-28} l6 3 -6 3z" fill="#e8e1d1"/>`;
    case'弓':return`<path d="M15 ${hy-26} Q4 ${hy-4} 15 ${hy+18}" fill="none" stroke="#6b3d1f" stroke-width="2.4" stroke-linecap="round"/><line x1="15" y1="${hy-26}" x2="15" y2="${hy+18}" stroke="#eee" stroke-width=".7"/>`;
    case'鐵炮':return`<g transform="rotate(-38 14 ${hy})"><rect x="2" y="${hy-2}" width="30" height="3.2" rx="1" fill="#3a3a40"/><rect x="0" y="${hy-2.6}" width="9" height="5" rx="1.5" fill="#7a5230"/></g>`;
    case'器械':return`<line x1="13" y1="${hy+14}" x2="13" y2="${hy-18}" stroke="#7a5230" stroke-width="2.4" stroke-linecap="round"/><rect x="6" y="${hy-26}" width="14" height="9" rx="2" fill="#6b7480" stroke="#3b4048" stroke-width=".8"/>`;
    default:return'';
  }
}
function horse(c){
  return`<g><ellipse cx="33" cy="58" rx="19" ry="8.5" fill="${c}"/><path d="M47 56 Q55 48 54 40 L59 41 Q61 50 52 60Z" fill="${c}"/><ellipse cx="56.5" cy="40.5" rx="4.5" ry="3" fill="${c}"/>`+
    `<path d="M50 41 Q53 36 56 38" stroke="#2a1d14" stroke-width="2" fill="none"/>`+
    [18,24,40,46].map(x=>`<rect x="${x}" y="62" width="3.2" height="8" rx="1.2" fill="${c}"/><rect x="${x}" y="68.5" width="3.2" height="2" fill="#2a1d14"/>`).join('')+
    `<path d="M14 55 Q7 58 9 66" stroke="#2a1d14" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M24 52 h20 v6 h-20z" fill="#7d2b25" opacity=".9"/></g>`;
}

// ---- 名將特徵：外觀固定的武將（髮色、盔甲色、頭盔、前立、鬍鬚、披風…），沒列到的武將依名字雜湊產生 ----
// helm: kabuto 兜（預設）／jin 陣笠／eboshi 烏帽子／hood 頭巾／none 不戴（髮髻或長髮）
// crest: moon 新月／kuwa 鍬形／sun 日輪／sword 劍／horn 金角／gourd 千成瓢簞／lion 白獅子毛／fan 軍扇／tall 立物
// beard: moustache 鬍子／full 大鬍子／thin 細鬍；eye: round／smile／fierce／calm／sly；
const SPEC={
  織田信長:{helm:'none',hair:'#1d1d24',armor:'#2b2b33',trim:'#c8442c',cape:'#8b1d18',eye:'fierce',beard:'thin',crest:null,topknot:1,ponytail:1},
  明智光秀:{helm:'kabuto',armor:'#3d6db8',trim:'#d8e3f4',crest:'kuwa',eye:'calm',skin:'#f6d6b6',hair:'#2a211c'},
  豐臣秀吉:{helm:'kabuto',armor:'#c99a2e',trim:'#8a1c14',crest:'gourd',eye:'smile',beard:'thin',cape:'#a02a1c',hair:'#4a3526',skin:'#e9bd92'},
  德川家康:{helm:'kabuto',armor:'#3e8a5c',trim:'#e8d36a',crest:'tall',eye:'calm',round:1,hair:'#2a211c'},
  武田信玄:{helm:'kabuto',armor:'#a3352f',trim:'#f2c94c',crest:'lion',eye:'fierce',beard:'full',hair:'#e8e8ea',cape:'#f2efe6'},
  上杉謙信:{helm:'hood',armor:'#3d6db8',trim:'#fff',crest:null,eye:'calm',hair:'#2a211c',hoodCol:'#f4f1e8',cape:'#f4f1e8'},
  柴田勝家:{helm:'kabuto',armor:'#8b2a1c',trim:'#d9dee6',crest:'horn',eye:'fierce',beard:'full',hair:'#3b2a20'},
  松永久秀:{helm:'none',armor:'#5a4a7a',trim:'#e8c85a',crest:null,eye:'sly',beard:'moustache',hair:'#cfcfd6',old:1,topknot:1},
  今川義元:{helm:'eboshi',armor:'#7b5a8a',trim:'#e8c85a',eye:'calm',skin:'#fbeee0',hair:'#1d1d24',brow:1,round:1},
  淺井長政:{helm:'kabuto',armor:'#2f5aa8',trim:'#e8e1d1',crest:'moon',eye:'round',hair:'#2a211c'},
  朝倉義景:{helm:'eboshi',armor:'#5a6a7a',trim:'#d8d0b0',eye:'calm',skin:'#fbeee0',hair:'#1d1d24',brow:1},
  前田利家:{helm:'kabuto',armor:'#b8473a',trim:'#f2c94c',crest:'sword',eye:'round',hair:'#3b2a20',cape:'#c8442c'},
  馬場信春:{helm:'kabuto',armor:'#a3352f',trim:'#d9dee6',crest:'lion',eye:'calm',beard:'moustache',hair:'#cfcfd6',old:1},
  山縣昌景:{helm:'kabuto',armor:'#c0392b',trim:'#f2c94c',crest:'horn',eye:'fierce',beard:'moustache',hair:'#2a211c'},
  內藤昌豐:{helm:'kabuto',armor:'#a3352f',trim:'#e8e1d1',crest:'lion',eye:'calm',hair:'#4a3526'},
  本多忠勝:{helm:'kabuto',armor:'#2c2c33',trim:'#d4a82a',crest:'horn',eye:'fierce',beard:'moustache',hair:'#2a211c'},
  黑田官兵衛:{helm:'jin',armor:'#4a5a6a',trim:'#e8e1d1',eye:'sly',hair:'#2a211c'},
  竹中半兵衛:{helm:'none',armor:'#8aa0b8',trim:'#fff',eye:'calm',hair:'#2a211c',topknot:1,skin:'#fbeee0'},
  荒木村重:{helm:'kabuto',armor:'#5a4a42',trim:'#c8a64a',crest:'fan',eye:'sly',hair:'#2a211c'},
  佐久間信盛:{helm:'kabuto',armor:'#b8473a',trim:'#d9dee6',eye:'round',beard:'full',hair:'#4a3526'},
  本願寺顯如:{helm:'hood',armor:'#6a5a3a',trim:'#e8c85a',eye:'calm',hair:'#2a211c',hoodCol:'#e8e1d1'},
  森可成:{helm:'kabuto',armor:'#b8473a',trim:'#f2c94c',crest:'sword',eye:'fierce',beard:'moustache',hair:'#2a211c'},
  毛利輝元:{helm:'kabuto',armor:'#3f6a4a',trim:'#e8e1d1',crest:'moon',eye:'calm',hair:'#2a211c'},
  歸蝶:{female:1,helm:'none',armor:'#8a4a7a',trim:'#f4d7e8',eye:'calm',hair:'#1d1d24',skin:'#fbeee0'},
  阿市:{female:1,helm:'none',armor:'#c0508a',trim:'#fbe8f0',eye:'round',hair:'#2a211c',skin:'#fbeee0'},
  寧寧:{female:1,helm:'none',armor:'#d49a3a',trim:'#fbe8c8',eye:'smile',hair:'#4a3526',skin:'#f8dcc2'},
  妻木熙子:{female:1,helm:'none',armor:'#3d6db8',trim:'#e8f0fb',eye:'calm',hair:'#1d1d24',skin:'#fbeee0'},
};
const lerpHex=(a,b,t)=>{const A=[1,3,5].map(i=>parseInt(a.slice(i,i+2),16)),B=[1,3,5].map(i=>parseInt(b.slice(i,i+2),16));return'#'+A.map((v,i)=>Math.round(v+(B[i]-v)*t).toString(16).padStart(2,'0')).join('')};
const lite=c=>lerpHex(c,'#ffffff',.28),dark=c=>lerpHex(c,'#000000',.38);
const gid=c=>c.slice(1);
function crestOf(k,y,col){
  const G='#f2c94c',S='#8a6a1a';
  switch(k){
    case'gourd':return`<g transform="translate(0 ${y-2})"><path d="M32 -8 q3 -6 7 -4" stroke="#3a2a1a" stroke-width="1.2" fill="none"/><circle cx="32" cy="-4" r="4.4" fill="${G}" stroke="${S}" stroke-width=".7"/><circle cx="32" cy="3.5" r="6" fill="${G}" stroke="${S}" stroke-width=".7"/><path d="M28 -.2 h8" stroke="#c8442c" stroke-width="1.2"/></g>`;
    case'lion':return`<path d="M17 ${y+3} Q16 ${y-5} 22 ${y-7} Q24 ${y-2} 28 ${y-5} Q32 ${y-11} 36 ${y-5} Q40 ${y-2} 42 ${y-7} Q48 ${y-5} 47 ${y+3} Q40 ${y-1} 32 ${y} Q24 ${y-1} 17 ${y+3}Z" fill="#f4f1e8" stroke="#a89f88" stroke-width=".7"/><path d="M24 ${y-1} q3 -4 5 -1 M35 ${y-2} q3 -3 5 1" stroke="#c9c1ac" fill="none" stroke-width=".8"/>`;
    case'horn':return`<path d="M24 ${y+3} Q14 ${y-3} 12 ${y-14} Q20 ${y-8} 27 ${y} Z M40 ${y+3} Q50 ${y-3} 52 ${y-14} Q44 ${y-8} 37 ${y}Z" fill="${G}" stroke="${S}" stroke-width=".7"/>`;
    case'kuwa':return`<path d="M32 ${y+5} L22 ${y-9} L25.5 ${y-9} L32 ${y+0} L38.5 ${y-9} L42 ${y-9}Z" fill="${G}" stroke="${S}" stroke-width=".7"/>`;
    case'fan':return`<path d="M32 ${y+4} L21 ${y-8} Q32 ${y-14} 43 ${y-8}Z" fill="#e8e1d1" stroke="#7d7462" stroke-width=".7"/><circle cx="32" cy="${y-5}" r="2.2" fill="#c8442c"/>`;
    case'tall':return`<path d="M32 ${y+3} q-5 -4 -2 -10 q2 3 2 5 q0 -4 2 -7 q4 6 -2 12Z" fill="${G}" stroke="${S}" stroke-width=".7"/>`;
    case'sword':return`<path d="M32 ${y-5} L34.6 ${y+3} L29.4 ${y+3}Z" fill="${G}" stroke="${S}" stroke-width=".6"/>`;
    default:return crest(['moon','kuwa','sun','sword','x'].indexOf(k),y);
  }
}
// g: {n, f(勢力)}; o: {arm, side, boss, flip}
let UID=0;   // 漸層 id 每隻武將獨立：同一頁有很多 SVG，id 重複時若第一個在隱藏區塊，後面的漸層會失效變全黑
export function chibi(g,o={}){
  const uid=++UID,h=hash(g.n),sp=SPEC[g.n]||{},arm=o.arm||'槍',side=o.side||0;
  const ar=sp.armor||FAC_COL[g.f]||'#6a6f7a',trim=sp.trim||'#f2c94c',hair=sp.hair||HAIR[h%HAIR.length],skin=sp.skin||SKIN[(h>>>3)%SKIN.length];
  const ride=arm==='騎',dy=ride?-12:0,ey=31+dy,fem=!!sp.female;
  const helm=sp.helm||(fem?'none':['kabuto','kabuto','kabuto','jin'][(h>>>14)%4]);
  const crestK=sp.crest!==undefined?sp.crest:['moon','kuwa','sun','sword','x'][(h>>>5)%5];   // 前立最高不超過 viewBox 上緣
  const eyeK=sp.eye||['round','smile','fierce'][(h>>>9)%3];
  const ink='#221a16',aL=lite(ar),aD=dark(ar),aid='a'+uid,sid='s'+uid,hid='h'+uid;
  const defs=`<defs><linearGradient id="${aid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${aL}"/><stop offset=".55" stop-color="${ar}"/><stop offset="1" stop-color="${aD}"/></linearGradient>`+
    `<radialGradient id="${sid}" cx=".38" cy=".3" r=".85"><stop offset="0" stop-color="${lerpHex(skin,'#ffffff',.35)}"/><stop offset=".6" stop-color="${skin}"/><stop offset="1" stop-color="${lerpHex(skin,'#a8643c',.45)}"/></radialGradient>`+
    `<linearGradient id="${hid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5a5e6a"/><stop offset=".5" stop-color="#2e2a2c"/><stop offset="1" stop-color="#15131a"/></linearGradient></defs>`;
  const E=(x,w=2.1,hh=2.7)=>`<ellipse cx="${x}" cy="${ey}" rx="${w}" ry="${hh}" fill="${ink}"/><circle cx="${x+.7}" cy="${ey-1}" r=".85" fill="#fff"/>`;
  const eye={
    round:E(26.5)+E(37.5),
    smile:`<path d="M24 ${ey} q2.5 -2.8 5 0 M35 ${ey} q2.5 -2.8 5 0" stroke="${ink}" stroke-width="1.7" fill="none" stroke-linecap="round"/>`,
    fierce:`<path d="M23.5 ${ey-2.4} l5.5 1.5 M40.5 ${ey-2.4} l-5.5 1.5" stroke="${ink}" stroke-width="1.6" stroke-linecap="round"/><ellipse cx="26.8" cy="${ey+.6}" rx="1.8" ry="2.1" fill="${ink}"/><ellipse cx="37.2" cy="${ey+.6}" rx="1.8" ry="2.1" fill="${ink}"/>`,
    calm:`<path d="M23.5 ${ey+.6} q3 -3.4 6 0 M34.5 ${ey+.6} q3 -3.4 6 0" stroke="${ink}" stroke-width="1.5" fill="none" stroke-linecap="round"/><ellipse cx="26.5" cy="${ey+.4}" rx="1.4" ry="1.1" fill="${ink}"/><ellipse cx="37.5" cy="${ey+.4}" rx="1.4" ry="1.1" fill="${ink}"/>`,
    sly:`<path d="M23.5 ${ey-1.6} l5.5 .6 M40.5 ${ey-1.6} l-5.5 .6" stroke="${ink}" stroke-width="1.3" stroke-linecap="round"/><path d="M24 ${ey+1} q2.6 -2.6 5.2 0 M34.8 ${ey+1} q2.6 -2.6 5.2 0" stroke="${ink}" stroke-width="1.7" fill="none" stroke-linecap="round"/>`,
  }[eyeK]||'';
  const mouth=eyeK==='fierce'?`<path d="M29.4 ${38+dy} q2.6 -1.4 5.2 0" stroke="#7a3b2e" stroke-width="1.3" fill="none" stroke-linecap="round"/>`:`<path d="M29.6 ${37+dy} q2.4 1.8 4.8 0" stroke="#7a3b2e" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;
  const bd=sp.beard==='full'?`<path d="M19 ${33+dy} Q20 ${47+dy} 32 ${48+dy} Q44 ${47+dy} 45 ${33+dy} Q40 ${41+dy} 32 ${41+dy} Q24 ${41+dy} 19 ${33+dy}Z" fill="${hair}"/>`
    :sp.beard==='moustache'?`<path d="M24 ${36+dy} Q28 ${34+dy} 32 ${36+dy} Q36 ${34+dy} 40 ${36+dy} Q36 ${39.5+dy} 32 ${37.5+dy} Q28 ${39.5+dy} 24 ${36+dy}Z" fill="${hair}"/>`
    :sp.beard==='thin'?`<path d="M26 ${36.5+dy} q6 -2.6 12 0" stroke="${hair}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`:'';
  const brow=sp.brow?`<ellipse cx="26.5" cy="${ey-6}" rx="2.4" ry="1.1" fill="#221a16"/><ellipse cx="37.5" cy="${ey-6}" rx="2.4" ry="1.1" fill="#221a16"/>`:'';
  const faceR=sp.round?15.8:15;
  // 披風（畫在身體後面）
  const cape=sp.cape?`<path d="M19 ${44+dy} Q12 ${58+dy} 16 ${72+dy} L48 ${72+dy} Q52 ${58+dy} 45 ${44+dy}Z" fill="${sp.cape}" stroke="#00000055" stroke-width=".8"/><path d="M24 ${50+dy} Q22 ${62+dy} 24 ${72+dy} M40 ${50+dy} Q42 ${62+dy} 40 ${72+dy}" stroke="#00000030" stroke-width="1" fill="none"/>`:'';
  const flagCol=SIDE_COL[side];
  // 軀幹：漸層、縅（編繩）橫紋、胴丸、草摺
  const torso=`<path d="M21 ${44+dy} Q32 ${38+dy} 43 ${44+dy} L45 ${60+dy} Q32 ${64+dy} 19 ${60+dy}Z" fill="url(#${aid})" stroke="#00000070" stroke-width=".9"/>`+
    [47,51,55].map(yy=>`<path d="M21 ${yy+dy} Q32 ${yy+3.5+dy} 43 ${yy+dy}" stroke="${aD}" stroke-width=".9" fill="none" opacity=".75"/>`).join('')+
    `<path d="M26 ${42+dy} L32 ${52+dy} L38 ${42+dy}" stroke="${trim}" stroke-width="1.3" fill="none"/>`+
    `<path d="M20 ${58+dy} Q32 ${62+dy} 44 ${58+dy}" stroke="${trim}" stroke-width="1.5" fill="none"/>`+
    [20.5,26.5,32.5,38.5].map(x=>`<path d="M${x} ${59.5+dy} h5.2 l-.6 5 h-4Z" fill="url(#${aid})" stroke="#00000066" stroke-width=".6"/>`).join('')+
    `<path d="M24 ${43+dy} Q32 ${40+dy} 40 ${43+dy}" stroke="#fff" stroke-opacity=".35" stroke-width="1" fill="none"/>`;
  const shoulder=x=>`<ellipse cx="${x}" cy="${46+dy}" rx="5.6" ry="4.4" fill="url(#${aid})" stroke="#00000070" stroke-width=".9"/><path d="M${x-4.5} ${46.4+dy} h9 M${x-4} ${48+dy} h8" stroke="${trim}" stroke-width=".8" opacity=".9"/>`;
  // 頭髮與頭盔
  const hairBack=fem?`<path d="M15 ${28+dy} Q13 ${40+dy} 19 ${50+dy} L45 ${50+dy} Q51 ${40+dy} 49 ${28+dy}Z" fill="${hair}" stroke="#00000030" stroke-width=".7"/>`
    :`<path d="M17 ${30+dy} Q16 ${41+dy} 21 ${42+dy} L43 ${42+dy} Q48 ${41+dy} 47 ${30+dy}Z" fill="${hair}"/>`;
  let top='';
  if(helm==='kabuto'){
    top=`<path d="M15.5 ${27+dy} Q16 ${10+dy} 32 ${10+dy} Q48 ${10+dy} 48.5 ${27+dy} Q40 ${21+dy} 32 ${21+dy} Q24 ${21+dy} 15.5 ${27+dy}Z" fill="url(#${hid})" stroke="#000" stroke-width=".7"/>`+
      `<path d="M16 ${27.5+dy} Q10 ${31+dy} 11.5 ${37+dy} Q16 ${35+dy} 17.5 ${30+dy}Z M48 ${27.5+dy} Q54 ${31+dy} 52.5 ${37+dy} Q48 ${35+dy} 46.5 ${30+dy}Z" fill="${ar}" stroke="#00000070" stroke-width=".7"/>`+
      `<path d="M20 ${20.4+dy} Q32 ${15.5+dy} 44 ${20.4+dy}" stroke="${trim}" stroke-width="1.4" fill="none"/><path d="M21 ${14+dy} Q28 ${11+dy} 35 ${12+dy}" stroke="#fff" stroke-opacity=".5" stroke-width="1.2" fill="none"/>`+
      (crestK?crestOf(crestK,9+dy):'');
  }else if(helm==='jin'){
    top=`<path d="M10 ${23+dy} Q32 ${6+dy} 54 ${23+dy} Q32 ${27+dy} 10 ${23+dy}Z" fill="url(#${hid})" stroke="#000" stroke-width=".7"/><path d="M18 ${20+dy} Q32 ${12+dy} 46 ${20+dy}" stroke="#fff" stroke-opacity=".45" stroke-width="1.2" fill="none"/><circle cx="32" cy="${14+dy}" r="1.6" fill="${trim}"/>`;
  }else if(helm==='eboshi'){
    top=`<path d="M19 ${22+dy} Q22 ${8+dy} 34 ${0+dy} Q42 ${8+dy} 45 ${22+dy} Q32 ${18+dy} 19 ${22+dy}Z" fill="#1d1a22" stroke="#000" stroke-width=".7"/><path d="M26 ${10+dy} Q33 ${5+dy} 38 ${12+dy}" stroke="#fff" stroke-opacity=".3" stroke-width="1" fill="none"/><path d="M45 ${21+dy} q8 3 7 14" stroke="#1d1a22" stroke-width="2" fill="none"/>`;
  }else if(helm==='hood'){
    const hc=sp.hoodCol||'#f4f1e8';
    top=`<path d="M14 ${30+dy} Q13 ${9+dy} 32 ${9+dy} Q51 ${9+dy} 50 ${30+dy} Q50 ${40+dy} 45 ${43+dy} L45 ${33+dy} Q32 ${20+dy} 19 ${33+dy} L19 ${43+dy} Q14 ${40+dy} 14 ${30+dy}Z" fill="${hc}" stroke="#9a937f" stroke-width=".8"/><path d="M19 ${24+dy} Q32 ${17+dy} 45 ${24+dy}" stroke="#c8442c" stroke-width="1.3" fill="none"/>`;
  }else{  // none：髮髻／長髮
    top=fem?`<path d="M15.5 ${28+dy} Q15 ${10+dy} 32 ${10+dy} Q49 ${10+dy} 48.5 ${28+dy} Q42 ${19+dy} 32 ${19+dy} Q22 ${19+dy} 15.5 ${28+dy}Z" fill="${hair}"/><path d="M22 ${14+dy} Q30 ${11+dy} 38 ${13+dy}" stroke="#fff" stroke-opacity=".28" stroke-width="1.4" fill="none"/><circle cx="46" cy="${17+dy}" r="3.2" fill="${trim}" stroke="#8a6a1a" stroke-width=".5"/><path d="M45 ${19+dy} q6 3 4 12" stroke="${trim}" stroke-width="1.6" fill="none"/>`
      :`<path d="M15.5 ${28+dy} Q15 ${10+dy} 32 ${10+dy} Q49 ${10+dy} 48.5 ${28+dy} Q41 ${20+dy} 32 ${20+dy} Q23 ${20+dy} 15.5 ${28+dy}Z" fill="${hair}"/><path d="M22 ${14+dy} Q30 ${11+dy} 38 ${13+dy}" stroke="#fff" stroke-opacity=".28" stroke-width="1.4" fill="none"/>`+
        (sp.topknot?`<path d="M30 ${11+dy} Q32 ${1+dy} 38 ${3+dy} Q36 ${8+dy} 34 ${11+dy}Z" fill="${hair}"/><rect x="32" y="${8+dy}" width="3" height="2" fill="${trim}"/>`:'')+
        (sp.ponytail?`<path d="M47 ${20+dy} Q58 ${22+dy} 56 ${38+dy} Q52 ${30+dy} 46 ${27+dy}Z" fill="${hair}"/>`:'');
  }
  const body=`<g>`+cape+
    `<line x1="47" y1="${4+dy}" x2="47" y2="${50+dy}" stroke="#4a3626" stroke-width="1.6"/>`+
    `<rect x="47" y="${4+dy}" width="13" height="19" rx="1" fill="${flagCol}" stroke="${o.boss?'#f2c94c':'#00000055'}" stroke-width="${o.boss?1.6:.8}"/>`+
    kamonSvg(g.f,53.5,13.5+dy,1.08,'#fff',flagCol)+
    (ride?'':`<rect x="25" y="58" width="5.5" height="9" rx="2" fill="#2c2622"/><rect x="33.5" y="58" width="5.5" height="9" rx="2" fill="#2c2622"/><rect x="24" y="65" width="7.5" height="3" rx="1.4" fill="#4a3626"/><rect x="32.5" y="65" width="7.5" height="3" rx="1.4" fill="#4a3626"/>`)+
    torso+shoulder(18)+shoulder(46)+weapon(arm,48+dy)+
    `<circle cx="14" cy="${50+dy}" r="3.2" fill="${skin}" stroke="#00000033" stroke-width=".6"/><circle cx="48" cy="${52+dy}" r="3" fill="${skin}" stroke="#00000033" stroke-width=".6"/>`+
    hairBack+
    `<circle cx="32" cy="${29+dy}" r="${faceR}" fill="url(#${sid})" stroke="#00000038" stroke-width=".9"/>`+
    (sp.old?`<path d="M22 ${27+dy} q2 1 4 0 M38 ${27+dy} q2 1 4 0" stroke="#00000030" stroke-width=".6" fill="none"/>`:'')+
    eye+brow+
    `<ellipse cx="23" cy="${35.5+dy}" rx="2.6" ry="1.5" fill="#f08c8c" opacity="${fem?.7:.5}"/><ellipse cx="41" cy="${35.5+dy}" rx="2.6" ry="1.5" fill="#f08c8c" opacity="${fem?.7:.5}"/>`+
    `<path d="M32.4 ${33+dy} q.9 1.4 -.3 2" stroke="#b9805c" stroke-width=".7" fill="none"/>`+
    mouth+bd+top+`</g>`;
  return`<svg viewBox="0 -10 64 82" class="chibi${o.flip?' flip':''}" aria-hidden="true">${defs}`+
    `<ellipse cx="33" cy="69" rx="${ride?21:15}" ry="3" fill="#000" opacity=".32"/>`+
    (ride?horse(['#7a4e2d','#5b3a24','#8d6a4a','#3a2c24'][(h>>>12)%4]):'')+body+`</svg>`;
}
