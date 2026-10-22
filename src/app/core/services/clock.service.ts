import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { DestroyRef, PLATFORM_ID, Service, inject, signal } from '@angular/core';

@Service()
export class ClockService {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly timestamp = signal(Date.now());
  readonly now = this.timestamp.asReadonly();

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const interval = setInterval(() => this.refresh(), 1000);
    const onVisible = () => {
      if (this.document.visibilityState === 'visible') this.refresh();
    };
    this.document.addEventListener('visibilitychange', onVisible);
    this.destroyRef.onDestroy(() => {
      clearInterval(interval);
      this.document.removeEventListener('visibilitychange', onVisible);
    });
  }

  refresh(): void {
    this.timestamp.set(Date.now());
  }
}
