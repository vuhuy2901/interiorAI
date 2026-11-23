import urllib.request
import re
from bs4 import BeautifulSoup

url = "https://furnimesh.com/library/"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
html = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", errors="ignore")
soup = BeautifulSoup(html, "html.parser")

cat_links = set()
for a in soup.find_all("a"):
    href = a.get("href", "")
    if href.startswith("/library/") and href != "/library/":
        parts = href.strip("/").split("/")
        # /library/<cat>/<subcat> or /library/<cat>
        if len(parts) >= 2 and not re.search(r"-[a-z0-9]{5,8}$", href.strip("/")):
            cat_links.add(href)

print(f"Found {len(cat_links)} category/subcategory URLs:")
for c in sorted(cat_links):
    print(" ", c)
