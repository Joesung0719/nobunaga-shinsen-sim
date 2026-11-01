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

// ---- 銀與商店（等級不賣，靠經驗；名將已滿紅，所以也不賣紅度）----
export const SILVER0=1500;
export const SHOP=[
  {k:'weapon',n:'武器',max:5,base:2400,fx:'武勇、智略 +2%／級'},
  {k:'armor',n:'防具',max:5,base:2400,fx:'統率、速度 +2%／級'},
  {k:'camp',n:'兵種營',max:5,base:3000,fx:'全屬性 +2%／級（全軍）'},
  {k:'supply',n:'兵力補給',max:10,base:1600,fx:'每位武將兵力 +1000／級（全軍）'},
];
export const ensureHero=h=>{if(!h.shop){h.silver=SILVER0;h.shop={weapon:0,armor:0,camp:0,supply:0};h.sale=null}return h};
// 價格：下一級的基本價，特價 7 折，魅力折扣每點 0.3%（上限 15%）
export const price=(h,it)=>Math.round(it.base*(h.shop[it.k]+1)*(h.sale===it.k?.7:1)*(1-Math.min(.15,.003*h.pts.魅)));
export const gearMul=h=>{const s=h.shop;return{武勇:1+.02*(s.weapon+s.camp),智略:1+.02*(s.weapon+s.camp),統率:1+.02*(s.armor+s.camp),速度:1+.02*(s.armor+s.camp)}};
export const stageSilver=(i,rank,foes)=>Math.round((2000+300*(i+1))*(RANK_M[rank]||1)+(300+50*(i+1))*foes);
export function newHero({name,arm='騎',color=COLORS[0][0],lean='武'}){
  const pts=Object.fromEntries(ATTRS.map(a=>[a,0]));pts[lean]=3;
  return ensureHero({v:1,name:name.trim().slice(0,6)||'無名',arm,color,lean,lv:1,exp:0,pts,free:0,stage:0,pick:{},done:{}});
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
  const g=h.lv-1,p=h.pts,m=gearMul(ensureHero(h));
  return{武勇:Math.round((85+1.9*g+1.5*p.武)*m.武勇),智略:Math.round((85+1.9*g+1.5*p.智)*m.智略),統率:Math.round((90+2*g+1.5*p.統)*m.統率),速度:Math.round((50+1.3*g+1.5*p.速)*m.速度)};
}
export const heroTroops=h=>3000+200*(h.lv-1)+1000*ensureHero(h).shop.supply;
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
  kawanaka_u:{
    pre:[
      {who:'旁白',text:'永祿四年九月，信濃。霧很濃，千曲川的水聲蓋過了所有的腳步聲。'},
      {who:'宇佐美定滿',text:'{名}，你是前些日子投到主公麾下的客將吧？今夜的事，只有幾個人知道。'},
      {who:'上杉謙信',text:'武田的別動隊已經上了妻女山，本陣空了一半。我要趁霧渡河，直取信玄。你，怕不怕？'},
      {choose:[
        {a:'武',text:'「怕就不會站在這裡。請讓我走在最前面。」',reply:[
          {who:'上杉謙信',text:'好。毘沙門天看著你的刀。'}]},
        {a:'智',text:'「信玄不會沒想到有人偷襲。他的本陣一定留了後手。」',reply:[
          {who:'宇佐美定滿',text:'……是個看得見陷阱的人。主公，這位值得聽一句。'},
          {who:'上杉謙信',text:'我知道有後手。所以才要比他更快。'}]},
        {a:'速',text:'「霧散之前渡河，天亮前就能壓到八幡原。我來開路。」',reply:[
          {who:'上杉謙信',text:'去吧。腳步，要比霧還輕。'}]},
        {a:'魅',text:'「全軍都在等您一句話。說出口，他們今夜就是一個人。」',reply:[
          {who:'上杉謙信',text:'……毘。全軍，渡河。'}]},
      ]},
      {who:'旁白',text:'黎明，霧一點點散開。八幡原的對面，武田的旗已經在眼前。'},
      {who:'柿崎景家',text:'敵軍的陣型，比我們想的整齊。要先打哪一翼？'},
      {choose:[
        {a:'統',text:'「別分散。一個方向壓過去，讓他們的陣型自己裂開。」',reply:[
          {who:'柿崎景家',text:'好，車懸之陣，輪番上！'}]},
        {a:'武',text:'「直取本陣。信玄倒了，其他人自然會退。」',reply:[
          {who:'柿崎景家',text:'有膽識。我跟你衝。'}]},
        {a:'智',text:'「先打弱的那一翼，誘他們的本隊來救，再反手切斷。」',reply:[
          {who:'柿崎景家',text:'……這樣打，他們的軍師也會頭痛。'}]},
      ]},
    ],
    post:[
      {who:'旁白',text:'八幡原上，兩面軍旗在風裡糾纏。這一仗，沒有人能說自己是完全的贏家。'},
      {who:'上杉謙信',text:'信玄還在。但今天，他也知道了，越後的刀有多長。{名}，你有什麼想說的嗎？'},
      {choose:[
        {a:'武',text:'「下次，我想親手面對他。」',reply:[
          {who:'上杉謙信',text:'好。那天，我們一起去。'}]},
        {a:'統',text:'「把今日傷亡的名字都記下來。每個人都該被好好送回去。」',reply:[
          {who:'上杉謙信',text:'……會的。這也是毘沙門天的教誨。'}]},
        {a:'魅',text:'「今天的霧，是為了讓我遇見您才起的吧。」',reply:[
          {who:'上杉謙信',text:'呵，你很會說話。去休息吧。'}]},
      ]},
    ],
  },
  kawanaka_t:{
    pre:[
      {who:'旁白',text:'永祿四年九月，信濃。八幡原的夜裡，武田的篝火少得出奇。'},
      {who:'山本勘助',text:'啄木鳥戰法：別動隊敲響妻女山這棵樹，把蟲逼下山，本隊在另一頭啄食。{名}，你是新來的，記住這個陣型。'},
      {who:'武田信玄',text:'謙信不會乖乖等著被趕。他若比我想的更快，本陣就得撐住。你，願意守在本陣嗎？'},
      {choose:[
        {a:'統',text:'「願意。我會守住每一道防線，讓您的旗不倒。」',reply:[
          {who:'武田信玄',text:'好。疾如風，徐如林——今天，我們是林。'}]},
        {a:'武',text:'「與其守，不如在他們渡河時迎頭撞回去。」',reply:[
          {who:'山本勘助',text:'……果然是個不愛守的人。主公，要不要聽聽看？'},
          {who:'武田信玄',text:'聽，不一定照做。但敢說的人，我欣賞。'}]},
        {a:'智',text:'「謙信若夜渡千曲川，一定留了斥候在霧裡。先找到他們，就知道他來的方向。」',reply:[
          {who:'山本勘助',text:'嗯？這個想法，和老夫的不謀而合。'}]},
        {a:'魅',text:'「兵士們都想知道，這一仗為了什麼。告訴他們，他們就不會退。」',reply:[
          {who:'武田信玄',text:'……說得好。人是城，人是石垣。傳令下去。'}]},
      ]},
      {who:'旁白',text:'霧散去的那一刻，八幡原正面，上杉的軍旗已列成陣。'},
      {who:'馬場信春',text:'來得比預料的早。別動隊還沒回來，本陣只能自己撐。{名}，你有什麼看法？'},
      {choose:[
        {a:'速',text:'「讓輕騎去拖住他們的前鋒，爭取別動隊回來的時間。」',reply:[
          {who:'馬場信春',text:'好。能拖幾刻，是幾刻。'}]},
        {a:'統',text:'「分三層，輪流頂住，不要讓前線一次崩掉。」',reply:[
          {who:'馬場信春',text:'嗯，穩當。照辦。'}]},
        {a:'智',text:'「謙信的目標只有一個：信玄的首級。讓他以為他到了，再收網。」',reply:[
          {who:'馬場信春',text:'……真是危險的想法。但值得一試。'}]},
      ]},
    ],
    post:[
      {who:'旁白',text:'別動隊終於趕回戰場，上杉軍緩緩退去。八幡原上，風裡有血的味道。'},
      {who:'武田信玄',text:'勘助看錯了謙信一步，也看對了謙信一步。{名}，你在這一仗裡，看見了什麼？'},
      {choose:[
        {a:'智',text:'「謀略再深，也要留一條給對方想不到的路。」',reply:[
          {who:'武田信玄',text:'……說得好。勘助，記下來。'}]},
        {a:'統',text:'「兵的陣型，比兵的勇氣更先決定勝負。」',reply:[
          {who:'武田信玄',text:'嗯。這句話，我也想過。'}]},
        {a:'魅',text:'「謙信是個對手，也是個讓人想站得更挺的人。」',reply:[
          {who:'武田信玄',text:'哈哈！好眼光。來，喝一杯。'}]},
      ]},
    ],
  },
  kanegasaki:{
    pre:[
      {who:'旁白',text:'元龜元年四月，越前。金崎城外，傳來了不該傳來的消息。'},
      {who:'織田信長',text:'長政……反了？不可能……不，是真的。全軍撤退！金崎城交給殿軍，誰留下？'},
      {who:'豐臣秀吉',text:'小的留下！把鐵炮和弓都留給我，我撐到最後一刻。'},
      {who:'旁白',text:'你站在殿軍的陣列裡。撤退的號角響起，所有人的目光，都落在你身上。'},
      {choose:[
        {a:'武',text:'「我留下。擋住第一波，我們就賺到了時間。」',reply:[
          {who:'豐臣秀吉',text:'好小子！老子就喜歡這種人。'}]},
        {a:'智',text:'「在兩邊的山口各布一隊弓手，朝倉的人一進來就會挨箭。」',reply:[
          {who:'明智光秀',text:'地形的利用，很到位。就這麼辦。'}]},
        {a:'統',text:'「分班輪守，讓每一隊都能喘口氣。殿軍不能一次崩潰。」',reply:[
          {who:'明智光秀',text:'穩紮穩打，我也同意。'}]},
        {a:'魅',text:'「各位，把背後交給我。今天，我們一起回去。」',reply:[
          {who:'豐臣秀吉',text:'好！這句話，大家都聽見了！'}]},
      ]},
      {who:'德川家康',text:'我的人，也留在這裡。不過，朝倉不是唯一的威脅，淺井的兵，很快就會從後面來。'},
      {who:'豐臣秀吉',text:'這下麻煩了。{名}，你說，我們該先對付哪一邊？'},
      {choose:[
        {a:'速',text:'「先擊潰朝倉的追兵，在淺井趕到之前結束。」',reply:[
          {who:'德川家康',text:'時間很緊，但行得通。'}]},
        {a:'智',text:'「先拖住淺井的先鋒，讓他們來不及會合。」',reply:[
          {who:'明智光秀',text:'切斷會合……好計策。'}]},
        {a:'武',text:'「兩邊都來，那就兩邊都打。」',reply:[
          {who:'豐臣秀吉',text:'哈哈哈！好，就這麼辦！'}]},
      ]},
    ],
    post:[
      {who:'旁白',text:'殿軍成功撤出了金崎。山下的路上，信長的大旗早已不見蹤影。'},
      {who:'豐臣秀吉',text:'呼……撐住了！{名}，你這個人，我記住了。有什麼想說的嗎？'},
      {choose:[
        {a:'魅',text:'「能一起活著回來，比什麼都重要。」',reply:[
          {who:'豐臣秀吉',text:'說得好！今晚，我請客！'}]},
        {a:'統',text:'「殿軍這一仗，每一個人的位置都不能少。」',reply:[
          {who:'明智光秀',text:'……確實。這是我們共同的功勞。'}]},
        {a:'武',text:'「下次，我想跟在主力前面，而不是殿軍。」',reply:[
          {who:'豐臣秀吉',text:'哈哈，等著吧，會有的。'}]},
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
