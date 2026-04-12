import json

nb_path = r"c:\Users\Zehra\Desktop\bitirme\LectureAI\LectureAI\video\lectureAI_video_test.ipynb"

cred_path = r"c:\Users\Zehra\Desktop\bitirme\LectureAI\LectureAI\video\content\senior-design-488908-1d5d3e1681ee.json"
with open(cred_path, "r", encoding="utf-8") as f:
    cred_content = f.read().strip()
cred_escaped = json.dumps(cred_content)

def make_cell(source_lines, cell_id=None):
    return {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {"id": cell_id} if cell_id else {},
        "outputs": [],
        "source": source_lines,
    }

cells = []

# -- Cell 1: Credential (works everywhere) --
cells.append(make_cell([
    "import os, json\n",
    "\n",
    "CREDENTIAL_PATH = '/content/senior-design-488908-1d5d3e1681ee.json'\n",
    "\n",
    "# Credential JSON icerigini dogrudan dosyaya yazar\n",
    "# (files.upload() gerekmez, VS Code ve Colab tarayicida calisir)\n",
    f"_cred = {cred_escaped}\n",
    "\n",
    "with open(CREDENTIAL_PATH, 'w') as f:\n",
    "    f.write(_cred)\n",
    "\n",
    "os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = CREDENTIAL_PATH\n",
    "print('Credential hazir:', CREDENTIAL_PATH)\n",
], cell_id="c1"))

# -- Cell 2: Clone repo --
cells.append(make_cell([
    'REPO_URL = "https://github.com/pinaraltinok/LectureAI.git"\n',
    'BRANCH_NAME = "main"\n',
    'REPO_DIR = "/content/LectureAI"\n',
    "\n",
    "!rm -rf {REPO_DIR}\n",
    "!git clone {REPO_URL} {REPO_DIR}\n",
    "%cd {REPO_DIR}\n",
    "!git fetch --all\n",
    "!git checkout {BRANCH_NAME}\n",
], cell_id="c2"))

# -- Cell 3: Pip install --
cells.append(make_cell([
    '!pip install -q "numpy<2" "mediapipe==0.10.21" "easyocr==1.7.2" "google-cloud-storage>=2.16.0" opencv-python-headless pandas torch\n',
    "\n",
    "import site\n",
    "import importlib\n",
    "importlib.reload(site)\n",
    "print('Paketler kuruldu ve path guncellendi.')\n",
], cell_id="c3"))

# -- Cell 4: Imports --
cells.append(make_cell([
    "import os, sys, json, glob\n",
    "import pandas as pd\n",
    "import mediapipe as mp\n",
    "from pathlib import Path\n",
    "\n",
    "# Credential ayarla\n",
    "CREDENTIAL_PATH = '/content/senior-design-488908-1d5d3e1681ee.json'\n",
    "if not os.path.exists(CREDENTIAL_PATH):\n",
    f"    _cred = {cred_escaped}\n",
    "    with open(CREDENTIAL_PATH, 'w') as f:\n",
    "        f.write(_cred)\n",
    "os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = CREDENTIAL_PATH\n",
    "\n",
    'REPO_DIR = "/content/LectureAI"\n',
    "sys.path.insert(0, REPO_DIR)\n",
    "%cd {REPO_DIR}\n",
    "\n",
    'print("mediapipe:", mp.__version__)\n',
    'print("Credential:", CREDENTIAL_PATH)\n',
], cell_id="c4"))

# -- Cell 5: Import pipeline --
cells.append(make_cell([
    "from video.dynamic_visual_pipeline import run_dynamic_visual_poc\n",
    "from video.frame_extractor import get_video_meta\n",
    "from google.cloud import storage\n",
    "\n",
    "client = storage.Client()\n",
    'print("Import ve Storage client hazir.")\n',
], cell_id="c5"))

