from bs4 import BeautifulSoup
import urllib.request
import re

url = "https://furnimesh.com/library/sofas/sofa/?page=1"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
html = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", errors="ignore")
soup = BeautifulSoup(html, "html.parser")

for a in soup.find_all("a"):
    href = a.get("href", "")
    if re.search(r"-[a-z0-9]{5,8}/?$", href):
        print("Model URL:", href)
        # Find parent container or card
        parent = a.find_parent("div")
        # Check all links inside parent or nearby
        card = a
        for _ in range(3):
            if card.parent:
                card = card.parent
        card_html = str(card)
        glb = re.findall(r'https://storage\.googleapis\.com/furnimesh-3d/gbl-files/[^"\'\s<>\\]+', card_html)
        obj = re.findall(r'https://storage\.googleapis\.com/furnimesh-3d/obj-files/[^"\'\s<>\\]+', card_html)
        img = re.findall(r'https%3A%2F%2Fstorage\.googleapis\.com%2Ffurnimesh-3d%2F[^"\'\s&]+', card_html)
        print("  GLB:", glb[:1])
        print("  OBJ:", obj[:1])
        print("  IMG:", [urllib.parse.unquote(i) for i in img[:1]])
        print("---")
        break
