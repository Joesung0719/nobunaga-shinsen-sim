// 組隊共用：戰法使用規則（數量）與「推薦戰法」評估。瀏覽器與 node 都能用（不碰 fs）。
//
// 戰法規則（Joe 2026-11-20）：每個可傳授戰法有「數量」，一份只能裝在一位武將身上，同隊最多用到「數量」個人。
// 庫存：百煉成鋼、奮鬥 2，B 級 3，其餘 1，跨隊共用（reserved 參數＝其他隊已用掉的份數）。
// 固有戰法只有該武將自己有，不能傳授。這裡的數量 = D.teach 裡「以這招當傳授戰法的武將」人數。
//
// 2026-11-21 依 Joe 的四個配將觀念＋官方「大名錄」148 組編制（official.json）重做：
//   1. 先看武將自身能力、特性、自帶兵種，再選戰法（戰法受哪項屬性影響、傷害類型、自帶戰法連動、兵種技要符合兵種）；
//   2. 同勢力（吃協力）或三個不同勢力配合盟之陣（提高大將自帶主動／突擊的發動率），兩者都不是就扣分；
//   3. 謀將（智略型）與女性武將通常帶補血、輔助戰法；武勇型帶突擊／連擊／增傷；
//   4. 輔助戰法的優先序：提高戰法發動率 > 減傷 > 增傷 > 增加能力（補血另計，謀將／女性優先）。
//   另外有「官方編制先驗」：這位武將／這個戰法在官方編制出現的頻率，只輕微加權（回測時會排除同一組三人，避免作弊）。
// 推薦戰法（全部是推估，不是遊戲官方算法）：
//   基礎分 = 用戰鬥引擎模擬出來的「這招裝在武勇型／智略型武將身上平均多贏多少兵力」（skillpower.json，tools/skill-power.mjs 產生，
//            已含發動機率、傷害率、目標數、控制、增益）；
//   再依這一隊調整：干擾（控制狀態隊內補位、同種重複打折、快手優先）、受哪項屬性影響（本隊該屬性最高者加成）、
//   勢力／一門（來源武將同勢力、同標籤略加分）、等級紅度（紅度低偏好發動率高、不用準備；紅度高才吃準備型）。
import {parseSkill,innateOf} from './engine.js?v=59';
import {facsOf as facsOfR,facTypeOf,armTraits,bossText,FEMALE as FEMALE_R,ARM_NAME} from './rules.js?v=2';

// 權重（2026-11-21）：基礎分是模擬強度，其餘是官方大名錄編制校正的倍率。校正方式：用官方 123 隊的偶數號隊伍座標下降調整、奇數號隊伍檢驗（留出測試），
// 命中率 規則版 7.9%→17.8%、含官方先驗 28%→36%（留出測試半邊平均 19.7%→23.5%，訓練半邊 30.5%，有過擬合，數字只當參考）。
export const TU={b0:.35,bm:1.2,bd:.2,heal:1.22,healNone:1.4,pGS:2,pS:.3,
  cat:{兵種:.6,連擊:1.25,主動謀略傷害:.7,主動控制:.5,主動增益:1.1,被動:.8},
  grade:{A:.55,B:.35},
  // 2026-11-22 Joe：兵種技給「統率或武勇高」的人帶（看這招吃哪項能力：三河武士／鐵炮僧兵隊／僧兵隊吃統率；越後先手組／大太刀力士隊吃武勇）；armStat＝全隊該能力最高者的加成倍率（其餘人除以它）
  armStat:2,rushActPen:.85};   // 官方 738 個戰法槽裡 A 級只占約 4%、B 級幾乎沒有（金將以 S 級戰法為主）