# -- Cell 7: Config --
cells.append(make_cell([
    'BUCKET_NAME = "lectureai_processed"\n',
    'SEGMENT_PREFIX = "TUR40W245_TUE-18_8-9(M1L1)/"\n',
    'TEACHER_NAME = "Zehra Bozkurt"\n',
    "\n",
    "ANALYSIS_INTERVAL_SEC = 2.0\n",
    "RELOCALIZE_INTERVAL_SEC = 10.0\n",
    "SMILE_THRESHOLD = 0.60\n",
    "\n",
    'LOCAL_SEGMENT_DIR = "/content/work/segments"\n',
    'LOCAL_OUTPUT_DIR = "/content/work/outputs"\n',
    "\n",
    "os.makedirs(LOCAL_SEGMENT_DIR, exist_ok=True)\n",
    "os.makedirs(LOCAL_OUTPUT_DIR, exist_ok=True)\n",
], cell_id="c7"))

# -- Cell 8: List segments --
cells.append(make_cell([
    "blobs = sorted([\n",
    "    blob.name\n",
    "    for blob in client.list_blobs(BUCKET_NAME, prefix=SEGMENT_PREFIX)\n",
    '    if blob.name.lower().endswith(".mp4")\n',
    "])\n",
    "\n",
    'print(f"Toplam segment: {len(blobs)}")\n',
    "for b in blobs[:30]:\n",
    '    print("-", b)\n',
], cell_id="c8"))

# -- Cell 9: Select segments --
cells.append(make_cell([
    'TEST_MODE = "single"   # "single", "first_n", "all"\n',
    "SINGLE_SEGMENT_INDEX = 4\n",
    "FIRST_N = 2\n",
    "\n",
    'if TEST_MODE == "single":\n',
    "    selected_blobs = [blobs[SINGLE_SEGMENT_INDEX]]\n",
    'elif TEST_MODE == "first_n":\n',
    "    selected_blobs = blobs[:FIRST_N]\n",
    'elif TEST_MODE == "all":\n',
    "    selected_blobs = blobs\n",
    "else:\n",
    '    raise ValueError("TEST_MODE yanlis.")\n',
    "\n",
    'print("Secilen segmentler:")\n',
    "for s in selected_blobs:\n",
    "    print(s)\n",
], cell_id="c9"))

# -- Cell 10: Process function --
cells.append(make_cell([
    "def download_blob(bucket_name, source_blob_name, destination_file_name):\n",
    "    bucket = client.bucket(bucket_name)\n",
    "    blob = bucket.blob(source_blob_name)\n",
    "    os.makedirs(os.path.dirname(destination_file_name), exist_ok=True)\n",
    "    blob.download_to_filename(destination_file_name)\n",
    '    print(f"Downloaded: gs://{bucket_name}/{source_blob_name} -> {destination_file_name}")\n',
    "\n",
    "\n",
    "def process_segment(blob_name: str):\n",
    "    segment_name = Path(blob_name).name\n",
    "    segment_stem = Path(segment_name).stem\n",
    "\n",
    "    local_video = os.path.join(LOCAL_SEGMENT_DIR, segment_name)\n",
    "    output_dir = os.path.join(LOCAL_OUTPUT_DIR, segment_stem)\n",
    "    os.makedirs(output_dir, exist_ok=True)\n",
    '    debug_frames_dir = os.path.join(output_dir, "frames")\n',
    "    os.makedirs(debug_frames_dir, exist_ok=True)\n",
    "\n",
    "    download_blob(BUCKET_NAME, blob_name, local_video)\n",
    "\n",
    "    meta = get_video_meta(local_video)\n",
    '    print("Video meta:", meta)\n',
    "\n",
    "    summary, debug_df = run_dynamic_visual_poc(\n",
    "        video_path=local_video,\n",
    "        teacher_name=TEACHER_NAME,\n",
    "        analysis_interval_sec=ANALYSIS_INTERVAL_SEC,\n",
    "        relocalize_interval_sec=RELOCALIZE_INTERVAL_SEC,\n",
    "        smile_threshold=SMILE_THRESHOLD,\n",
    "        start_sec=0.0,\n",
    "        end_sec=None,\n",
    "        only_camera_open_frames=True,\n",
    "        debug_dir=debug_frames_dir,\n",
    "    )\n",
    "\n",
    "    summary.update({\n",
    '        "bucket": BUCKET_NAME,\n',
    '        "blob": blob_name,\n',
    '        "segment_name": segment_name,\n',
    '        "teacher_name": TEACHER_NAME,\n',
    '        "video_duration_sec": meta["duration_sec"],\n',
    '        "video_fps": meta["fps"],\n',
    '        "video_width": meta["width"],\n',
    '        "video_height": meta["height"],\n',
    "    })\n",
    "\n",
    '    summary_json = os.path.join(output_dir, "summary.json")\n',
    '    summary_csv = os.path.join(output_dir, "summary.csv")\n',
    '    debug_csv = os.path.join(output_dir, "debug.csv")\n',
    "\n",
    '    with open(summary_json, "w", encoding="utf-8") as f:\n',
    "        json.dump(summary, f, ensure_ascii=False, indent=2)\n",
    "\n",
    "    pd.DataFrame([summary]).to_csv(summary_csv, index=False)\n",
    "    debug_df.to_csv(debug_csv, index=False)\n",
    "\n",
    '    print("Saved:")\n',
    "    print(summary_json)\n",
    "    print(summary_csv)\n",
    "    print(debug_csv)\n",
    "\n",
    "    return summary, debug_df, output_dir\n",
], cell_id="c10"))

