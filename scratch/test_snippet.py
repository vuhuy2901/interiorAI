import urllib.request
import re
import json

url = "https://furnimesh.com/library/sofas/sofa/?page=1"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
html = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", errors="ignore")

idx = html.find('initialCards')
print("idx of initialCards:", idx)
if idx != -1:
    snippet = html[idx:idx+200]
    print("Snippet:", snippet)
