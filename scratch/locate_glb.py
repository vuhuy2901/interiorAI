from bs4 import BeautifulSoup
import urllib.request
import re

url = "https://furnimesh.com/library/sofas/sofa/?page=1"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
html = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", errors="ignore")

for match in re.finditer(r'https://storage\.googleapis\.com/furnimesh-3d/gbl-files/[^"\'\s<>\\]+', html):
    start = max(0, match.start() - 100)
    end = min(len(html), match.end() + 100)
    print("Context around match:")
    print(html[start:end])
    print("=" * 40)
    break