export function makeKit(D,{power={},tags={},pulls=()=>1000,field={},official=[]}={}){
  const PS=new Map(),ps=(n,lv=null)=>{const k=n+'|'+lv;if(!PS.has(k))PS.set(k,parseSkill(n,D,lv));return PS.get(k)};
  const SRC={};for(const[g,s]of Object.entries(D.teach))(SRC[s]??=[]).push(g);
  const INN=new Set([...Object.values(D.innate),...Object.values(D.stats).map(x=>x.inn).filter(Boolean)]);
  // 數量＝全帳號共用的戰法庫存（Joe 2026-11-20）：A 級百煉成鋼、奮鬥 2，B 級全部 3，其餘所有戰法 1。
  // 不論有幾隊、每隊三人，只要有人裝上，庫存就減 1，用完就不能再裝給別人（跨隊也算）；固有戰法不受此限。
  const grade=s=>D.skillText?.[s]?.g||D.skills?.[s];
  const A2=new Set(['百煉成鋼','奮鬥']);
  const count=s=>{const g=grade(s);return g==='B'?3:A2.has(s)?2:1};
  const usable=s=>{const p=ps(s);return p.modeled==='text'&&['主動','突擊','指揮','被動','兵種'].includes(p.kind)&&(!INN.has(s)||!!SRC[s])};   // 4★（A級）武將的固有戰法同時是傳授戰法（官方編制有人帶矢石飛交、槍彈正…）；金將固有仍不可傳授（POOL 來自 SRC，每人另外排除自己的固有）
  // 兵種技有些（三河武士、越後先手組…）資料裡沒有傳授來源武將，仍列入候選（來源待補，不計抽數）
  // 官方編制（official.json）出現過、但資料庫還沒有「來源武將」的戰法（直言極諫、立身之志、追亡逐北…）也列入候選（來源待補，不計抽數，數量 1）
  const OFS=new Set(official.flatMap(t=>t.gens.flatMap(g=>g.s)).filter(Boolean));
  // 2026-11-22：候選池改為「說明文字有建模的所有非專屬戰法」。過去只收有傳授來源的，規則版（官方 gens 清空）會漏掉誘敵深入、疑兵盜城、南蠻東渡、追亡逐北等
  // 「資料庫還沒收到傳授來源」的戰法——但 Joe 的隊伍與玩家站戰法榜都常用（來源待補，不計抽數，數量照一般規則）。
  const POOL=[...new Set([...Object.keys(SRC),...Object.keys(D.skillText||{}),...OFS])].filter(s=>D.skillText?.[s]).filter(usable);
  // 戰報歸納（tools/report-patterns.py，67 場）：隊伍實際發動的突擊戰法 0 / 1 / 2 種 → 勝率 40% / 61% / 68%；主動戰法 3 種的隊勝率只有 37%（0～1 種 53～56%）。
  // 突擊戰法只在「普通攻擊命中後」判定，所以：自帶突擊的武將，其他戰法要選突擊（每次普攻多一次觸發機會）或能多打普攻／提高突擊發動率的戰法；
  // 純主動戰法（要準備、機率低）對他沒有加成。
  const kindOf=s=>ps(s)?.kind;
  const feedsAtk=s=>{const p=ps(s),x=p.text||'';return p.kind==='突擊'||/連擊|亂舞|普通攻擊(後|造成的傷害|傷害(提高|增加))|突擊戰法的?發動機率|額外[^。]{0,12}普通攻擊|普通攻擊[^。]{0,8}(兩|2)次/.test(x)||(p.buf||[]).some(b=>b.k==='rushRate'||b.k==='dmgAtk')};
  const fallback=s=>{const x=ps(s);return((x.rate||0)*((x.dmg||0)*(x.n?(x.n[0]+x.n[1])/2:1)+(x.heal||0)*.5+(x.status?.p||0)*.6))*.1};
  const pw=(s,role)=>{const p=power[s];return p?(role==='phys'?p.p:p.m):fallback(s)};
  const srcPull=s=>SRC[s]?Math.min(...SRC[s].map(pulls),1e9):0;
  const scaleStat=s=>ps(s).text.match(/受(智略|統率|武勇|速度)影響/)?.[1]||null;
  const roleOf=st=>st.武勇>=st.智略?'phys':'mag';
  const facOf=n=>D.stats[n]?.f;
  const tagsOf=n=>tags[n]||[];
  // 女性武將（資料庫沒有性別欄，依官方設定列出；謀將與女性通常帶補血、輔助戰法）
  const FEMALE=FEMALE_R;   // 名單在 slg/rules.js
  // 輔助戰法的四級（Joe）：發動率 > 減傷 > 增傷 > 增加能力；補血另計。依模擬資料與說明文字判斷。
  const TIER_M={rate:1.45,cut:1.35,up:1.2,stat:1.1},TIER_N={rate:'提高戰法發動率',cut:'減傷',up:'增傷',stat:'增加能力'};
  const TC=new Map();
  function tierOf(s){
    if(TC.has(s))return TC.get(s);
    const p=ps(s),x=p.text||'',b=(p.buf||[]).map(y=>y.k),f=p.fx||{},c=f.cast||f.open||{};
    let tier=null;
    if(b.some(k=>k==='rateAct'||k==='rushRate')||/發動(機)?率(增加|提高)|發動率增加|效果翻倍|跳過1回合準備/.test(x))tier='rate';
    else if(b.some(k=>/^taken|^weak$/.test(k))||['weak','taken','guard','taunt','shiten','bisha'].includes(c.t)||/(傷害|傷亡)(降低|減少)/.test(x))tier='cut';
    else if(b.some(k=>/^dmg|^crit/.test(k))||/(傷害|普通攻擊傷害)(提高|增加)\d|會心狀態|獲得連擊/.test(x)||c.t==='combo'||c.t==='zan')tier='up';
    else if(b.some(k=>k.startsWith('stat:'))||/(武勇|智略|統率|速度)[^，。]{0,14}(增加|提高)\d/.test(x))tier='stat';
    const heal=!!(p.heal||p.regen||/治療|恢復[^，。]{0,8}兵力/.test(x));
    const r={tier,heal,support:!p.dmg||!!p.alliance||p.kind==='指揮'||c.t==='combo'};
    TC.set(s,r);return r;
  }
  // 戰法類別（官方編制逐類統計後校正權重用）
  const catOf=s=>{const x=D.skillText?.[s]||{},tg=x.tags||'',k=x.kind,p=ps(s);
    if(k==='兵種')return'兵種';if(tg.includes('治療'))return'補血';
    if(k==='突擊')return'突擊';if(p.fx?.cast?.t==='combo')return'連擊';
    if(k==='主動'&&/謀略/.test(tg))return'主動謀略傷害';if(k==='主動'&&/兵刃|兵謀/.test(tg))return'主動兵刃傷害';
    if(k==='主動'&&tg.includes('控制'))return'主動控制';if(k==='主動'&&tg.includes('減益'))return'主動減益';if(k==='主動')return'主動增益';
    if(k==='指揮')return'指揮';return'被動'};
  // —— 武將特徵（全部由戰法／特性說明文字判斷，不看人名）：官方編制逐位拆解出的因果（audit/official-why.md）——
  const innTxt=n=>D.skillText?.[innateOf(D,n)]?.text||'';
  const traitTxt=n=>Object.values(D.traitText?.[n]||{}).join('；');
  const feat=n=>{
    const x=innTxt(n),tr=traitTxt(n),ik=D.skillText?.[innateOf(D,n)]?.kind;
    return{
      innK:ik,
      prep:ik==='主動'&&/準備\d回合/.test(x),   // 固有是要準備的主動 → 運勝之鼻／疑心暗鬼才有用
      selfCombo:/連擊|每回合可以普通攻擊2次/.test(x),   // 固有本身就帶連擊（成田甲斐）→ 突擊戰法吃滿，不再需要連擊戰法
      atk:ik==='突擊'||/連擊|每回合可以普通攻擊|亂舞|可觸發普通攻擊效果|普通攻擊之後|普通攻擊後|普通攻擊時/.test(x.replace(/受到普通攻擊時/g,'')),   // 靠普攻打的人（連擊、亂舞、突擊）
      wantAct:/(發動|成功發動)[^，。]{0,6}主動(或突擊)?戰法|自身主動戰法的發動機率/.test(x)||/前\d回合主動、突擊戰法發動率/.test(tr),   // 固有／特性要靠「發動主動戰法」觸發
      tank:/受到(普通攻擊|兵刃傷害|傷害)時/.test(x)||/受到普通攻擊的機率|被敵方戰法選中的機率/.test(tr),   // 被打型（剛猛、威迫）：被打才觸發的戰法才有用
      both:/兵刃[^。]{0,80}謀略|謀略[^。]{0,80}兵刃/.test(x),
      rushFed:ik!=='突擊'&&/(可觸發|觸發)[^，。]{0,12}突擊/.test(x),   // 固有自己會觸發突擊（古今獨步反擊可觸發普攻效果及突擊）→ 戰法全帶突擊   // 固有兩種傷害都會打（文武雙全才吃得滿）
    };
  };
  const SYN=['奇謀','麻痺','封擊','混亂','無策','疲弊','威壓','亂舞','連擊','火傷','中毒','消沉','離反','鐵壁','規避','挑釁','先攻'];
  const FEAT={};const F=n=>FEAT[n]??=feat(n);
  // 大將位偏好（Joe 2026-11-21：大將通常只給有大將技的武將，但遊戲讓玩家自己配、模擬器不設限制，只當加分；大將技寫在武將自身（固有）戰法的說明裡，即 skillText[固有戰法].boss）。
  // 例外：官方編制裡實際擔任過大將的武將一律算（目前只有阿市的夢幻泡影沒收到大將技說明，疑似資料缺口）。
  const BOSS=new Set(Object.keys(D.stats).filter(n=>bossText(D,innateOf(D,n))));   // 固有戰法真的有大將技說明的武將（Joe 2026-11-24：有大將技的人要優先當大將，不浪費大將技）
  const LEAD=new Set([...BOSS,...official.map(t=>t.gens[0]?.n).filter(Boolean)]);   // 有資格當大將：大將技持有者＋官方編制擔任過大將者（阿市無大將技說明，只靠官方紀錄）
  // 大將位排序（Joe 2026-11-22：有大將技的武將都有資格當大將，Cost 7 不該自動壓過 Cost 6，只是不要把強力大將排成副將）。
  // 排序＝ 有大將技 > 「官方大將率」（貝氏收縮：官方當大將次數＋先驗 .3，權重 2 場；Cost 完全不參與）> 固有戰法指揮型 > 政務高。
  // 官方常當大將的人（前田利家、伊達晴宗、福島正則…不論 Cost）排前面；沒有官方紀錄的人先驗都一樣，再看固有戰法型態與政務。
  // 官方 148 隊留一法猜大將命中 135 隊（91%；舊的只看 Cost 為 117 隊）。只是排序偏好，手動組隊不受限。
  const OFLEAD={},OFAPP={};for(const t of official){t.gens.forEach((g,i)=>{OFAPP[g.n]=(OFAPP[g.n]||0)+1;if(i===0)OFLEAD[g.n]=(OFLEAD[g.n]||0)+1})}
  const leadRate=n=>((OFLEAD[n]||0)+2*.3)/((OFAPP[n]||0)+2);
  const leadKey=n=>[BOSS.has(n)?1:0,LEAD.has(n)?1:0,(F(n).tank&&F(n).innK==='被動')?0:1,leadRate(n),D.stats[n].kind==='指'?1:0,D.stats[n].st?.政務?.[0]||0];
  const leadCmp=(a,b)=>{const x=leadKey(a),y=leadKey(b);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return y[i]-x[i];return 0};
  const leaderFirst=names=>[...names].sort(leadCmp);
  // 官方編制先驗：戰法人氣、武將×戰法搭配次數
  const OF_S={},OF_GS={};let OF_MAX=1;
  for(const t of official)for(const g of t.gens)for(const sk of g.s)if(sk){OF_S[sk]=(OF_S[sk]||0)+1;OF_GS[g.n+'|'+sk]=(OF_GS[g.n+'|'+sk]||0)+1;OF_MAX=Math.max(OF_MAX,OF_S[sk])}
  const ofS=(sk,loo)=>(OF_S[sk]||0)-(loo?.gens.reduce((a,g)=>a+g.s.filter(x=>x===sk).length,0)||0);
  const ofGS=(n,sk,loo)=>(OF_GS[n+'|'+sk]||0)-(loo?.gens.some(g=>g.n===n&&g.s.includes(sk))?1:0);
  // 勢力型態：同勢力（吃協力）／三勢力皆不同（可配合盟之陣）／其他
  // 老獪（真田昌幸：勢力與大將一致）、老狐狸（德川家康：另外兩人同勢力時變成其勢力）→ 這兩位是「勢力可變」的補位
  const facsOf=team=>facsOfR(D,team.map(g=>g.n));   // 實際勢力（含老獪／老狐狸），規則在 slg/rules.js
  const facType=team=>facTypeOf(facsOf(team));

  // 輔助型：女性，或固有戰法不是傷害型（治療／增益／控制）。固有就是傷害戰法的智將（毛利元就、明智光秀…）是輸出，帶主動攻擊戰法，不自動套補血（Joe 2026-11-23：毛利智略成長最高，要帶主動攻擊戰法）。
  const isSup=(n,st)=>{if(FEMALE.has(n))return true;const t=D.skillText?.[innateOf(D,n)]?.tags||'';if(/兵刃|謀略|兵謀/.test(t))return false;return roleOf(st)==='mag'};
  // 固有戰法的「代價」：「以無法獲得X狀態為代價」→ 帶會給X的戰法就浪費（上杉謙信軍神不能獲得亂舞，不能帶一力當先）
  const costBan=n=>{const m=innTxt(n).match(/以無法(?:獲得|發動|施加|使用)([^，。為]{1,8}?)(?:狀態)?為代價/);return m?m[1]:null};
  // team: [{n, red, st:{武勇,智略,統率,速度}}]  picks: [[skill..],..]（已選，其餘由評估補滿到每人 2 個）
  function pick(team,picks=null,reserved={},ctx={}){
    const arm=ctx.arm||null;
    const N=team.length,sel=team.map((_,i)=>[...(picks?.[i]||[])].filter(Boolean).slice(0,2));
    const used=s=>(reserved[s]||0)+sel.reduce((a,l)=>a+l.filter(x=>x===s).length,0);
    const sts=team.map(g=>g.st),avg=k=>sts.reduce((a,x)=>a+x[k],0)/N;
    const fastest=sts.reduce((b,x,i)=>x.速度>sts[b].速度?i:b,0);
    const physN=team.filter(g=>roleOf(g.st)==='phys').length,loo=ctx.loo||null;
    const statusKinds=()=>new Set(sel.flat().flatMap(s=>ps(s).status?.k||[]));
    const why=team.map(()=>[]);
    function score(i,s){
      const g=team[i],p=ps(s),role=roleOf(g.st);
      // 模擬強度只當基底（壓平，避免少數幾招壓過一切）；真正的選擇由「武將自身能力／特性／兵種、謀將女性帶輔助、輔助優先序、隊伍補血減傷控制」這些規則決定
      let v=TU.b0+Math.max(0,Math.min(TU.bm,pw(s,role)/TU.bd)),tips=[];
      const sk=p.status?.k||[];
      if(sk.length){
        const have=statusKinds();const fresh=sk.filter(k=>!have.has(k));
        if(fresh.length){v*=1.15;tips.push(`干擾：補上${fresh.join('、')}（隊內其他戰法沒有）`)}
        else{v*=.8;tips.push(`與隊內干擾重複（${sk.join('、')}），已降權`)}
        if(i===fastest){v*=1.1;tips.push('速度最快，先手施放干擾')}
      }
      const ss=scaleStat(s);
      // 相容檢查：戰法吃某項能力（受X影響），而這位武將自己的固有戰法／已選戰法會把自身X降低 → 互斥（例：今川義元海道第一降統率，不能配吃統率的戮力同心）
      if(ss){const lowers=[innateOf(D,g.n),...(sel[i]||[])].filter(x=>x&&x!==s&&new RegExp('自身'+ss+'(降低|下降|減少)').test(ps(x).text||''));
        if(lowers.length){v*=.05;tips.push(`衝突：${lowers[0]}會降低自身${ss}，與吃${ss}的${s}互斥`)}}
      if(ss){const r=g.st[ss]/avg(ss),own=g.st[ss]/((g.st.武勇+g.st.智略+g.st.統率+g.st.速度)/4),m=Math.max(.85,Math.min(1.25,1+.3*(r-1)+.2*(own-1)));v*=m;if(m>1.04)tips.push(`受${ss}影響，${g.n}的${ss}${r>1?'比隊友高':'是自己的強項'}（先看武將自身能力）`);else if(m<.95)tips.push(`受${ss}影響，但${g.n}的${ss}偏低，已降權`)}
      {const ban=costBan(g.n);if(ban&&new RegExp('(獲得|進入|賦予)[^，。]{0,4}'+ban).test(p.text||''))return{v:0,tips:[`衝突：${g.n}的固有戰法以「無法獲得${ban}」為代價，這招會給${ban}，不能帶`]}}
      {const top3=Math.max(g.st.武勇,g.st.智略,g.st.統率),teamTop=Math.max(...sts.map(x=>x.統率));
        if((ss==='統率'||/自身統率(提高|增加)/.test(p.text||''))&&g.st.統率>=top3&&g.st.統率>=teamTop){const self=/自身統率(提高|增加)/.test(p.text||'')&&p.kind!=='被動'&&p.kind!=='兵種';v=Math.max(v,self?.6:.3)*(self?6:1.5);tips.push(`${g.n}統率是自己與全隊最高，${self?'加統率的戰法（挑釁自己扛）':'統率型戰法（吃統率）'}最划算`)}}
      const sources=SRC[s]||[],fo=facOf(g.n);
      if(sources.some(x=>x!==g.n&&facOf(x)===fo)){v*=1.04;tips.push(`來源武將與${g.n}同勢力（${fo}）`)}
      const sh=tagsOf(g.n).filter(t=>sources.some(x=>tagsOf(x).includes(t)));
      if(sh.length){v*=1.03;tips.push(`一門／標籤相同（${sh[0]}）`)}
      const seen=field.skill?.[g.n]?.[s]||0;
      if(seen){v*=1+.2*Math.min(1,seen/3);tips.push(`戰報裡${g.n}實際用過（${seen} 場${seen<3?'，樣本少':''}）`)}
      else if((field.skillUse?.[s]||0)>=4){v*=1.05;tips.push(`戰報裡別的武將常用（${field.skillUse[s]} 場）`)}
      // —— 戰報歸納出的搭配規則 ——
      const innK=kindOf(innateOf(D,g.n)),mine=sel[i];
      const teamKinds=sel.flatMap((l,j)=>[kindOf(innateOf(D,team[j].n)),...l.map(kindOf)]);
      const nRush=teamKinds.filter(k=>k==='突擊').length,nAct=teamKinds.filter(k=>k==='主動').length;
      if(p.alliance){
        const fs=facsOf(team),bossK=kindOf(innateOf(D,team[0].n));
        if(!(facTypeOf(fs)==='alliance'&&(bossK==='主動'||bossK==='突擊')))return{v:0,tips:[]};
        v=Math.max(v,1);tips.push(`合盟之陣：三人勢力都不同（${fs.join('、')}），大將自帶${bossK}，提高大將自帶戰法的發動機率、副將傷害與減傷（但會失去同勢力協力加成）`);
      }else if(p.kind==='兵種'){
        if(!arm||(p.arm&&p.arm!==arm))return{v:0,tips:[]};
        if(sel.some(l=>l.some(x=>kindOf(x)==='兵種'&&!ps(x).alliance)))return{v:0,tips:[]};
        v=Math.max(v,.9)*1.12;tips.push(`兵種技：開場直接生效、整隊吃到（隊伍是${arm}兵）`);
        const st1=scaleStat(s);if(st1&&TU.armStat!==1){const top=Math.max(...sts.map(x=>x[st1]));if(g.st[st1]>=top){v*=TU.armStat;tips.push(`${st1}是全隊最高，兵種技吃${st1}（玩家讓統率／武勇高的人帶）`)}else v/=Math.sqrt(TU.armStat)}
      }
      if(p.kind==='突擊'){
        if(innK==='突擊'){v*=1.35;tips.push('自帶突擊，再配突擊戰法：每次普攻命中都多一次觸發機會（戰報：突擊技傷害占贏方輸出 18%、輸方 10%）')}
        else if((roleOf(g.st)==='mag'||FEMALE.has(g.n))&&physN<2){v*=.8;tips.push('謀將／女性武將在智略型隊伍裡少帶突擊，偏向補血與輔助（官方智略型隊伍幾乎不帶突擊）')}
        else if(nRush===0){v*=1.2;tips.push('隊內還沒有突擊戰法，補一個（戰報：實際發動 0 種突擊勝率 40%，1 種 61%）')}
        else if(nRush===1){v*=1.08;tips.push('隊內第二個突擊戰法（戰報：2 種突擊勝率 68%）')}
        else{v*=.8;tips.push('隊內突擊戰法已經夠多，邊際效益低')}
      }else if(innK==='突擊'||mine.some(x=>kindOf(x)==='突擊')){
        if(feedsAtk(s)){v*=1.25;tips.push('能多打普攻／提高突擊發動率，幫自帶突擊多觸發')}
        else if(p.kind==='主動'){v*=TU.rushActPen;tips.push('自帶突擊卻選純主動戰法：主動戰法不會觸發突擊，已降權（戰報：這類組合多半輸）')}
      }
      if(p.kind==='主動'&&nAct>=7){v*=.7;tips.push(`隊內已有 ${nAct} 個主動戰法（含自帶），再加邊際效益低（官方編制一般 3～6 個）`)}
      for(const b of p.buf||[]){
        if(b.k==='rateAct'){if(nAct>0){v*=1+.06*Math.min(3,nAct);tips.push('增益：提高主動戰法發動率，隊內有主動戰法可吃到')}else v*=.7}
        if(b.k==='rushRate'){if(nRush>0){v*=1+.08*Math.min(3,nRush);tips.push('增益：提高突擊發動率，隊內有突擊戰法可吃到')}else v*=.7}
      }
      if(p.kind==='指揮'&&(p.buf||[]).length&&!(p.dmg||p.heal)){tips.push('指揮技：開場直接生效，不用等發動')}
      // 傷害類型要和武將屬性型相符（兵刃吃武勇、謀略吃智略）；不相符又沒有控制效果就幾乎不選
      if(p.dmg&&(p.dtype==='兵刃'||p.dtype==='謀略')&&((p.dtype==='兵刃')!==(role==='phys'))){if(p.status){v*=.7}else{v*=.3;tips.push(`${p.dtype}傷害與${g.n}的${role==='phys'?'武勇':'智略'}型不合，已大幅降權`)}}
      const sw=field.skillWin?.[s];
      if(sw&&sw[0]>=5){const wr=(sw[1]+1.5)/(sw[0]+3),m=Math.max(.9,Math.min(1.12,1+.6*(wr-.5)));v*=m;if(Math.abs(m-1)>.03)tips.push(`戰報：出現在 ${sw[0]} 隊，勝率 ${Math.round(sw[1]/sw[0]*100)}%（樣本少，只微調）`)}
      const red=g.red||0;
      if(p.prep){const m=.9+.02*red;v*=m;if(red<=1)tips.push('紅度低，準備型戰法降權')}
      else if(p.rate!=null&&red<=2&&p.rate>=.4){v*=1+.08*(p.rate-.4)*(5-red)/5;tips.push('紅度低，偏好發動率高的戰法')}
      // —— Joe 的觀念：謀將／女性帶補血與輔助，輔助依 發動率>減傷>增傷>能力 排序；武勇型帶突擊、連擊、增傷 ——
      const sup=isSup(g.n,g.st),to=tierOf(s);
      if(to.support){
        const m=to.tier?TIER_M[to.tier]:1,mh=to.heal?TU.heal:1;
        if(sup){const mm=Math.max(m,mh);if(mm>1){v=Math.max(v,.02)*mm;tips.push(`${FEMALE.has(g.n)?'女性':'謀將'}${g.n}帶輔助：${to.heal?'補血':TIER_N[to.tier]}（輔助優先序：提高戰法發動率＞減傷＞增傷＞增加能力）`)}}
        else if(m>1){v*=1+(m-1)*.5;if(m>=1.2)tips.push(`輔助戰法：${TIER_N[to.tier]}`)}
        if(sup&&p.kind!=='兵種'&&!(/自身統率(提高|增加)/.test(p.text||'')&&g.st.統率>=Math.max(g.st.武勇,g.st.智略)&&g.st.統率>=Math.max(...sts.map(x=>x.統率)))&&(to.heal||to.tier==='cut'||p.status||['seal','taunt','taunt2'].includes(p.fx?.open?.t||p.fx?.cast?.t))&&sel[i].some(x=>{const o=tierOf(x),q=ps(x);return kindOf(x)!=='兵種'&&o.support&&(o.heal||o.tier==='cut'||q.status)})){v*=.5;tips.push('補血、控場、降傷取一，這位已經有一個，第二格改帶輸出或發動率')}
      }else if(!sup&&(p.kind==='突擊'||p.fx?.cast?.t==='combo')){v*=1.1}
      if(/女性/.test(p.text||'')){if(FEMALE.has(g.n)){v*=1.25;tips.push('這招對女性武將有額外加成')}else v*=.9}
      // 隊伍分工：官方編制 98% 至少有一個補血來源、76% 至少一個減傷、78% 至少一個控制（封擊／挑釁／混亂…）
      const cov=pred=>ctx.assumeCover||team.some((tg,j)=>[innateOf(D,tg.n),...sel[j]].some(x=>x&&pred(tierOf(x),ps(x)))),
        isCtl=!!(p.status||['seal','taunt','taunt2'].includes(p.fx?.open?.t||p.fx?.cast?.t));
      if(to.heal&&!sup&&team.some((tg,j)=>j!==i&&isSup(tg.n,tg.st))){v*=.55;tips.push('隊內已有輔助型武將負責補血，輸出型武將第二、三招優先帶攻擊戰法')}
      if(to.heal&&!sup&&/謀略|兵刃|兵謀/.test(D.skillText?.[innateOf(D,g.n)]?.tags||'')){v*=.6;tips.push('固有本身是輸出／控制傷害，第二、三招優先帶主動攻擊戰法（Joe：毛利元就）')}
      if(to.heal){const hn=team.reduce((a,tg,j)=>a+[innateOf(D,tg.n),...sel[j]].filter(x=>x&&tierOf(x).heal).length,0);
        if(!cov(o=>o.heal)){if(sup){v*=TU.healNone;tips.push('隊內還沒有補血來源（官方編制 98% 至少有一個），由輔助型武將補')}else v*=.85}else if(hn>=3)v*=.8}
      if(to.tier==='cut'&&!cov(o=>o.tier==='cut')){v*=1.25;tips.push('隊內還沒有減傷（官方編制 76% 至少有一個）')}
      if(isCtl&&!cov((o,pp)=>pp.status||['seal','taunt','taunt2'].includes(pp.fx?.open?.t||pp.fx?.cast?.t))){v*=1.15;tips.push('隊內還沒有控制（封擊／挑釁／混亂，官方編制 78% 至少有一個）')}
      // —— 官方編制逐位拆解出的因果規則（說明文字可推；權重是推估，只調排序、不設限制）——
      {const f=F(g.n),x=p.text||'',own=sel[i],b2=(p.buf||[]).map(y=>y.k);
        const selfRate=b2.includes('rateAct')&&(p.buf||[]).some(y=>y.k==='rateAct'&&y.to==='self');
        // 1. 固有是主動 → 自身主動發動率／自帶主動傷害類；固有不是主動 → 這類沒有對象
        if(selfRate||/自帶主動戰法.{0,10}(傷害|發動)/.test(x)){if(f.innK==='主動'){v*=1.5;tips.push(`${g.n}固有是主動戰法，自身主動發動率類戰法直接加成自帶戰法`)}else if(f.innK){v*=.55;tips.push(`${g.n}固有不是主動戰法，吃不到這招的發動率加成`)}}
        // 1b. 固有是「普通攻擊後」才出額外傷害的主動（破陣亂舞）→ 增加普攻傷害＋給亂舞的主動直接放大（Joe：酒井一力當先優先）
        if(f.innK==='主動'&&/普通攻擊後/.test(innTxt(g.n))&&p.kind==='主動'&&/普通攻擊傷害(提高|增加)/.test(x)&&/亂舞/.test(x)){v=Math.max(v,2)*1.8;tips.push(`${g.n}固有靠普通攻擊後出傷害，增加普攻傷害並給亂舞的戰法直接放大固有`)}
        // 2. 準備型自帶主動 → 運勝之鼻／疑心暗鬼（跳過準備／準備時加成）
        if(/需要準備的自帶主動|自帶準備主動/.test(x)){if(f.prep){v=Math.max(v,.8)*3.5;tips.push(`${g.n}固有戰法要準備，這招能跳過準備或在準備時加成（官方北條綱成、松永久秀必帶）`)}else v*=.25}
        // 3. 靠普攻打的人（連擊、亂舞、突擊）→ 突擊／連擊類；不吃普攻的主動戰法降權
        if(f.atk&&f.innK!=='突擊'&&p.kind==='突擊'&&f.selfCombo){v*=1.35;tips.push(`${g.n}固有自帶連擊（每回合普攻 2 次），突擊判定翻倍 → 帶突擊戰法`)}
        if(f.atk&&f.innK!=='突擊'&&feedsAtk(s)&&p.kind!=='突擊'){if(f.selfCombo)v*=.7;else{v=Math.max(v,1.1)*1.4;tips.push(`${g.n}固有靠普通攻擊（亂舞），連擊／增加普攻的戰法直接放大固有`)}}
        // 3b. 靠普攻打的人，官方兩個槽的結構：突擊固有 28 人次中 25 次是「1 個連擊／增加普攻的主動＋1 個突擊」；被動型（連擊、亂舞）則是 2 個突擊或 2 個連擊類
        if(f.atk){const oR=own.filter(y=>kindOf(y)==='突擊').length,oF=own.filter(y=>kindOf(y)!=='突擊'&&feedsAtk(y)).length;
          if(p.kind==='突擊'){if(oR>=1&&oF===0&&f.innK==='突擊'){v*=.6;tips.push('已有突擊，另一格留給連擊／增加普攻的戰法（官方突擊型武將 25/28 這樣配）')}else if(oR>=1&&f.innK!=='突擊')v*=.85}
          else if(feedsAtk(s)&&!(f.selfCombo&&f.innK!=='突擊')){if(oF===0)v*=oR>=1?1.8:1.3;else v*=f.innK==='突擊'?.55:1.1}}
        // 3c. 關鍵狀態同名連動：固有／特性在做的事（奇謀、麻痺、封擊、混亂、亂舞、火傷…）和戰法在做的事一樣 → 放大（立花道雪麻痺＋霹靂一擊、真田昌幸混亂＋瞬息萬變、黑田官兵衛奇謀＋七十二欺計、飯富虎昌封擊＋千軍辟易）
        {const mine=innTxt(g.n)+traitTxt(g.n),syn=SYN.filter(k=>mine.includes(k)&&x.replace(/免疫[^，。]*/g,'').includes(k));
          if(syn.length){v=Math.max(v,.7)*(1+.45*Math.min(2,syn.length));tips.push(`和${g.n}的固有／特性同樣在做「${syn.join('、')}」，互相放大`)}}
        // 3d. 治療的實際效率：只治療自己的（按甲休兵）、只在偶數回合發動的（惠風和雨）打折
        if(to.heal){if(D.skillText?.[s]?.target==='自己')v*=.6;if(/偶數回合/.test(x))v*=.6}
        // 3e. 被打型（龍造寺隆信…）普攻不是主力，突擊戰法效益低
        if(f.tank&&!f.atk&&p.kind==='突擊')v*=.7
        // 3f. 智略型謀將（武勇遠低於智略）、固有也不靠普攻：連擊／增加普攻傷害／亂舞這類「吃普通攻擊」的戰法，等於幫一個不靠普攻輸出的人強化普攻，沒有用處（Joe：黑田官兵衛武勇145、智略421，不該配縱橫馳突）

        if(role==='mag'&&g.st.武勇<g.st.智略*.6&&!f.atk&&!f.rushFed&&p.kind!=='突擊'&&p.kind!=='兵種'&&feedsAtk(s)&&!to.heal&&!(p.status||['seal','taunt','taunt2'].includes(p.fx?.open?.t||p.fx?.cast?.t))){v*=.2;tips.push(`${g.n}武勇${Math.round(g.st.武勇)}遠低於智略${Math.round(g.st.智略)}，固有也不靠普通攻擊，連擊／強化普攻類戰法幾乎沒有用`)}
        if(f.rushFed){if(p.kind==='突擊'){v*=1.8;tips.push(`${g.n}固有的反擊會觸發突擊，兩招都裝突擊戰法（Joe：本多忠勝）`)}else if(p.kind==='主動'&&!feedsAtk(s))v*=.6}
        // 妻木熙子型固有（敵軍全體都處於持續性狀態才補血）→ 隊內多帶持續傷害戰法（明智光秀的囊沙之計、方今之時）
        if(team.some(tg=>/敵軍全體都處於持續性狀態/.test(innTxt(tg.n)))&&/持續受到傷害|火傷|水攻|中毒|潰走|消沉/.test(x)){v=Math.max(v,.8)*1.6;tips.push('隊內有固有補血要敵軍全體持續性狀態的武將，持續傷害戰法讓它觸發')}
        // 4. 固有要「發動主動戰法」才觸發 → 主動戰法多帶
        if(f.wantAct&&p.kind==='主動'){v*=1.3;tips.push(`${g.n}的固有／特性靠「發動主動戰法」觸發，主動戰法越多越好`)}
        else if(f.wantAct&&(p.kind==='指揮'||p.kind==='被動'||p.kind==='兵種')&&!(p.buf||[]).some(y=>y.k==='rateAct'))v*=.9;
        // 5. 被打型（剛猛／威迫）→ 被打才觸發的戰法（沉魚落雁、罵詈雜言、堅忍不拔、挑釁）
        if(/受到普通攻擊時|挑釁|反擊狀態/.test(x)&&p.kind!=='突擊'){if(f.tank){v*=1.5;tips.push(`${g.n}特性／固有讓自己容易被打，配「被打才觸發」的戰法`)}else if(!FEMALE.has(g.n))v*=.8}
        // 6. 兩種傷害都會打 → 文武雙全、兵謀戰法
        if(/造成謀略傷害時[^。]{0,20}武勇/.test(x)){if(f.both||(Math.abs(g.st.武勇-g.st.智略)/Math.max(g.st.武勇,g.st.智略)<.12)){v=Math.max(v,.8)*1.7;tips.push(`${g.n}兵刃與謀略都會打，文武雙全兩邊都疊得到`)}else v*=.3}
        if((p.tags||'').includes?.('兵謀')||/兵謀/.test(D.skillText?.[s]?.tags||'')){if(f.both||Math.abs(g.st.武勇-g.st.智略)/Math.max(g.st.武勇,g.st.智略)<.12){v*=1.3;tips.push(`${g.n}武勇智略接近，兵謀戰法兩種傷害都吃`)}}
        // 7. 千軍辟易：對封擊／無策目標附威壓 → 隊內有封擊／無策來源才有意義
        if(/處於封擊或無策/.test(x)){const hasSeal=team.some((tg,j)=>[innateOf(D,tg.n),...sel[j]].some(y=>y&&(ps(y).status?.k||[]).some(k=>k==='封擊'||k==='無策')||ps(y)?.fx?.open?.t==='seal'));if(hasSeal){v*=1.3;tips.push('隊內有封擊／無策來源，千軍辟易可接威壓')}}
        // 8. 兵種技的「統領」限定彩蛋（龍騎兵＝伊達政宗、三河弓兵隊＝酒井忠次、越後先手組＝上杉謙信、大太刀力士隊＝真柄直隆）
        if(p.kind==='兵種'){const m=x.match(/若由?(\S{2,4}?)統領/);if(m){if(team[0].n===m[1]){v*=1.8;tips.push(`${m[1]}統領時有專屬加成（大將就是${m[1]}）`)}else if(team.some(tg=>tg.n===m[1]))v*=1.1;else v*=.85}}
      }
      v*=(TU.cat[catOf(s)]??1)*(TU.grade[grade(s)]??1);
      // 官方編制先驗（回測會排除同一組三人）
      const ofc=ofGS(g.n,s,loo),ofs=ofS(s,loo);
      // 官方資料沒出現過的戰法：officialOnly（一鍵推薦／榜單）直接剔除；官方有人帶、但這位武將沒帶過的組合只降權（預設 .6，官方先驗關閉時不動）
      if(ctx.officialOnly&&!ofc&&!ofs)return{v:0,tips:[]};
      if(ctx.officialOnly&&!ofc)v*=.6;
      if(ofc>0){v*=1+TU.pGS*Math.min(1,ofc/3);tips.push(`官方編制裡${g.n}常帶這招（${ofc} 組）`)}
      else if(ofs>0)v*=1+TU.pS*Math.min(1,ofs/OF_MAX*1.5);
      return{v,tips};
    }
    for(let round=0;round<N*2;round++){
      let best=null;
      for(let i=0;i<N;i++){
        if(sel[i].length>=2)continue;
        for(const s of POOL){
          if(s===innateOf(D,team[i].n)||sel[i].includes(s)||used(s)>=count(s))continue;
          const r=score(i,s);if(ctx.dbg)ctx.dbg(i,s,r);
          if(!best||r.v>best.v)best={i,s,...r};
        }
      }
      if(!best)break;
      sel[best.i].push(best.s);why[best.i].push({s:best.s,tips:best.tips});
    }
    // 使用者已指定的戰法也附上說明
    team.forEach((g,i)=>{const have=new Set(why[i].map(x=>x.s));for(const s of sel[i])if(!have.has(s))why[i].unshift({s,tips:['自選']})});
    return{sel,why:why.map((l,i)=>l.map(x=>describe(team[i],x.s,x.tips)))};
  }
  function describe(g,s,tips){
    const p=ps(s),role=roleOf(g.st);
    const bits=[`${s}（${p.kind}）`];
    if(p.rate!=null&&p.rate<1)bits.push(`發動 ${Math.round(p.rate*100)}%`);
    if(p.dmg)bits.push(`${p.dtype==='auto'?'兵刃／謀略':p.dtype}傷害率 ${Math.round(p.dmg*100)}%${p.n&&p.n[1]>1?`×${p.n[1]}人`:''}`);
    else if(p.status)bits.push(`${p.status.k.join('、')}`);
    else if(p.heal)bits.push(`治療 ${Math.round(p.heal*100)}%`);
    else if(p.buf)bits.push('增益');
    const out=[];
    if(p.dtype==='兵刃'||p.dtype==='謀略'){
      const fit=(p.dtype==='兵刃')===(role==='phys');
      out.push(fit?`${g.n}${role==='phys'?'武勇':'智略'}偏高，吃${p.dtype}傷害`:`${p.dtype}傷害與${g.n}的${role==='phys'?'武勇':'智略'}偏向不同，但模擬仍有增益`);
    }
    if(count(s)>1)out.push(`數量${count(s)}戰法`);
    return`${bits.join('・')}：${[...out,...tips.filter(t=>t!=='自選')].join('；')||'模擬增益最高'}`+(tips.includes('自選')?'（自選）':'');
  }
  // 驗證／篩選用：某位武將目前的選單能列哪些戰法（排除其他人已用完數量的）
  function options(team,i,reserved={}){
    const used=s=>(reserved[s]||0)+team.reduce((a,g,j)=>a+(j===i?0:(g.s||[]).filter(x=>x===s).length),0);
    return POOL.filter(s=>s!==innateOf(D,team[i].n)&&used(s)<count(s));
  }
  // 戰報實戰分：每位武將勝率（勝 1 平 .5，先驗 6 場 0.5 收縮）＋同隊兩兩搭配勝率；n = 最少樣本場數。樣本通常很少，只當參考。
  const PRIOR=6,shr=([n,w])=>(w+PRIOR*.5)/(n+PRIOR);
  function fieldScore(names){
    const gs=names.map(n=>field.gen?.[n]||[0,0]),base=gs.reduce((a,x)=>a+shr(x),0)/names.length;
    let pb=0,pn=0;const pairs=[];
    for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){
      const k=[names[i],names[j]].sort().join('|'),x=field.pair?.[k];
      if(x){pb+=shr(x)-.5;pn+=x[0];pairs.push(`${names[i]}×${names[j]} ${x[0]}場${Math.round(x[1]/x[0]*100)}%`)}}
    const tr=field.trio?.[[...names].sort().join('|')];
    return{score:base+pb*.5+(tr?(shr(tr)-.5)*.5:0),n:Math.min(...gs.map(x=>x[0])),each:gs.map(x=>x[0]),pairs,trio:tr||null};
  }
  // 搭配品質（一鍵推薦的硬性門檻）：回傳 {ok, fails, score}。
  // 不合格＝自帶突擊沒搭突擊／普攻類、兵種技與隊伍兵種不符、主動戰法 ≥4、戰法沒配滿、傷害類型與武將屬性型不合（無控制效果時）、增益沒有可吃到的對象。
  // score＝加分項數量（突擊連動、兵種技生效、增益有對象、主動數量合理），給排序用：先看搭配品質再看勝率。
  function quality(team,sel,arm){
    const fails=[],soft=[],K=kindOf;let score=0;
    for(const c of check(team,sel,arm)){if(c.lv==='warn')fails.push(c.t);else if(c.lv==='ok')score++}
    const ft=facType(team);
    const allK=team.flatMap((g,i)=>[K(innateOf(D,g.n)),...sel[i].filter(Boolean).map(K)]);
    const nRush=allK.filter(k=>k==='突擊').length,nAct=allK.filter(k=>k==='主動').length;
    team.forEach((g,i)=>{
      const role=roleOf(g.st),mine=sel[i].filter(Boolean);
      if(mine.length<2)fails.push(`${g.n}的戰法沒有配滿`);
      const hi_=Math.max(g.st.武勇,g.st.智略),lo_=Math.min(g.st.武勇,g.st.智略),clear=(hi_-lo_)/hi_>.2;
      for(const s of mine){const p=ps(s);
        if(p.alliance){if(!(facType(team)==='alliance'&&['主動','突擊'].includes(K(innateOf(D,team[0].n)))))fails.push(`「${s}」需要三人勢力都不同且大將自帶主動或突擊`)}
        if(clear&&p.dmg&&(p.dtype==='兵刃'||p.dtype==='謀略')&&!p.status&&((p.dtype==='兵刃')!==(role==='phys')))soft.push(`${g.n}的「${s}」是${p.dtype}傷害，與${g.n}的${role==='phys'?'武勇':'智略'}型不合（官方編制也有這種搭法，只提醒）`);
        for(const b of p.buf||[]){
          if(b.k==='rateAct'&&!nAct)fails.push(`「${s}」提高主動發動率，但隊內沒有主動戰法`);
          if(b.k==='rushRate'&&!nRush)fails.push(`「${s}」提高突擊發動率，但隊內沒有突擊戰法`);
        }
        if(p.kind==='兵種'&&(p.arm===arm||p.alliance))score++;
      }
    });
    if(nRush>=1&&nRush<=3)score++;
    if(nAct<=6)score++;
    if(ft!=='mixed')score++;   // 同勢力吃協力，或三勢力皆不同配合盟之陣（官方編制 80% 以上屬於這兩種）
    return{ok:!fails.length,fails,soft,score};
  }
  // 組好之後的檢查：回傳 [{lv:'warn'|'note'|'ok', t}]；warn＝戰法不會生效等硬傷（品質檢查不合格），note＝經驗提醒（220、勢力混搭、兵種特性用不到、主動偏多），由模擬勝率決定，不擋（2026-11-24 統一，一鍵推薦與 AI 配隊同一標準），給畫面顯示「這組搭配有沒有問題」
  function check(team,sel,arm){
    const out=[],K=n=>kindOf(n),inn=team.map(g=>K(innateOf(D,g.n)));
    if(BOSS.has(team[0].n))out.push({lv:'ok',t:`大將${team[0].n}有大將技（玩家通常讓有大將技的武將當大將；只是慣例，不是限制）`});
    else{const b=team.find(g=>BOSS.has(g.n));
      if(b)out.push({lv:'warn',t:`${b.n}有大將技卻不是大將，大將技會浪費（大將是${team[0].n}${LEAD.has(team[0].n)?'，他在官方編制擔任過大將、但沒有收到大將技說明':''}）`});
      else if(LEAD.has(team[0].n))out.push({lv:'ok',t:`大將${team[0].n}沒有大將技說明，但官方編制擔任過大將；隊上也沒有人有大將技`})}
    team.forEach((g,i)=>{
      const mine=sel[i].filter(Boolean),all=[innateOf(D,g.n),...mine].filter(Boolean);
      if(inn[i]==='突擊'||mine.some(x=>K(x)==='突擊')){
        const sup=mine.filter(x=>K(x)==='突擊'||feedsAtk(x)).length;
        if(inn[i]==='突擊'&&!sup)out.push({lv:'warn',t:`${g.n}自帶突擊，但第 2、3 戰法沒有突擊或能觸發普攻的技能，突擊只靠普攻觸發，威力用不滿`});
        else out.push({lv:'ok',t:`${g.n}：突擊 ${all.filter(x=>K(x)==='突擊').length} 個，普攻命中後會連續判定`});
      }
      for(const x of mine){const p=ps(x);if(p.kind==='兵種'&&!p.alliance&&p.arm&&p.arm!==arm)out.push({lv:'warn',t:`${g.n}的「${x}」需要${p.arm}兵，隊伍是${arm}兵，這招不會生效`})}
    });
    const nAct=[...inn,...sel.flat().filter(Boolean).map(K)].filter(k=>k==='主動').length;
    if(nAct>=7)out.push({lv:'note',t:`整隊有 ${nAct} 個主動戰法，比官方編制常見的 3～6 個還多`});
    {const hi=team.filter(t=>Math.max(t.st.統率||0,t.st.速度||0)>=220).map(t=>t.n);
      if(!hi.length)out.push({lv:'note',t:'隊內沒有統率或速度達 220 的武將：Joe 的經驗是單一武將統率或速度 220 以上，對上滿紅對手比較不吃虧、強度較高；可靠裝備、加成、兵種累加（引擎數值含設施加成，僅供參考）'});
      else out.push({lv:'ok',t:`統率／速度 220 以上：${hi.join('、')}`})}
    const ft=facType(team);if(ft==='mixed')out.push({lv:'note',t:`勢力混搭（${facsOf(team).join('、')}）：沒有同勢力協力（約 +7% 全能力），也不是三勢力皆不同的合盟之陣。群雄同在一隊也算同勢力有加成，除非要搭合盟之陣，盡量同勢力`});
    // 兵種特性對不上隊伍兵種（石川數正馬弓術放在足輕隊用不到）
    for(const g of team){const a=armTraits(D,g.n);const ks=Object.keys(a.o);   // 每個特性只算一次（rules.js），含「X兵大將」
      if(ks.length&&!a.o[arm])out.push({lv:'note',t:`${g.n}的兵種特性（${a.src.join('、')}）對${ARM_NAME[arm]||arm}隊沒有加成`})}
    // 固有有條件：大將要同時打兵刃與謀略（壽桂尼尼御台）／敵全體要有持續性狀態（妻木熙子內賢之助）
    {const b=F(team[0].n);
      for(const g of team){const x=innTxt(g.n);
        if(/我軍大將[\s\S]{0,90}離反及攻心/.test(x)&&!(b.both||b.innK==='突擊'))out.push({lv:'warn',t:`${g.n}的固有給大將離反＋攻心，大將${team[0].n}不是兵謀／突擊型，離反效果會浪費（適合兵謀＋突擊大將，例如今川義元）`});
        if(/敵軍全體都處於持續性狀態/.test(x)){const dots=team.reduce((a,t)=>a+[innateOf(D,t.n),...(sel[team.indexOf(t)]||[])].filter(y=>y&&/持續受到傷害|火傷|水攻|中毒|潰走|消沉/.test(ps(y).text||'')).length,0);if(dots<2)out.push({lv:'warn',t:`${g.n}的固有補血要「敵軍全體都處於持續性狀態」才觸發，隊內持續傷害來源只有 ${dots} 個，建議搭明智光秀（方今之時、囊沙之計）這類`})}}}
    return out;
  }
  return{facsOf,catOf,LEAD,BOSS,leaderFirst,leadCmp,kindOf,feedsAtk,check,quality,tierOf,facType,FEMALE,ofGS,ofS,ps,SRC,INN,POOL,count,usable,pick,options,roleOf,srcPull,pw,fieldScore,TWO:POOL.filter(s=>count(s)>1),MULTI:POOL.filter(s=>count(s)>1).map(s=>[s,count(s)])};
}
