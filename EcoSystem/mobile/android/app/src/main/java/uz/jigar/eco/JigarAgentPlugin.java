package uz.jigar.eco;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.provider.Settings;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Telefon agenti va server manzili (web/app/phone-agent.js, mobile/www/index.html chaqiradi).
 * setServer — server manzilini saqlab, ilovani shu manzilda qayta ochadi; start — agentni yoqadi (kalit bilan);
 * stop — o'chiradi. Ruxsatlar: SMS, kontaktlar, bildirishnoma; fonda ilova ochish — "boshqa ilovalar ustida".
 */
@CapacitorPlugin(
    name = "JigarAgent",
    permissions = {
        @Permission(alias = "sms", strings = { Manifest.permission.SEND_SMS }),
        @Permission(alias = "contacts", strings = { Manifest.permission.READ_CONTACTS }),
        @Permission(alias = "notifications", strings = { "android.permission.POST_NOTIFICATIONS" }),
    }
)
public class JigarAgentPlugin extends Plugin {
    static final String PREFS = "jigar";
    static final String KEY_SERVER = "serverUrl";
    static final String KEY_TOKEN = "agentToken";

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Faqat http(s) manzil, oxirida "/" siz. Noto'g'ri — null. */
    static String normalize(String url) {
        if (url == null) return null;
        Uri u = Uri.parse(url.trim());
        String scheme = u.getScheme();
        if (u.getHost() == null || !("http".equals(scheme) || "https".equals(scheme))) return null;
        return scheme + "://" + u.getHost() + (u.getPort() > 0 ? ":" + u.getPort() : "");
    }

    @PluginMethod
    public void getServer(PluginCall call) {
        JSObject out = new JSObject();
        out.put("url", prefs().getString(KEY_SERVER, null));
        call.resolve(out);
    }

    @PluginMethod
    public void setServer(PluginCall call) {
        String url = normalize(call.getString("url"));
        if (url == null) {
            call.reject("Manzil http:// yoki https:// bilan boshlansin.");
            return;
        }
        prefs().edit().putString(KEY_SERVER, url).remove(KEY_TOKEN).apply();
        call.resolve();
        getActivity().runOnUiThread(() -> getActivity().recreate()); // MainActivity yangi manzil bilan ochiladi
    }

    @PluginMethod
    public void resetServer(PluginCall call) {
        prefs().edit().remove(KEY_SERVER).remove(KEY_TOKEN).apply();
        getContext().stopService(new Intent(getContext(), AgentService.class));
        call.resolve();
        getActivity().runOnUiThread(() -> getActivity().recreate());
    }

    @PluginMethod
    public void start(PluginCall call) {
        String url = normalize(call.getString("url"));
        String token = call.getString("token");
        if (url == null || token == null || !token.startsWith("jgr_")) {
            call.reject("Manzil yoki kalit noto'g'ri.");
            return;
        }
        prefs().edit().putString(KEY_SERVER, url).putString(KEY_TOKEN, token).apply();
        requestPermissionForAliases(new String[] { "sms", "contacts", "notifications" }, call, "afterPermissions");
    }

    @PermissionCallback
    private void afterPermissions(PluginCall call) {
        // Fonda boshqa ilovani (YouTube, Telegram, terish) ochish uchun — bir marta sozlamalarda yoqiladi.
        if (!Settings.canDrawOverlays(getContext())) {
            Intent overlay = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getContext().getPackageName()));
            overlay.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(overlay);
        }
        ContextCompat.startForegroundService(getContext(), new Intent(getContext(), AgentService.class));
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        prefs().edit().remove(KEY_TOKEN).apply();
        getContext().stopService(new Intent(getContext(), AgentService.class));
        call.resolve();
    }
}
