from bs4 import BeautifulSoup
import urllib.request
import re

url = "https://furnimesh.com/library/sofas/sofa/?page=1"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
html = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", errors="ignore")
soup = BeautifulSoup(html, "html.parser")

for s in soup.find_all("script"):
    if "glb3D" in (s.string or ""):
        print("Script type:", s.get("type"))
        print("Script id:", s.get("id"))
        content = s.string or ""
        print("Script length:", len(content))
        print("Content preview:", content[:300])
        break
