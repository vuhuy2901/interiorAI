import urllib.request
import re

url = "https://furnimesh.com/library/sofas/sofa/?page=1"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
html = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", errors="ignore")

chunks = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)', html, re.DOTALL)
full_stream = "".join(chunks).replace('\\"', '"').replace('\\\\', '\\')

idx = full_stream.find('"glb3D"')
print(full_stream[max(0, idx - 200):min(len(full_stream), idx + 300)])
