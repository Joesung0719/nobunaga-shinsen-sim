// 戰役模式：玩家自創的流浪客將，從桶狹間一路打到關原、家康開幕府。
// 這支只放資料與計算（沒有畫面），畫面與流程在 game.js。數值都是遊戲性設計，不是史實，之後可依試玩調整。

export const ATTRS=['武','智','統','魅','速'];
export const ATTR_NAME={武:'武勇',智:'智略',統:'統率',魅:'魅力',速:'速度'};
export const ATTR_HINT={
  武:'硬派強攻，提高武勇（兵刃傷害）',
  智:'獻策謀略，提高智略（謀略傷害）',
  統:'整軍嚴令，提高統率（減傷）',
  魅:'說服安撫：身邊友軍增傷、好感度與對話說服',
  速:'奇襲迅速，提高速度（先手）',
};
export const MAXLV=50;
export const ARMS=['騎','槍','弓','鐵炮'];
export const COLORS=[['#3f7fd9','藍'],['#3e8a5c','綠'],['#a3352f','赤'],['#7b5a8a','紫'],['#c99a2e','金'],['#2c2c33','黑']];

// 關卡順序（依年代）。ids 有兩個代表可以選邊（川中島）。關原與終章之後補。
export const CHAIN=[
  {ids:['okehazama'],era:'1560'},
  {ids:['kawanaka_u','kawanaka_t'],era:'1561'},
  {ids:['kanegasaki'],era:'1570'},
  {ids:['anegawa'],era:'1570'},
  {ids:['mikatagahara'],era:'1572'},
  {ids:['nagashino'],era:'1575'},
  {ids:['tedorigawa'],era:'1577'},
  {ids:['honnoji'],era:'1582'},
  {ids:['yamazaki'],era:'1582'},
  {ids:['shizugatake'],era:'1583'},
  {ids:['komaki'],era:'1584'},
];
export const TOTAL=13;   // 預定總關數（含關原、終章），經驗曲線以它為準

// ---- 經驗與等級 ----
export const expNeed=lv=>60+12*lv;                       // Lv lv → lv+1 所需經驗
const RANK_M={S:1.5,A:1.2,B:1,C:.8};
export const stageExp=(i,rank)=>Math.round((700+100*(i+1))*(RANK_M[rank]||1));
export const routExp=i=>15+5*i;                          // 每擊潰一隊敵軍
// 走到第 i 關開場時「預期」的玩家等級（全 B 評價）；敵軍等級據此訂，跟得上進度才打得贏
export const LV_AT=(()=>{const a=[];let lv=1,ex=0;for(let i=0;i<TOTAL;i++){a.push(lv);ex+=stageExp(i,'B');while(lv<MAXLV&&ex>=expNeed(lv)){ex-=expNeed(lv);lv++}}return a})();
export const enemyLv=i=>Math.min(MAXLV,(LV_AT[i]||MAXLV)+2);

export function newHero({name,arm='騎',color=COLORS[0][0],lean='武'}){
  const pts=Object.fromEntries(ATTRS.map(a=>[a,0]));pts[lean]=3;
  return{v:1,name:name.trim().slice(0,6)||'無名',arm,color,lean,lv:1,exp:0,pts,free:0,stage:0,pick:{},done:{}};
}
// 加經驗，回傳升了幾級；每升一級得 1 點自由點數（Lv50 共 49 點）
export function addExp(h,n){
  let up=0;h.exp+=Math.round(n);
  while(h.lv<MAXLV&&h.exp>=expNeed(h.lv)){h.exp-=expNeed(h.lv);h.lv++;h.free++;up++}
  if(h.lv>=MAXLV)h.exp=0;
  return up;
}
// 玩家的四項戰鬥數值（魅不直接影響數值）。點數每點 ×1.5，與名將 Lv50 的數值量級相當
export function heroStats(h){
  const g=h.lv-1,p=h.pts;
  return{武勇:Math.round(85+1.9*g+1.5*p.武),智略:Math.round(85+1.9*g+1.5*p.智),統率:Math.round(90+2*g+1.5*p.統),速度:Math.round(50+1.3*g+1.5*p.速)};
}
export const heroTroops=h=>3000+200*(h.lv-1);
// 魅力光環：主角在場時，我方全軍傷害 +0.4%／點（上限 +30%）
export const charmDmg=h=>1+Math.min(.3,.004*h.pts.魅);

// 外觀：依傾向決定表情與前立，盔甲色自選
const LOOK={武:{eye:'fierce',crest:'horn'},智:{eye:'calm',crest:'fan'},統:{eye:'round',crest:'tall'},魅:{eye:'smile',crest:'sun'},速:{eye:'sly',crest:'sword'}};
export const heroSpec=h=>({helm:'kabuto',armor:h.color,trim:'#f2e3b0',hair:'#241c18',cape:h.color,...LOOK[h.lean]});

