import json
import subprocess
import urllib.request
import time

def trigger_all():
    # 1. Get files
    gsutil_bin = r"D:\New folder (4)\google-cloud-sdk\bin\gsutil.cmd"
    cmd = [gsutil_bin, "ls", "gs://lectureai_full_videos/Lesson_Records/*.mp4"]
    result = subprocess.run(cmd, capture_output=True, text=True)
    files = [line.strip() for line in result.stdout.split('\n') if line.strip()]
    
    # 2. Get Cloud Run URL and Token
    gcloud_bin = r"D:\New folder (4)\google-cloud-sdk\bin\gcloud.cmd"
    url = subprocess.run([gcloud_bin, "run", "services", "describe", "video-segmenter", "--region=europe-west4", "--format=value(status.url)"], capture_output=True, text=True).stdout.strip()
    token = subprocess.run([gcloud_bin, "auth", "print-identity-token"], capture_output=True, text=True).stdout.strip()
    
    print(f"Found {len(files)} files. Hitting {url}")
    
    for f in files:
        blob_name = f.replace("gs://lectureai_full_videos/", "")
        print(f"Triggering function for: {blob_name}")
        
        # Valid CloudEvent payload
        payload = json.dumps({
            "bucket": "lectureai_full_videos",
            "name": blob_name
        }).encode('utf-8')
        
        req = urllib.request.Request(url, data=payload, method="POST")
        req.add_header("Authorization", f"Bearer {token}")
        req.add_header("Content-Type", "application/json")
        req.add_header("ce-id", "manual-trigger-1234")
        req.add_header("ce-source", "//storage.googleapis.com/projects/_/buckets/lectureai_full_videos")
        req.add_header("ce-specversion", "1.0")
        req.add_header("ce-type", "google.cloud.storage.object.v1.finalized")
        
        try:
            with urllib.request.urlopen(req) as resp:
                print(f"  Success: {resp.status}")
        except Exception as e:
            print(f"  Error: {e}")
            
        time.sleep(2)

if __name__ == "__main__":
    trigger_all()
