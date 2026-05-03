import json
import os

def split_student_chunks(transcript_path, registry_path, chunk_duration_min=30):
    """
    Öğrenci bazlı 30 dakikalık pencereler halinde chunk splitter.
    """
    print(f"\n[START] Chunk splitter basliyor ({chunk_duration_min} dk pencereler)...")
    
    with open(transcript_path, 'r', encoding='utf-8') as f:
        transcript = json.load(f)
    
    with open(registry_path, 'r', encoding='utf-8') as f:
        registry = json.load(f)
        
    # Speaker -> Student Name eşlemesi
    speaker_to_student = {}
    for entry in registry:
        voice_notes = entry.get("voice_notes", "")
        if "Speaker " in voice_notes:
            # "Speaker A (Biometric...)" -> "A"
            import re
            match = re.search(r"Speaker ([A-Z0-9]+)", voice_notes)
            if match:
                speaker_to_student[match.group(1)] = entry["id"]

    utterances = transcript.get("utterances", [])
    student_data = {} # {student_name: [utterances]}
    
    for utt in utterances:
        speaker = utt["speaker"]
        student_name = speaker_to_student.get(speaker, f"Unknown_{speaker}")
        
        if student_name not in student_data:
            student_data[student_name] = []
        student_data[student_name].append(utt)
        
    # Chunklara böl
    chunk_ms = chunk_duration_min * 60 * 1000
    all_chunks = {} # {student_name: [chunk1, chunk2, ...]}
    
    for student, utts in student_data.items():
        if not utts: continue
        
        chunks = []
        current_chunk = []
        chunk_start_time = utts[0]["start"]
        
        for utt in utts:
            if (utt["end"] - chunk_start_time) > chunk_ms:
                # Yeni chunk'a geç
                chunks.append(current_chunk)
                current_chunk = [utt]
                chunk_start_time = utt["start"]
            else:
                current_chunk.append(utt)
        
        if current_chunk:
            chunks.append(current_chunk)
            
        all_chunks[student] = chunks
        print(f"[INFO] {student}: {len(chunks)} chunk olusturuldu.")

    # Kaydet
    output_path = "core/registry_output/student_chunks.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(all_chunks, f, ensure_ascii=False, indent=2)
    print(f"[OK] Chunklar kaydedildi: {output_path}")
    return all_chunks

if __name__ == "__main__":
    split_student_chunks(
        "core/registry_output/omer_full_transcript.json",
        "core/registry_output/student_registry.json"
    )
