import urllib.request

url = "https://furnimesh.com/library/sofas/sofa/?page=1"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
html = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", errors="ignore")

needle = 'initialCards\\":'
idx = html.find(needle)
start = idx + len(needle)

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

print("start:", start, "end:", end, "len:", end - start)
print(html[start:start+100])
