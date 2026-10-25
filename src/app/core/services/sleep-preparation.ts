import type { TrackerData } from '../models/tracker.models';
import type { SleepCycle } from '../models/sleep-assistant.models';
import { sleepBoundary } from '../models/sleep-history.models';

/** Content revision, not clock or mutable transport revision; survives export/import. */
export function cycleAnchorRevision(data: TrackerData, anchorId: string): string | null {
  if (anchorId.startsWith('sleep:')) {
    const sleep = data.events.find(event => event.id === anchorId.slice(6));
    return sleep?.type === 'sleep' ? sleepBoundary(sleep).revision : null;
  }
  const wake = data.confirmedWakes?.find(item => `wake:${item.id}` === anchorId);
  return wake ? JSON.stringify(wake) : null;
}

/** Reconciliation never manufactures diary events or a waking time. */
export function reconcileSleepPreparations(data: TrackerData, scope: string): TrackerData {
  const timer = data.activeTimers.sleepTimer;
  const sleepPreparations = (data.sleepPreparations ?? []).map(prep => {
    if (prep.state === 'cancelled') return prep;
    const linked = data.events.find(event => event.id === prep.sleepEventId);
    const invalidAnchor = prep.scope !== scope || cycleAnchorRevision(data, prep.anchorId) !== prep.anchorRevision;
    const invalidCompleted = prep.state === 'completed' &&
      !((timer?.id === prep.sleepEventId && timer.startedAt === prep.completedAt) || (linked?.type === 'sleep' && linked.startTime === prep.completedAt));
    const superseded = prep.state === 'preparing' && (!data.sleepRoutine?.assistantEnabled || data.activeTimers.sleepTimer !== null ||
      (data.confirmedWakes ?? []).some(wake => Date.parse(wake.at) > Date.parse(prep.anchorAt)) ||
      data.events.some(event => event.type === 'sleep' && Date.parse(event.endTime) > Date.parse(prep.anchorAt)));
    return invalidAnchor || invalidCompleted || superseded
      ? { ...prep, state: 'cancelled' as const, sleepEventId: null, completedAt: null } : prep;
  });
  return { ...data, sleepPreparations };
}

export function cycleMatches(a: SleepCycle, scope: string, anchorId: string, anchorAt: string): boolean {
  return a.scope === scope && a.anchorId === anchorId && a.anchorAt === anchorAt;
}