# -- Cell 11: Run pipeline --
cells.append(make_cell([
    "all_summaries = []\n",
    "all_debug_dfs = []\n",
    "\n",
    "for blob_name in selected_blobs:\n",
    "    summary, debug_df, output_dir = process_segment(blob_name)\n",
    "    all_summaries.append(summary)\n",
    "    all_debug_dfs.append(debug_df)\n",
], cell_id="c11"))

# -- Cell 12: Summary table --
cells.append(make_cell([
    "segment_summary_df = pd.DataFrame(all_summaries)\n",
    "segment_summary_df\n",
], cell_id="c12"))

# -- Cell 13: Overall summary --
cells.append(make_cell([
    "def build_overall_summary(segment_summary_df: pd.DataFrame):\n",
    "    if segment_summary_df.empty:\n",
    "        return {}\n",
    "\n",
    '    total_sampled = float(segment_summary_df["frames_total_sampled"].sum())\n',
    '    total_located = float(segment_summary_df["teacher_located_frames"].sum())\n',
    '    total_camera_open = float(segment_summary_df["camera_open_frames"].sum())\n',
    "\n",
    "    weighted_movement_num = (\n",
    '        segment_summary_df["movement_energy_avg"] * segment_summary_df["camera_open_frames"]\n',
    "    ).sum()\n",
    "\n",
    "    overall = {\n",
    '        "segments_processed": int(len(segment_summary_df)),\n',
    '        "frames_total_sampled": int(total_sampled),\n',
    '        "teacher_located_frames": int(total_located),\n',
    '        "camera_open_frames": int(total_camera_open),\n',
    '        "teacher_locate_ratio": (total_located / total_sampled) if total_sampled else 0.0,\n',
    '        "camera_open_ratio_total": (total_camera_open / total_sampled) if total_sampled else 0.0,\n',
    '        "camera_open_ratio_among_located": (total_camera_open / total_located) if total_located else 0.0,\n',
    '        "movement_energy_avg": (weighted_movement_num / total_camera_open) if total_camera_open else 0.0,\n',
    '        "avg_smile_frame_ratio": float(segment_summary_df["smile_frame_ratio"].mean()) if len(segment_summary_df) else 0.0,\n',
    '        "avg_hand_visible_ratio": float(segment_summary_df["hand_visible_ratio"].mean()) if len(segment_summary_df) else 0.0,\n',
    "    }\n",
    "    return overall\n",
    "\n",
    "overall_summary = build_overall_summary(segment_summary_df)\n",
    "overall_summary\n",
], cell_id="c13"))

