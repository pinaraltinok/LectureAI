import re
import json

def analyze():
    # 1. Biyometrik sonuçları oku
    try:
        with open('core/registry_output/surgical_results.txt', 'r', encoding='utf-16') as f:
            data = f.read()
    except:
        with open('core/registry_output/surgical_results.txt', 'r', encoding='utf-8') as f:
            data = f.read()

    # 2. Transkripti oku
    with open('core/registry_output/1777550695949___4.l2_araba_olu__turmak_full_transcript.json', 'r', encoding='utf-8') as f:
        transcript = json.load(f)
    utterances = transcript['utterances']

    # 3. Skorları ayıkla
    matches = re.findall(r'([\d.]+)s \| Skor: ([\d.-]+)', data)
    scores = [(float(t), float(s)) for t, s in matches]
    
    # 4. En yüksek skorlu 20 anı bul
    top_scores = sorted(scores, key=lambda x: x[1], reverse=True)[:20]

    print(f"{'ZAMAN':<10} | {'SKOR':<10} | {'METİN'}")
    print("-" * 60)
    
    for t, s in top_scores:
        # O saniyeye en yakın metni bul
        closest_text = "-"
        for u in utterances:
            u_start = u['start'] / 1000.0
            u_end = u['end'] / 1000.0
            if u_start <= t <= u_end or abs(u_start - t) < 0.5:
                closest_text = u['text']
                break
        
        print(f"{t:<10.2f} | {s:<10.4f} | {closest_text}")

if __name__ == "__main__":
    analyze()
