import os
import json
import subprocess
from voice_biometric_matcher import VoiceBiometricMatcher

class StudentBiometricManager:
    def __init__(self, reference_dir="reference_voices", registry_path="core/registry_output/student_registry.json"):
        self.reference_dir = reference_dir
        self.registry_path = registry_path
        self.matcher = VoiceBiometricMatcher()
        
    def process_transcript(self, transcript_path, video_audio_path):
        """
        Tüm konuşmacıları referans seslerle eşleştirir.
        """
        print(f"\n[START] Tum konusmacilar icin biometric analiz basliyor...")
        print("="*60)
        
        # 1. Referans sesleri yükle
        references = {}
        if os.path.exists(self.reference_dir):
            for file in os.listdir(self.reference_dir):
                if file.endswith(".mp3") or file.endswith(".wav"):
                    name = os.path.splitext(file)[0].replace("_", " ")
                    path = os.path.join(self.reference_dir, file)
                    print(f"[REF] Referans yukleniyor: {name}")
                    emb = self.matcher.get_embedding(path)
                    if emb is not None:
                        references[name] = emb

        if not references:
            print("[-] Hic referans ses bulunamadi.")
            return

        # 2. Transkripti yükle
        with open(transcript_path, 'r', encoding='utf-8') as f:
            transcript = json.load(f)
        
        utterances = transcript.get("utterances", [])
        speaker_segments = {}
        for utt in utterances:
            speaker = utt["speaker"]
            if speaker not in speaker_segments:
                speaker_segments[speaker] = []
            speaker_segments[speaker].append(utt)

        # 3. Her speaker için analiz
        os.makedirs("temp_analysis", exist_ok=True)
        results = {} # {speaker_id: {student_name: score}}

        # Mevcut ses dosyasının süresini al (analiz için sınır)
        try:
            cmd_dur = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", video_audio_path]
            max_dur = float(subprocess.check_output(cmd_dur).decode().strip())
            print(f"[INFO] Mevcut ses suresi: {max_dur:.2f} saniye. Sadece bu araliktaki segmentler incelenecek.")
        except:
            max_dur = 600 # Fallback 10 dk
            print(f"[WARN] Ses suresi alinamadi, varsayilan 600sn kullaniliyor.")

        for speaker, segments in speaker_segments.items():
            print(f"\n[ANALYSIS] Speaker {speaker} inceleniyor...")
            
            # Ses dosyasının süresi içinde kalan ve yeterince uzun olan segmentleri bul
            valid_segments = [s for s in segments if (s["start"] / 1000.0) < max_dur and (s["end"] - s["start"]) > 2000]
            
            if not valid_segments:
                print(f"   [-] Speaker {speaker} icin mevcut ses dosyasinda ({max_dur}sn) yeterli veri yok.")
                continue
                
            # İlk 30 saniyeyi temsil eden bir ses dosyası oluştur
            combined_audio = f"temp_analysis/speaker_{speaker}_30s.wav"
            
            # Mevcut aralıktaki en uzun segmenti alalım
            best_seg = max(valid_segments, key=lambda x: x["end"] - x["start"])
            start_sec = best_seg["start"] / 1000.0
            # Süreyi hem segment uzunluğu hem de dosya sonu ile sınırla
            duration = min((best_seg["end"] - best_seg["start"]) / 1000.0, 30.0)
            if start_sec + duration > max_dur:
                duration = max_dur - start_sec
            
            if duration < 1.0:
                print(f"   [-] Speaker {speaker} segmenti cok kisa ({duration:.2f}s).")
                continue

            print(f"   [EXTRACT] {start_sec:.2f}s -> {duration:.2f}s")
            cmd = [
                "ffmpeg", "-y", "-i", video_audio_path,
                "-ss", str(start_sec), "-t", str(duration),
                "-ar", "16000", "-ac", "1", combined_audio
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                print(f"   [-] FFmpeg hatasi: {result.stderr}")
            
            if os.path.exists(combined_audio):
                file_size = os.path.getsize(combined_audio)
                print(f"   [FILE] {combined_audio} created, size: {file_size} bytes")
                if file_size < 100:
                    print(f"   [WARN] Dosya cok kucuk, muhtemelen bos.")
                
                target_emb = self.matcher.get_embedding(combined_audio)
                if target_emb is not None:
                    speaker_results = {}
                    for student_name, ref_emb in references.items():
                        score = self.matcher.compare_voices(ref_emb, target_emb)
                        speaker_results[student_name] = score
                    results[speaker] = speaker_results
                os.remove(combined_audio)

        # 4. Eşleşmeleri Registry'e yaz (Step 5 & 6)
        self.update_registry_with_matches(results)

    def update_registry_with_matches(self, match_results, threshold=0.90):
        """
        match_results: {speaker_id: {student_name: score}}
        """
        if not os.path.exists(self.registry_path):
            registry = []
        else:
            with open(self.registry_path, "r", encoding="utf-8") as f:
                registry = json.load(f)

        updated_speakers = set()

        for speaker_id, scores in match_results.items():
            best_student = max(scores, key=scores.get)
            best_score = scores[best_student]
            
            if best_score >= threshold:
                print(f"[MATCH] Speaker {speaker_id} -> {best_student} (Score: {best_score:.4f})")
                
                # Mevcut kaydı bul veya güncelle
                found = False
                for student in registry:
                    if student.get("voice_notes") == f"Speaker {speaker_id}":
                        student["id"] = best_student
                        student["voice_confirmed"] = True
                        student["voice_notes"] = f"Speaker {speaker_id} (Biometric Match: {best_score:.2f})"
                        found = True
                        break
                
                if not found:
                    registry.append({
                        "id": best_student,
                        "voice_notes": f"Speaker {speaker_id} (Biometric Match: {best_score:.2f})",
                        "voice_confirmed": True,
                        "detection_method": "biometric_all_manager"
                    })
                updated_speakers.add(speaker_id)
            else:
                print(f"[UNRESOLVED] Speaker {speaker_id} eslesmedi (En iyi: {best_student} - {best_score:.4f})")
                # Unresolved olarak işaretle
                found = False
                for student in registry:
                    if student.get("voice_notes") == f"Speaker {speaker_id}":
                        if "unresolved" not in student.get("id", "").lower():
                            student["id"] = f"UNRESOLVED_{speaker_id}"
                            student["voice_confirmed"] = False
                            student["notes"] = "Biometric match failed. Need teacher confirmation."
                        found = True
                        break
                if not found:
                    registry.append({
                        "id": f"UNRESOLVED_{speaker_id}",
                        "voice_notes": f"Speaker {speaker_id}",
                        "voice_confirmed": False,
                        "notes": "Biometric match failed. Need teacher confirmation."
                    })

        with open(self.registry_path, "w", encoding="utf-8") as f:
            json.dump(registry, f, ensure_ascii=False, indent=2)
        print(f"[OK] Registry guncellendi: {self.registry_path}")

if __name__ == "__main__":
    manager = StudentBiometricManager()
    manager.process_transcript(
        "core/registry_output/full_transcript.json",
        "core/registry_output/full_audio.mp3"
    )
