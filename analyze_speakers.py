import json

with open('core/registry_output/irem_full_transcript.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

utterances = data.get('utterances', [])

print("--- SPEAKER C SEGMENTS ---")
for u in utterances:
    if u['speaker'] == 'C':
        print(f"[{u['start']/1000:.1f}s - {u['end']/1000:.1f}s] {u['text']}")

print("\n--- SPEAKER D SEGMENTS ---")
for u in utterances:
    if u['speaker'] == 'D':
        print(f"[{u['start']/1000:.1f}s - {u['end']/1000:.1f}s] {u['text']}")
