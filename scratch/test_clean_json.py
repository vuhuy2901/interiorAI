import urllib.request
import json

url = "https://furnimesh.com/library/sofas/sofa/?page=1"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
html = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", errors="ignore")

needle = 'initialCards\\":['
idx = html.find(needle)
if idx != -1:
    start = idx + len(needle) - 1 # start at '['
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
    raw = html[start:end]
    # Replace \" with "
    clean_json = raw.replace('\\"', '"').replace('\\\\', '\\')
    cards = json.loads(clean_json)
    print(f"Success! Extracted {len(cards)} cards on page 1.")
    print("Keys:", list(cards[0].keys()))
    print(json.dumps(cards[0], indent=2))
