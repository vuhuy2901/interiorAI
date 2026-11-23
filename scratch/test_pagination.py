import urllib.request
import re
import json

for p in [1, 2]:
    url = f"https://furnimesh.com/library/?page={p}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    html = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", errors="ignore")
    chunks = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)', html, re.DOTALL)
    full_stream = "".join(chunks).replace('\\"', '"').replace('\\\\', '\\')
    idx = full_stream.find('"initialCards":')
    if idx != -1:
        start = idx + len('"initialCards":')
        decoder = json.JSONDecoder()
        cards, _ = decoder.raw_decode(full_stream, start)
        print(f"Page {p}: got {len(cards)} cards. First card: {cards[0]['id']} - {cards[0]['category']}")
