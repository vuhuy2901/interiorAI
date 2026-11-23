import urllib.request

for url in ["https://furnimesh.com/robots.txt", "https://furnimesh.com/sitemap.xml"]:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as res:
            data = res.read().decode("utf-8", errors="ignore")
            print(f"=== {url} ===")
            print(data[:500])
    except Exception as e:
        print(f"Error for {url}: {e}")
