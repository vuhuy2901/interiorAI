from bs4 import BeautifulSoup
import urllib.request
import re

url = "https://furnimesh.com/library/sofas/sofa/?page=1"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
html = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", errors="ignore")

glb_matches = set(re.findall(r'https://storage\.googleapis\.com/furnimesh-3d/gbl-files/[^"\'\s<>]+', html))
print(f"GLB matches on category page: {len(glb_matches)}")
