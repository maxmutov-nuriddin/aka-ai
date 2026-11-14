// "Jigarga ayt" Siri buyrug'i (macOS Shortcuts): Jigar ilovasi uni o'zi yaratadi, Apple bilan imzolaydi va Shortcuts'da ochadi —
// egasi faqat "Qo'shish" tugmasini bosadi (qo'lda 4 ta amalni sozlash shart emas).
// Ketma-ketlik: gapni yozib olish → POST {server}/api/voice (Bearer kalit) → javobdagi "speech" → ovoz bilan aytish.
// Bu fayl — toza mantiq (Electron'siz, testlanadi): shortcut tavsifi (JSON → plutil bilan plist) va kirish tekshiruvi.
// Chaqiruvchi: main.js (jigar:install-siri). Kalit faqat vaqtinchalik faylda turadi va darhol o'chiriladi.

// Buyruq nomi "Jigar": Siri "Hey Siri, Jigar" desa shu ishga tushadi. Mac ilovasi nomi "Jigar AI" (nomlar to'qnashmasin).
const SHORTCUT_NAME = "Jigar";
const TOKEN_RE = /^jgr_[A-Za-z0-9_-]{10,200}$/;
const OBJECT_REPLACEMENT = "￼"; // Shortcuts matn ichidagi o'zgaruvchi belgisi
const VOICE_PATH = "/api/voice";

const UUIDS = {
  dictate: "6B1E5D2A-0A8E-4C0B-9E55-0D1E5A100001",
  request: "6B1E5D2A-0A8E-4C0B-9E55-0D1E5A100002",
  value: "6B1E5D2A-0A8E-4C0B-9E55-0D1E5A100003",
};

/** Shortcuts matn maydoni: oddiy matn. */
const text = (string) => ({ Value: { string }, WFSerializationType: "WFTextTokenString" });

/** Shortcuts matn maydoni: butunlay oldingi amal natijasi (o'zgaruvchi). */
const variable = (outputUUID, outputName) => ({
  Value: { string: OBJECT_REPLACEMENT, attachmentsByRange: { "{0, 1}": { OutputUUID: outputUUID, Type: "ActionOutput", OutputName: outputName } } },
  WFSerializationType: "WFTextTokenString",
});

const dictionary = (items) => ({ Value: { WFDictionaryFieldValueItems: items }, WFSerializationType: "WFDictionaryFieldValue" });
const field = (key, value) => ({ WFItemType: 0, WFKey: text(key), WFValue: value });

/** Server manzili: faqat https:// yoki http://localhost; yo'l/so'rovsiz. Noto'g'ri bo'lsa — null. */
function voiceUrl(serverUrl) {
  try {
    const url = new URL(serverUrl);
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
    return `${url.origin}${VOICE_PATH}`;
  } catch {
    return null;
  }
}

/**
 * Shortcuts fayli tavsifi (plutil bilan binar plist'ga aylantiriladi).
 * @param {{ serverUrl: string, token: string, language?: string }} options
 * @returns {object | null} noto'g'ri manzil yoki kalit — null
 */
function buildShortcut({ serverUrl, token, language = "ru-RU" }) {
  const url = voiceUrl(serverUrl);
  if (!url || !TOKEN_RE.test(String(token ?? ""))) return null;
  return {
    WFWorkflowClientVersion: "900",
    WFWorkflowMinimumClientVersion: 900,
    WFWorkflowMinimumClientVersionString: "900",
    WFWorkflowIcon: { WFWorkflowIconStartColor: 4282601983, WFWorkflowIconGlyphNumber: 59511 },
    WFWorkflowImportQuestions: [],
    WFWorkflowTypes: [],
    WFWorkflowInputContentItemClasses: [],
    WFWorkflowActions: [
      {
        WFWorkflowActionIdentifier: "is.workflow.actions.dictatetext",
        WFWorkflowActionParameters: { UUID: UUIDS.dictate, WFSpeechLanguage: language, WFDictateTextStopListening: "After Pause" },
      },
      {
        WFWorkflowActionIdentifier: "is.workflow.actions.downloadurl",
        WFWorkflowActionParameters: {
          UUID: UUIDS.request,
          WFURL: url,
          WFHTTPMethod: "POST",
          WFHTTPHeaders: dictionary([field("Authorization", text(`Bearer ${token}`))]),
          WFHTTPBodyType: "JSON",
          WFJSONValues: dictionary([field("text", variable(UUIDS.dictate, "Dictated Text"))]),
        },
      },
      {
        WFWorkflowActionIdentifier: "is.workflow.actions.getvalueforkey",
        WFWorkflowActionParameters: {
          UUID: UUIDS.value,
          WFDictionaryKey: "speech",
          WFInput: { Value: { OutputUUID: UUIDS.request, Type: "ActionOutput", OutputName: "Contents of URL" }, WFSerializationType: "WFTextTokenAttachment" },
        },
      },
      {
        WFWorkflowActionIdentifier: "is.workflow.actions.speaktext",
        WFWorkflowActionParameters: { WFText: variable(UUIDS.value, "Dictionary Value") },
      },
    ],
  };
}

module.exports = { SHORTCUT_NAME, TOKEN_RE, buildShortcut, voiceUrl };
