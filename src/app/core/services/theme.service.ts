import { DOCUMENT } from '@angular/common';
import { Service, computed, effect, inject, resource, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

type Theme = 'default' | 'terracotta' | 'muted-sage';
const THEME_KEY = 'baby-tracker-theme';

@Service()
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly stored = resource({
    loader: async (): Promise<Theme> => {
      const { value } = await Preferences.get({ key: THEME_KEY });
      return value === 'terracotta' || value === 'muted-sage' ? value : 'default';
    },
  });
  readonly selected = computed(() => this.stored.hasValue() ? this.stored.value() : 'default');
  readonly loading = this.stored.isLoading;
  readonly loadError = this.stored.error;
  readonly saving = signal(false);
  readonly error = signal('');
  readonly options = [
    { id: 'default', label: 'Стандартная', description: 'Текущая тёмная тема' },
    { id: 'terracotta', label: 'Terracotta', description: 'Тёплый персик' },
    { id: 'muted-sage', label: 'Muted Sage', description: 'Тихий шалфей' },
  ] as const;

  constructor() {
    effect(() => {
      this.document.documentElement.dataset['theme'] = this.selected();
    });
  }

  retry(): void { this.stored.reload(); }

  async select(theme: Theme): Promise<void> {
    if (this.loading() || this.loadError() || this.saving()) return;
    this.error.set('');
    this.saving.set(true);
    try {
      await Preferences.set({ key: THEME_KEY, value: theme });
      this.stored.value.set(theme);
    } catch {
      this.error.set('Не удалось сохранить тему на устройстве. Попробуйте ещё раз.');
    } finally {
      this.saving.set(false);
    }
  }
}
