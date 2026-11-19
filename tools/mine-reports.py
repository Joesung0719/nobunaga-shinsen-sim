# 從戰報（戰報.xlsx 總表＋武將頁、戰報詳情_事件_107場.xlsx）統計「玩家實際搭配」，輸出 field.json 給開荒推薦的「AI 一鍵組隊」用。
# 只輸出以武將／戰法為單位的彙總，不含玩家名稱、座標等原始資料。用法：python3 tools/mine-reports.py [戰報資料夾]
import json,sys,difflib,collections,itertools,datetime,openpyxl
base=sys.argv[1] if len(sys.argv)>1 else '/mnt/project-files'
D=json.load(open('land.json'));GEN=set(D['stats']);SK=set(D['skillText'])|set(D['skills'])
FIX={'立花辣千代':'立花誾千代','立花閣千代':'立花誾千代','啄木人為':'鈴木佐大夫'}
cache={}
def norm(n,pool,cut=.75):
    n=(n or '').strip()
    if not n or n in('—','(名稱未辨識)','?'):return None
    n=FIX.get(n,n)
    if n in pool:return n
    k=(id(pool),n)
    if k not in cache:
        m=difflib.get_close_matches(n,pool,1,cut);cache[k]=m[0] if m else None
    return cache[k]
G=sorted(GEN);S=sorted(SK)
wb=openpyxl.load_workbook(base+'/戰報.xlsx',read_only=True,data_only=True)
rows=list(wb['戰報'].iter_rows(values_only=True));h=rows[0];ix={k:i for i,k in enumerate(h)}
gen=collections.defaultdict(lambda:[0,0.0]);pair=collections.defaultdict(lambda:[0,0.0]);trio=collections.defaultdict(lambda:[0,0.0])
nb=0
for r in rows[1:]:
    res={'勝利':1,'平局':.5,'敗北':0}.get(r[ix['結果']])
    if res is None:continue
    nb+=1
    for side,sc in((r[ix['左武將']],res),(r[ix['右武將']],1-res)):
        t=sorted({norm(x,G) for x in (side or '').split('、')}-{None})
        for n in t:gen[n][0]+=1;gen[n][1]+=sc
        for a,b in itertools.combinations(t,2):pair[a+'|'+b][0]+=1;pair[a+'|'+b][1]+=sc
        if len(t)==3:trio['|'.join(t)][0]+=1;trio['|'.join(t)][1]+=sc
# 事件：每位武將實際用過的戰法（損傷事件的技能名，出現在幾場）
wb2=openpyxl.load_workbook(base+'/戰報詳情_事件_107場.xlsx',read_only=True,data_only=True)
ev=list(wb2['事件'].iter_rows(values_only=True))[1:]
seen=collections.defaultdict(set);nev=set()
for r in ev:
    bid,typ,sk,who=r[1],r[3],r[4],r[5]
    nev.add(bid)
    if typ!='損傷' or not sk:continue
    sk=str(sk).strip()
    if sk in('普通攻擊','?'):continue
    g=norm(who,G,.85);s=norm(sk,S,.8)
    if g and s:seen[(g,s)].add(bid)
sg=collections.defaultdict(dict);su=collections.Counter()
for (g,s),b in seen.items():sg[g][s]=len(b);su[s]+=len(b)
out={'built':datetime.date.today().isoformat(),'battles':nb,'detailBattles':len(nev),
 'gen':{k:[v[0],round(v[1],1)] for k,v in gen.items()},
 'pair':{k:[v[0],round(v[1],1)] for k,v in pair.items() if v[0]>=2},
 'trio':{k:[v[0],round(v[1],1)] for k,v in trio.items() if v[0]>=2},
 'skill':{g:dict(sorted(d.items(),key=lambda x:-x[1])) for g,d in sg.items()},'skillUse':dict(su.most_common())}
json.dump(out,open('field.json','w'),ensure_ascii=False,separators=(',',':'))
print(nb,len(gen),len(out['pair']),len(out['trio']),len(sg),sum(len(d) for d in sg.values()))
top=sorted(gen.items(),key=lambda x:-x[1][0])[:12];print([(k,v[0],round(v[1]/v[0],2)) for k,v in top])
print(list(su.most_common(8)))
