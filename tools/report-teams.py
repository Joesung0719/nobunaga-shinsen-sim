# 戰報實戰隊伍：把 戰報.xlsx（131 場總表）＋戰報詳情事件（107 場）整理成「實際出場過的隊伍」：
# 每隊的勝/平/負（左右兩方都算；結果欄是左方視角）、陣型（同勢力／三勢力皆不同／其他）、實際用過的戰法（事件裡出現的技能名，扣掉固有與普攻）。
# 用法：python3 tools/report-teams.py  → report-teams.json（原始戰報不進 repo，只有彙整）
import openpyxl,json,collections,re
L=json.load(open('land.json'));ST=L['stats'];SK=L['skillText']
inn=lambda n:ST[n].get('inn','') or L.get('innate',{}).get(n,'')
R='/mnt/project-files/'
rows=list(openpyxl.load_workbook(R+'戰報.xlsx',read_only=True)['戰報'].iter_rows(values_only=True));ix={k:i for i,k in enumerate(rows[0])}
# 事件：時間 → {武將: Counter(技能)}
# 事件表的時間與總表不同基準，無法對時間；改成「事件戰報裡三位都出手過的隊伍」＝同一隊，把技能累積到隊上
use=collections.defaultdict(lambda:collections.defaultdict(collections.Counter))   # 戰報hash → 武將 → 技能
ev=openpyxl.load_workbook(R+'戰報詳情_事件_107場.xlsx',read_only=True)['事件']
for r in ev.iter_rows(min_row=2,values_only=True):
    _,t,_,typ,sk,who=r[:6]
    if typ and str(typ).startswith('損傷') and sk and who in ST:
        s=str(sk).strip()
        if s in SK and s!=inn(who):use[t][who][s]+=1
        else:use[t][who]['']+=0
teams={}
def add(names,res,t,pos):
    if len(names)!=3 or any(n not in ST for n in names):return
    k='|'.join(sorted(names));d=teams.setdefault(k,{'n':sorted(names),'w':0,'d':0,'l':0,'ord':collections.Counter(),'sk':collections.defaultdict(collections.Counter)})
    d[{'W':'w','D':'d','L':'l'}[res]]+=1;d['ord'][','.join(names)]+=1
    pass
def attach():
    for k,d in teams.items():
        for t,gs in use.items():
            if all(n in gs for n in d['n']):
                d['eb']=d.get('eb',0)+1
                for g in d['n']:
                    for s,v in gs[g].items():
                        if s:d['sk'][g][s]+=v
FL={'勝利':('W','L'),'敗北':('L','W'),'平局':('D','D')}
for r in rows[1:]:
    res=r[ix['結果']];t=str(r[ix['時間']])
    if res not in FL:continue
    a=[x.strip() for x in str(r[ix['左武將']]).split('、')];b=[x.strip() for x in str(r[ix['右武將']]).split('、')]
    add(a,FL[res][0],t,0);add(b,FL[res][1],t,1)
def fac(n):
    f=[ST[x]['f'] for x in n]
    return 'same' if len(set(f))==1 else 'alliance' if len(set(f))==3 else 'mixed'
def build():
  pass
out=[]
attach()
for k,d in teams.items():
    n=sum(d[x] for x in 'wdl')
    lead=d['ord'].most_common(1)[0][0].split(',')
    sk={g:[s for s,_ in c.most_common(4)] for g,c in d['sk'].items()}
    out.append({'n':lead,'w':d['w'],'d':d['d'],'l':d['l'],'cost':sum(ST[x]['c'] for x in lead),'fac':fac(lead),'eb':d.get('eb',0),'sk':sk,'skn':{g:dict(c.most_common(4)) for g,c in d['sk'].items()}})
out.sort(key=lambda x:-(x['w']+x['d']+x['l']))
attach()
# 陣型統計：贏方／輸方各自的 same/alliance/mixed 次數
fs={'W':collections.Counter(),'D':collections.Counter(),'L':collections.Counter()}
for t in out:
    for k,c in (('W',t['w']),('D',t['d']),('L',t['l'])):fs[k][t['fac']]+=c
json.dump({'built':'2026-11-22','battles':len(rows)-1,'teams':out,'facStat':{k:dict(v) for k,v in fs.items()}},open('report-teams.json','w'),ensure_ascii=False)
print(len(out),'隊；出場>=3 的',sum(1 for t in out if t['w']+t['d']+t['l']>=3),fs)
for t in out[:12]:print(t['n'],t['w'],t['d'],t['l'],t['cost'],t['fac'],t['sk'])
