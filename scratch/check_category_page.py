import urllib.request
import re
from bs4 import BeautifulSoup
import json

url = "https://furnimesh.com/library/sofas/sofa/?page=1"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
try:
    with urllib.request.urlopen(req, timeout=15) as res:
        html = res.read().decode("utf-8", errors="ignore")
        soup = BeautifulSoup(html, "html.parser")
        print("Title:", soup.title.string if soup.title else "")
        # Check __NEXT_DATA__
        next_data = soup.find("script", id="__NEXT_DATA__")
        if next_data:
            print("Has __NEXT_DATA__!")
            data = json.loads(next_data.string)
            props = data.get("props", {}).get("pageProps", {})
            print("pageProps keys:", list(props.keys()))
            for k in props.keys():
                val = props[k]
                if isinstance(val, list):
                    print(f"List key '{k}', count: {len(val)}")
                    if val and isinstance(val[0], dict):
                        print("Sample item keys:", list(val[0].keys()))
                        print("Sample item:", val[0])
                elif isinstance(val, dict):
                    print(f"Dict key '{k}', keys: {list(val.keys())}")
        else:
            print("No __NEXT_DATA__, checking model cards in HTML...")
            cards = soup.find_all(class_=re.compile(r"card|model|item|grid", re.I))
            print(f"Found {len(cards)} card-like elements")
            # find all library links
            links = [a.get("href") for a in soup.find_all("a") if a.get("href") and "/library/" in a.get("href")]
            print(f"Total /library/ links: {len(links)}")
            print("Sample:", links[:5])
except Exception as e:
    print("Error:", e)
