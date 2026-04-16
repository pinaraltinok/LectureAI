from google import genai
from google.genai import types
import os
import time
import json
import logging
import re
import numpy as np
import datetime
from typing import List, Optional, Dict, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed
from google.cloud import storage
from prompt_templates import PRECISION_SEARCH_PROMPT, REPORT_PROMPT, SYSTEM_INSTRUCTION

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Configuration
PROJECT_ID = "senior-design-488908"
BUCKET_NAME = "lectureai_processed"
PROCESSED_LOG = "processed_videos_precision.json"
REPORT_OUTPUT_DIR = "reports"
MATRIX_OUTPUT_DIR = "score_matrices"
MAX_CONCURRENCY_EMBED = 3
MAX_CONCURRENCY_ZOOM = 2 # Lower to avoid 429 during heavy video reasoning
TOP_EVIDENCE_PER_RUBRIC = 1 # Top 1 best segment per rubric for zooming

# Rubrics for Embedding Similarity
RUBRICS = {
    "İletişim": "Samimi etkileşim, yüksek enerji, öğrencileri motive etme ve gülümseme.",
    "Hazırlık": "Akıcı ders anlatımı, konu hakimiyeti ve planlı geçişler.",
    "Organizasyon": "Düzenli ekran paylaşımı, teknik sorunların hızlı çözümü ve iyi zaman yönetimi.",
    "Ders Yapısı": "Belirgin giriş, gelişme ve sonuç bölümleri."
}

def init_clients():
    client = genai.Client(vertexai=True, project=PROJECT_ID, location="us-central1")
    storage_client = storage.Client(project=PROJECT_ID)
    return client, storage_client

def format_timestamp(minutes: int) -> str:
    return str(datetime.timedelta(minutes=minutes))[:-3]

def cosine_similarity(v1, v2):
    return float(np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2)))

def get_embedding_gcs(client, gcs_uri: str, segment_name: str, index: int):
    max_retries = 5
    for attempt in range(max_retries):
        try:
            logging.info(f"Stage 1 Mapping Segment {index}: {segment_name}")
            content_part = types.Part.from_uri(file_uri=gcs_uri, mime_type="video/mp4")
            result = client.models.embed_content(model="gemini-embedding-2-preview", contents=content_part)
            return index, segment_name, result.embeddings[0].values, content_part
        except Exception as e:
            if "429" in str(e):
                time.sleep((2 ** attempt) * 15)
            else:
                logging.error(f"Mapping failed: {e}")
                return index, segment_name, None, None
    return index, segment_name, None, None

def zoom_precision_timestamps(client, segment_part, segment_idx: int, rubrics_to_search: List[str]):
    """
    Stage 2: Use Gemini to find EXACT minutes/seconds within a 10-minute segment.
    """
    metrics_list = "\n".join([f"- {r}" for r in rubrics_to_search])
    prompt = PRECISION_SEARCH_PROMPT.format(metrics_list=metrics_list)
    
    max_retries = 5
    for attempt in range(max_retries):
        try:
            logging.info(f"Stage 2 Zooming into Segment {segment_idx} for precise evidence...")
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[segment_part, prompt],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.1
                )
            )
            return segment_idx, json.loads(response.text)
        except Exception as e:
            if "429" in str(e):
                time.sleep((2 ** attempt) * 20)
            else:
                logging.error(f"Zooming failed for segment {segment_idx}: {e}")
                return segment_idx, None
    return segment_idx, None

