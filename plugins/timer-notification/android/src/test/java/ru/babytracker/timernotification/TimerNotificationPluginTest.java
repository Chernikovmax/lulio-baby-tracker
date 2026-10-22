package ru.babytracker.timernotification;

import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.service.notification.StatusBarNotification;
import android.view.View;
import android.widget.Chronometer;
import android.widget.FrameLayout;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.time.Duration;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowWebView;
import org.robolectric.android.controller.ActivityController;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = {32, 36})
public class TimerNotificationPluginTest {
    public static class TestActivity extends BridgeActivity {
        @Override
        public void onCreate(Bundle savedInstanceState) {
            config = new CapConfig.Builder(this).setResolveServiceWorkerRequests(false).create();
            registerPlugin(TimerNotificationPlugin.class);
            super.onCreate(savedInstanceState);
        }
    }

    private TestActivity activity;
    private ActivityController<TestActivity> controller;
    private TimerNotificationPlugin plugin;
    private NotificationManager manager;

    @Before
    public void setup() {
        PackageInfo webView = new PackageInfo();
        webView.versionName = "140.0.0.0";
        webView.packageName = "com.google.android.webview";
        ShadowWebView.setCurrentWebViewPackage(webView);
        if (Build.VERSION.SDK_INT >= 33) shadowOf(RuntimeEnvironment.getApplication()).grantPermissions(Manifest.permission.POST_NOTIFICATIONS);
        controller = Robolectric.buildActivity(TestActivity.class).setup();
        activity = controller.get();
        plugin = (TimerNotificationPlugin) activity.getBridge().getPlugin("TimerNotification").getInstance();
        manager = activity.getSystemService(NotificationManager.class);
    }

    @After
    public void teardown() {
        if (controller != null) controller.pause().stop().destroy();
    }

    @Test
    public void sleepStopwatchTicksInSystemViewWithoutFurtherPluginUpdates() throws Exception {
        long now = System.currentTimeMillis();
        // Align Android's instrumented wall clock with the JVM clock used by plugin code.
        SystemClock.setCurrentTimeMillis(now);
        long start = now - 90_000;
        update(timer("Ночной сон", start, 0), null);
        Notification notification = onlyNotification();
        assertEquals("Ночной сон", notification.extras.getString(Notification.EXTRA_TITLE));
        assertEquals(start, notification.when);
        assertNotEquals(0, notification.flags & Notification.FLAG_ONGOING_EVENT);
        assertNull(manager.getNotificationChannel(notification.getChannelId()).getSound());
        assertFalse(manager.getNotificationChannel(notification.getChannelId()).shouldVibrate());
        assertNotNull(notification.contentIntent);
        notification.contentIntent.send();
        assertEquals(TestActivity.class.getName(), shadowOf(activity).getNextStartedActivity().getComponent().getClassName());

        Notification.Builder systemBuilder = Notification.Builder.recoverBuilder(activity, notification);
        for (android.widget.RemoteViews layout : new android.widget.RemoteViews[] {
            systemBuilder.createContentView(), systemBuilder.createBigContentView()
        }) {
            assertNotNull(layout);
            FrameLayout parent = new FrameLayout(activity);
            View content = layout.apply(activity, parent);
            activity.setContentView(content);
            activity.getWindow().getDecorView().dispatchWindowVisibilityChanged(View.VISIBLE);
            int chronometerId = activity.getResources().getIdentifier("timer_duration", "id", activity.getPackageName());
            Chronometer clock = content.findViewById(chronometerId);
            assertNotNull("Timer must be in the notification body, not only the system header", clock);
            assertTrue(clock.isShown());
            long before = SystemClock.elapsedRealtime() - clock.getBase();
            assertTrue(before / 1000 >= 90 && before / 1000 <= 92);
            shadowOf(android.os.Looper.getMainLooper()).idleFor(Duration.ofSeconds(2));
            assertEquals(2000, SystemClock.elapsedRealtime() - clock.getBase() - before);
            String rendered = clock.getText().toString();
            assertTrue("Rendered clock: " + rendered, rendered.matches("0?1:3[1-4]"));
        }
    }

