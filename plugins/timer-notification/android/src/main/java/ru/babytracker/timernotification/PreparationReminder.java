package ru.babytracker.timernotification;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.AtomicFile;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** One private, non-backed-up ledger. All receiver/plugin operations share this process lock. */
final class PreparationReminder {
    static final Object LOCK = new Object();
    static final String CHANNEL = "baby-tracker-sleep-preparation";
    static final String ACTION = "ru.babytracker.PREPARATION_DUE";
    static final String OPEN = "babyTrackerPreparationOpen";
    static final int ID = 4101;
    private final Context context;
    private final AtomicFile file;
    private final NotificationManager notifications;
    private final AlarmManager alarms;

    PreparationReminder(Context context) {
        this.context = context;
        file = new AtomicFile(new File(context.getNoBackupFilesDir(), "sleep-preparation.json"));
        notifications = context.getSystemService(NotificationManager.class);
        alarms = context.getSystemService(AlarmManager.class);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Подготовка ко сну", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("Одно напоминание о ближайшем сне на этом устройстве");
            notifications.createNotificationChannel(channel);
        }
    }

    private JSONObject read() throws Exception {
        if (!file.getBaseFile().exists()) return new JSONObject().put("device", UUID.randomUUID().toString())
            .put("enabled", false).put("generation", 0).put("terminal", new JSONArray());
        try (java.io.FileInputStream input = file.openRead()) {
            java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) != -1) bytes.write(buffer, 0, count);
            return new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
        }
    }

    private void save(JSONObject state) throws Exception {
        FileOutputStream output = null;
        try {
            output = file.startWrite();
            output.write(state.toString().getBytes(StandardCharsets.UTF_8));
            file.finishWrite(output);
        } catch (Exception error) { if (output != null) file.failWrite(output); throw error; }
    }

    boolean allowed() {
        boolean allowed = notifications.areNotificationsEnabled();
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = notifications.getNotificationChannel(CHANNEL);
            allowed &= channel != null && channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
        }
        return allowed;
    }

    boolean exact() { return Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms(); }

    private PendingIntent pending(JSONObject intent) throws JSONException {
        // Revision and generation are part of PendingIntent identity, never mutable UPDATE_CURRENT extras.
        Intent broadcast = new Intent(context, PreparationReminderReceiver.class).setAction(ACTION)
            .setData(android.net.Uri.parse("lulio-reminder://alarm/" + intent.getString("token")))
            .putExtra("token", intent.getString("token"));
        return PendingIntent.getBroadcast(context, ID, broadcast, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private boolean terminal(JSONObject state, String key) throws JSONException {
        JSONArray values = state.getJSONArray("terminal");
        for (int i = 0; i < values.length(); i++) if (key.equals(values.getString(i))) return true;
        return false;
    }

    private void consume(JSONObject state, String key) throws JSONException {
        if (!terminal(state, key)) state.getJSONArray("terminal").put(key);
    }

    private boolean identityMatches(JSONObject state, JSONObject plan) throws JSONException {
        JSONArray key = new JSONArray(plan.getString("key"));
        return key.length() == 3 && !plan.getString("scope").isEmpty() && !plan.getString("cycle").isEmpty() &&
            !plan.getString("revision").isEmpty() && key.getString(0).equals(plan.getString("scope")) &&
            key.getString(1).equals(plan.getString("cycle")) && key.getString(2).equals(state.getString("device"));
    }

    private void clear(JSONObject state) throws Exception {
        JSONObject current = state.optJSONObject("intent");
        if (current != null) { PendingIntent pending = pending(current); alarms.cancel(pending); pending.cancel(); }
        state.remove("intent");
        notifications.cancel(CHANNEL, ID);
    }

    JSObject status() throws Exception {
        synchronized (LOCK) { JSONObject state = read(); save(state); return status(state); }
    }

    private JSObject status(JSONObject state) throws JSONException {
        JSObject result = new JSObject();
        result.put("device", state.getString("device"));
        result.put("generation", state.getLong("generation"));
        result.put("enabled", state.optBoolean("enabled"));
        result.put("notifications", allowed());
        result.put("exact", exact());
        result.put("pending", state.has("intent"));
        result.put("lastState", state.optString("lastState", "off"));
        return result;
    }

    JSObject consent(boolean enabled) throws Exception {
        synchronized (LOCK) {
            JSONObject state = read(); clear(state);
            state.put("enabled", enabled).put("generation", state.getLong("generation") + 1).put("lastState", enabled ? "idle" : "off");
            save(state); return status(state);
        }
    }

    /** Fence queued JS plans before any diary commit; failures are deliberately fail-closed. */
    JSObject invalidate() throws Exception {
        synchronized (LOCK) {
            JSONObject state = read(); clear(state);
            state.put("generation", state.getLong("generation") + 1).put("lastState", "idle");
            save(state); return status(state);
        }
    }

    JSObject reconcile(long generation, JSONObject plan, String blockedKey) throws Exception {
        synchronized (LOCK) {
            JSONObject state = read();
            if (generation != state.getLong("generation")) return status(state);
            if (blockedKey != null) consume(state, blockedKey);
            if (plan == null || !state.optBoolean("enabled")) {
                clear(state); state.put("lastState", state.optBoolean("enabled") ? "idle" : "off");
                save(state); return status(state);
            }
            String key = plan.getString("key");
            if (!identityMatches(state, plan)) throw new IllegalArgumentException("Invalid reminder identity");
            long now = System.currentTimeMillis(), due = plan.getLong("due"), expiry = plan.getLong("expiry");
            JSONObject old = state.optJSONObject("intent");
            // Re-reading an already armed plan after its due time must not cancel its valid delayed delivery.
            if (old != null && old.getString("key").equals(key) && old.getString("revision").equals(plan.getString("revision")) &&
                !terminal(state, key) && now < old.getLong("expiry") && allowed() &&
                state.optString("lastState").equals(exact() ? "exact" : "inexact")) return status(state);
            clear(state);
            if (terminal(state, key)) state.put("lastState", "consumed");
            else if (due <= now || expiry <= due || expiry > due + 600000L) {
                consume(state, key); state.put("lastState", "expired");
            } else if (!allowed()) state.put("lastState", "blocked");
            else {
                plan.put("token", UUID.randomUUID().toString()).put("generation", generation).put("device", state.getString("device"));
                state.put("intent", plan).put("lastState", exact() ? "exact" : "inexact");
            }
            save(state);
            arm(state);
            return status(state);
        }
    }

    private void arm(JSONObject state) throws Exception {
        JSONObject intent = state.optJSONObject("intent");
        if (intent == null) return;
        PendingIntent pending = pending(intent);
        if (exact()) {
            try {
                alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, intent.getLong("due"), pending);
                state.put("lastState", "exact"); save(state); return;
            }
            catch (SecurityException revoked) { /* Access can change between check and scheduling. */ }
        }
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, intent.getLong("due"), pending);
        state.put("lastState", "inexact"); save(state);
    }

    /** Boot/time/access restoration never catches up a due alarm, even inside its delivery TTL. */
    void restore() throws Exception {
        synchronized (LOCK) {
            JSONObject state = read(), intent = state.optJSONObject("intent");
            if (intent == null) return;
            if (!state.optBoolean("enabled") || !allowed() || terminal(state, intent.getString("key")) ||
                intent.getLong("generation") != state.getLong("generation") || !identityMatches(state, intent) ||
                intent.getLong("due") <= System.currentTimeMillis() || intent.getLong("expiry") <= System.currentTimeMillis()) {
                consume(state, intent.getString("key")); clear(state); state.put("lastState", "expired"); save(state);
            } else { arm(state); }
        }
    }

    /** At-most-once publication authorization: persist consumption BEFORE notify, under the same lock. */
    void publish(String token) throws Exception {
        synchronized (LOCK) {
            JSONObject state = read(), intent = state.optJSONObject("intent");
            if (intent == null || token == null || !token.equals(intent.getString("token"))) return;
            long now = System.currentTimeMillis();
            if (now < intent.getLong("due")) return;
            boolean valid = state.optBoolean("enabled") && allowed() && now < intent.getLong("expiry") &&
                intent.getLong("generation") == state.getLong("generation") && identityMatches(state, intent) &&
                !terminal(state, intent.getString("key"));
            consume(state, intent.getString("key")); clear(state);
            state.put("lastState", valid ? "consumed" : "expired"); save(state);
            if (!valid) return;
            Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            if (open == null) return;
            open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP).putExtra(OPEN, true);
            PendingIntent tap = PendingIntent.getActivity(context, ID, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            notifications.notify(CHANNEL, ID, new NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_tracker_timer).setContentTitle("Скоро сон")
                .setContentText("Можно начинать спокойную подготовку")
                .setContentIntent(tap).setAutoCancel(true).setTimeoutAfter(intent.getLong("expiry") - now)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).build());
        }
    }
}