# -- Cell 14: Save combined --
cells.append(make_cell([
    'combined_dir = os.path.join(LOCAL_OUTPUT_DIR, "_combined")\n',
    "os.makedirs(combined_dir, exist_ok=True)\n",
    "\n",
    'segment_summary_path = os.path.join(combined_dir, "segment_summaries.csv")\n',
    'overall_summary_path = os.path.join(combined_dir, "overall_summary.json")\n',
    'combined_debug_path = os.path.join(combined_dir, "combined_debug.csv")\n',
    "\n",
    "segment_summary_df.to_csv(segment_summary_path, index=False)\n",
    "\n",
    'with open(overall_summary_path, "w", encoding="utf-8") as f:\n',
    "    json.dump(overall_summary, f, ensure_ascii=False, indent=2)\n",
    "\n",
    "combined_debug_df = pd.concat(all_debug_dfs, ignore_index=True) if all_debug_dfs else pd.DataFrame()\n",
    "combined_debug_df.to_csv(combined_debug_path, index=False)\n",
    "\n",
    "print(segment_summary_path)\n",
    "print(overall_summary_path)\n",
    "print(combined_debug_path)\n",
], cell_id="c14"))

# -- Cell 14b: Display results in notebook --
cells.append(make_cell([
    "# === SONUCLARI GORUNTULE ===\n",
    "print('='*60)\n",
    "print('OVERALL SUMMARY')\n",
    "print('='*60)\n",
    "for k, v in overall_summary.items():\n",
    "    print(f'  {k}: {v}')\n",
    "\n",
    "print()\n",
    "print('='*60)\n",
    "print('SEGMENT SUMMARIES')\n",
    "print('='*60)\n",
    "display(segment_summary_df)\n",
    "\n",
    "print()\n",
    "print('='*60)\n",
    "print('DEBUG DF (ilk 20 satir)')\n",
    "print('='*60)\n",
    "combined_debug_df = pd.concat(all_debug_dfs, ignore_index=True) if all_debug_dfs else pd.DataFrame()\n",
    "display(combined_debug_df.head(20))\n",
], cell_id="c14b"))

# -- Cell 14c: Upload results to GCS --
cells.append(make_cell([
    "# Sonuclari GCS bucket'a yukle (kalici erisim icin)\n",
    "import shutil\n",
    "\n",
    "# Zip olustur\n",
    "zip_path = shutil.make_archive('/content/lectureai_results', 'zip', LOCAL_OUTPUT_DIR)\n",
    "\n",
    "# GCS'ye yukle\n",
    "RESULTS_BUCKET = BUCKET_NAME\n",
    "RESULTS_PREFIX = SEGMENT_PREFIX.rstrip('/') + '_results/'\n",
    "\n",
    "_bucket = client.bucket(RESULTS_BUCKET)\n",
    "\n",
    "# Tek tek dosyalari yukle\n",
    "import glob as _glob\n",
    "for fpath in _glob.glob(os.path.join(LOCAL_OUTPUT_DIR, '_combined', '*')):\n",
    "    blob_name = RESULTS_PREFIX + os.path.basename(fpath)\n",
    "    _bucket.blob(blob_name).upload_from_filename(fpath)\n",
    "    print(f'Yuklendi: gs://{RESULTS_BUCKET}/{blob_name}')\n",
    "\n",
    "# ZIP'i de yukle\n",
    "zip_blob = RESULTS_PREFIX + 'lectureai_results.zip'\n",
    "_bucket.blob(zip_blob).upload_from_filename(zip_path)\n",
    "print(f'ZIP yuklendi: gs://{RESULTS_BUCKET}/{zip_blob}')\n",
    "print()\n",
    "print('Tum sonuclar GCS bucket a yuklendi!')\n",
], cell_id="c14c"))

