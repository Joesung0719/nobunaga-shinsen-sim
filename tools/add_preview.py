# 新賽季官方預告（tools/pk_preview.txt）併入 land.json：python3 tools/add_preview.py .
# 可以重複執行（每次覆蓋同名資料）。land.json 目前不是完全由 build_land.py 產生（之後的 PR 直接改過 land.json），
# 所以預告資料用這支獨立加上去，不重跑 build_land.py。
import json, sys
repo = sys.argv[1] if len(sys.argv) > 1 else '.'
P = f'{repo}/land.json'
D = json.load(open(P, encoding='utf-8'))
STAT_KEYS = ['武勇', '智略', '統率', '速度', '政務', '魅力']
KIND = {'主': '主動', '突': '突擊', '指': '指揮', '被': '被動'}
ART = {'佐佐成政': 'p01', '長宗我部國親': 'p02', '土居清良': 'p03', '小早川秀包': 'p04'}
NOTE = '官方預告，僅供參考，實際以上線版本為準'

pv = {'note': NOTE, 'src': 'Joe 2026-11-25 官方「PK賽季武將全面解析」「事件戰法總覽」截圖 30 張',
      'unknown': ['兵學樹', 'Lv50 數值（只有 1 級基礎屬性與每級成長）', '戰法 Lv2～9 的數值（只有 Lv1→滿級）'],
      'gens': {}, 'events': {}, 'teams': []}
team = {}
for raw in open(f'{repo}/tools/pk_preview.txt', encoding='utf-8'):
    line = raw.rstrip('\n')
    if not line.strip() or line.startswith('#'): continue
    f = line.split('|'); tag = f[0]
    if tag == 'S':
        n, cost, fac, house, *rest = f[1:]
        vals, (inn, kind, tags, traits) = rest[:6], rest[6:]
        D['stats'][n] = dict(r=5, c=int(cost), f=fac, st={k: [float(a), float(b)] for k, (a, b) in zip(STAT_KEYS, (v.split() for v in vals))},
                             inn=inn, kind=kind, tags=tags.split(','), traits=traits.split(','), season='PK', pre=True)
        D['innate'][n] = inn
        D['kind'][inn] = KIND[kind]
        D.setdefault('art', {})[n] = ART[n]
        pv['gens'].setdefault(n, {})['house'] = house
    elif tag == 'T':
        D['traitText'].setdefault(f[1], {})[f[2]] = f[3]
    elif tag == 'K':
        s, g, kind, tags, target, rate, text, boss = f[1:9]
        t = dict(g=g, kind=kind, tags=tags, target=target, rate=rate, text=text, pre=True)
        if boss: t['boss'] = boss
        old = D['skillText'].get(s, {})
        for k in ('ev', 'arm'):
            if k in old: t[k] = old[k]
        D['skillText'][s] = t; D['skills'][s] = g; D['kind'][s] = kind
    elif tag == 'R':
        D['skillText'][f[1]]['arm'] = f[2]
    elif tag == 'E':
        s, ev, cost, arms = f[1:5]
        D['skillText'].setdefault(s, {})['ev'] = ev
        pv['events'].setdefault(s, {}).update(event=ev, cost=cost, arms=arms)
    elif tag == 'G':
        D['teach'][f[1]] = f[3]
    elif tag == 'H':
        pv['gens'].setdefault(f[1], {})['heijo'] = dict(name=f[2], cat=f[3], pos=f[4], neg=f[5])
    elif tag == 'B':
        pv['gens'].setdefault(f[1], {})['story'] = f[2]
    elif tag == 'A':
        pv['gens'].setdefault(f[1], {}).setdefault('ana', {})[f[2]] = f[3]
    elif tag == 'X':
        pv['events'].setdefault(f[1], {}).setdefault('ana', {})[f[2]] = f[3]
    elif tag == 'O':
        team[f[1]] = dict(id=int(f[1]), title=f[2], cost=int(f[3]), note=f[4], gens=[])
        pv['teams'].append(team[f[1]])
    elif tag == 'M':
        sk = f[5].split(',')
        team[f[1]]['gens'].append(dict(n=f[2], c=int(f[3]), lead=f[4] == '1', s=sk[:3], a=sk[3:], pt=f[6], bg=f[7].split(',')))
    else:
        raise SystemExit(f'不認得的行：{line}')
# 官方截圖用字和資料庫不同的戰法名（只影響載入，畫面照官方原字顯示）
pv['alias'] = {'氣勢衝天': '氣勢沖天', '七十二歎計': '七十二欺計', '鐵炮僧兵': '鐵炮僧兵隊'}
D['preview'] = pv
json.dump(D, open(P, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('preview:', len(pv['gens']), 'generals,', len(pv['events']), 'event skills,', len(pv['teams']), 'teams')
