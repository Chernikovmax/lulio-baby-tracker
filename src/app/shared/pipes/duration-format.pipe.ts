import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'durationFormat' })
export class DurationFormatPipe implements PipeTransform {
  transform(value: number | null | undefined, format: 'human' | 'timer' = 'human'): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    const seconds = Math.floor(Math.max(0, value));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds / 60);
    if (format === 'timer') {
      const mm = String(hours > 0 ? minutes % 60 : minutes).padStart(2, '0');
      const ss = String(seconds % 60).padStart(2, '0');
      return hours > 0 ? `${String(hours).padStart(2, '0')}:${mm}:${ss}` : `${mm}:${ss}`;
    }
    return hours > 0 ? `${hours} ч ${minutes % 60} мин` : `${minutes} мин`;
  }
}
