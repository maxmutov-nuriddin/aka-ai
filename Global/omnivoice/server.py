"""OmniVoice — o'z serverimizdagi ovoz (TTS), API to'lovisiz. Ochiq model: k2-fsa/OmniVoice (Apache-2.0).

Har ovoz (xarakter-yosh, masalan "jahldor-katta") doim bir xil eshitilishi uchun ovoz namunasi (voice clone prompt)
bir marta yaratiladi va voices/<ovoz>.pt ga saqlanadi:
  1. voices/<ovoz>.pt bo'lsa — o'sha.
  2. voices/<ovoz>.wav (+ ixtiyoriy <ovoz>.txt — namunadagi matn) bo'lsa — shu yozuvdan klon. Gemini ovozlaridan
     bir marta yozib olish: npm run omnivoice:voices (scripts/omnivoice-voices.js). O'z ovozingizni ham qo'yish mumkin.
     DIQQAT: birovning ovozini faqat uning roziligi bilan klonlang.
  3. Aks holda — "instruct" (masalan "male, young adult, low pitch") bo'yicha xarakter ohangidagi namuna gap
     ("sample") qat'iy seed bilan o'qitiladi; klon shu ohangni (mehribon, jahldor, ...) davom ettiradi.
Fayl nomida instruct + sample xeshi bor — Node'da xarakter tavsifi o'zgarsa, ovoz o'zi qayta yaratiladi.

Ishga tushirish:  npm run omnivoice   (127.0.0.1:8770)
So'rov:  POST /tts   JSON {"text", "lang": "uz"|"ru"|null, "voice": "neytral-yosh", "instruct": "male, ...",
                           "sample": "xarakter ohangidagi gap", "speed": 0.9}
Javob:   audio/wav (24 kHz, mono, 16-bit)
Holat:   GET /health -> {"ok": true, "device": "mps"}
"""
import io
import json
import os
import re
import threading
import wave
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import torch
from omnivoice import OmniVoice, VoiceClonePrompt

MODEL_NAME = os.environ.get("OMNIVOICE_MODEL", "k2-fsa/OmniVoice")
HOST = os.environ.get("OMNIVOICE_HOST", "127.0.0.1")
PORT = int(os.environ.get("OMNIVOICE_PORT", "8770"))
VOICES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "voices")
MAX_TEXT_CHARS = 3000
MAX_BODY_BYTES = 16 * 1024
MAX_INSTRUCT_CHARS = 200
MAX_SAMPLE_CHARS = 300
SPEED_RANGE = (0.6, 1.4)  # 1 — model tanlagan sur'at; < 1 — sekinroq
LANGS = {"uz", "ru"}
VOICE_KEY = re.compile(r"^[a-z]+-[a-z]+$")  # fayl nomi bo'ladi — faqat shu ko'rinish (yo'l bilan hujum yo'q)
DEFAULT_VOICE = "neytral-yosh"
DEFAULT_INSTRUCT = "male, young adult, moderate pitch"
# Namuna gap berilmasa (o'zbekcha; klon ruscha matnda ham shu ovoz bilan gapiradi).
DEFAULT_SAMPLE = "Salom! Men Jigarman. Keling, bu mavzuni birga, shoshilmasdan, oddiy so'zlar bilan tushunib olamiz."


def pick_device():
    wanted = os.environ.get("OMNIVOICE_DEVICE", "").strip()
    if wanted:
        return wanted
    if torch.cuda.is_available():
        return "cuda:0"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


DEVICE = pick_device()
DTYPE = torch.float32 if DEVICE == "cpu" else torch.float16
# Diffuziya qadamlari: GPU (cuda) — 32 (sifat); Mac (mps) / CPU — 16 (o'lchov: M-seriyada 32 qadam real vaqtdan
# ~3 barobar sekin, 16 — ~1.6, 10 — ~1). OMNIVOICE_STEPS bilan o'zgartiriladi.
NUM_STEP = int(os.environ.get("OMNIVOICE_STEPS") or (32 if DEVICE.startswith("cuda") else 16))
MODEL = OmniVoice.from_pretrained(MODEL_NAME, device_map=DEVICE, dtype=DTYPE)
SAMPLE_RATE = MODEL.sampling_rate or 24_000
LOCK = threading.Lock()  # bitta model — so'rovlar navbat bilan (GPU xotirasi bitta nusxaga)
PROMPTS = {}


def to_wav(samples):
    pcm = (np.clip(np.asarray(samples, dtype=np.float32), -1.0, 1.0) * 32767).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


def design_prompt(voice, instruct, sample, speed):
    """instruct bo'yicha namuna: seed ovoz nomidan — qayta yaratilsa ham o'sha ovoz chiqadi. Namuna doim 32 qadam:
    u bir marta yaratiladi, sifati esa keyingi hamma javobga o'tadi."""
    torch.manual_seed(zlib.crc32(voice.encode()))
    audio = MODEL.generate(text=sample, language="uz", instruct=instruct, speed=speed, num_step=32)[0]
    waveform = torch.from_numpy(np.asarray(audio, dtype=np.float32)).unsqueeze(0)
    return MODEL.create_voice_clone_prompt(ref_audio=(waveform, SAMPLE_RATE), ref_text=sample)


