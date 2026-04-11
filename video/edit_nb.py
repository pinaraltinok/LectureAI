import json
import os
import sys

nb_path = r"c:\Users\Zehra\Desktop\bitirme\LectureAI\LectureAI\video\lectureAI_video_test.ipynb"
with open(nb_path, "r", encoding="utf-8") as f:
    nb = json.load(f)

new_cells = []

# Intro cell
setup_cell = {
    "cell_type": "code",
    "execution_count": None,
    "metadata": {},
    "outputs": [],
    "source": [
        "import os\n",
        "import sys\n",
        "from pathlib import Path\n",
        "\n",
        "# Proje ana dizinini path'e ekleyelim ki 'video' modüllerini bulabilelim.\n",
        "# Notebook video/ dizininde olduğu için bir üst dizine çıkıyoruz:\n",
        "REPO_DIR = os.path.abspath(os.path.join(os.getcwd(), \"..\"))\n",
        "if REPO_DIR not in sys.path:\n",
        "    sys.path.insert(0, REPO_DIR)\n",
        "    \n",
        "print(\"Proje kök dizini sys.path'e eklendi:\", REPO_DIR)"
    ]
}

import_cell = {
    "cell_type": "code",
    "execution_count": None,
    "metadata": {},
    "outputs": [],
    "source": [
        "import json\n",
        "import pandas as pd\n",
        "import mediapipe as mp\n",
        "from video.dynamic_visual_pipeline import run_dynamic_visual_poc\n",
        "from video.frame_extractor import get_video_meta\n",
        "\n",
        "print(\"mediapipe version:\", mp.__version__)\n",
        "print(\"has solutions:\", hasattr(mp, \"solutions\"))\n",
        "print(\"Import başarılı.\")"
    ]
}

auth_cell = {
    "cell_type": "code",
    "execution_count": None,
    "metadata": {},
    "outputs": [],
    "source": [
        "import glob\n",
        "from google.cloud import storage\n",
        "\n",
        "# Kendi bilgisayarınızdaki service account JSON dosyasının yolunu buraya yazın:\n",
        "# Örneğin: r\"C:\\Users\\Zehra\\Desktop\\bitirme\\senior-design.json\"\n",
        "CREDENTIAL_PATH = r\"C:\\Users\\Zehra\\Desktop\\bitirme\\senior-design-488908-1d5d3e1681ee (2).json\"\n",
        "\n",
        "if not os.path.exists(CREDENTIAL_PATH):\n",
        "    print(f\"UYARI: Credential dosyası bulunamadı! Lütfen CREDENTIAL_PATH'i güncelleyin. Beklenen yol: {CREDENTIAL_PATH}\")\n",
        "else:\n",
        "    os.environ[\"GOOGLE_APPLICATION_CREDENTIALS\"] = CREDENTIAL_PATH\n",
        "    print(\"Credential:\", os.environ.get(\"GOOGLE_APPLICATION_CREDENTIALS\"))\n",
        "\n",
        "try:\n",
        "    client = storage.Client()\n",
        "    print(\"Storage client hazır.\")\n",
        "except Exception as e:\n",
        "    print(\"Storage client başlatılamadı:\", e)"
    ]
}

config_cell = {
    "cell_type": "code",
    "execution_count": None,
    "metadata": {},
    "outputs": [],
    "source": [
        "BUCKET_NAME = \"lectureai_processed\"\n",
        "SEGMENT_PREFIX = \"TUR40W245_TUE-18_8-9(M1L1)/\"\n",
        "TEACHER_NAME = \"Zehra Bozkurt\"\n",
        "\n",
        "ANALYSIS_INTERVAL_SEC = 2.0\n",
        "RELOCALIZE_INTERVAL_SEC = 10.0\n",
        "SMILE_THRESHOLD = 0.35\n",
        "\n",
        "# /content yerine lokal çalışma dizinleri\n",
        "LOCAL_SEGMENT_DIR = \"work/segments\"\n",
        "LOCAL_OUTPUT_DIR = \"work/outputs\"\n",
        "\n",
        "os.makedirs(LOCAL_SEGMENT_DIR, exist_ok=True)\n",
        "os.makedirs(LOCAL_OUTPUT_DIR, exist_ok=True)\n",
        "print(f\"Çalışma dizinleri oluşturuldu:\\n- {LOCAL_SEGMENT_DIR}\\n- {LOCAL_OUTPUT_DIR}\")"
    ]
}

new_cells.extend([setup_cell, import_cell, auth_cell, config_cell])

for cell in nb["cells"]:
    if cell["cell_type"] != "code":
        new_cells.append(cell)
        continue
        
    src = "".join(cell.get("source", []))
    
    # We want to keep cells that contain specific text
    if "client.list_blobs" in src or "TEST_MODE" in src or "def download_blob" in src or "all_summaries =" in src or "segment_summary_df =" in src or "def build_overall_summary" in src or "combined_dir = os.path.join" in src or "first_blob = selected_blobs[0]" in src:
        
        if sys_path_duplicate_check := ("sys.path.insert(0, REPO_DIR)" in src and "run_dynamic_visual_poc" in src):
            continue
            
        cell["outputs"] = []
        cell["execution_count"] = None
        new_cells.append(cell)

nb["cells"] = new_cells

with open(nb_path, "w", encoding="utf-8") as f:
    json.dump(nb, f, indent=2, ensure_ascii=False)

print("Notebook updated.")
