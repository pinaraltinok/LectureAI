import json
from pathlib import Path

def generate_readable_transcript():
    json_path = "core/registry_output/1777550695949___4.l2_araba_olu__turmak_full_transcript.json"
    out_path = "data/FULL_TRANSCRIPT_SYNCED.md"
    
    if not Path(json_path).exists():
        print("JSON bulunamadı.")
        return

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("# 📝 Full Video Transkripti (Senkronize Edilmiş)\n\n")
        f.write("| Zaman | Konuşmacı | Mesaj |\n")
        f.write("| :--- | :--- | :--- |\n")
        
        # Speaker mapping for readability
        speaker_map = {"A": "Yaman", "B": "Öğretmen"}
        
        for utt in data.get("utterances", []):
            start_sec = utt["start"] / 1000.0
            timestamp = f"{int(start_sec // 60):02d}:{int(start_sec % 60):02d}"
            speaker = speaker_map.get(utt["speaker"], f"Speaker {utt['speaker']}")
            text = utt["text"]
            f.write(f"| **{timestamp}** | **{speaker}** | {text} |\n")

    print(f"[OK] Full transkript oluşturuldu: {out_path}")

if __name__ == "__main__":
    generate_readable_transcript()
