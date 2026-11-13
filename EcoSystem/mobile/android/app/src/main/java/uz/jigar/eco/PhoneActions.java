package uz.jigar.eco;

import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.database.Cursor;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.ContactsContract;
import android.telephony.SmsManager;
import android.view.KeyEvent;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import org.json.JSONObject;

/**
 * Telefonda Jigar buyruqlarini bajaradi (server: "phone" asbobi). Natija: {"text": ...} yoki {"error": ...}.
 * SMS — faqat server egasining "Ha"sini olgan bo'lsa (approved). Boshqa ilovani ochish fonda — "boshqa ilovalar ustida"
 * ruxsati bilan (JigarAgentPlugin so'raydi).
 */
final class PhoneActions {
    private static final Pattern PHONE = Pattern.compile("^\\+?[0-9 ()-]{5,20}$");
    private static final Pattern VIDEO_ID = Pattern.compile("^[A-Za-z0-9_-]{11}$");
    private static final int FIND_MS = 20_000;
    private static final int TEXT_MAX = 2000;
    private static final int LIST_MAX = 200;
    private final Context context;

    PhoneActions(Context context) {
        this.context = context.getApplicationContext();
    }

    JSONObject run(JSONObject command) {
        try {
            if (!"phone".equals(command.optString("tool"))) return error("Bu qurilma faqat telefon buyruqlarini bajaradi.");
            JSONObject input = command.optJSONObject("input");
            if (input == null) input = new JSONObject();
            return dispatch(input.optString("action"), input, command.optBoolean("approved", false));
        } catch (Exception e) {
            return error("Bajarib bo'lmadi: " + e.getMessage());
        }
    }

