import os
import json
import numpy as np

class VoiceBiometricMatcher:
    def __init__(self, model_name="pyannote/embedding"):
        print(f"[MODEL] Biometrik model yukleniyor: {model_name}")
        self.model = None
        self.inference = None
        
        # Öncelikle pyannote deniyoruz
        try:
            import torch
            import torchaudio
            from pyannote.audio import Model, Inference
            # Not: torchaudio DLL hatası varsa burası patlayabilir
            self.model = Model.from_pretrained(model_name)
            self.inference = Inference(self.model, window="whole")
            print("[OK] pyannote.audio basariyla yuklendi.")
        except Exception as e:
            print(f"[WARN] pyannote.audio yuklenemedi veya torchaudio hatası: {e}")
            print("[INFO] Alternatif: Frekans spektrumu analizi (Spectral Signature) kullanilacak.")

    def get_embedding(self, audio_path):
        """Sesin zaman serisi bazlı gelişmiş imzasını (MFCC Sequence) çıkarır"""
        try:
            import librosa
            import numpy as np

            # Sesi yükle (16kHz, mono)
            y, sr = librosa.load(audio_path, sr=16000)
            
            # Sessiz kısımları temizle (daha hassas)
            y, _ = librosa.effects.trim(y, top_db=30)
            
            if len(y) < 8000: # En az 0.5 saniye ses lazım
                return None

            # 1. MFCC Sequence (Sesin karakterini saniye saniye takip eder)
            # 20 katsayı, 512 hop_length (yaklaşık 32ms pencereler)
            mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=20, hop_length=512)
            
            # 2. Spektral Kontrast (Sesin parlaklığı/derinliği)
            contrast = librosa.feature.spectral_contrast(y=y, sr=sr, hop_length=512)
            
            # 3. Konuşma Dinamiği (Vurgu ve enerji değişimi)
            zcr = librosa.feature.zero_crossing_rate(y, hop_length=512)
            
            # Tüm zaman serisi özelliklerini birleştir
            features = np.vstack([mfccs, contrast, zcr])
            
            # Normalizasyon (Mikrofon ve ortam farkını temizler)
            mean = np.mean(features, axis=1, keepdims=True)
            std = np.std(features, axis=1, keepdims=True) + 1e-8
            normalized_features = (features - mean) / std
            
            return normalized_features
        except Exception as e:
            print(f"[-] Gelişmiş özellik çıkarma hatası: {e}")
            return None

    def compare_voices(self, ref_features, target_features):
        """DTW benzeri bir yaklaşımla konuşma akışını karşılaştırır"""
        if ref_features is None or target_features is None:
            return 0.0
        
        try:
            from scipy.spatial.distance import cdist
            import numpy as np

            # İşlem hızını artırmak için dizileri örnekle
            def subsample(arr, target_size=150):
                if arr.shape[1] <= target_size:
                    return arr
                indices = np.linspace(0, arr.shape[1]-1, target_size).astype(int)
                return arr[:, indices]

            ref = subsample(ref_features)
            target = subsample(target_features)

            # Mesafe matrisi (Her zaman adımı arasındaki benzerlik)
            dist_matrix = cdist(ref.T, target.T, metric='cosine')
            
            # Her bir saniyedeki en yakın eşleşmeyi bul (Hizalama)
            min_dist_ref = np.min(dist_matrix, axis=1)
            min_dist_target = np.min(dist_matrix, axis=0)
            
            avg_min_dist = (np.mean(min_dist_ref) + np.mean(min_dist_target)) / 2
            
            # Benzerliği 0-1 arasına çek (0.5 altı eşleşme değildir)
            similarity = np.exp(-avg_min_dist * 2.5)
            
            return similarity
        except Exception as e:
            print(f"[-] Karşılaştırma hatası: {e}")
            return 0.0

    def match_student_by_voice(self, reference_audio_path, video_audio_path, transcript_path):
        """
        Referans ses kaydını videodaki konuşmacılarla eşleştirir.
        """
        print(f"[SEARCH] Referans ses: {reference_audio_path}")
        
        # 1. Referans sesin imzasını al
        ref_embedding = self.get_embedding(reference_audio_path)
        if ref_embedding is None:
            print("[-] Referans ses imzasi alinamadi.")
            return None

        # 2. Transkripti yükle
        with open(transcript_path, 'r', encoding='utf-8') as f:
            transcript = json.load(f)

        utterances = transcript.get("utterances", [])
        
        # 3. Konuşmacı bazlı segmentleri grupla
        speaker_segments = {}
        for utt in utterances:
            speaker = utt["speaker"]
            if speaker not in speaker_segments:
                speaker_segments[speaker] = []
            speaker_segments[speaker].append(utt)

        # 4. Her konuşmacı için biometrik eşleşme skoru hesapla
        # (Her konuşmacının ilk birkaç uzun cümlesini örneklem olarak alalım)
        results = {}
        
        # Geçici klasör oluştur
        os.makedirs("temp_audio_segments", exist_ok=True)
        
        import subprocess

        for speaker, segments in speaker_segments.items():
            print(f"[ANALYSIS] Konusmaci {speaker} analiz ediliyor...")
            
            # En az 3 saniyelik segmentleri bul
            valid_segments = [s for s in segments if (s["end"] - s["start"]) > 3000]
            if not valid_segments:
                valid_segments = segments[:3] # Hiç yoksa ilk 3'ü al
            
            speaker_scores = []
            
            # İlk 3 geçerli segmenti test et
            for i, seg in enumerate(valid_segments[:3]):
                start_sec = seg["start"] / 1000.0
                end_sec = seg["end"] / 1000.0
                duration = end_sec - start_sec
                
                segment_path = f"temp_audio_segments/speaker_{speaker}_seg_{i}.wav"
                
                # Segmenti kesip çıkar (ffmpeg kullanarak)
                ffmpeg_binary = os.getenv("FFMPEG_BINARY") or "ffmpeg"
                cmd = [
                    ffmpeg_binary, "-y", "-i", video_audio_path,
                    "-ss", str(start_sec), "-t", str(duration),
                    "-ar", "16000", "-ac", "1", segment_path
                ]
                subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                
                if os.path.exists(segment_path):
                    target_emb = self.get_embedding(segment_path)
                    if target_emb is not None:
                        score = self.compare_voices(ref_embedding, target_emb)
                        speaker_scores.append(score)
                    
                    # Temizlik
                    if os.path.exists(segment_path):
                        os.remove(segment_path)
            
            if speaker_scores:
                avg_score = sum(speaker_scores) / len(speaker_scores)
                results[speaker] = avg_score
                print(f"   [SCORE] Ortalama Benzerlik: {avg_score:.4f}")

        # 5. En iyi eşleşmeyi bul
        if not results:
            return None
            
        best_speaker = max(results, key=results.get)
        print(f"\n[WINNER] En iyi eslesme: Konusmaci {best_speaker} (Skor: {results[best_speaker]:.4f})")
        
        return {
            "best_speaker": best_speaker,
            "score": results[best_speaker],
            "all_scores": results
        }

if __name__ == "__main__":
    # Test kullanımı
    # matcher = VoiceBiometricMatcher()
    # matcher.match_student_by_voice("student_ref.wav", "video_audio.mp3", "transcript.json")
    pass
