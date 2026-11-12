#!/usr/bin/env bash
# OmniVoice xizmatini o'rnatadi: Python muhiti, PyTorch, omnivoice va model (HuggingFace'dan, bir necha GB).
# NVIDIA GPU: OMNIVOICE_TORCH=cu128 ./setup.sh   (CUDA 12.8 uchun PyTorch). macOS (Apple Silicon) — oddiy.
set -euo pipefail
cd "$(dirname "$0")"
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q --upgrade pip
if [ "${OMNIVOICE_TORCH:-}" = "cu128" ]; then
  .venv/bin/pip install -q torch==2.8.0+cu128 torchaudio==2.8.0+cu128 --extra-index-url https://download.pytorch.org/whl/cu128
else
  .venv/bin/pip install -q torch torchaudio  # macOS / CPU: Python versiyasiga mos eng yangi PyTorch
fi
.venv/bin/pip install -r requirements.txt
.venv/bin/python - <<'PY'
from huggingface_hub import snapshot_download
snapshot_download("k2-fsa/OmniVoice")  # modelni oldindan yuklab oladi
print("tayyor: k2-fsa/OmniVoice")
PY
