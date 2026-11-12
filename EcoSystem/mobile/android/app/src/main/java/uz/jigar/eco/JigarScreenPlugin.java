package uz.jigar.eco;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Telefon ekranini Jigarga ko'rsatish (web/app/phone-screen.js chaqiradi).
 * start — Android ruxsat oynasi va ekranni kuzatuvchi xizmat; capture — boshqa ilovadagi oxirgi ekran (JPEG, base64);
 * stop — to'xtatish. Jigar oldinda turganda kadrlar yangilanmaydi: egasi qaytib so'raganda o'sha ilova ekrani beriladi.
 */
@CapacitorPlugin(name = "JigarScreen")
public class JigarScreenPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        MediaProjectionManager manager = (MediaProjectionManager) getContext().getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        startActivityForResult(call, manager.createScreenCaptureIntent(), "onProjectionResult");
    }

    @ActivityCallback
    private void onProjectionResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("denied");
            return;
        }
        Intent service = new Intent(getContext(), ScreenCaptureService.class)
            .putExtra(ScreenCaptureService.EXTRA_CODE, result.getResultCode())
            .putExtra(ScreenCaptureService.EXTRA_DATA, result.getData());
        ContextCompat.startForegroundService(getContext(), service);
        call.resolve();
    }

    @PluginMethod
    public void capture(PluginCall call) {
        JSObject out = new JSObject();
        out.put("image", ScreenCaptureService.lastForeignFrame());
        call.resolve(out);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), ScreenCaptureService.class));
        call.resolve();
    }

    // Jigar ekrandan ketdi — boshqa ilova ko'rinyapti: kadrlar yoziladi.
    @Override
    protected void handleOnPause() {
        ScreenCaptureService.setJigarVisible(false);
    }

    // Jigar qaytdi: kadrlar to'xtaydi, oxirgi "begona" kadr saqlanadi.
    @Override
    protected void handleOnResume() {
        ScreenCaptureService.setJigarVisible(true);
    }
}
