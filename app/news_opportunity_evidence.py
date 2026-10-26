"""Use explicit article securities and article prose, never JSON/URL token guesses."""
import json
import re


def candidates_from_news(text, records, markets):
    try: articles=json.loads(text)
    except (ValueError,TypeError):return None
    if isinstance(articles,dict):articles=articles.get('items')
    if not isinstance(articles,list) or not articles or not all(isinstance(a,dict) for a in articles):return None
    if not any(any(k in a for k in ('related_symbols','mentioned_symbols','symbol_evidence')) for a in articles):return None
    all_known={row['symbol']:row for row in records}
    known={code:row for code,row in all_known.items() if row['market'] in markets}
    found={};unresolved={}
    for article_index,article in enumerate(articles):
        codes=[]
        for key in ('related_symbols','mentioned_symbols'):
            values=article.get(key)
            if isinstance(values,list):codes.extend(c for c in values if isinstance(c,str))
        codes=list(dict.fromkeys(codes))
        for code in codes:
            if code in all_known and code not in known:continue
            record=known.get(code)
            if not record:
                unresolved[code]=dict(symbol=code,reason='新闻明确关联，但本地证券目录未确认其市场身份，未调用 JEV')
                continue
            row=found.setdefault(code,{k:v for k,v in record.items() if k not in ('aliases','_names')} | dict(evidence=[],articles=[],firstMention=article_index,mentionCount=0,evidenceScope='article-original-excerpts'))
            names=[record['name'],*record.get('aliases',[])]
            names.extend(s.get('name','') for s in (article.get('related_stocks') or []) if isinstance(s,dict) and s.get('symbol')==code)
            anchors=[re.escape(code),*[re.escape(name) for name in names if isinstance(name,str) and len(name)>=3]]
            matches=[]
            # Keep source fields separate: no image paths, links, other articles'
            # metadata, or serialized tag lists become JEV evidence.
            for field in ('content_text','aime_summary'):
                source=article.get(field) or ''
                if not isinstance(source,str):continue
                hits=sorted({(m.start(),m.end()) for pattern in anchors for m in re.finditer(r'(?<![A-Za-z0-9])'+pattern+r'(?![A-Za-z0-9])',source,re.I)})
                row['mentionCount']+=len(hits)
                if not hits and source:
                    hits=[(i,min(i+1,len(source))) for i in sorted({0,len(source)//2,max(0,len(source)-160)})]
                for position in sorted({0,len(hits)//2,len(hits)-1}) if hits else []:
                    start,end=hits[position];left=max(0,start-100);right=min(len(source),left+280)
                    evidence=dict(start=left,end=right,text=source[left:right],mention=source[start:end],sourceField=field,
                                  articleIndex=article_index,articleUrl=article.get('url',''),publishedAt=article.get('published_at',''))
                    if evidence not in matches:matches.append(evidence)
            row['evidence'].extend(matches)
            row['articles'].append(dict(title=article.get('title',''),url=article.get('url',''),publishedAt=article.get('published_at',''),
                                        summary=article.get('summary',''),excerpts=[e['text'] for e in matches]))
    return list(found.values()),list(unresolved.values())
