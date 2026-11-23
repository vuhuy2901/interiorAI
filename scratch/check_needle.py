import urllib.request

url = "https://furnimesh.com/library/sofas/sofa/?page=1"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
html = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", errors="ignore")

needle = 'initialCards\\":['
idx = html.find(needle)
print("needle found:", idx)
if idx != -1:
    print("chars:", repr(html[idx:idx+40]))
