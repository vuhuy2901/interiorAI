import urllib.request
import re
import json

url = "https://furnimesh.com/library/sofas/sofa/?page=1"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
html = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", errors="ignore")

chunks = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)', html, re.DOTALL)
full_stream = "".join(chunks).replace('\\"', '"').replace('\\\\', '\\')

idx = full_stream.find('"initialCards":')
print("idx in full_stream:", idx)
if idx != -1:
    start = idx + len('"initialCards":')
    depth = 0
    end = start
    for i in range(start, len(full_stream)):
        if full_stream[i] == '[':
            depth += 1
        elif full_stream[i] == ']':
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    raw = full_stream[start:end]
    print("start:", start, "end:", end, "len:", len(raw))
    cards = json.loads(raw)
    print(f"BINGO! Successfully parsed {len(cards)} models!")
    print(json.dumps(cards[0], indent=2))
