import urllib.request
import re
import json

url = "https://furnimesh.com/library/sofas/sofa/?page=1"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
html = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", errors="ignore")

# Find push chunks
chunks = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)', html, re.DOTALL)
full_stream = "".join(chunks).replace('\\"', '"').replace('\\\\', '\\')

# Find a sample JSON chunk for a model
idx = full_stream.find('"glb3D"')
if idx != -1:
    # search backwards for '{'
    start = full_stream.rfind('{', 0, idx)
    # search forward for matching '}'
    brace_count = 0
    end = start
    for i in range(start, len(full_stream)):
        if full_stream[i] == '{':
            brace_count += 1
        elif full_stream[i] == '}':
            brace_count -= 1
            if brace_count == 0:
                end = i + 1
                break
    sample_json = full_stream[start:end]
    print("Found JSON sample:")
    try:
        data = json.loads(sample_json)
        print(json.dumps(data, indent=2)[:1000])
    except Exception as e:
        print("Parse error, raw string:", sample_json[:500])
