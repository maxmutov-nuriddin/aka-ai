package uz.jigar.eco;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.SystemClock;
import android.util.Base64;
import android.util.DisplayMetrics;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.ArrayDeque;
import java.util.Iterator;

/**
 * Ekranni kuzatuvchi xizmat (MediaProjection, Android 10+ foreground service talabi).
 * Sekundiga ko'pi bilan 1 kadr, kichraytirilgan JPEG; oxirgi bir nechtasi xotirada (diskka yozilmaydi).
 */
public class ScreenCaptureService extends Service {
    static final String EXTRA_CODE = "code";
    static final String EXTRA_DATA = "data";
    private static final String CHANNEL_ID = "jigar_screen";
    private static final int NOTIFICATION_ID = 7301;
    private static final int TARGET_WIDTH = 720;
    private static final int JPEG_QUALITY = 70;
    private static final long FRAME_EVERY_MS = 1000;
    private static final long RETURN_GAP_MS = 700; // Jigar'ga qaytish animatsiyasi kadrga tushmasin
    private static final int KEEP_FRAMES = 4;

    private static final class Frame {
        final long at;
        final String jpeg;
        Frame(long at, String jpeg) { this.at = at; this.jpeg = jpeg; }
    }

    private static final Object LOCK = new Object();
    private static final ArrayDeque<Frame> FRAMES = new ArrayDeque<>();
    private static volatile boolean jigarVisible = true;
    private static volatile long visibleSince = 0;

    private MediaProjection projection;
    private VirtualDisplay display;
    private ImageReader reader;
    private HandlerThread thread;
    private long lastFrameAt = 0;

    static void setJigarVisible(boolean visible) {
        if (visible && !jigarVisible) visibleSince = SystemClock.elapsedRealtime();
        jigarVisible = visible;
    }

    /** Jigar oldinga chiqishidan oldingi eng so'nggi kadr (base64 JPEG) yoki null. */
    static String lastForeignFrame() {
        long limit = jigarVisible ? visibleSince - RETURN_GAP_MS : Long.MAX_VALUE;
        synchronized (LOCK) {
            Iterator<Frame> it = FRAMES.descendingIterator();
            while (it.hasNext()) {
                Frame f = it.next();
                if (f.at <= limit) return f.jpeg;
            }
        }
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startAsForeground();
        if (intent == null || projection != null) return START_NOT_STICKY;
        Intent data = Build.VERSION.SDK_INT >= 33
            ? intent.getParcelableExtra(EXTRA_DATA, Intent.class)
            : intent.getParcelableExtra(EXTRA_DATA);
        int code = intent.getIntExtra(EXTRA_CODE, 0);
        MediaProjectionManager manager = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        if (data == null || manager == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        synchronized (LOCK) { FRAMES.clear(); }
        projection = manager.getMediaProjection(code, data);
        thread = new HandlerThread("jigar-screen");
        thread.start();
        Handler handler = new Handler(thread.getLooper());
        // Android 14+: virtual display yaratishdan oldin callback majburiy.
        projection.registerCallback(new MediaProjection.Callback() {
            @Override
            public void onStop() { stopSelf(); }
        }, handler);

        DisplayMetrics metrics = getResources().getDisplayMetrics();
        float scale = Math.min(1f, TARGET_WIDTH / (float) metrics.widthPixels);
        int width = Math.max(1, Math.round(metrics.widthPixels * scale));
        int height = Math.max(1, Math.round(metrics.heightPixels * scale));
        reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2);
        reader.setOnImageAvailableListener(r -> onImage(r, width, height), handler);
        display = projection.createVirtualDisplay("jigar-screen", width, height, metrics.densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader.getSurface(), null, handler);
        return START_NOT_STICKY;
    }

    private void onImage(ImageReader r, int width, int height) {
        Image image = r.acquireLatestImage();
        if (image == null) return;
        try {
            long now = SystemClock.elapsedRealtime();
            if (jigarVisible || now - lastFrameAt < FRAME_EVERY_MS) return;
            lastFrameAt = now;
            String jpeg = encode(image, width, height);
            synchronized (LOCK) {
                FRAMES.addLast(new Frame(now, jpeg));
                while (FRAMES.size() > KEEP_FRAMES) FRAMES.removeFirst();
            }
        } finally {
            image.close();
        }
    }

    private static String encode(Image image, int width, int height) {
        Image.Plane plane = image.getPlanes()[0];
        ByteBuffer buffer = plane.getBuffer();
        int rowPadding = plane.getRowStride() - plane.getPixelStride() * width;
        Bitmap padded = Bitmap.createBitmap(width + rowPadding / plane.getPixelStride(), height, Bitmap.Config.ARGB_8888);
        padded.copyPixelsFromBuffer(buffer);
        Bitmap bitmap = Bitmap.createBitmap(padded, 0, 0, width, height);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out);
        if (bitmap != padded) bitmap.recycle();
        padded.recycle();
        return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
    }

    private void startAsForeground() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm != null) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "Jigar ekrani", NotificationManager.IMPORTANCE_LOW));
        }
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL_ID) : new Notification.Builder(this);
        Notification notification = builder
            .setContentTitle("Jigar ekraningizni ko'ryapti")
            .setContentText("To'xtatish uchun Jigar'da \"Ekran\" tugmasini bosing")
            .setSmallIcon(getApplicationInfo().icon)
            .setOngoing(true)
            .build();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    @Override
    public void onDestroy() {
        if (display != null) display.release();
        if (reader != null) reader.close();
        if (projection != null) projection.stop();
        if (thread != null) thread.quitSafely();
        projection = null;
        synchronized (LOCK) { FRAMES.clear(); }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
