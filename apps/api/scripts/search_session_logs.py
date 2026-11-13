import os
import glob

search_root = r"C:\Users\TUAN\.paperclip\instances\default\companies\b2e1c8a5-c3c9-412c-99cb-63180c4015dc"
session_files = glob.glob(os.path.join(search_root, "**", "*.jsonl"), recursive=True)
print(f"Total session files: {len(session_files)}")

for fpath in session_files:
    try:
        with open(fpath, 'r', encoding='utf-8') as f:
            for line_no, line in enumerate(f):
                if "Giao cho Geometry Agent" in line or "1200x1400mm" in line or "Dulux" in line:
                    print(f"File: {os.path.basename(fpath)}, Line: {line_no+1}")
                    # Print preview
                    print(line[:300])
                    break
    except Exception as e:
        continue
