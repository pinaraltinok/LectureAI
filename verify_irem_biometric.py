import os
import json
import subprocess
import numpy as np
from google.cloud import storage
from voice_biometric_matcher import VoiceBiometricMatcher

# GCS setup
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = (
    r"C:\Users\iremd\Downloads\senior-design-488908-28bd7c55329d.json"
)

def get_signed_url(bucket_name, blob_name):
    storage_client = storage.Client()
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(blob_name)
    return blob.generate_signed_url(version="v4", expiration=3600, method="GET")

def detailed_comparison(video_url, transcript_path, reference_audio, student_id):
    matcher = VoiceBiometricMatcher()
    
    if not os.path.exists(reference_audio):
        print(f"Hata: {reference_audio} bulunamadı!")
        return
        
    print(f"[>>] Referans ses yukleniyor: {reference_audio}")
    ref_emb = matcher.get_embedding(reference_audio)
    
    if not os.path.exists(transcript_path):
        print(f"Hata: {transcript_path} henüz hazır değil!")
        return
        
    with open(transcript_path, 'r', encoding='utf-8') as f:
        t = json.load(f)
    
    utterances = t.get('utterances', [])
    if not utterances:
        print("Hata: Transkriptte konusma bulunamadi.")
        return

    # Tüm toplantıyı analiz et (Toplantı videoları genelde derslerden kısadır)
    speaker_data = {}
    for u in utterances:
        spk = u['speaker']
        if spk not in speaker_data:
            speaker_data[spk] = []
        speaker_data[spk].append(u)
    
    safe_student = (
        student_id.replace("ö", "o")
        .replace("ü", "u")
        .replace("ç", "c")
        .replace("ş", "s")
        .replace("ı", "i")
        .replace("ğ", "g")
        .replace(" ", "_")
        .lower()
    )
    temp_dir = f"temp_verify_{safe_student}"
    os.makedirs(temp_dir, exist_ok=True)
    results = {}
    
    for spk in speaker_data.keys():
        print(f"\n--- Speaker {spk} Analizi ---")
        # En uzun 5 segmenti al
        segments = sorted(speaker_data[spk], key=lambda x: x['end']-x['start'], reverse=True)[:5]
        scores = []
        
        for i, seg in enumerate(segments):
            start_sec = seg['start'] / 1000.0
            dur = min((seg['end'] - seg['start']) / 1000.0, 15.0)
            if dur < 1.0: continue
            
            temp_file = f"{temp_dir}/spk_{spk}_seg_{i}.wav"
            cmd = [
                "ffmpeg", "-y", "-ss", str(start_sec), "-i", video_url, 
                "-t", str(dur), "-ar", "16000", "-ac", "1", temp_file
            ]
            subprocess.run(cmd, capture_output=True)
            
            if os.path.exists(temp_file):
                emb = matcher.get_embedding(temp_file)
                if emb is not None:
                    score = matcher.compare_voices(ref_emb, emb)
                    scores.append(score)
                    print(f"   Seg {i} ({dur:.1f}s): Benzerlik: {score:.4f} | Text: {seg['text'][:50]}...")
        
        if scores:
            avg_score = np.mean(scores)
            results[spk] = avg_score
            print(f"  [SONUÇ] Speaker {spk} -> Ortalama Benzerlik: {avg_score:.4f}")

    if results:
        best_spk = max(results, key=results.get)
        print(f"\n[FINAL] {student_id} büyük ihtimalle Speaker {best_spk} (Skor: {results[best_spk]:.4f})")
        
        # Registry guncelle
        registry_path = "core/registry_output/student_registry.json"
        if os.path.exists(registry_path):
            with open(registry_path, 'r', encoding='utf-8') as f:
                reg = json.load(f)
        else:
            reg = []
            
        # Öğrenciyi bul veya ekle
        found = False
        for entry in reg:
            if entry.get('id') == student_id:
                entry['speaker_id'] = best_spk
                entry['voice_notes'] = f"Speaker {best_spk} (Confirmed for Meeting 2)"
                entry['voice_confirmed'] = True
                entry['is_student'] = True
                entry['detection_method'] = "biometric_analysis"
                found = True
                break
        
        if not found:
            reg.append({
                "id": student_id,
                "speaker_id": best_spk,
                "is_student": True,
                "voice_notes": f"Speaker {best_spk} (Confirmed for Meeting 2)",
                "voice_confirmed": True,
                "detection_method": "biometric_analysis"
            })
            
        with open(registry_path, 'w', encoding='utf-8') as f:
            json.dump(reg, f, ensure_ascii=False, indent=2)
        print(f"[OK] {registry_path} güncellendi: {student_id} = Speaker {best_spk}")
        return best_spk
    return None

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--student", dest="student_id", default="İrem")
    parser.add_argument("--ref", dest="reference_audio", default="data/irem.mp3")
    parser.add_argument(
        "--transcript",
        dest="transcript_path",
        default="core/registry_output/irem_full_transcript.json",
    )
    parser.add_argument("--bucket", dest="bucket_name", default="lectureai_full_videos")
    parser.add_argument(
        "--blob",
        dest="video_blob",
        default="Lesson_Records/Meeting 2-20260305_131318-Toplantı Kaydı.mp4",
    )
    args = parser.parse_args()

    url = get_signed_url(args.bucket_name, args.video_blob)
    detailed_comparison(url, args.transcript_path, args.reference_audio, args.student_id)
