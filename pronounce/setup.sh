#!/usr/bin/env bash
# Talaffuz xizmatini o'rnatadi: espeak-ng, Python muhiti, model (~1.2 GB) va uning lug'ati (vocab.json).
set -euo pipefail
cd "$(dirname "$0")"
command -v espeak-ng >/dev/null || { echo "espeak-ng kerak: macOS — brew install espeak-ng; Linux — apt install espeak-ng"; exit 1; }
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r requirements.txt
.venv/bin/python - <<'PY'
import json
from transformers import Wav2Vec2ForCTC, Wav2Vec2PhonemeCTCTokenizer
name = "facebook/wav2vec2-xlsr-53-espeak-cv-ft"
Wav2Vec2ForCTC.from_pretrained(name)  # modelni oldindan yuklab oladi
vocab = Wav2Vec2PhonemeCTCTokenizer.from_pretrained(name).get_vocab()
json.dump(vocab, open("vocab.json", "w", encoding="utf8"), ensure_ascii=False)
print("tayyor: model va vocab.json", len(vocab), "ta tovush")
PY
