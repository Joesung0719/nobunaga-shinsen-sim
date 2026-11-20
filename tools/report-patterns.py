#!/usr/bin/env python3
"""戰報搭配規律：從詳細戰報事件（events.csv，不進 repo）歸納「哪些戰法搭配真的有效」。
用法：python3 tools/report-patterns.py /path/events.csv [--write]    --write 會把彙總結果（不含原始戰報）合併進 field.json 的 skillWin / kindWin / dmgShare。
做法（全是推估）：
 1. 用同場戰報裡「攻擊者→目標」的往來，把出手最多的 6 位武將切成 3 對 3（兩邊互相攻擊最多的切法）。
 2. 勝負＝戰報最後記錄到的雙方剩餘兵力（差距 < 300 的不算）。
 3. 戰法名稱 OCR 有雜訊，用相似度對回 land.json 的戰法名。只看得到「有造成傷害」的戰法，純增益技看不到。
"""
import csv,json,collections,difflib,re,sys,itertools,os
R=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')
d=json.load(open(os.path.join(R,'land.json')));T=d['skillText'];st=d['stats']
kind={k:v['kind'] for k,v in T.items()}
innate={n:(st.get(n,{}).get('inn') or d['innate'].get(n)) for n in set(st)|set(d['innate'])}
kg=os.path.join(os.path.dirname(sys.argv[1]),'known_generals.txt')
known=set(st)
for p in (kg,'/mnt/project-files/report-collector/known_generals.txt'):
    if os.path.exists(p):known|={l.strip() for l in open(p,encoding='utf-8') if l.strip()};break
known=sorted(known)
def fz(x,pool,cut=.6):
    x=(x or '').strip()
    if x in pool:return x
    m=difflib.get_close_matches(x,pool,1,cut);return m[0] if m else None
def skn(s):
    s=re.sub(r'^[\d【\[\]『』」〔\(\)_\s]+','',s.strip())
    return s if s in('','?','普通攻擊') else fz(s,list(T),.7)
rows=list(csv.DictReader(open(sys.argv[1],encoding='utf-8-sig')))
B=collections.defaultdict(list)
for r in rows:B[r['battle']].append(r)
recs=[]
for b,ev in B.items():
    cnt=collections.Counter();W=collections.Counter();use=collections.defaultdict(set);dmg=collections.defaultdict(collections.Counter);remain={}
    for r in ev:
        a=fz(r['attacker'],known);t=fz(r['target'],known)
        if a:cnt[a]+=1
        if a and t and a!=t and r['kind'] in('普攻','損傷'):W[frozenset((a,t))]+=1
        s=skn(r['skill'])
        if a and s and s not in('?','','普通攻擊'):use[a].add(s)
        if a and r['kind']=='損傷' and r['loss'].isdigit() and s:dmg[a]['普攻' if s=='普通攻擊' else kind.get(s,'?')]+=int(r['loss'])
        if t and r['remain'].isdigit() and r['kind']=='損傷':remain[t]=int(r['remain'])
    names=[n for n,_ in cnt.most_common(6)]
    if len(names)<6:continue
    best=None
    for comb in itertools.combinations(names,3):
        if names[0] not in comb:continue
        A=set(comb);sc=sum(w*(1 if len(k&A)==1 else -1) for k,w in W.items() if k<=set(names))
        if best is None or sc>best[0]:best=(sc,A,set(names)-A)
    if best[0]<8:continue
    sides=[sorted(best[1]),sorted(best[2])];rem=[sum(remain.get(n,0) for n in x) for x in sides]
    if abs(rem[0]-rem[1])<300:continue
    for c in(0,1):
        sk=set().union(*[use[n] for n in sides[c]]);dk=sum((dmg[n] for n in sides[c]),collections.Counter())
        recs.append(dict(win=rem[c]>rem[1-c],team=sides[c],sk=sk,kinds=collections.Counter(kind[s] for s in sk),dk=dk))
print('可判定勝負的戰報',len(recs)//2,'場 /',len(B))
def rate(f,label):
    a=[r for r in recs if f(r)]
    if len(a)>=4:print(f'{label}: {len(a)}隊 勝率 {sum(r["win"] for r in a)*100//len(a)}%')
for k in('突擊','主動','指揮','兵種','被動'):
    for n in range(4):rate(lambda r:r['kinds'][k]==n,f'實際發動過的{k}戰法 {n} 種')
tw=collections.Counter();tl=collections.Counter()
for r in recs:(tw if r['win'] else tl).update(r['dk'])
sh=lambda c:{k:round(v/sum(c.values()),3) for k,v in c.items()}
print('贏方傷害來源',sh(tw));print('輸方傷害來源',sh(tl))
sw=collections.defaultdict(lambda:[0,0])
for r in recs:
    for s in r['sk']:sw[s][0]+=1;sw[s][1]+=r['win']
kw={}
for k in('突擊','主動','指揮','兵種','被動'):
    kw[k]={n:[sum(1 for r in recs if r['kinds'][k]==n),sum(r['win'] for r in recs if r['kinds'][k]==n)] for n in range(4)}
for s,(n,w) in sorted(sw.items(),key=lambda x:-x[1][1]/x[1][0]):
    if n>=5:print(f'  {s}({kind[s]}) {n}隊 勝{w*100//n}%')
if '--write' in sys.argv:
    f=os.path.join(R,'field.json');F=json.load(open(f))
    F['skillWin']={s:v for s,v in sw.items()};F['kindWin']=kw;F['dmgShare']={'win':sh(tw),'lose':sh(tl)};F['patternBattles']=len(recs)//2
    json.dump(F,open(f,'w'),ensure_ascii=False,separators=(',',':'))
