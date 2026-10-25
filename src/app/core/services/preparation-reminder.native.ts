import { Capacitor } from '@capacitor/core';
import { TimerNotification } from '@baby-tracker/timer-notification';

export const preparationNative = TimerNotification;
export const androidPreparationSupported = () => Capacitor.getPlatform() === 'android';
