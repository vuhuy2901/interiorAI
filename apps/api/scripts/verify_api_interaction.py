import urllib.request
import json

url = "http://localhost:3100/api/issues/9eabba62-c6da-4a2c-829c-07a3321e86b9/interactions"
req = urllib.request.Request(url)
with urllib.request.urlopen(req) as resp:
    status = resp.status
    content_type = resp.headers.get('Content-Type')
    raw_data = resp.read()
    text = raw_data.decode('utf-8')
    data = json.loads(text)

print(f"Status: {status}")
print(f"Content-Type: {content_type}")
print(f"Total interactions returned: {len(data)}")
for item in data:
    if item['id'] == 'b37d60f5-9c46-4e86-a585-69f712a5dc67':
        print("Found target interaction:")
        q = item['payload']['questions'][0]
        print(f"  Prompt: {q['prompt']}")
        for opt in q['options']:
            print(f"    - {opt['label']}")
