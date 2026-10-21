export interface TimerDisplay {
  title: string;
  /** Epoch milliseconds for the system chronometer; null when paused. */
  startedAt: number | null;
  /** Used only for the frozen, paused display. */
  elapsedSeconds: number;
}

export interface TimerNotificationState {
  sleepWake: TimerDisplay | null;
  breastfeeding: TimerDisplay | null;
}

export interface TimerNotificationStatus {
  enabled: boolean;
  permission: 'prompt' | 'granted' | 'denied';
}

export interface TimerNotificationPlugin {
  update(state: TimerNotificationState): Promise<TimerNotificationStatus>;
  /** Requests notification access, or opens settings if access is blocked. */
  requestAccess(): Promise<TimerNotificationStatus>;
}

export const TimerNotification: TimerNotificationPlugin;
