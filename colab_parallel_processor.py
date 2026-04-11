import os
import io
import json
import logging
import concurrent.futures
from typing import List, Dict, Any, Tuple
from pathlib import Path

# AI Libraries (Must be installed in Colab)
import torch
import numpy as np
from pydub import AudioSegment
import whisper
from pyannote.audio import Pipeline
from pyannote.core import Segment
from google.cloud import storage

# Configure Logger for Colab
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] [%(threadName)s] %(message)s')
logger = logging.getLogger("ParallelTranscriber")


class LectureAITranscriber:
    def __init__(self, hf_token: str):
        self.PROCESSED_BUCKET = "lectureai_processed"
        self.TRANSCRIPT_BUCKET = "lectureai_transcripts"
        self.HF_TOKEN = hf_token
        
        # H100 VRAM mapping allows 6-8 concurrent heavy segments safely.
        self.MAX_CONCURRENT_SEGMENTS = 6 
        
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"Using device: {self.device} | H100 Concurrency: {self.MAX_CONCURRENT_SEGMENTS}")
        
        self.storage_client = storage.Client()
        self._ensure_bucket_exists(self.TRANSCRIPT_BUCKET)
        
        self._load_models()

    def _ensure_bucket_exists(self, bucket_name: str):
        """Creates the destination bucket if it doesn't already exist."""
        try:
            bucket = self.storage_client.get_bucket(bucket_name)
        except Exception:
            logger.info(f"Creating bucket {bucket_name}...")
            bucket = self.storage_client.create_bucket(bucket_name)

    def _load_models(self):
        """Loads models once into VRAM so threads can share them."""
        logger.info("Loading Whisper Turbo...")
        self.whisper_model = whisper.load_model("turbo", device=self.device)
        
        logger.info("Loading Pyannote Diarization Pipeline...")
        self.diarize_pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=self.HF_TOKEN
        ).to(torch.device(self.device))
        
        logger.info("All models loaded successfully!")

    def download_segment_to_memory(self, source_blob: storage.Blob) -> bytes:
        """Download remote GCS segment directly into RAM (0 disk I/O)."""
        logger.info(f"Downloading {source_blob.name} to memory stream...")
        mem_file = io.BytesIO()
        source_blob.download_to_file(mem_file)
        return mem_file.getvalue()

    def decode_audio_bytes(self, audio_bytes: bytes) -> Tuple[torch.Tensor, np.ndarray]:
        """Decode purely in RAM. Whisper needs NumPy 16k, Pyannote needs Torch Tensor 16k."""
        audio = AudioSegment.from_file(io.BytesIO(audio_bytes))
        audio = audio.set_frame_rate(16000).set_channels(1)
        
        samples = np.array(audio.get_array_of_samples(), dtype=np.float32) / 32768.0
        tensor = torch.from_numpy(samples).unsqueeze(0)  # Shape: (1, samples)
        
        return tensor, samples

    def process_single_segment(self, blob: storage.Blob, video_id: str) -> Dict[str, Any]:
        """Core Thread Function: Downlolad -> Decode -> Transcribe -> Diarize -> Format."""
        try:
            segment_name = Path(blob.name).stem # e.g. "seg_0"
            
            # Step 1: Disk-less download
            audio_bytes = self.download_segment_to_memory(blob)
            
            # Step 2: Disk-less decode
            tensor, samples_np = self.decode_audio_bytes(audio_bytes)
            
            # Step 3: Pyannote Diarization
            logger.info(f"[{segment_name}] Running Diarization...")
            with torch.no_grad():
                diarization = self.diarize_pipeline({"waveform": tensor, "sample_rate": 16000})

            # Step 4: Whisper Transcription
            logger.info(f"[{segment_name}] Running Transcription...")
            with torch.no_grad():
                transcription = self.whisper_model.transcribe(samples_np, language="tr") # Adjust language if needed
                
            # Step 5: Merge into final JSON structured objects
            logger.info(f"[{segment_name}] Aligning words directly in memory...")
            aligned_data = self._align_transcription_and_diarization(diarization, transcription["segments"])
            
            # Clean up VRAM references from thread to prevent accumulation
            del tensor, samples_np
            torch.cuda.empty_cache()

            return {
                "segment_name": segment_name,
                "aligned_data": aligned_data,
                "raw_text": transcription["text"]
            }

        except Exception as e:
            logger.error(f"Error processing {blob.name}: {e}")
            return {"segment_name": Path(blob.name).stem, "error": str(e)}

    def _align_transcription_and_diarization(self, diarization, whisper_segments) -> List[Dict[str, Any]]:
        """Maps Pyannote speakers to Whisper timestamps."""
        aligned_results = []
        for segment in whisper_segments:
            start_time = segment["start"]
            end_time = segment["end"]
            text = segment["text"]
            
            # Find the speaker who dominated this time segment
            turn = diarization.crop(Segment(start_time, end_time))
            try:
                # the argmax over duration provides the most dominant speaker in that small chunk
                speaker = turn.argmax() if len(turn) > 0 else "UNKNOWN"
            except Exception:
                speaker = "UNKNOWN"
                
            aligned_results.append({
                "start": round(start_time, 2),
                "end": round(end_time, 2),
                "speaker": speaker,
                "text": text.strip()
            })
            
        return aligned_results

    def process_video_segments(self, video_folder_prefix: str):
        """Master Orchestrator pulling all segments for a specific video folder."""
        logger.info(f"Starting pipeline for video prefix: {video_folder_prefix}")
        
        bucket = self.storage_client.bucket(self.PROCESSED_BUCKET)
        blobs = list(bucket.list_blobs(prefix=video_folder_prefix))
        
        if not blobs:
            logger.warning(f"No segments found for prefix: {video_folder_prefix}")
            return
            
        # Parallel Execution Map
        processed_segments = []
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=self.MAX_CONCURRENT_SEGMENTS) as executor:
            future_to_blob = {
                executor.submit(self.process_single_segment, blob, video_folder_prefix): blob 
                for blob in blobs if blob.name.endswith('.mp4') or blob.name.endswith('.wav')
            }
            
            for future in concurrent.futures.as_completed(future_to_blob):
                blob = future_to_blob[future]
                try:
                    result = future.result()
                    if "error" not in result:
                        processed_segments.append(result)
                        self._upload_segment_result(video_folder_prefix, result)
                except Exception as exc:
                    logger.error(f"Segment {blob.name} generated an exception: {exc}")

        logger.info("All parallel segments finalized and uploaded to GCS!")

    def _upload_segment_result(self, video_prefix: str, result_dict: Dict[str, Any]):
        """Uploads JSON and TXT for the finished segment natively inside the Video's isolated folder."""
        target_bucket = self.storage_client.bucket(self.TRANSCRIPT_BUCKET)
        segment_name = result_dict["segment_name"]
        
        # Base folder route: lectureai_transcripts/Lesson_Record_lecture_01/
        # Files: /seg_0.json Space and /seg_0.txt
        
        video_id = video_prefix.strip("/") 
        json_blob_path = f"{video_id}/{segment_name}.json"
        txt_blob_path  = f"{video_id}/{segment_name}.txt"
        
        # Write JSON
        json_blob = target_bucket.blob(json_blob_path)
        json_blob.upload_from_string(json.dumps(result_dict["aligned_data"], indent=2, ensure_ascii=False), content_type="application/json")
        
        # Write Transcript
        txt_blob = target_bucket.blob(txt_blob_path)
        txt_blob.upload_from_string(result_dict["raw_text"], content_type="text/plain")
        
        logger.info(f"[{segment_name}] Data finalized physically to gs://{self.TRANSCRIPT_BUCKET}/{video_id}/")

# Example Usage to test in Colab:
if __name__ == "__main__":
    # In Colab, you would load credentials natively via `from google.colab import auth; auth.authenticate_user()`
    HF_TOKEN = "YOUR_HF_TOKEN_HERE" # Replace with user token
    VIDEO_PREFIX = "Lesson_Records/my_video_id" # The folder/prefix where video segmenter output the files
    
    # transcriber = LectureAITranscriber(hf_token=HF_TOKEN)
    # transcriber.process_video_segments(VIDEO_PREFIX)
