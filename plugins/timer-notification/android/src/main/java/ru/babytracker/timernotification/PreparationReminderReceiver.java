package ru.babytracker.timernotification;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class PreparationReminderReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        try {
            PreparationReminder scheduler = new PreparationReminder(context);
            if (PreparationReminder.ACTION.equals(intent.getAction())) scheduler.publish(intent.getStringExtra("token"));
            else scheduler.restore();
        } catch (Exception error) {
            // Corrupt/unwritable state is not permission to publish or reconstruct an alarm.
            android.util.Log.e("SleepPreparation", "Reminder unavailable; reopen the application");
        }
    }
}