def generate_full_precision_report(client, storage_client, folder_name):
    # --- STAGE 1: Numerical Map ---
    bucket = storage_client.bucket(BUCKET_NAME)
    blobs = bucket.list_blobs(prefix=f"{folder_name}/")
    segments = [blob for blob in blobs if blob.name.endswith(".mp4")]
    segments.sort(key=lambda x: int(re.search(r'seg_(\d+)', x.name).group(1)) if re.search(r'seg_(\d+)', x.name) else 0)
    
    if not segments: return None
    logging.info(f"Starting 3-Stage Precision Analysis for 2-hour scale video: {folder_name}")

    rubric_embeddings = {name: client.models.embed_content(model="gemini-embedding-2-preview", contents=q).embeddings[0].values for name, q in RUBRICS.items()}
    segment_data = {}
    with ThreadPoolExecutor(max_workers=MAX_CONCURRENCY_EMBED) as executor:
        futures = {executor.submit(get_embedding_gcs, client, f"gs://{BUCKET_NAME}/{b.name}", b.name, i): i for i, b in enumerate(segments)}
        for future in as_completed(futures):
            idx, name, vector, part = future.result()
            if vector is not None:
                segment_data[idx] = {"name": name, "vector": vector, "part": part, "base_time": idx * 10}

    # Identify best segments for each rubric
    best_segments = {r_name: max(segment_data.keys(), key=lambda i: cosine_similarity(segment_data[i]["vector"], rubric_embeddings[r_name])) for r_name in RUBRICS.keys()}

    # --- STAGE 2: Precision Zoom ---
    # Group rubrics by the segment they matched
    segment_to_rubrics = {}
    for r_name, idx in best_segments.items():
        if idx not in segment_to_rubrics: segment_to_rubrics[idx] = []
        segment_to_rubrics[idx].append(r_name)

    precision_evidence = []
    with ThreadPoolExecutor(max_workers=MAX_CONCURRENCY_ZOOM) as executor:
        futures = {executor.submit(zoom_precision_timestamps, client, segment_data[idx]["part"], idx, rubrics): idx for idx, rubrics in segment_to_rubrics.items()}
        for future in as_completed(futures):
            idx, result = future.result()
            if result:
                for r_name, detail in result.get("metrics", {}).items():
                    # Calculate Global Timestamp (Lecture Minute)
                    local_min, local_sec = map(int, detail["exact_timestamp"].split(":"))
                    global_min = segment_data[idx]["base_time"] + local_min
                    global_ts = f"{global_min}:{local_sec:02d}"
                    
                    precision_evidence.append({
                        "rubric": r_name,
                        "global_timestamp": global_ts,
                        "description": detail.get("evidence_description", "N/A"),
                        "quote": detail.get("quote", ""),
                        "part": segment_data[idx]["part"]
                    })

    # --- STAGE 3: synthesis ---
    logging.info("Stage 3: Synthesizing final report with exact evidence timestamps...")
    evidence_plan_str = "\n".join([f"- {e['rubric']} (Zaman: {e['global_timestamp']}): {e['description']} Quote: '{e['quote']}'" for e in precision_evidence])
    
    unique_parts = list({e['part'].file_data.file_uri: e['part'] for e in precision_evidence}.values())
    
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[REPORT_PROMPT.format(evidence_plan=evidence_plan_str)] + unique_parts,
            config=types.GenerateContentConfig(system_instruction=SYSTEM_INSTRUCTION, temperature=0.2)
        )
        return response.text, precision_evidence
    except Exception as e:
        logging.error(f"Final synthesis failed: {e}")
        return None, precision_evidence

def main():
    for d in [REPORT_OUTPUT_DIR, MATRIX_OUTPUT_DIR]:
        if not os.path.exists(d): os.makedirs(d)
        
    client, storage_client = init_clients()
    
    if os.path.exists(PROCESSED_LOG):
        try:
            with open(PROCESSED_LOG, 'r') as f: processed_videos = json.load(f)
        except: processed_videos = []
    else: processed_videos = []

    logging.info("Starting Precision RAG Pipeline (Map -> Zoom -> Report)...")
    
    bucket = storage_client.bucket(BUCKET_NAME)
    blobs = bucket.list_blobs(delimiter='/')
    list(blobs)
    target_folders = [p.strip('/') for p in blobs.prefixes if p.strip('/') not in processed_videos and p.strip('/') not in ["results", "test_trigger"]]
            
    if not target_folders:
        logging.info("No new video folders found.")
        return
            
    target = target_folders[0]
    report_text, evidence = generate_full_precision_report(client, storage_client, target)
    
    if report_text:
        safe_name = target.replace(' ', '_').replace('(', '').replace(')', '')
        report_path = os.path.join(REPORT_OUTPUT_DIR, f"{safe_name}_precision_report.md")
        with open(report_path, 'w', encoding='utf-8') as f: f.write(report_text)
        
        # Save the structured Evidence Plan as well
        plan_path = os.path.join(MATRIX_OUTPUT_DIR, f"{safe_name}_evidence_plan.json")
        with open(plan_path, 'w', encoding='utf-8') as f:
            json.dump({"folder": target, "evidence": [{"rubric": e["rubric"], "time": e["global_timestamp"], "evidence": e["description"]} for e in evidence]}, f, indent=2, ensure_ascii=False)
            
        logging.info(f"SUCCESS: Precision report saved to {report_path}")
        processed_videos.append(target)
        with open(PROCESSED_LOG, 'w') as f: json.dump(processed_videos, f)
    
    logging.info("Process complete.")

if __name__ == "__main__":
    main()
