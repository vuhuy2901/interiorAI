import urllib.request
import json

url = "https://furnimesh.com/library/sofas/sofa/?page=1"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
html = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", errors="ignore")

idx = html.find('initialCards\\":')
if idx != -1:
    start = idx + len('initialCards\\":')
    # scan for matching bracket accounting for escapes
    depth = 0
    end = start
    for i in range(start, len(html)):
        if html[i] == '[':
            depth += 1
        elif html[i] == ']':
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    raw_cards = html[start:end].encode('utf-8').decode('unicode_escape')
    try:
        cards = json.loads(raw_cards)
        print(f"Successfully parsed {len(cards)} cards!")
        print("Keys of card 0:", list(cards[0].keys()))
        print(json.dumps(cards[0], indent=2))
    except Exception as e:
        print("Decode error:", e)
        # try simple replace
        raw2 = html[start:end].replace('\\"', '"').replace('\\\\', '\\')
        cards = json.loads(raw2)
        print(f"Parsed with replace: {len(cards)} cards!")
        print(json.dumps(cards[0], indent=2))
