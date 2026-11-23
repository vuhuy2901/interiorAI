from bs4 import BeautifulSoup
import urllib.request
import re

url = "https://furnimesh.com/library/sofas/sofa/?page=1"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
html = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", errors="ignore")
soup = BeautifulSoup(html, "html.parser")

model_links = []
for a in soup.find_all("a"):
    href = a.get("href", "")
    # Check if href ends with slug pattern (slug-id/)
    if re.search(r"-[a-z0-9]{5,8}/?$", href):
        img = a.find("img")
        img_src = img.get("src") if img else None
        model_links.append((href, a.get_text(strip=True), img_src))

print(f"Found {len(model_links)} model links on page 1:")
for l, t, img in model_links[:5]:
    print("Link:", l)
    print("Text:", t)
    print("Img:", img)
    print("---")
