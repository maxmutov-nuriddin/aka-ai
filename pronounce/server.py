"""Talaffuz bahosi — o'z serverimizdagi ochiq model (Azure'siz). Rus va o'zbek tili.

Usul (GOP — "goodness of pronunciation"):
  1. Namuna matn (Scribe tanigan matn) -> espeak-ng -> kutilgan tovushlar (IPA), so'zma-so'z.
  2. wav2vec2-xlsr-53-espeak-cv-ft -> har 20 ms uchun tovush ehtimollari (CTC).
  3. Kutilgan tovushlar ketma-ketligi audioga majburiy moslanadi (CTC Viterbi).
  4. Har tovush bahosi = moslangan kadrlardagi eng yuqori ehtimol; so'z bahosi = tovushlar o'rtachasi.

Ishga tushirish:  npm run pronounce   (127.0.0.1:8765)
So'rov:  POST /assess?lang=ru&text=<matn>   body: 16 kHz mono PCM WAV
Javob:   {"source":"local","overall":0-100,"fluency":null,"words":[{"word","score","weak":[...]}]}
"""
import io
import json
import os
import re
import subprocess
import threading
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import numpy as np
import torch
from transformers import Wav2Vec2ForCTC

MODEL_NAME = "facebook/wav2vec2-xlsr-53-espeak-cv-ft"
HOST = os.environ.get("PRONOUNCE_HOST", "127.0.0.1")
PORT = int(os.environ.get("PRONOUNCE_PORT", "8765"))
ESPEAK = os.environ.get("ESPEAK_BIN", "espeak-ng")
SAMPLE_RATE = 16_000
MAX_AUDIO_SECONDS = 30
MAX_TEXT_CHARS = 400
MAX_BODY_BYTES = SAMPLE_RATE * 2 * MAX_AUDIO_SECONDS + 1024
METHODS = ("max", "ratio", "gop")
# O'lchov (espeak toza xatolar + Fish/ElevenLabs tabiiy nutq) bo'yicha eng yaxshisi: ratio + mean.
DEFAULT_METHOD = os.environ.get("PRONOUNCE_METHOD", "ratio")
AGGS = ("mean", "min", "mix")
DEFAULT_AGG = os.environ.get("PRONOUNCE_AGG", "mean")
WEAK_PHONEME = 50  # tovush bahosi (%) shundan past — sust tovush
LANGS = {"ru": "ru", "uz": "uz"}
STRESS = re.compile("[ˈˌ]")
WORD_CHARS = re.compile(r"[^\w'ʻʼ-]+", re.UNICODE)

