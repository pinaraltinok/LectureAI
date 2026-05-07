import librosa
import numpy as np
import os

def analyze_pitch(audio_path):
    print(f"Analiz ediliyor: {audio_path}")
    y, sr = librosa.load(audio_path, sr=16000)
    
    # Sessiz kısımları at
    y, _ = librosa.effects.trim(y)
    
    # Perde (F0) tespiti (yin-yang veya piptrack)
    pitches, magnitudes = librosa.piptrack(y=y, sr=sr)
    
    # Sadece anlamlı (yüksek genlikli) perdeleri al
    valid_pitches = pitches[magnitudes > np.median(magnitudes)]
    if len(valid_pitches) == 0:
        return 0
        
    mean_pitch = np.mean(valid_pitches[valid_pitches > 50]) # 50Hz altı gürültü olabilir
    return mean_pitch

# Önce Ali Deniz'in sesini analiz et (GCS'den indirmemiz lazım ama önce yerelde var mı bakalım)
# Eğer yerelde yoksa, daha önce indirdiğim diğer öğrencilerin perdelerine bakalım
data_dir = "data"
for f in os.listdir(data_dir):
    if f.endswith(".mp3") or f.endswith(".wav"):
        p = analyze_pitch(os.path.join(data_dir, f))
        print(f"[{f}] Ortalama Perde: {p:.2f} Hz")
