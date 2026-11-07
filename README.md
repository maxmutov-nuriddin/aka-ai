# aka-ai

"Aka" — maktab va litsey o'quvchilari (12-18 yosh) uchun o'quv yordamchisi. O'quvchi ko'rayotgan sahifani jaydari, hazilkash, lekin aniq tilda tushuntirib beradi.

## Tizim prompti

To'liq prompt: [`prompts/system-prompt.md`](prompts/system-prompt.md).

### Javob formati

Oddiy javob quyidagi bo'limlardan iborat (aynan shu tartibda):

| Bo'lim | Mazmuni |
| --- | --- |
| `[TUSHUNTIRISH]` | 3-6 gaplik bog'langan tushuntirish + hayotiy misol |
| `[ESDA QOLSIN]` | Eng muhim fikr bitta gapda |
| `[VIZUAL]` | Mermaid diagramma kodi yoki `yo'q` |
| `[QUIZ]` | JSON: `savol`, `variantlar` (A-D), `togri`, `izoh` |

### Dars xulosasi

Agar foydalanuvchi xabari `XULOSA_SO'ROVI` bilan boshlansa, model yuqoridagi formatni ishlatmaydi va faqat dars xulosasi, "Takrorlash kerak" qismi va ruhlantiruvchi gap qaytaradi.
