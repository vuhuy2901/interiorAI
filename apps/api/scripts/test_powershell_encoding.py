import http.server
import socketserver
import threading
import subprocess
import json

received_data = []

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        content_type = self.headers.get("Content-Type")
        received_data.append((content_type, raw))
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"OK")

def test_variant(name, ps_script):
    received_data.clear()
    server = socketserver.TCPServer(("127.0.0.1", 19998), Handler)
    t = threading.Thread(target=server.handle_request)
    t.start()

    res = subprocess.run(["powershell.exe", "-Command", ps_script], capture_output=True, text=False)
    t.join()
    server.server_close()

    print(f"\n=== VARIANT: {name} ===")
    if received_data:
        ct, raw = received_data[0]
        try:
            decoded = raw.decode("utf-8")
            print("UTF-8 DECODE SUCCESS:")
            print(decoded)
        except Exception as e:
            print("UTF-8 DECODE FAILED:", e)
            print("RAW HEX:", raw.hex())
            print("REPLACE:", raw.decode("utf-8", errors="replace"))

def main():
    test_str = "Ngân sách trần cho phòng ngủ trẻ em là mức nào? A — 80–120 triệu VNĐ. Mức khác, ghi rõ số tiền."

    # Variant 1: UTF8 GetBytes
    ps1 = f"""
    $body = @{{ text = '{test_str}' }} | ConvertTo-Json -Depth 5
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    Invoke-WebRequest -UseBasicParsing -Method Post -Uri 'http://127.0.0.1:19998' -Headers @{{'Content-Type'='application/json; charset=utf-8'}} -Body $bytes
    """
    test_variant("1. UTF8 GetBytes", ps1)

    # Variant 2: curl.exe with temp utf8 file
    ps2 = f"""
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $body = @{{ text = '{test_str}' }} | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText('test_temp.json', $body, [System.Text.Encoding]::UTF8)
    curl.exe -s -X POST -H "Content-Type: application/json; charset=utf-8" --data-binary "@test_temp.json" http://127.0.0.1:19998
    Remove-Item 'test_temp.json'
    """
    test_variant("2. curl.exe with utf8 file", ps2)

    # Variant 3: Python helper
    ps3 = f"""
    python -c "import urllib.request, json; data = json.dumps({{'text': '{test_str}'}}).encode('utf-8'); urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:19998', data=data, headers={{'Content-Type': 'application/json'}}))"
    """
    test_variant("3. python helper", ps3)

if __name__ == "__main__":
    main()
