#!/usr/bin/env python3
"""Lädt zu jedem Ausflug das Hauptbild des Wikipedia-Artikels von Wikimedia Commons.

Liest .github/images.tsv (id, Sprache, Artikel), speichert img/<id>.jpg (800 px)
und schreibt Bildnachweise nach img/credits.json. Nur Dateien auf Commons
(freie Lizenz) werden übernommen, alles andere wird übersprungen.
"""
import html, json, os, re, sys, urllib.parse, urllib.request

UA = 'china-reise-app/1.0 (https://github.com/AlexFeini/china-reise)'
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'img')


def get_json(url, params):
    q = url + '?' + urllib.parse.urlencode({**params, 'format': 'json', 'formatversion': 2})
    with urllib.request.urlopen(urllib.request.Request(q, headers={'User-Agent': UA}), timeout=30) as r:
        return json.load(r)


def page_image(lang, title):
    d = get_json(f'https://{lang}.wikipedia.org/w/api.php',
                 {'action': 'query', 'titles': title, 'prop': 'pageimages', 'piprop': 'name', 'redirects': 1})
    pages = d.get('query', {}).get('pages', [])
    return pages[0].get('pageimage') if pages else None


def commons_info(name):
    d = get_json('https://commons.wikimedia.org/w/api.php',
                 {'action': 'query', 'titles': 'File:' + name, 'prop': 'imageinfo',
                  'iiprop': 'url|extmetadata|mime', 'iiurlwidth': 800})
    page = d['query']['pages'][0]
    if page.get('missing') or not page.get('imageinfo'):
        return None
    return page['imageinfo'][0]


def plain(s):
    return html.unescape(re.sub(r'<[^>]+>', '', s or '')).strip()


def main():
    os.makedirs(OUT, exist_ok=True)
    credits = {}
    with open(os.path.join(ROOT, '.github', 'images.tsv'), encoding='utf-8') as f:
        rows = [l.rstrip('\n').split('\t') for l in f if l.strip()]
    for id_, lang, title in rows:
        try:
            name = page_image(lang, title)
            info = commons_info(name) if name else None
            if not info or info.get('mime') != 'image/jpeg':
                print(f'{id_}: kein freies JPEG ({title})')
                continue
            meta = info.get('extmetadata', {})
            req = urllib.request.Request(info['thumburl'], headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=60) as r, open(os.path.join(OUT, id_ + '.jpg'), 'wb') as out:
                out.write(r.read())
            credits[id_] = {
                'f': f'img/{id_}.jpg',
                'a': plain(meta.get('Artist', {}).get('value'))[:120] or 'unbekannt',
                'l': plain(meta.get('LicenseShortName', {}).get('value')) or 'siehe Commons',
                'u': info['descriptionurl'],
            }
            print(f'{id_}: {name}')
        except Exception as e:  # ein fehlendes Bild soll den Rest nicht aufhalten
            print(f'{id_}: Fehler {e}', file=sys.stderr)
    with open(os.path.join(OUT, 'credits.json'), 'w', encoding='utf-8') as f:
        json.dump(credits, f, ensure_ascii=False, indent=0, sort_keys=True)
    print(f'{len(credits)} von {len(rows)} Bildern geladen')


if __name__ == '__main__':
    main()
