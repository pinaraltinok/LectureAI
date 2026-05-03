import librosa
import numpy as np
import os
import subprocess
import json

def get_pitch(y, sr):
    pitches, magnitudes = librosa.piptrack(y=y, sr=sr)
    valid_pitches = pitches[magnitudes > np.median(magnitudes)]
    if len(valid_pitches) == 0: return 0
    return np.mean(valid_pitches[valid_pitches > 50])

def analyze_surgical_pitch(video_audio_path, ref_audio_path, start_time, end_time):
    print(f"[ANALYSIS] {start_time}s - {end_time}s arası analiz ediliyor...")
    
    # 1. Referans Sesin Perdesi
    y_ref, sr_ref = librosa.load(ref_audio_path, sr=16000)
    ref_pitch = get_pitch(y_ref, sr_ref)
    print(f"Ref Pitch (Ali Deniz): {ref_pitch:.2f} Hz")

    # 2. Videodan O Bölgeyi Kes
    temp_clip = "temp_surgical_clip.wav"
    subprocess.run([
        "ffmpeg", "-y", "-ss", str(start_time), "-to", str(end_time),
        "-i", video_audio_path, "-ar", "16000", "-ac", "1", temp_clip
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    y_vid, sr_vid = librosa.load(temp_clip, sr=16000)
    
    # 3. 1 Saniyelik Pencerelerle Tara
    win_len = 1.0 # 1 saniye
    step = 0.5    # 0.5 saniye kaydır
    
    results = []
    for start in np.arange(0, (end_time - start_time) - win_len, step):
        s_idx = int(start * sr_vid)
        e_idx = int((start + win_len) * sr_vid)
        window = y_vid[s_idx:e_idx]
        
        win_pitch = get_pitch(window, sr_vid)
        diff = abs(win_pitch - ref_pitch)
        
        results.append({
            "time": start_time + start,
            "pitch": win_pitch,
            "diff": diff
        })

    print(f"\n{'ZAMAN':<10} | {'PERDE (Hz)':<12} | {'FARK':<10}")
    print("-" * 40)
    for r in results:
        match = "⭐ MATCH" if r['diff'] < 50 and r['pitch'] > 0 else ""
        print(f"{r['time']:<10.1f} | {r['pitch']:<12.2f} | {r['diff']:<10.2f} {match}")

if __name__ == "__main__":
    # Not: data klasöründeki MP3'leri kullanalım
    # Önce video audio'yu GCS'den indirmemiz gerekebilir veya registry_output'taki dosyayı kullanalım
    video_audio = "core/registry_output/new_lesson_audio.mp3"
    ref_audio = "data/alideniz.mp3" # Daha önce indirmiş olmalıyız
    
    # Eğer dosyalar yoksa hata verir, o yüzden kontrol edelim
    if os.path.exists(video_audio) and os.path.exists(ref_audio):
        analyze_surgical_pitch(video_audio, ref_audio, 5385, 5405)
    else:
        print("Dosyalar eksik!")
