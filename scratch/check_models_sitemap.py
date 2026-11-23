import urllib.request
import gzip

url = "https://furnimesh.com/sitemap-models.xml"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept-Encoding": "gzip"})
with urllib.request.urlopen(req, timeout=15) as res:
    data = res.read()
    if res.headers.get("content-encoding") == "gzip" or data[:2] == b"\x1f\x8b":
        data = gzip.decompress(data)
    text = data.decode("utf-8", errors="ignore")
    print("sitemap-models length:", len(text))
    urls = [line.strip() for line in text.splitlines() if "<loc>" in line]
    print(f"Total model URLs in sitemap: {len(urls)}")
    print("Sample URLs:", urls[:5])
