package ru.babytracker.timernotification;

import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.SystemClock;
import com.getcapacitor.JSObject;
import java.io.File;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowAlarmManager;

/** Executes Android alarm PendingIntents/receiver, durable file and NotificationManager without JS. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = {32, 36}, instrumentedPackages = {"ru.babytracker.timernotification"})
public class PreparationReminderTest {
    private Context context;
    private PreparationReminder scheduler;
    private NotificationManager notifications;
    private AlarmManager alarms;
    private long now;
    private String device;
    private long generation;

    @Before public void setup() throws Exception {
        context = RuntimeEnvironment.getApplication();
        for (File file : context.getNoBackupFilesDir().listFiles()) file.delete();
        if (Build.VERSION.SDK_INT >= 33) shadowOf(RuntimeEnvironment.getApplication()).grantPermissions(Manifest.permission.POST_NOTIFICATIONS);
        notifications = context.getSystemService(NotificationManager.class);
        alarms = context.getSystemService(AlarmManager.class);
        shadowOf(alarms).setCanScheduleExactAlarms(true);
        now = System.currentTimeMillis();
        SystemClock.setCurrentTimeMillis(now);
        scheduler = new PreparationReminder(context);
        JSObject status = scheduler.consent(true);
        device = status.getString("device"); generation = status.getLong("generation");
    }
    private JSONObject plan(String cycle, String revision, long delay) throws Exception {
        return new JSONObject().put("key", new JSONArray().put("test-scope").put(cycle).put(device).toString())
            .put("scope", "test-scope").put("cycle", cycle).put("revision", revision)
            .put("due", now + delay).put("expiry", now + delay + 120000);
    }
    private ShadowAlarmManager.ScheduledAlarm pending() {
        return shadowOf(alarms).getScheduledAlarms().get(0);
    }
    private void fire(ShadowAlarmManager.ScheduledAlarm alarm, long at) throws Exception {
        SystemClock.setCurrentTimeMillis(at);
        Intent intent = shadowOf(alarm.operation).getSavedIntent();
        context.sendBroadcast(intent);
        shadowOf(android.os.Looper.getMainLooper()).idle();
    }
    @Test public void replacementFencesOldReceiverAndSentCycleNeverReplaysAfterRestartOrRevision() throws Exception {
        scheduler.reconcile(generation, plan("wake:one", "r1", 60000), null);
        ShadowAlarmManager.ScheduledAlarm old = pending();
        scheduler.reconcile(generation, plan("wake:one", "r2", 90000), null);
        ShadowAlarmManager.ScheduledAlarm current = pending();
        fire(old, now + 61000);
        assertEquals(0, notifications.getActiveNotifications().length);
        fire(current, now + 91000);
        assertEquals(1, notifications.getActiveNotifications().length);
        Notification notification = notifications.getActiveNotifications()[0].getNotification();
        assertEquals("Скоро сон", notification.extras.getString(Notification.EXTRA_TITLE));
        assertEquals(PreparationReminder.CHANNEL, notification.getChannelId());
        notification.contentIntent.send();
        assertTrue(shadowOf(RuntimeEnvironment.getApplication()).getNextStartedActivity().getBooleanExtra(PreparationReminder.OPEN, false));
        notifications.cancelAll();
        scheduler = new PreparationReminder(context);
        scheduler.restore();
        fire(current, now + 92000);
        scheduler.reconcile(generation, plan("wake:one", "r3", 300000), null);
        assertFalse(scheduler.status().getBoolean("pending"));
        assertEquals("consumed", scheduler.status().getString("lastState"));
        assertEquals(0, notifications.getActiveNotifications().length);
        scheduler.reconcile(generation, plan("wake:two", "r1", 300000), null);
        assertTrue(scheduler.status().getBoolean("pending"));
    }
    @Test public void bootAndTimeChangeOnlyRestoreFutureAndNeverCatchUpEvenInsideTtl() throws Exception {
        scheduler.reconcile(generation, plan("wake:boot", "r1", 60000), null);
        ShadowAlarmManager.ScheduledAlarm original = pending();
        context.sendBroadcast(new Intent(Intent.ACTION_BOOT_COMPLETED).setClass(context, PreparationReminderReceiver.class));
        shadowOf(android.os.Looper.getMainLooper()).idle();
        assertEquals(1, shadowOf(alarms).getScheduledAlarms().size());
        SystemClock.setCurrentTimeMillis(now + 61000);
        context.sendBroadcast(new Intent(Intent.ACTION_TIME_CHANGED).setClass(context, PreparationReminderReceiver.class));
        shadowOf(android.os.Looper.getMainLooper()).idle();
        assertFalse(new PreparationReminder(context).status().getBoolean("pending"));
        assertEquals(0, shadowOf(alarms).getScheduledAlarms().size());
        fire(original, now + 62000);
        scheduler.reconcile(generation, plan("wake:boot", "r2", 300000), null);
        assertEquals("consumed", scheduler.status().getString("lastState"));
        assertEquals(0, notifications.getActiveNotifications().length);
    }
    @Test public void delayedExpiredAlarmAndPastSubmissionConsumeCycleRatherThanReplay() throws Exception {
        scheduler.reconcile(generation, plan("wake:expired", "r1", 60000), null);
        fire(pending(), now + 180000);
        assertEquals(0, notifications.getActiveNotifications().length);
        scheduler.reconcile(generation, plan("wake:expired", "r2", 300000), null);
        assertEquals("consumed", scheduler.status().getString("lastState"));
        scheduler.reconcile(generation, plan("wake:past", "r1", 1000), null);
        assertEquals("expired", scheduler.status().getString("lastState"));
        assertFalse(scheduler.status().getBoolean("pending"));
    }
    @Test public void cancellationGenerationSuppressionAndConsentWinAgainstQueuedAlarms() throws Exception {
        JSONObject first = plan("wake:cancel", "r1", 60000);
        scheduler.reconcile(generation, first, null);
        ShadowAlarmManager.ScheduledAlarm old = pending();
        generation = scheduler.invalidate().getLong("generation");
        scheduler.reconcile(generation - 1, first, null);
        fire(old, now + 61000);
        assertEquals(0, notifications.getActiveNotifications().length);
        JSONObject future = plan("wake:cancel", "r2", 300000);
        scheduler.reconcile(generation, future, future.getString("key"));
        assertFalse(scheduler.status().getBoolean("pending"));
        scheduler.reconcile(generation, plan("wake:off", "r1", 300000), null);
        ShadowAlarmManager.ScheduledAlarm off = pending();
        scheduler.consent(false);
        fire(off, now + 301000);
        assertEquals(0, notifications.getActiveNotifications().length);
    }
    @Test public void resumePermissionChangesRearmInexactThenExactWithoutPromisingStaleMode() throws Exception {
        JSONObject plan = plan("wake:access", "r1", 300000);
        scheduler.reconcile(generation, plan, null);
        assertEquals("exact", scheduler.status().getString("lastState"));
        shadowOf(alarms).setCanScheduleExactAlarms(false);
        scheduler.reconcile(generation, plan, null);
        assertEquals("inexact", scheduler.status().getString("lastState"));
        shadowOf(alarms).setCanScheduleExactAlarms(true);
        scheduler.restore();
        assertEquals("exact", scheduler.status().getString("lastState"));
        shadowOf(notifications).setNotificationsEnabled(false);
        fire(pending(), now + 301000);
        assertEquals(0, notifications.getActiveNotifications().length);
        shadowOf(notifications).setNotificationsEnabled(true);
        scheduler.reconcile(generation, plan("wake:access", "r2", 500000), null);
        assertEquals("consumed", scheduler.status().getString("lastState"));
    }
    @Test public void corruptScopeOrDeviceCannotArmAndBlockedChannelCannotPublish() throws Exception {
        JSONObject malformed = plan("wake:identity", "r1", 60000).put("scope", "other-scope");
        assertThrows(IllegalArgumentException.class, () -> scheduler.reconcile(generation, malformed, null));
        assertFalse(scheduler.status().getBoolean("pending"));
        scheduler.reconcile(generation, plan("wake:channel", "r1", 60000), null);
        android.app.NotificationChannel channel = notifications.getNotificationChannel(PreparationReminder.CHANNEL);
        channel.setImportance(NotificationManager.IMPORTANCE_NONE);
        notifications.createNotificationChannel(channel);
        fire(pending(), now + 61000);
        assertEquals(0, notifications.getActiveNotifications().length);
        assertFalse(scheduler.status().getBoolean("pending"));
    }
}
