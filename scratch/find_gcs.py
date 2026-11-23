from bs4 import BeautifulSoup
import urllib.request
import re

url = "https://furnimesh.com/library/sofas/sofa/a-contemporary-curved-twoseater-sofa-featuring-a-ukk68h/"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
html = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", errors="ignore")

# Find all matches of storage.googleapis.com/furnimesh-3d
matches = set(re.findall(r'https://storage\.googleapis\.com/furnimesh-3d/[^"\'\s<>]+', html))
print(f"Total GCS matches: {len(matches)}")
for m in sorted(matches):
    print(" ", m)
