import torch
try:
    from pyannote.audio import Model, Inference
    model = Model.from_pretrained("pyannote/embedding")
    inference = Inference(model, window="whole")
    print("SUCCESS: pyannote.audio is working")
except Exception as e:
    print(f"FAILURE: pyannote.audio error: {e}")
