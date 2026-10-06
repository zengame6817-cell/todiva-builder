import json, re, time, urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
BASE='https://tekuwiki.cloudfree.jp/'
def fetch(url):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url,timeout=45) as r: return r.read().decode('utf-8')
        except Exception:
            if attempt==2: raise
            time.sleep(2)
def parse_list(html):
    out=[]
    for row in BeautifulSoup(html,'html.parser').select('tr'):
        t=row.find_all('td',recursive=False)
        if len(t)!=8 or t[5].get_text(strip=True)!='キャラ': continue
        title=t[2].get_text(' ',strip=True)
        m=re.match(r'【(.*?)】\s*(.*)',title)
        out.append(dict(id=int(t[0].get_text(strip=True)),name=t[7].get_text(' ',strip=True),cardName=m[1] if m else title,rarity=t[4].get_text(strip=True),attribute=t[6].get_text(strip=True),image=t[1].img['src'],sourceUrl=t[2].a['href']))
    return out
def detail(c):
    cache=ROOT/'cache'/f'{c["id"]}.html'
    try:
        html=cache.read_text(encoding='utf-8') if cache.exists() else fetch(c['sourceUrl'])
        cache.parent.mkdir(exist_ok=True); cache.write_text(html,encoding='utf-8')
        soup=BeautifulSoup(html,'html.parser')
        start=soup.find('h3',string=re.compile('初期ステータス'))
        nodes=[]
        if start:
            for n in start.next_siblings:
                if getattr(n,'name',None) in ['h2','h3']: break
                nodes.append(str(n))
        section=BeautifulSoup(''.join(nodes),'html.parser')
        c['initialStats']={}
        for row in section.select('tr'):
            cells=row.find_all(['td','th'])
            for i in range(len(cells)-1):
                key=cells[i].get_text(strip=True); val=cells[i+1].get_text(strip=True).replace(',','')
                if key in ['俊敏性','攻撃力','HP','物攻','物防','特攻','特防','狂暴性','耐久性','人間性','魔性'] and val.isdigit(): c['initialStats'][key]=int(val)
        lines=[x.strip() for x in section.get_text('\n',strip=True).splitlines() if x.strip()]
        c['attackerType']=next((x.strip('《》') for x in lines if 'アタッカー' in x),None)
        c['skills']={}
        for label,key in [('ユニークスキル','unique'),('アクティブスキル','active'),('パッシブスキル','passive')]:
            if label in lines:
                i=lines.index(label)+1; end=next((j for j in range(i,len(lines)) if lines[j] in ['ユニークスキル','アクティブスキル','パッシブスキル']),len(lines))
                c['skills'][key]='\n'.join(lines[i:end])
            else: c['skills'][key]=None
        # Preserve table-row boundaries for accurate skill-name counts.
        c['skillDetails']={'unique':[], 'active':[], 'passive':[]}
        category=None
        categories={'ユニークスキル':'unique','アクティブスキル':'active','パッシブスキル':'passive'}
        for row in section.select('tr'):
            label=row.get_text(' ',strip=True)
            if label in categories:
                category=categories[label]
                continue
            if category:
                for cell in row.find_all('td',recursive=False):
                    parsed=BeautifulSoup(str(cell),'html.parser')
                    for br in parsed.find_all('br'): br.replace_with('\n')
                    parts=[p.strip() for p in parsed.get_text().splitlines() if p.strip()]
                    if not parts: continue
                    name=parts[0]
                    cost=parts[1] if category=='active' and len(parts)>1 and re.match(r'^\d+\s*TU\s*/',parts[1]) else None
                    description='\n'.join(parts[2:] if cost else parts[1:])
                    c['skillDetails'][category].append({'name':name,'description':description,'cost':cost,'requiresRear':'増援' in description,'positionCheck':'エントリー' in name})
        portrait=start.find_previous('h2').find_next('img') if start else None
        c['previewImage']=portrait.get('src') if portrait else c['image']
        link=soup.find(['h2','h3'],string=re.compile('^リンクボーナス$'))
        c['linkBonus']=link.find_next('table').get_text(' ',strip=True) if link else None
        c['dataStatus']='complete' if start else 'missing'
    except Exception as e:
        c.update(initialStats={},attackerType=None,skills={},linkBonus=None,dataStatus='failed'); print(c['id'],str(e))
    return c
if __name__=='__main__':
    cards=parse_list((ROOT/'list.html').read_text(encoding='utf-8'))
    print('Character cards:',len(cards),flush=True)
    with ThreadPoolExecutor(max_workers=3) as pool: cards=list(pool.map(detail,cards))
    previous_path=ROOT/'dist/data/cards.json'
    previous=json.loads(previous_path.read_text(encoding='utf-8')) if previous_path.exists() else {}
    previous_by_id={c['id']:c for c in previous.get('cards',[])}
    for card in cards:
        old=previous_by_id.get(card['id'],{})
        if old.get('defaultImageAdjustment'):
            for key in ['image','iconImage','detailImage','defaultImageAdjustment']:
                if key in old: card[key]=old[key]
    refreshed={c['id'] for c in cards}
    cards.extend(c for c in previous.get('cards',[]) if c['id'] not in refreshed)
    data={**previous,'schemaVersion':1,'fetchedAt':time.strftime('%Y-%m-%d'),'source':BASE+'全カード一覧/','cards':cards}
    (ROOT/'dist/data/cards.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Complete:',sum(c['dataStatus']=='complete' for c in cards),'/',len(cards),flush=True)
