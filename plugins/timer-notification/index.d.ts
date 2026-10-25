import type { PluginListenerHandle } from '@capacitor/core';

export interface PreparationStatus {
  device: string;
  generation: number;
  enabled: boolean;
  notifications: boolean;
  exact: boolean;
  pending: boolean;
  lastState: string;
}

export interface PreparationPlan {
  key: string;
  scope: string;
  cycle: string;
  revision: string;
  due: number;
  expiry: number;
}

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
  preparationStatus(): Promise<PreparationStatus>;
  preparationInvalidate(): Promise<PreparationStatus>;
  preparationConsent(options: { enabled: boolean }): Promise<PreparationStatus>;
  preparationReconcile(options: { generation: number; plan: PreparationPlan | null; blockedKey: string | null }): Promise<PreparationStatus>;
  preparationSettings(options: { exact: boolean }): Promise<PreparationStatus>;
  preparationTakeOpen(): Promise<{ open: boolean }>;
  addListener(name: 'preparationOpened', listener: () => void): Promise<PluginListenerHandle>;
}

export const TimerNotification: TimerNotificationPlugin;
