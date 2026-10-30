// Q版武將：程式畫的 SVG（不使用遊戲素材）。
// 盔甲顏色依勢力、手上武器依兵種、背旗顏色依陣營並寫上名字第一個字；
// 前立（頭盔裝飾）、髮色、眼睛依名字雜湊，同一位武將每次長得一樣。
export const FAC_COL={織田:'#b8473a',豐臣:'#c99a2e',德川:'#3e8a5c',武田:'#a3352f',上杉:'#3d6db8',群雄:'#7b6650'};
export const SIDE_COL=['#3f7fd9','#d24a3a'];
const HAIR=['#2a211c','#3b2a20','#1d1d24','#4a3526','#5a4a42'];
const SKIN=['#f6d6b6','#f1cba6','#f8dcc2'];
function hash(s){let h=2166136261;for(const c of s)h=Math.imul(h^c.codePointAt(0),16777619);return h>>>0}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

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

// g: {n, f(勢力)}; o: {arm, side, boss, flip}
export function chibi(g,o={}){
  const h=hash(g.n),arm=o.arm||'槍',side=o.side||0;
  const ar=FAC_COL[g.f]||'#6a6f7a',hair=HAIR[h%HAIR.length],skin=SKIN[(h>>>3)%SKIN.length];
  const ride=arm==='騎',dy=ride?-12:0;   // rider sits on the horse
  const cr=crest((h>>>5)%5,9+dy),eyes=(h>>>9)%3;
  const ey=31+dy;
  const eye=eyes===0?`<ellipse cx="26.5" cy="${ey}" rx="2.1" ry="2.7" fill="#221a16"/><ellipse cx="37.5" cy="${ey}" rx="2.1" ry="2.7" fill="#221a16"/><circle cx="27.2" cy="${ey-1}" r=".8" fill="#fff"/><circle cx="38.2" cy="${ey-1}" r=".8" fill="#fff"/>`
    :eyes===1?`<path d="M24 ${ey} q2.5 -2.6 5 0" stroke="#221a16" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M35 ${ey} q2.5 -2.6 5 0" stroke="#221a16" stroke-width="1.6" fill="none" stroke-linecap="round"/>`
    :`<path d="M24 ${ey-2} l5 1.2" stroke="#221a16" stroke-width="1.4" stroke-linecap="round"/><path d="M40 ${ey-2} l-5 1.2" stroke="#221a16" stroke-width="1.4" stroke-linecap="round"/><ellipse cx="26.8" cy="${ey+.6}" rx="1.8" ry="2.2" fill="#221a16"/><ellipse cx="37.2" cy="${ey+.6}" rx="1.8" ry="2.2" fill="#221a16"/>`;
  const flagCol=SIDE_COL[side];
  const ch=esc([...g.n][0]||'？');
  const body=`<g>`+
    `<line x1="47" y1="${4+dy}" x2="47" y2="${50+dy}" stroke="#4a3626" stroke-width="1.6"/>`+
    `<rect x="47" y="${4+dy}" width="13" height="19" rx="1" fill="${flagCol}" stroke="${o.boss?'#f2c94c':'#00000055'}" stroke-width="${o.boss?1.6:.8}"/>`+
    `<text x="53.5" y="${17.6+dy}" font-size="10" text-anchor="middle" fill="#fff" font-weight="900" font-family="Noto Serif TC,serif">${ch}</text>`+
    (ride?'':`<rect x="25" y="58" width="5.5" height="9" rx="2" fill="#2c2622"/><rect x="33.5" y="58" width="5.5" height="9" rx="2" fill="#2c2622"/>`)+
    `<path d="M21 ${44+dy} Q32 ${38+dy} 43 ${44+dy} L45 ${60+dy} Q32 ${64+dy} 19 ${60+dy}Z" fill="${ar}" stroke="#00000066" stroke-width=".8"/>`+
    `<path d="M21 ${51+dy} Q32 ${55+dy} 43 ${51+dy}" stroke="#00000040" stroke-width="1.2" fill="none"/><path d="M20.5 ${56+dy} Q32 ${60+dy} 44 ${56+dy}" stroke="#f2c94c" stroke-width="1.3" fill="none"/>`+
    `<ellipse cx="18" cy="${46+dy}" rx="5" ry="4" fill="${ar}" stroke="#00000066" stroke-width=".8"/><ellipse cx="46" cy="${46+dy}" rx="5" ry="4" fill="${ar}" stroke="#00000066" stroke-width=".8"/>`+
    weapon(arm,48+dy)+
    `<circle cx="14" cy="${50+dy}" r="3.2" fill="${skin}" stroke="#00000033" stroke-width=".6"/><circle cx="48" cy="${52+dy}" r="3" fill="${skin}" stroke="#00000033" stroke-width=".6"/>`+
    `<path d="M17 ${30+dy} Q16 ${41+dy} 21 ${42+dy} L43 ${42+dy} Q48 ${41+dy} 47 ${30+dy}Z" fill="${hair}"/>`+
    `<circle cx="32" cy="${29+dy}" r="15" fill="${skin}" stroke="#00000030" stroke-width=".8"/>`+
    eye+
    `<ellipse cx="23" cy="${35.5+dy}" rx="2.6" ry="1.5" fill="#f08c8c" opacity=".55"/><ellipse cx="41" cy="${35.5+dy}" rx="2.6" ry="1.5" fill="#f08c8c" opacity=".55"/>`+
    `<path d="M29.6 ${37+dy} q2.4 1.8 4.8 0" stroke="#7a3b2e" stroke-width="1.2" fill="none" stroke-linecap="round"/>`+
    `<path d="M15.5 ${27+dy} Q16 ${11+dy} 32 ${11+dy} Q48 ${11+dy} 48.5 ${27+dy} Q40 ${21+dy} 32 ${21+dy} Q24 ${21+dy} 15.5 ${27+dy}Z" fill="#2e2a2c" stroke="#000" stroke-width=".6"/>`+
    `<path d="M15.5 ${27+dy} L11 ${30+dy} L15 ${22+dy}Z M48.5 ${27+dy} L53 ${30+dy} L49 ${22+dy}Z" fill="${ar}" stroke="#00000066" stroke-width=".6"/>`+
    `<path d="M20 ${20.5+dy} Q32 ${16+dy} 44 ${20.5+dy}" stroke="#f2c94c" stroke-width="1.2" fill="none"/>`+
    cr+`</g>`;
  return`<svg viewBox="0 -10 64 82" class="chibi${o.flip?' flip':''}" aria-hidden="true">`+
    `<ellipse cx="33" cy="69" rx="${ride?21:15}" ry="3" fill="#000" opacity=".32"/>`+
    (ride?horse(['#7a4e2d','#5b3a24','#8d6a4a','#3a2c24'][(h>>>12)%4]):'')+body+`</svg>`;
}
