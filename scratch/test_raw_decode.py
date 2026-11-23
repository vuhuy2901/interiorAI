import urllib.request
import re
import json

url = "https://furnimesh.com/library/sofas/sofa/?page=1"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
html = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", errors="ignore")

chunks = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)', html, re.DOTALL)
full_stream = "".join(chunks).replace('\\"', '"').replace('\\\\', '\\')

idx = full_stream.find('"initialCards":')
start = idx + len('"initialCards":')

decoder = json.JSONDecoder()
cards, end = decoder.raw_decode(full_stream, start)
print(f"BINGO! Successfully parsed {len(cards)} models!")
print("Sample card fields:", list(cards[0].keys()))
print(json.dumps(cards[0], indent=2))