# -- Cell 15: Visualization --
cells.append(make_cell([
    "import cv2\n",
    "import matplotlib.pyplot as plt\n",
    "import matplotlib.patches as patches\n",
    "\n",
    "first_blob = selected_blobs[0]\n",
    "first_segment_name = Path(first_blob).name\n",
    "first_segment_stem = Path(first_segment_name).stem\n",
    "first_local_video = os.path.join(LOCAL_SEGMENT_DIR, first_segment_name)\n",
    'first_debug_csv = os.path.join(LOCAL_OUTPUT_DIR, first_segment_stem, "debug.csv")\n',
    "\n",
    "debug_df = pd.read_csv(first_debug_csv)\n",
    "\n",
    'sample_rows = debug_df[debug_df["used_for_metrics"] == True].iloc[::10].head(5)\n',
    "\n",
    "if sample_rows.empty:\n",
    '    print("Kullanilan frame yok.")\n',
    "else:\n",
    "    cap = cv2.VideoCapture(first_local_video)\n",
    "\n",
    "    for _, row in sample_rows.iterrows():\n",
    '        t_sec = float(row["t_sec"])\n',
    "        cap.set(cv2.CAP_PROP_POS_MSEC, t_sec * 1000)\n",
    "        ok, frame = cap.read()\n",
    "        if not ok:\n",
    "            continue\n",
    "\n",
    '        x, y, w, h = int(row["tile_x"]), int(row["tile_y"]), int(row["tile_w"]), int(row["tile_h"])\n',
    "\n",
    "        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)\n",
    "        fig, ax = plt.subplots(1, figsize=(12, 7))\n",
    "        ax.imshow(frame_rgb)\n",
    "\n",
    "        rect = patches.Rectangle((x, y), w, h, linewidth=2, edgecolor='red', facecolor='none')\n",
    "        ax.add_patch(rect)\n",
    "\n",
    '        face = row.get("face_detected_metric", False)\n',
    "        smile = row.get(\"smile_score\", float('nan'))\n",
    "        hands = row.get(\"hands_detected\", float('nan'))\n",
    "        mov = row.get(\"movement_energy\", float('nan'))\n",
    "\n",
    "        info_text = (\n",
    '            f"Face: {face}\\\\n"\n',
    '            f"Smile: {smile:.2f}\\\\n"\n',
    '            f"Hands: {hands}\\\\n"\n',
    '            f"Mov: {mov:.2f}"\n',
    "        )\n",
    "\n",
    "        ax.text(x, max(0, y - 10), info_text, color='yellow', fontsize=12,\n",
    "                bbox=dict(facecolor='black', alpha=0.5, edgecolor='none'))\n",
    "\n",
    "        title = (\n",
    "            f\"{first_segment_name} | t={t_sec:.1f}s | source={row['source']} | \"\n",
    "            f\"camera_open={row['camera_open_frame']}\"\n",
    "        )\n",
    "        ax.set_title(title)\n",
    '        plt.axis("off")\n',
    "        plt.show()\n",
    "\n",
    "    cap.release()\n",
], cell_id="c15"))

# -- Cell 16: Debug stats --
cells.append(make_cell([
    "first_blob = selected_blobs[0]\n",
    "first_segment_name = Path(first_blob).name\n",
    "first_segment_stem = Path(first_segment_name).stem\n",
    'first_debug_csv = os.path.join(LOCAL_OUTPUT_DIR, first_segment_stem, "debug.csv")\n',
    "\n",
    "debug_df = pd.read_csv(first_debug_csv)\n",
    "\n",
    'print("Toplam sampled:", len(debug_df))\n',
    'print("Teacher found:", int(debug_df["teacher_found"].fillna(False).sum()))\n',
    'print("Camera open:", int(debug_df["camera_open_frame"].fillna(False).sum()))\n',
    'print("Used for metrics:", int(debug_df["used_for_metrics"].fillna(False).sum()))\n',
    "\n",
    'print("\\nSource dagilimi:")\n',
    'print(debug_df["source"].value_counts(dropna=False))\n',
    "\n",
    'print("\\nSadece kullanilan framelerde source dagilimi:")\n',
    'print(debug_df[debug_df["used_for_metrics"] == True]["source"].value_counts(dropna=False))\n',
], cell_id="c16"))


nb = {
    "cells": cells,
    "metadata": {
        "accelerator": "GPU",
        "colab": {"gpuType": "T4", "provenance": []},
        "kernelspec": {"display_name": "Python 3 (ipykernel)", "language": "python", "name": "python3"},
        "language_info": {"name": "", "version": ""},
    },
    "nbformat": 4,
    "nbformat_minor": 0,
}

with open(nb_path, "w", encoding="utf-8") as f:
    json.dump(nb, f, indent=2, ensure_ascii=False)

print(f"Notebook guncellendi: {nb_path}")
print(f"Toplam {len(cells)} hucre yazildi.")
