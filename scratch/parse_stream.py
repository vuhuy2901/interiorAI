import urllib.request
import re
import json

url = "https://furnimesh.com/library/sofas/sofa/?page=1"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
html = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", errors="ignore")

# Find all JSON-like objects containing glb3D
# Pattern for model object
matches = re.findall(r'(\{"[^"]*slug"[^}]*glb3D[^}]*\})', html)
print("Regex model objects found:", len(matches))
if matches:
    # Clean up escaped quotes if needed
    raw = matches[0].replace('\\"', '"').replace('\\\\', '\\')
    print("Sample raw object:", raw[:400])

# Better: extract all next_f strings
chunks = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)', html, re.DOTALL)
full_stream = "".join(chunks).replace('\\"', '"').replace('\\\\', '\\')
print("Full stream length:", len(full_stream))

# Search for models inside stream
model_pattern = r'\{"id":"([^"]+)".*?"slug":"([^"]+)".*?"name":"([^"]+)".*?"glb3D":"([^"]+)".*?\}'
found = re.findall(r'"slug":"([^"]+)".*?"glb3D":"([^"]+)"', full_stream)
print("Found models in stream:", len(found))
if found:
    print("First 3:", found[:3])