// ---- 劇情（全部原創撰寫）----
// 台詞 {who,text}：who 是武將名；'我' 代表玩家；'旁白' 沒有人像。文字裡的 {名} 會換成玩家名字。
// 選擇點 {choose:[{a:'武',text:玩家說的話,pts:加幾點(預設1),reply:[台詞…]}]}：選了加該項屬性，再接 reply。
// pre 出陣前、post 勝利後。沒寫的關卡用 generic（只有主公一句話，沒有選擇）。
export const SCENES={
  okehazama:{
    pre:[
      {who:'旁白',text:'永祿三年五月，尾張。今川家兩萬五千大軍壓境，清洲城裡卻靜得出奇。'},
      {who:'旁白',text:'一個無名的浪人，帶著一支舊部，在這個夜裡站在清洲城門外。'},
      {who:'織田信長',text:'這麼晚了，在城門外徘徊的是誰？今川的細作，還是想找死的人？'},
      {choose:[
        {a:'武',text:'「我叫{名}。只問一件事——主公敢不敢迎戰？」',reply:[
          {who:'織田信長',text:'哈哈，好大的膽子！敢這樣對本殿說話的人，這一年來你是第一個。'}]},
        {a:'智',text:'「我看過今川的行軍路線。他們會在桶狹間歇馬，守備最鬆。」',reply:[
          {who:'織田信長',text:'……你說的地方，和本殿想的一模一樣。進來，把話說完。'}]},
        {a:'魅',text:'「我是來討一碗飯吃的，順便幫您贏這一仗。」',reply:[
          {who:'織田信長',text:'哈哈哈哈！一碗飯，管夠！你這傢伙，本殿喜歡。'}]},
        {a:'速',text:'「我從熱田神宮一路趕來，今川的先頭離這裡只剩一日路程。」',reply:[
          {who:'織田信長',text:'一日？來得好，趕得上就趕上！'}]},
      ]},
      {who:'織田信長',text:'聽好，{名}。本殿只有三千兵，對面有兩萬五千。想活命，就跟緊本殿的旗。'},
      {who:'森可成',text:'主公，要不要先分兵，讓今川以為我們要退？'},
      {choose:[
        {a:'統',text:'「分兵反而容易被各個擊破。全軍一起走，一起衝。」',reply:[
          {who:'森可成',text:'……有道理。人數少，更要擰成一股繩。'}]},
        {a:'智',text:'「讓他們以為我們固守清洲，鬆懈了，才會停在桶狹間。」',reply:[
          {who:'森可成',text:'故意示弱嗎？好計。'}]},
        {a:'速',text:'「我先帶輕騎去探。天色一轉，我就回報。」',reply:[
          {who:'織田信長',text:'去。別被看見，也別跑慢了。'}]},
        {a:'武',text:'「不必想那麼多。只要斬下義元的首級，一切就結束了。」',reply:[
          {who:'森可成',text:'……說得簡單。不過，我也想這麼做。'}]},
        {a:'魅',text:'「讓各隊都知道今天的目標只有一個：義元。人心一齊，事就成了一半。」',reply:[
          {who:'織田信長',text:'傳令下去！照他說的辦。'}]},
      ]},
    ],
    post:[
      {who:'旁白',text:'雨停了。桶狹間的泥地上，今川家的旗倒了一地。'},
      {who:'織田信長',text:'義元的首級，是你們每一個人的功勞。{名}，你呢？想要什麼賞賜？'},
      {choose:[
        {a:'武',text:'「刀還沒有鈍。下一場仗在哪裡？」',reply:[
          {who:'織田信長',text:'好，本殿就等你這句話。'}]},
        {a:'智',text:'「今川一倒，三河的松平必定動搖。請善待他們，不要逼他們。」',reply:[
          {who:'織田信長',text:'……你想得比本殿遠。記住了。'}]},
        {a:'魅',text:'「今天的雨，大概是專門為我們下的。天都站在您這邊。」',reply:[
          {who:'織田信長',text:'哈哈，天不天不知道，有你們在，本殿就站得住。'}]},
      ]},
    ],
  },
};
// 沒有專屬劇情的關卡
export const generic=(lord)=>({
  pre:[{who:lord,text:'{名}，聽說你是個靠得住的人。這一仗，我就把右翼交給你了。'},
       {who:'我',text:'「是。我會盡全力。」'}],
  post:[{who:lord,text:'幹得好，{名}。先回營休息，下一場仗還在等著。'}],
});
