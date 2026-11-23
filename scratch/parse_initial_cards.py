import urllib.request
import re
import json

url = "https://furnimesh.com/library/sofas/sofa/?page=1"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
html = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", errors="ignore")

# Find initialCards
m = re.search(r'"initialCards":(\[\{.*?\}\])(?:,"|\}\])', html)
if not m:
    # try parsing from index of initialCards
    idx = html.find('"initialCards":')
    if idx != -1:
        start = idx + len('"initialCards":')
        # find matching bracket
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
        raw_cards = html[start:end].replace('\\"', '"').replace('\\\\', '\\')
        try:
            cards = json.loads(raw_cards)
            print(f"Successfully parsed {len(cards)} cards from initialCards!")
            print("Card 0 keys:", list(cards[0].keys()))
            print(json.dumps(cards[0], indent=2))
        except Exception as e:
            print("Parse error:", e)
            print("Raw snippet:", raw_cards[:300])
