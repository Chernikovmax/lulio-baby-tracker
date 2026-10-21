package ru.babytracker.timernotification;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.Locale;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "TimerNotification",
    permissions = @Permission(alias = "notifications", strings = Manifest.permission.POST_NOTIFICATIONS)
)
public class TimerNotificationPlugin extends Plugin {
    private static final String CHANNEL = "baby-tracker-live-timers";
    private static final String TAG = "baby-tracker-live-timers";
    private static final int SLEEP_WAKE_ID = 1;
    private static final int FEEDING_ID = 2;
    private NotificationManager manager;
    private SharedPreferences preferences;

    @Override
    public void load() {
        manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        preferences = getContext().getSharedPreferences(TAG, Context.MODE_PRIVATE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Текущие таймеры", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Сон, бодрствование и грудное кормление без звука и вибрации");
            channel.setSound(null, null);
            channel.enableVibration(false);
            channel.setShowBadge(false);
            manager.createNotificationChannel(channel);
        }
    }

    @PluginMethod
    public void update(PluginCall call) {
        boolean hasTimers = !call.getData().isNull("sleepWake") || !call.getData().isNull("breastfeeding");
        if (hasTimers && needsPermission() && !preferences.getBoolean("asked", false)) {
            preferences.edit().putBoolean("asked", true).apply();
            requestPermissionForAlias("notifications", call, "updateAfterPermission");
            return;
        }
        updateAfterPermission(call);
    }

    @PermissionCallback
    private void updateAfterPermission(PluginCall call) {
        try {
            if (status().getBoolean("enabled", false)) {
                show(SLEEP_WAKE_ID, call.getData().optJSONObject("sleepWake"));
                show(FEEDING_ID, call.getData().optJSONObject("breastfeeding"));
            } else {
                manager.cancel(TAG, SLEEP_WAKE_ID);
                manager.cancel(TAG, FEEDING_ID);
            }
            call.resolve(status());
        } catch (JSONException | IllegalArgumentException | SecurityException error) {
            call.reject("Не удалось обновить уведомление таймера.", error);
        }
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        if (needsPermission() && getPermissionState("notifications") != PermissionState.DENIED) {
            preferences.edit().putBoolean("asked", true).apply();
            requestPermissionForAlias("notifications", call, "accessAfterPermission");
            return;
        }
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !manager.areNotificationsEnabled()) {
            intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName())
                .putExtra(Settings.EXTRA_CHANNEL_ID, CHANNEL);
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                android.net.Uri.parse("package:" + getContext().getPackageName()));
        }
        getActivity().startActivity(intent);
        call.resolve(status());
    }

    @PermissionCallback
    private void accessAfterPermission(PluginCall call) {
        call.resolve(status());
    }

    private boolean needsPermission() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getPermissionState("notifications") != PermissionState.GRANTED;
    }

    private JSObject status() {
        boolean enabled = manager.areNotificationsEnabled();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = manager.getNotificationChannel(CHANNEL);
            enabled = enabled && channel != null && channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
        }
        JSObject result = new JSObject();
        result.put("enabled", enabled);
        result.put("permission", !needsPermission() ? "granted" : preferences.getBoolean("asked", false) ? "denied" : "prompt");
        return result;
    }

    private void show(int id, JSONObject timer) throws JSONException {
        if (timer == null) {
            manager.cancel(TAG, id);
            return;
        }
        Intent intent = getContext().getPackageManager().getLaunchIntentForPackage(getContext().getPackageName());
        if (intent == null) throw new IllegalArgumentException("No launcher activity");
        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tap = PendingIntent.getActivity(getContext(), 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(getContext(), CHANNEL)
            .setSmallIcon(R.drawable.ic_tracker_timer)
            .setContentTitle(timer.getString("title"))
            .setContentIntent(tap)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE);
        if (!timer.isNull("startedAt")) {
            long startedAt = Math.min(timer.getLong("startedAt"), System.currentTimeMillis());
            builder.setWhen(startedAt).setShowWhen(true).setUsesChronometer(true)
                .setContentText("Нажмите, чтобы открыть дневник");
        } else {
            long seconds = Math.max(0, timer.getLong("elapsedSeconds"));
            builder.setShowWhen(false).setUsesChronometer(false)
                .setContentText(String.format(Locale.ROOT, "%02d:%02d:%02d", seconds / 3600, seconds / 60 % 60, seconds % 60));
        }
        manager.notify(TAG, id, builder.build());
    }
}