def recorded_prompt(recording, transcript):
    """O'z yozuvingizdan klon. Matn fayli bo'lmasa — Whisper yozib oladi."""
    ref_text = None
    if os.path.exists(transcript):
        with open(transcript, encoding="utf8") as f:
            ref_text = f.read().strip() or None
    if ref_text is None:
        MODEL.load_asr_model()
    return MODEL.create_voice_clone_prompt(ref_audio=recording, ref_text=ref_text)


def prompt_for(voice, instruct, sample, speed):
    """Ovoz namunasi (xotirada va diskda keshlanadi). LOCK ichida chaqiriladi."""
    recording = os.path.join(VOICES_DIR, f"{voice}.wav")
    # Yozuv almashtirilsa (npm run omnivoice:voices) — vaqt belgisi o'zgaradi va ovoz qayta yaratiladi.
    version = (
        f"rec{int(os.path.getmtime(recording))}"
        if os.path.exists(recording)
        else f"{zlib.crc32(f'{instruct}|{sample}|{speed}'.encode()):08x}"
    )
    key = f"{voice}-{version}"
    if key in PROMPTS:
        return PROMPTS[key]
    saved = os.path.join(VOICES_DIR, f"{key}.pt")
    if os.path.exists(saved):
        prompt = VoiceClonePrompt.load(saved)
    else:
        if os.path.exists(recording):
            prompt = recorded_prompt(recording, os.path.join(VOICES_DIR, f"{voice}.txt"))
        else:
            prompt = design_prompt(voice, instruct, sample, speed)
        os.makedirs(VOICES_DIR, exist_ok=True)
        prompt.save(saved)
        print(f"[omnivoice] ovoz tayyor: {key}", flush=True)
    PROMPTS[key] = prompt
    return prompt


def parse_speed(value):
    try:
        speed = float(value)
    except (TypeError, ValueError):
        return 1.0
    return min(max(speed, SPEED_RANGE[0]), SPEED_RANGE[1])


def parse_request(body):
    """JSON so'rovni tekshiradi: (text, lang, voice, instruct, sample, speed) yoki ValueError."""
    data = json.loads(body.decode("utf8"))
    if not isinstance(data, dict):
        raise ValueError("JSON obyekt kerak")
    text = str(data.get("text") or "").strip()
    if not text:
        raise ValueError("text bo'sh")
    if len(text) > MAX_TEXT_CHARS:
        raise ValueError(f"text {MAX_TEXT_CHARS} belgidan oshmasin")
    lang = data.get("lang")
    lang = lang if lang in LANGS else None  # None — til avtomatik (aralash nutq)
    voice = str(data.get("voice") or DEFAULT_VOICE)
    if not VOICE_KEY.match(voice):
        raise ValueError("voice: 'xarakter-yosh' ko'rinishida bo'lsin")
    instruct = str(data.get("instruct") or DEFAULT_INSTRUCT)[:MAX_INSTRUCT_CHARS]
    sample = str(data.get("sample") or DEFAULT_SAMPLE).strip()[:MAX_SAMPLE_CHARS]
    return text, lang, voice, instruct, sample, parse_speed(data.get("speed"))


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, body, content_type="application/json"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def fail(self, status, message):
        self.reply(status, json.dumps({"error": message}, ensure_ascii=False).encode("utf8"))

    def do_GET(self):
        if self.path != "/health":
            return self.fail(404, "topilmadi")
        self.reply(200, json.dumps({"ok": True, "device": DEVICE}).encode())

    def do_POST(self):
        if self.path != "/tts":
            return self.fail(404, "topilmadi")
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY_BYTES:
            return self.fail(400, "so'rov hajmi noto'g'ri")
        try:
            text, lang, voice, instruct, sample, speed = parse_request(self.rfile.read(length))
        except (ValueError, UnicodeDecodeError) as err:
            return self.fail(400, str(err))
        try:
            with LOCK:
                prompt = prompt_for(voice, instruct, sample, speed)
                audio = MODEL.generate(
                    text=text, language=lang, voice_clone_prompt=prompt, speed=speed, num_step=NUM_STEP
                )[0]
            self.reply(200, to_wav(audio), "audio/wav")
        except Exception as err:  # noqa: BLE001 — xato Node'ga qaytadi, u ElevenLabs'ga o'tadi
            print(f"[omnivoice] xato ({voice}): {err!r}", flush=True)
            self.fail(500, "ovoz yaratilmadi")

    def log_message(self, fmt, *args):
        pass  # har so'rovni yozmaymiz


if __name__ == "__main__":
    print(f"[omnivoice] {MODEL_NAME} — {DEVICE}, {NUM_STEP} qadam; http://{HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
