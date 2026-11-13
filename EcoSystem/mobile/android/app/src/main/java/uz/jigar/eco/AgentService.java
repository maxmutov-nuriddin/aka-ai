package uz.jigar.eco;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.provider.Settings;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Jigar agenti (fonda): serverga long-poll bilan ulanadi (POST /api/devices/poll, shaxsiy kalit bilan),
 * buyruqni PhoneActions bilan bajaradi va natijani qaytaradi (POST /api/devices/result).
 * Ilova yopiq bo'lsa ham ishlaydi — bildirishnomada "Jigar ulangan".
 */
public class AgentService extends Service {
    private static final String CHANNEL_ID = "jigar_agent";
    private static final int NOTIFICATION_ID = 7302;
    private static final int POLL_TIMEOUT_MS = 40_000; // server 25 s kutadi
    private static final int RETRY_MS = 5_000;
    private static final int SIGNED_OUT_RETRY_MS = 30_000;
    private volatile boolean running;
    private Thread worker;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startAsForeground();
        if (worker == null || !worker.isAlive()) {
            running = true;
            worker = new Thread(this::loop, "jigar-agent");
            worker.start();
        }
        return START_STICKY;
    }

    private void loop() {
        PhoneActions actions = new PhoneActions(this);
        SharedPreferences prefs = getSharedPreferences(JigarAgentPlugin.PREFS, Context.MODE_PRIVATE);
        while (running) {
            String server = prefs.getString(JigarAgentPlugin.KEY_SERVER, null);
            String token = prefs.getString(JigarAgentPlugin.KEY_TOKEN, null);
            if (server == null || token == null) {
                stopSelf();
                return;
            }
            try {
                JSONObject device = new JSONObject()
                    .put("id", "android-" + Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID))
                    .put("name", Build.MODEL)
                    .put("platform", "android")
                    .put("kind", "phone");
                Response res = post(server + "/api/devices/poll", token, device);
                if (res.code == 401) {
                    sleep(SIGNED_OUT_RETRY_MS);
                    continue;
                }
                if (res.code != 200) {
                    sleep(RETRY_MS);
                    continue;
                }
                JSONObject command = new JSONObject(res.body).optJSONObject("command");
                if (command == null) continue;
                JSONObject result = actions.run(command);
                post(server + "/api/devices/result", token, new JSONObject().put("id", command.optString("id")).put("result", result));
            } catch (Exception e) {
                sleep(RETRY_MS); // server o'chiq yoki internet yo'q
            }
        }
    }

    private static final class Response {
        final int code;
        final String body;
        Response(int code, String body) { this.code = code; this.body = body; }
    }

    private static Response post(String url, String token, JSONObject body) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        try {
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(POLL_TIMEOUT_MS);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Authorization", "Bearer " + token);
            try (OutputStream out = conn.getOutputStream()) {
                out.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            int code = conn.getResponseCode();
            InputStream in = code < 400 ? conn.getInputStream() : conn.getErrorStream();
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            if (in != null) {
                byte[] chunk = new byte[8192];
                for (int n; (n = in.read(chunk)) > 0; ) buffer.write(chunk, 0, n);
                in.close();
            }
            return new Response(code, buffer.toString("UTF-8"));
        } finally {
            conn.disconnect();
        }
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
    }

    private void startAsForeground() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm != null) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "Jigar agenti", NotificationManager.IMPORTANCE_MIN));
        }
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL_ID) : new Notification.Builder(this);
        Notification notification = builder
            .setContentTitle("Jigar ulangan")
            .setContentText("Jigar shu telefonni boshqara oladi")
            .setSmallIcon(getApplicationInfo().icon)
            .setOngoing(true)
            .build();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    @Override
    public void onDestroy() {
        running = false;
        if (worker != null) worker.interrupt();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
