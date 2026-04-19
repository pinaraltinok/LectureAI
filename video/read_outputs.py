import json

with open(r"c:\Users\Zehra\Desktop\bitirme\LectureAI\LectureAI\video\lectureAI_video_test.ipynb", "r", encoding="utf-8") as f:
    nb = json.load(f)

for i, cell in enumerate(nb.get("cells", [])):
    outputs = cell.get("outputs", [])
    if outputs:
        print(f"Cell {i} var:")
        for out in outputs:
            if "text" in out:
                print(out["text"][:300]) # Ilk 300 karakteri goster
            elif "data" in out and "text/plain" in out["data"]:
                print(out["data"]["text/plain"])
        print("-" * 40)
