import urllib.request
import re
from bs4 import BeautifulSoup
import json

url = "https://furnimesh.com/library/sofas/sofa/a-contemporary-curved-twoseater-sofa-featuring-a-ukk68h/"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
try:
    with urllib.request.urlopen(req, timeout=15) as res:
        html = res.read().decode("utf-8", errors="ignore")
        soup = BeautifulSoup(html, "html.parser")
        print("H1 Title:", soup.find("h1").get_text(strip=True) if soup.find("h1") else "No H1")
        # Look for download links or glb/obj
        downloads = []
        for a in soup.find_all("a"):
            href = a.get("href", "")
            if any(ext in href.lower() for ext in [".glb", ".obj", ".gltf", "download", "storage.googleapis"]):
                downloads.append((a.get_text(strip=True), href))
        print("Downloads found:", downloads)

        # Look for script tags with JSON / Next.js / state
        scripts = soup.find_all("script")
        for s in scripts:
            if s.get("type") == "application/ld+json":
                print("LD+JSON:", s.string[:200] if s.string else "")
            if s.get("id") == "__NEXT_DATA__":
                data = json.loads(s.string)
                print("__NEXT_DATA__ keys:", list(data.keys()))
                print("pageProps keys:", list(data.get("props", {}).get("pageProps", {}).keys()))
except Exception as e:
    print("Error:", e)