torch.set_num_threads(max(1, (os.cpu_count() or 4) // 2))
MODEL = Wav2Vec2ForCTC.from_pretrained(MODEL_NAME).eval()
with open(os.path.join(os.path.dirname(__file__), "vocab.json"), encoding="utf8") as f:
    VOCAB = json.load(f)  # model lug'ati (tovush -> id); setup.sh modeldan chiqarib saqlaydi
BLANK = VOCAB.get("<pad>", 0)

# Yaqin tovushlar bitta guruh: espeak ruscha/o'zbekcha nozik variantlarni (ʌ, ɪ, ɭ) kutadi,
# model esa ko'pincha asosiy tovushni (a, i, l) chiqaradi — bu xato emas. Yumshoqlik (ʲ) va
# cho'ziqlik (ː) ham bir guruhda: model ularni ishonchli ajratmaydi.
MODIFIERS = re.compile("[ʲːˑ̞̃.0-9ʰ]")
SIMILAR = [
    "a ɑ ʌ ɐ ə æ ɒ ä", "e ɛ ɘ", "i ɪ ɨ ɯ", "o ɔ ɵ", "u ʊ ʉ y",
    "l ɭ ɫ ʎ", "r ɾ ɹ ʀ", "ɡ g", "x χ", "ʃ ɕ ʂ", "ʒ ʐ ʑ", "tʃ tɕ ʈʂ", "n ɲ ŋ", "j ʝ",
]
GROUP_OF = {sym: i for i, line in enumerate(SIMILAR) for sym in line.split()}


def group_key(symbol: str):
    base = MODIFIERS.sub("", symbol)
    return GROUP_OF.get(base, base)


_keys: dict = {}
TOKEN_GROUP = np.zeros(max(VOCAB.values()) + 1, dtype=np.int32)
for _sym, _idx in VOCAB.items():
    TOKEN_GROUP[_idx] = _keys.setdefault(group_key(_sym), len(_keys))
LOCK = threading.Lock()  # bitta model — so'rovlar navbat bilan


def read_wav(body: bytes) -> np.ndarray:
    with wave.open(io.BytesIO(body)) as w:
        if w.getframerate() != SAMPLE_RATE or w.getnchannels() != 1 or w.getsampwidth() != 2:
            raise ValueError("16 kHz mono 16-bit WAV kerak")
        frames = w.readframes(min(w.getnframes(), SAMPLE_RATE * MAX_AUDIO_SECONDS))
    audio = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768
    if audio.size < SAMPLE_RATE // 4:
        raise ValueError("Ovoz juda qisqa")
    return (audio - audio.mean()) / (audio.std() + 1e-7)  # modelga kerakli normallash


AFFRICATES = {"ts", "tʃ", "dʒ", "dz", "tɕ", "dʑ", "tʂ"}  # bitta tovush — bo'linmaydi
UNIT = re.compile(r".[ʲːˑ̞̃ʰ]*")  # asosiy belgi + uning belgilari (yumshoqlik, cho'ziqlik)


def tokens_for(symbol: str) -> list:
    """espeak tovushi -> model lug'ati. "ja" kabi qo'shma belgilar tovushlarga ajratiladi
    (model ularni deyarli chiqarmaydi), affrikatlar (tʃ, ts) — butunligicha."""
    units = UNIT.findall(STRESS.sub("", symbol))
    out, i = [], 0
    while i < len(units):
        pair = "".join(units[i:i + 2])
        if MODIFIERS.sub("", pair) in AFFRICATES and pair in VOCAB:
            out.append(VOCAB[pair])
            i += 2
            continue
        unit = units[i]
        base = unit[0]
        if unit in VOCAB:
            out.append(VOCAB[unit])
        elif base in VOCAB:
            out.append(VOCAB[base])  # lug'atda belgili varianti yo'q — asosiy tovush
        i += 1
    return out


def espeak_ipa(text: str, lang: str) -> str:
    return subprocess.run(
        [ESPEAK, "-q", "--ipa", "--sep= ", "-v", LANGS[lang], text],
        capture_output=True, text=True, timeout=10, check=True,
    ).stdout


def expected_words(text: str, lang: str) -> list:
    """[(so'z, espeak tovushlari, model id'lari)] — ibora kontekstida (masalan, "в школу" -> f)."""
    words = [w for w in (WORD_CHARS.sub("", w) for w in text.split()) if re.search(r"\w", w)]
    if not words:
        return []
    chunks = [c.split() for c in re.split(r"\s{2,}|\n", espeak_ipa(" ".join(words), lang).strip()) if c.strip()]
    if len(chunks) != len(words):  # espeak so'zlarni boshqacha bo'lsa — har so'z alohida
        chunks = [espeak_ipa(w, lang).split() for w in words]
    result = []
    for word, phones in zip(words, chunks):
        phones = [p for p in (STRESS.sub("", p) for p in phones) if p]
        ids = [t for p in phones for t in tokens_for(p)]
        if ids:
            result.append((word, phones, ids))
    return result


def ctc_align(logp: np.ndarray, targets: list) -> list:
    """CTC Viterbi: har bir maqsad tovushga moslangan kadrlar ro'yxati."""
    T, L = logp.shape[0], len(targets)
    states = [BLANK]
    for t in targets:
        states += [t, BLANK]
    S = len(states)
    neg = -1e9
    dp = np.full((T, S), neg, dtype=np.float32)
    back = np.zeros((T, S), dtype=np.int8)
    dp[0, 0] = logp[0, states[0]]
    if S > 1:
        dp[0, 1] = logp[0, states[1]]
    emit = logp[:, states]  # (T, S)
    skip_ok = np.array([s >= 2 and states[s] != BLANK and states[s] != states[s - 2] for s in range(S)])
    for t in range(1, T):
        prev = dp[t - 1]
        stay = prev
        step = np.concatenate(([neg], prev[:-1]))
        jump = np.where(skip_ok, np.concatenate(([neg, neg], prev[:-2])), neg)
        choices = np.stack([stay, step, jump])
        arg = choices.argmax(0)
        dp[t] = choices[arg, np.arange(S)] + emit[t]
        back[t] = arg
    s = S - 1 if S < 2 or dp[T - 1, S - 1] >= dp[T - 1, S - 2] else S - 2
    frames = [[] for _ in range(L)]
    for t in range(T - 1, -1, -1):
        if states[s] != BLANK:
            frames[(s - 1) // 2].append(t)
        s -= int(back[t, s])
    return frames


def phone_scores(post: np.ndarray, frames: list, targets: list, method: str) -> list:
    """Har maqsad tovush bahosi (0-1).
    max   — moslangan kadrlarda tovush guruhining eng yuqori ehtimoli;
    ratio — eng yaxshi kadrda guruh ehtimoli / eng kuchli raqobatchi guruh (bo'shliqsiz);
    gop   — ratio ning kadrlar bo'yicha o'rtachasi."""
    groups = TOKEN_GROUP[: post.shape[1]]
    n_groups = int(groups.max()) + 1
    blank_group = groups[BLANK]
    out = []
    for f, t in zip(frames, targets):
        if not f:
            out.append(0.0)
            continue
        g = groups[t]
        if method == "max":
            out.append(float(post[f][:, groups == g].sum(1).max()))
            continue
        gp = np.zeros((len(f), n_groups), dtype=np.float32)
        np.add.at(gp.T, groups, post[f].T)  # kadr x guruh ehtimollari
        gp[:, blank_group] = 0
        ratio = gp[:, g] / np.maximum(gp.max(1), 1e-6)
        out.append(float(ratio.max() if method == "ratio" else ratio.mean()))
    return out


def assess(audio: np.ndarray, text: str, lang: str, method: str = "max", agg: str = "mean") -> dict:
    words = expected_words(text, lang)
    if not words:
        return {"source": "local", "overall": None, "fluency": None, "words": []}
    with LOCK, torch.no_grad():
        logits = MODEL(torch.from_numpy(audio)[None]).logits[0]
    logp = torch.log_softmax(logits, -1).numpy()
    targets = [t for _, _, ids in words for t in ids]
    if logp.shape[0] < len(targets):
        raise ValueError("Ovoz matnga nisbatan juda qisqa")
    frames = ctc_align(logp, targets)
    probs = phone_scores(np.exp(logp), frames, targets, method)
    out, i = [], 0
    for word, phones, ids in words:
        scores = probs[i:i + len(ids)]
        i += len(ids)
        per_phone, j = [], 0  # espeak tovushi bo'yicha: uning model bo'laklari o'rtachasi
        for p in phones:
            n = len(tokens_for(p))
            if n:
                per_phone.append((p, sum(scores[j:j + n]) / n))
                j += n
        weak = [p for p, s in sorted(per_phone, key=lambda x: x[1]) if s * 100 < WEAK_PHONEME][:4]
        # So'z bahosi: o'rtacha yoki eng sust tovush (bitta xato tovush uzun so'zda "erib ketmasin").
        value = min(scores) if agg == "min" else (sum(scores) / len(scores) if agg == "mean" else 0.5 * min(scores) + 0.5 * sum(scores) / len(scores))
        out.append({"word": word, "score": round(100 * value ** 0.5), "weak": weak})
    overall = round(sum(w["score"] for w in out) / len(out))
    return {"source": "local", "overall": overall, "fluency": None, "words": out}


class Handler(BaseHTTPRequestHandler):
    def _json(self, status: int, data: dict) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  # noqa: N802 — holat tekshiruvi
        if urlparse(self.path).path == "/health":
            return self._json(200, {"ok": True, "model": MODEL_NAME})
        self._json(404, {"error": "topilmadi"})

    def do_POST(self):  # noqa: N802
        url = urlparse(self.path)
        if url.path != "/assess":
            return self._json(404, {"error": "topilmadi"})
        query = parse_qs(url.query)
        lang = (query.get("lang") or [""])[0]
        method = (query.get("method") or [DEFAULT_METHOD])[0]
        agg = (query.get("agg") or [DEFAULT_AGG])[0]
        text = (query.get("text") or [""])[0][:MAX_TEXT_CHARS]
        length = int(self.headers.get("Content-Length") or 0)
        if lang not in LANGS or not text.strip():
            return self._json(400, {"error": "lang (ru|uz) va text kerak"})
        if not 0 < length <= MAX_BODY_BYTES:
            return self._json(413, {"error": "Ovoz juda katta yoki bo'sh"})
        try:
            result = assess(read_wav(self.rfile.read(length)), text, lang, method if method in METHODS else DEFAULT_METHOD, agg if agg in AGGS else DEFAULT_AGG)
        except ValueError as err:
            return self._json(400, {"error": str(err)})
        except Exception as err:  # model yoki espeak xatosi — Node Scribe ishorasiga o'tadi
            self.log_error("assess: %r", err)
            return self._json(500, {"error": "Talaffuz bahosi ishlamadi"})
        self._json(200, result)

    def log_message(self, fmt, *args):  # har so'rovni yozmaymiz; xatolar log_error orqali
        pass


if __name__ == "__main__":
    print(f"Talaffuz xizmati: http://{HOST}:{PORT} ({MODEL_NAME})", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
