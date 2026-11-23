import urllib.request
import json

url = "https://furnimesh.com/library/sofas/sofa/?page=1"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
html = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", errors="ignore")

needle = 'initialCards\\":'
idx = html.find(needle)
start = idx + len(needle)
print("char at start:", repr(html[start]))

# find matching ']'
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
print("raw len:", len(raw))
print("raw start:", repr(raw[:30]))
print("raw end:", repr(raw[-30:]))

# Because it's inside a JSON string in self.__next_f.push([1,"..."]),
# we can parse it by wrapping in quotes and json.loads, or unescaping
unescaped = json.loads('"' + raw.replace('"', '\\"').replace('\\\\"', '\\"') + '"')
cards = json.loads(unescaped)
print("Successfully parsed cards:", len(cards))
print("Card 0 keys:", list(cards[0].keys()))
print(json.dumps(cards[0], indent=2))
