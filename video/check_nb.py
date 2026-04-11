import json
nb = json.load(open(r"c:\Users\Zehra\Desktop\bitirme\LectureAI\LectureAI\video\lectureAI_video_test.ipynb", "r", encoding="utf-8"))
for i, c in enumerate(nb["cells"]):
    first_line = c["source"][0].strip() if c["source"] else "(empty)"
    print(f"Cell {i}: {first_line[:80]}")
