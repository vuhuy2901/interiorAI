import urllib.request
import re
from bs4 import BeautifulSoup

url = "https://furnimesh.com/library/"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
try:
    with urllib.request.urlopen(req, timeout=15) as res:
        html = res.read().decode("utf-8", errors="ignore")
        print("Page length:", len(html))
        soup = BeautifulSoup(html, "html.parser")
        print("Title:", soup.title.string if soup.title else "No title")
        links = [a.get("href") for a in soup.find_all("a") if a.get("href")]
        lib_links = [l for l in links if "/library" in l]
        print(f"Total links: {len(links)}, library links: {len(lib_links)}")
        print("Sample lib links:", lib_links[:15])
except Exception as e:
    print("Error:", e)
