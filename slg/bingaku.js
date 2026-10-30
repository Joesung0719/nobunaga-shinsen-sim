// 兵學（Joe 之後用文字提供，資料到了再補進 BINGAKU）。
// 每支部隊有一個 bingaku 欄位（BINGAKU 的 id，或 null）。一筆兵學的格式：
//   {id:'xxx', name:'名稱', text:'遊戲內說明原文',
//    start({team, enemy, log})      // 戰鬥開始時：例如加屬性 team.gens.forEach(g=>g.b.武勇+=10)
//    dmg({src, dst, g, d, dtype, v}) // 每次傷害：回傳修正後的傷害；src 是出手方部隊
//    end({team, enemy, res, log})}  // 戰鬥結束時
// 沒寫的鉤子就是沒有效果。g.b 是戰鬥中的屬性（已含加點與加成），g.troops 是兵力。
export const BINGAKU=[];

export function bingakuHooks(teams){
  const on=teams.map(t=>[t,BINGAKU.find(b=>b.id===t.bingaku)]).filter(x=>x[1]);
  if(!on.length)return{};
  return{
    start:({A,B,log})=>{for(const[t,b]of on)b.start?.({team:t,enemy:t===A?B:A,log})},
    dmg:(c)=>{for(const[t,b]of on)if(b.dmg&&(c.src===t||c.dst===t))c.v=b.dmg({...c,own:t});return c.v},
    end:({A,B,res,log})=>{for(const[t,b]of on)b.end?.({team:t,enemy:t===A?B:A,res,log})},
  };
}