    @Test
    public void transitionsReplaceStatusAndRemoveFinishedFeedingWithoutTouchingOtherNotifications() throws Exception {
        long start = System.currentTimeMillis() - 120_000;
        update(timer("Дневной сон", start, 0), timer("Кормление · левая грудь", start, 0));
        assertEquals(2, manager.getActiveNotifications().length);
        update(timer("Бодрствование", System.currentTimeMillis(), 0), timer("Грудное кормление · пауза", null, 125));
        Notification paused = notificationTitled("Грудное кормление · пауза");
        assertFalse(paused.extras.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER));
        assertEquals("00:02:05", paused.extras.getString(Notification.EXTRA_TEXT));
        View pausedContent = Notification.Builder.recoverBuilder(activity, paused).createContentView()
            .apply(activity, new FrameLayout(activity));
        assertEquals(View.GONE, pausedContent.findViewById(R.id.timer_duration).getVisibility());
        android.widget.TextView frozen = pausedContent.findViewById(R.id.timer_paused_duration);
        assertEquals(View.VISIBLE, frozen.getVisibility());
        assertEquals("00:02:05", frozen.getText().toString());
        shadowOf(android.os.Looper.getMainLooper()).idleFor(Duration.ofSeconds(2));
        assertEquals("00:02:05", frozen.getText().toString());
        assertNotNull(notificationTitled("Бодрствование"));
        assertEquals(2, manager.getActiveNotifications().length);
        update(timer("Бодрствование", start, 0), null);
        assertEquals("Бодрствование", onlyNotification().extras.getString(Notification.EXTRA_TITLE));
        manager.notify("unrelated", 1, new Notification.Builder(activity, onlyNotification().getChannelId()).setSmallIcon(R.drawable.ic_tracker_timer).build());
        update(null, null);
        assertEquals("unrelated", manager.getActiveNotifications()[0].getTag());
        assertEquals(1, manager.getActiveNotifications().length);
    }

    @Test
    public void blockedNotificationsAreReportedAndSettingsCanReenableTheApp() throws Exception {
        update(timer("Дневной сон", System.currentTimeMillis(), 0), null);
        shadowOf(manager).setNotificationsEnabled(false);
        Call result = update(timer("Бодрствование", System.currentTimeMillis(), 0), null);
        assertFalse(result.result.getBoolean("enabled"));
        assertEquals(0, manager.getActiveNotifications().length);
        plugin.requestAccess(new Call(new JSObject()));
        Intent settings = shadowOf(activity).getNextStartedActivity();
        assertEquals(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS, settings.getAction());
        assertEquals(activity.getPackageName(), settings.getStringExtra(android.provider.Settings.EXTRA_APP_PACKAGE));
    }

    private JSObject timer(String title, Long startedAt, long elapsedSeconds) {
        JSObject result = new JSObject();
        result.put("title", title);
        result.put("startedAt", startedAt == null ? JSONObject.NULL : startedAt);
        result.put("elapsedSeconds", elapsedSeconds);
        return result;
    }

    private Call update(JSObject sleepWake, JSObject feeding) {
        JSObject data = new JSObject();
        data.put("sleepWake", sleepWake == null ? JSONObject.NULL : sleepWake);
        data.put("breastfeeding", feeding == null ? JSONObject.NULL : feeding);
        Call call = new Call(data);
        plugin.update(call);
        assertNotNull(call.result);
        return call;
    }

    private Notification onlyNotification() {
        StatusBarNotification[] notifications = manager.getActiveNotifications();
        assertEquals(1, notifications.length);
        return notifications[0].getNotification();
    }

    private Notification notificationTitled(String title) {
        for (StatusBarNotification entry : manager.getActiveNotifications()) {
            if (title.equals(entry.getNotification().extras.getString(Notification.EXTRA_TITLE))) return entry.getNotification();
        }
        throw new AssertionError("Missing notification: " + title);
    }

    // Capture only the Capacitor transport response; Android notification services are real Robolectric services.
    private static class Call extends PluginCall {
        JSObject result;
        Call(JSObject data) { super(null, "TimerNotification", "test", "update", data); }
        @Override public void resolve(JSObject value) { result = value; }
        @Override public void reject(String message, String code, Exception error, JSObject data) { throw new AssertionError(message, error); }
    }
}