    private JSONObject dispatch(String action, JSONObject in, boolean approved) throws Exception {
        AudioManager audio = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        switch (action) {
            case "volume_set": {
                int max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                int level = Math.max(0, Math.min(100, in.optInt("level", 50)));
                audio.setStreamVolume(AudioManager.STREAM_MUSIC, Math.round(level * max / 100f), AudioManager.FLAG_SHOW_UI);
                return text("Telefon ovozi: " + level + "%.");
            }
            case "volume_up":
            case "volume_down": {
                int direction = action.equals("volume_up") ? AudioManager.ADJUST_RAISE : AudioManager.ADJUST_LOWER;
                audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, direction, AudioManager.FLAG_SHOW_UI);
                audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, direction, 0);
                return text(action.equals("volume_up") ? "Ovoz oshirildi." : "Ovoz pasaytirildi.");
            }
            case "mute":
            case "unmute":
                audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, action.equals("mute") ? AudioManager.ADJUST_MUTE : AudioManager.ADJUST_UNMUTE, 0);
                return text(action.equals("mute") ? "Ovoz o'chirildi." : "Ovoz yoqildi.");
            case "play_pause":
                return mediaKey(audio, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE);
            case "next":
                return mediaKey(audio, KeyEvent.KEYCODE_MEDIA_NEXT);
            case "previous":
                return mediaKey(audio, KeyEvent.KEYCODE_MEDIA_PREVIOUS);
            case "apps":
                return text(String.join("\n", appLabels()));
            case "open_app":
                return openApp(in.optString("app"));
            case "youtube":
                return youtube(in.optString("url"), in.optInt("seconds", 0));
            case "open_url":
                return openUrl(in.optString("url"));
            case "sms":
                if (!approved) return error("Egasining ruxsati yo'q.");
                return sms(in.optString("to"), in.optString("text"));
            case "call":
                return dial(in.optString("to"));
            case "contacts":
                return contacts(in.optString("query"));
            case "battery": {
                BatteryManager bm = (BatteryManager) context.getSystemService(Context.BATTERY_SERVICE);
                int percent = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
                return text("Batareya: " + percent + "%" + (bm.isCharging() ? ", quvvatlanmoqda." : "."));
            }
            case "flashlight_on":
            case "flashlight_off":
                return torch(action.equals("flashlight_on"));
            case "find":
                return find(audio);
            default:
                return error("Noma'lum amal: " + action);
        }
    }

    private JSONObject mediaKey(AudioManager audio, int code) throws Exception {
        audio.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, code));
        audio.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, code));
        return text("Bajarildi.");
    }

    private List<ResolveInfo> launchers() {
        Intent main = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        return context.getPackageManager().queryIntentActivities(main, 0);
    }

    private List<String> appLabels() {
        PackageManager pm = context.getPackageManager();
        List<String> labels = new ArrayList<>();
        for (ResolveInfo info : launchers()) {
            if (labels.size() >= LIST_MAX) break;
            String label = info.loadLabel(pm).toString();
            if (!labels.contains(label)) labels.add(label);
        }
        return labels;
    }

    private JSONObject openApp(String name) throws Exception {
        String wanted = name.trim().toLowerCase(Locale.ROOT);
        if (wanted.isEmpty()) return error("Ilova nomi berilmagan.");
        PackageManager pm = context.getPackageManager();
        for (ResolveInfo info : launchers()) {
            String label = info.loadLabel(pm).toString();
            if (label.toLowerCase(Locale.ROOT).contains(wanted)) {
                Intent intent = pm.getLaunchIntentForPackage(info.activityInfo.packageName);
                if (intent == null) continue;
                start(intent);
                return text("Ochildi: " + label);
            }
        }
        return error("\"" + name + "\" ilovasi topilmadi.");
    }

    private JSONObject youtube(String id, int seconds) throws Exception {
        if (!VIDEO_ID.matcher(id).matches()) return error("Video topilmadi.");
        String t = seconds > 0 ? "?t=" + seconds : "";
        try {
            start(new Intent(Intent.ACTION_VIEW, Uri.parse("vnd.youtube:" + id + t)));
        } catch (ActivityNotFoundException e) {
            start(new Intent(Intent.ACTION_VIEW, Uri.parse("https://www.youtube.com/watch?v=" + id + (seconds > 0 ? "&t=" + seconds + "s" : ""))));
        }
        return text("YouTube'da video ochildi.");
    }

    private JSONObject openUrl(String url) throws Exception {
        if (!url.startsWith("https://") && !url.startsWith("http://")) return error("Faqat http(s) havola ochiladi.");
        start(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        return text("Ochildi: " + url);
    }

    private JSONObject sms(String to, String body) throws Exception {
        if (!PHONE.matcher(to).matches()) return error("Telefon raqami noto'g'ri.");
        String message = body.trim();
        if (message.isEmpty()) return error("Xabar bo'sh.");
        if (message.length() > TEXT_MAX) message = message.substring(0, TEXT_MAX);
        SmsManager sms = Build.VERSION.SDK_INT >= 31 ? context.getSystemService(SmsManager.class) : SmsManager.getDefault();
        sms.sendMultipartTextMessage(to, null, sms.divideMessage(message), null, null);
        return text("SMS yuborildi: " + to);
    }

    private JSONObject dial(String to) throws Exception {
        if (!PHONE.matcher(to).matches()) return error("Telefon raqami noto'g'ri.");
        start(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(to))));
        return text("Qo'ng'iroq oynasi ochildi: " + to + " (qo'ng'iroqni o'zingiz bosing).");
    }

    private JSONObject contacts(String query) throws Exception {
        String q = query.trim();
        if (q.isEmpty()) return error("Ism berilmagan.");
        ContentResolver resolver = context.getContentResolver();
        String[] columns = { ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER };
        StringBuilder out = new StringBuilder();
        try (Cursor c = resolver.query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI, columns,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " LIKE ?", new String[] { "%" + q + "%" }, null)) {
            int rows = 0;
            while (c != null && c.moveToNext() && rows++ < 20) out.append(c.getString(0)).append(" | ").append(c.getString(1)).append('\n');
        }
        return text(out.length() > 0 ? out.toString().trim() : "\"" + q + "\" kontaktlarda topilmadi.");
    }

    private JSONObject torch(boolean on) throws Exception {
        CameraManager cameras = (CameraManager) context.getSystemService(Context.CAMERA_SERVICE);
        for (String id : cameras.getCameraIdList()) {
            Boolean flash = cameras.getCameraCharacteristics(id).get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
            if (Boolean.TRUE.equals(flash)) {
                cameras.setTorchMode(id, on);
                return text(on ? "Fonar yoqildi." : "Fonar o'chirildi.");
            }
        }
        return error("Fonar topilmadi.");
    }

    /** "Telefonim qayerda?" — 20 soniya baland ovoz (ovozsiz rejimda ham — budilnik oqimi). */
    private JSONObject find(AudioManager audio) {
        audio.setStreamVolume(AudioManager.STREAM_ALARM, audio.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0);
        Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (sound == null) sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        Ringtone ringtone = RingtoneManager.getRingtone(context, sound);
        if (ringtone == null) return error("Ovoz topilmadi.");
        ringtone.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());
        ringtone.play();
        new Handler(Looper.getMainLooper()).postDelayed(ringtone::stop, FIND_MS);
        return text("Telefon 20 soniya chalinadi.");
    }

    private void start(Intent intent) {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    private static JSONObject text(String value) throws Exception {
        return new JSONObject().put("text", value);
    }

    private static JSONObject error(String value) {
        try {
            return new JSONObject().put("error", value);
        } catch (Exception e) {
            return new JSONObject();
        }
    }
}
