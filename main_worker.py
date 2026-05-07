import os
import uvicorn
from core.pipelines.pubsub_listener import app

if __name__ == "__main__":
    # Cloud Run'ın verdiği PORT'u dinle
    port = int(os.environ.get("PORT", 8080))
    print(f"Worker baslatiliyor, port: {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
