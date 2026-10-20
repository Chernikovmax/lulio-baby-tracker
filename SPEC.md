# [SPEC.md](http://SPEC.md) — Техническая спецификация приложения «Трекер сна, кормлений и скачков роста»

## 1. Назначение приложения

Мобильное приложение для родителей младенцев (от рождения до 1+ года), повторяющее ключевой функционал и UX приложения «Скачки роста» (Дневник малыша):

- Мгновенный трекинг сна, грудного вскармливания (Л/П грудь), бутылочки, прикорма, сцеживания, подгузников и антропометрии (вес/рост) одной рукой.

- Живой расчет текущего Окна Бодрствования (ВБ) с индикацией возрастных норм и предупреждением о перегуле.

- Автоматическая подсказка следующей груди при кормлении.

- Визуальный 24-часовой паттерн снов и кормлений за 7/14/30 дней.

- Календарь 10 скачков роста (расчет строго по ПДР).

- Offline-First работа с опциональной синхронизацией между телефонами мамы и папы в реальном времени (Supabase Realtime).

---

## 2. Архитектура и файловая структура (`src/app/`)

\`\`\`text

src/app/

├── core/

│   ├── models/

│   │   ├── tracker.models.ts        # Интерфейсы профиля, событий, активных таймеров и Type Guards

│   │   └── leap.models.ts           # Интерфейсы для 10 скачков роста и календаря недель

│   ├── constants/

│   │   ├── wake-norms.const.ts      # Возрастные нормы ВБ и суточного сна (0–12+ мес)

│   │   └── wonder-weeks.const.ts    # Полные статические данные 10 скачков роста (недели 1–75)

│   └── services/

│       ├── clock.service.ts         # Единый Zoneless-генератор тиков времени + visibilitychange

│       ├── storage.service.ts       # Хранилище на базе resource() + @capacitor/preferences + JSON-бэкап

│       ├── sync.service.ts          # Опциональная синхронизация между родителями (Supabase Realtime)

│       ├── active-timer.service.ts  # Управление живыми таймерами Сна и ГВ (Левая/Правая) через timestamps

│       ├── wake-window.service.ts   # Расчет текущего ВБ, норм, времени с кормления и linkedSignal груди

│       └── leaps.service.ts         # Расчет недели от ПДР и фаз скачков роста (грозовые/солнечные)

├── shared/

│   ├── components/

│   │   ├── live-status-banner/      # Главный виджет в шапке: текущее ВБ/Сон, прогресс-бар нормы, инфо о ГВ

│   │   ├── quick-action-dock/       # Нижняя панель крупных кнопок запуска: Сон, ГВ, Бутылочка, Подгузник

│   │   └── modals/

│   │       ├── sleep-modal/         # Bottom-sheet модалка сна (живой таймер + ручной ввод на Signal Forms)

│   │       ├── feeding-modal/       # Bottom-sheet модалка еды (двойной секундомер Л/П + Бутылочка с чипами +30/+60 мл)

│   │       ├── diaper-modal/        # Bottom-sheet модалка подгузника (Мокрый / Грязный / Смешанный)

│   │       └── growth-modal/        # Модалка ввода веса, роста и окружности головы

│   └── pipes/

│       └── duration-format.pipe.ts  # Форматирование секунд в "1 ч 35 мин" или "04:12"

└── features/

    ├── tracker/                     # Вкладка 1 (/tabs/tracker): Календарь дней, Статус ВБ, Сводка дня, Лента событий

    ├── stats/                       # Вкладка 2 (/tabs/stats): Суточный паттерн 24ч, среднее ВБ, графики веса/роста

    ├── leaps/                       # Вкладка 3 (/tabs/leaps): Шкала недель от ПДР (тучки/солнышки) и описание скачков

    └── settings/                    # Вкладка 4 (/tabs/settings): Профиль малыша (Signal Forms), экспорт/импорт, синк

\`\`\`

---

## 3. Маппинг интерфейса «Скачков роста» на компоненты Ionic v9

| Элемент интерфейса | Поведение | Компоненты `@ionic/angular/standalone` |

|---|---|---|

| \*\*Нижняя навигация\*\* | 4 вкладки: \*Сегодня\*, \*Статистика\*, \*Скачки\*, \*Профиль\* | `IonTabs`, `IonTabBar`, `IonTabButton`, `IonIcon`, `IonLabel` |

| \*\*Шапка и переключатель дней\*\* | Имя малыша, возраст, свайп/стрелки по дням + быстрый возврат на «Сегодня» | `IonHeader`, `IonToolbar`, `IonButtons`, `IonButton`, `IonDatetimeButton` |

| \*\*Баннер живого статуса (ВБ и Сон)\*\* | Плашка состояния: \*«Бодрствует: 1 ч 35 мин (норма: 1ч 20м – 1ч 50м)»\* с цветной шкалой, время с прошлого кормления и бейдж \*«Следующая: Правая»\* | `IonCard`, `IonCardContent`, `IonProgressBar`, `IonBadge`, `IonText` |

| \*\*Док быстрых действий\*\* | Крупные кнопки высотой от 56px над таб-баром под большой палец. Если таймер запущен — на кнопке пульсирует бейдж с текущим временем | `IonGrid`, `IonRow`, `IonCol`, `IonButton`, `IonBadge`, `IonRippleEffect` |

| \*\*Шторки таймеров и ввода\*\* | Выезжают снизу на пол-экрана или на 85% высоты | `IonModal` с `breakpoints="[0, 0.55, 0.9]"` и `initialBreakpoint="0.55"` |

| \*\*Хронология (Лента дня)\*\* | Фильтр по чипам (\*Все\*, \*Сон\*, \*Еда\*, \*Подгузник\*). События за день сверху вниз. Между снами — серые разделители с фактическим временем ВБ. Свайп влево удаляет запись | `IonSegment`, `IonSegmentButton`, `IonList`, `IonItemSliding`, `IonItem`, `IonItemOptions`, `IonItemOption` |

| \*\*Суточный паттерн 24ч\*\* | Полосы по 24 часа за 7/14/30 дней: синие блоки — сон, точки — кормления | `IonSegment` (период) + кастомный SVG/CSS-Grid компонент суточных полос |

| \*\*Календарь скачков роста\*\* | Горизонтальная шкала недель (1–75) с иконками тучек/солнышек + развернутое описание кризиса и новых навыков | Горизонтальный flex-контейнер недель + `IonAccordionGroup`, `IonAccordion` |

---

## 4. Модели данных (`src/app/core/models/`)

### 4.1. `tracker.models.ts`

\`\`\`typescript

export type EventType = 'sleep' | 'breastfeeding' | 'bottle' | 'solids' | 'pumping' | 'diaper' | 'growth';

export type BreastSide = 'left' | 'right';

export type DiaperState = 'wet' | 'dirty' | 'mixed';

export type BottleContent = 'formula' | 'breast_milk' | 'water';

export type WakeStatusLevel = 'sleeping' | 'optimal' | 'approaching' | 'overtired';

export interface BabyProfile {

  id: string;

  name: string;

  birthDate: string; // ISO Date — для расчета фактического возраста и норм ВБ

  dueDate: string;   // ISO Date (ПДР) — СТРОГО для расчета календаря скачков роста

  gender: 'boy' | 'girl';

}

export interface BaseEvent {

  id: string;

  type: EventType;

  startTime: string; // ISO timestamp

  endTime?: string;  // ISO timestamp

  note?: string;

  updatedAt: string;

}

export interface SleepEvent extends BaseEvent {

  type: 'sleep';

  endTime: string;

  isNightSleep: boolean;

  tags?: ('crib' | 'stroller' | 'arms' | 'co_sleeping')[];

}

export interface BreastfeedingEvent extends BaseEvent {

  type: 'breastfeeding';

  endTime: string;

  leftDurationSec: number;

  rightDurationSec: number;

  lastSide: BreastSide;

}

export interface BottleEvent extends BaseEvent {

  type: 'bottle';

  content: BottleContent;

  volumeMl: number;

}

export interface DiaperEvent extends BaseEvent {

  type: 'diaper';

  state: DiaperState;

}

export interface GrowthEvent extends BaseEvent {

  type: 'growth';

  weightKg?: number;

  heightCm?: number;

  headCm?: number;

}

export type AnyTrackerEvent =

  | SleepEvent

  | BreastfeedingEvent

  | BottleEvent

  | DiaperEvent

  | GrowthEvent;

export interface ActiveSleepTimer {

  startedAt: string;

  isNightSleep: boolean;

}

export interface ActiveBreastTimer {

  startedAt: string;

  activeSide: BreastSide | null;

  currentSideStartedAt: string | null;

  accumulatedLeftSec: number;

  accumulatedRightSec: number;

  lastActiveSide: BreastSide;

}

export interface ActiveTimerState {

  sleepTimer: ActiveSleepTimer | null;

  breastTimer: ActiveBreastTimer | null;

}

\`\`\`

### 4.2. `leap.models.ts`

\`\`\`typescript

export type WeekWeather = 'sunny' | 'fussy' | 'stormy';

export interface WonderLeap {

  leapNumber: number;         // 1..10

  title: string;              // Например: "Скачок 4: Мир событий"

  peakWeek: number;           // Неделя пика от ПДР (5, 8, 12, 19, 26, 37, 46, 55, 64, 75)

  startWeek: number;          // Начало беспокойной фазы

  endWeek: number;            // Окончание беспокойной фазы

  whatHappens: string;        // Описание изменений в восприятии малыша

  cues: string[];             // Признаки скачка (капризы, частые прикладывания, регресс сна)

  newSkills: string[];        // Навыки, которые появляются после скачка

}

export interface CalendarWeekItem {

  weekNumber: number;         // 1..75

  weather: WeekWeather;

  leapNumber?: number;

  isCurrentWeek: boolean;

}

\`\`\`

---

## 5. Ключевая бизнес-логика и эталонные паттерны Angular v22

### 5.1. Нормы Окон Бодрствования (ВБ) по возрасту (`wake-norms.const.ts`)

- \*\*0–1 мес (0–30 дн):\*\* 40–60 мин

- \*\*1–2 мес (31–60 дн):\*\* 50–75 мин

- \*\*2–3 мес (61–90 дн):\*\* 60–80 мин (1 ч 00 м – 1 ч 20 м)

- \*\*3–4 мес (91–120 дн):\*\* 80–110 мин (1 ч 20 м – 1 ч 50 м)

- \*\*4–5 мес (121–150 дн):\*\* 105–135 мин (1 ч 45 м – 2 ч 15 м)

- \*\*5–6 мес (151–180 дн):\*\* 120–150 мин (2 ч 00 м – 2 ч 30 м)

- \*\*6–8 мес (181–240 дн):\*\* 150–180 мин (2 ч 30 м – 3 ч 00 м)

- \*\*9–12 мес (241–365 дн):\*\* 180–240 мин (3 ч 00 м – 4 ч 00 м)

- \*\*12+ мес (366+ дн):\*\* 210–300 мин (3 ч 30 м – 5 ч 00 м)

\*\*Цветовая логика `WakeWindowService`:\*\*

- `optimal` (зеленый `success`): текущее ВБ меньше `minWakeMinutes`.

- `approaching` (желтый `warning`): текущее ВБ между `minWakeMinutes` и `maxWakeMinutes` («Пора готовиться ко сну»).

- `overtired` (красный `danger`): текущее ВБ больше `maxWakeMinutes` («Риск перегула»).

### 5.2. Эталонный паттерн Zoneless-таймера (`ClockService`)

Все живые счетчики в приложении подписываются на единый сигнал `[ClockService.now](http://ClockService.now)()`:

\`\`\`typescript

import { Service, signal, DestroyRef, inject } from '@angular/core';

import { DOCUMENT } from '@angular/common';

@Service()

export class ClockService {

  private readonly destroyRef = inject(DestroyRef);

  private readonly document = inject(DOCUMENT);

  readonly now = signal&lt;number&gt;([Date.now](http://Date.now)());

  constructor() {

    const id = setInterval(() =&gt; [this.now](http://this.now).set([Date.now](http://Date.now)()), 1000);

    const onVisible = () =&gt; {

      if (this.document.visibilityState === 'visible') [this.now](http://this.now).set([Date.now](http://Date.now)());

    };

    this.document.addEventListener('visibilitychange', onVisible);

    this.destroyRef.onDestroy(() =&gt; {

      clearInterval(id);

      this.document.removeEventListener('visibilitychange', onVisible);

    });

  }

}

\`\`\`

### 5.3. Эталонный паттерн Signal Forms и `linkedSignal` (для модалок ввода)

В модалках запрещено использовать `ReactiveFormsModule`. Используется `form()` из `@angular/forms/signals`:

\`\`\`typescript

import { Component, inject, signal, linkedSignal } from '@angular/core';

import { form, FormField, required, min, max } from '@angular/forms/signals';

import { WakeWindowService } from '../../../core/services/wake-window.service';

import { BottleContent } from '../../../core/models/tracker.models';

// Автоматический выбор стартовой груди (противоположной от прошлого кормления)

readonly selectedSide = linkedSignal(() =&gt;

  this.wakeWindowService.lastUsedBreastSide() === 'left' ? 'right' : 'left'

);

// Signal Form для ввода бутылочки

readonly bottleModel = signal({

  content: 'breast_milk' as BottleContent,

  volumeMl: 90,

  startTime: new Date().toISOString(),

  note: ''

});

readonly bottleForm = form(this.bottleModel, (path) =&gt; {

  required(path.volumeMl);

  min(path.volumeMl, 5);

  max(path.volumeMl, 500);

});

\`\`\`

### 5.4. Алгоритм Календаря Скачков Роста (`LeapsService`)

- Базовая точка отсчета — \*\*строго `profile.dueDate` (ПДР)\*\*, а не фактическая дата рождения.

- Номер текущей недели = `Math.floor((now - dueDateMs) / (7 * 24 * 60 * 60 * 1000)) + 1`.

- 10 классических скачков происходят на пиковых неделях: \*\*5, 8, 12, 19, 26, 37, 46, 55, 64, 75\*\*.

- Каждая неделя от 1 до 75 получает статус `stormy` (идет скачок), `fussy` (неделя перед пиком длинного скачка) или `sunny` (спокойная неделя освоения навыков).

### 5.5. Требования к вкладкам приложения

1. \*\*Таб «Сегодня» (`/tabs/tracker`):\*\*

   - Переключатель даты в шапке.

   - `LiveStatusBannerComponent`: крупный таймер текущего ВБ или активного Сна, прогресс-бар нормы ВБ, время с последнего кормления и плашка рекомендуемой груди (`Л` / `П`).

   - `QuickActionDockComponent`: 4 крупные кнопки запуска (`Сон`, `ГВ`, `Бутылочка`, `Подгузник`).

   - Карточка сводки за выбранные сутки: суммарный дневной и ночной сон, количество кормлений и суммарный объем мл, количество смен подгузников.

   - Лента событий дня с фильтрацией по чипам и автоматическим выводом плашек `ВБ: X ч Y мин` между соседними завершенными снами.

2. \*\*Таб «Статистика» (`/tabs/stats`):\*\*

   - Переключатель периода: `7 дней` / `14 дней` / `30 дней`.

   - Визуальный 24-часовой график («Суточный паттерн»): колонки или строки по дням от `00:00` до `24:00`, где наглядно видны интервалы ночного/дневного сна и точки кормлений.

   - Карточки средних значений за выбранный период (среднее ВБ, средний ночной сон, средний дневной сон).

   - История замеров веса и роста с динамикой прибавки.

3. \*\*Таб «Скачки» (`/tabs/leaps`):\*\*

   - Горизонтальный скролл-календарь недель от 1 до 75 с автофокусом на текущей неделе от ПДР.

   - Детальная карточка текущего/выбранного скачка (Что происходит, Признаки, Новые навыки).

4. \*\*Таб «Профиль» (`/tabs/settings`):\*\*

   - Редактирование имени, даты рождения и ПДР на базе Signal Forms.

   - Кнопки «Экспорт бэкапа в JSON» и «Импорт из JSON».

   - Поля настройки семейной синхронизации (Supabase URL, Anon Key, общий `family_id`) для синхронизации таймеров между телефонами мамы и папы в реальном времени.

## 6. Контракты реализованного Core

- `StorageService` читает данные через `resource()` и `@capacitor/preferences`, ключ `baby-tracker.v1`. Снимок содержит `profile`, `events`, `activeTimers`. Перед операциями можно дождаться `ready()`; состояние чтения доступно через `isLoading()` и `error()`.
- `saveProfile()`, `saveEvent()`, `deleteEvent()` и транзакционный `update()` возвращают `Promise<void>`. Операции сериализованы; сигналы меняются только после успешной записи. Ошибки записи передаются вызывающему коду. `saveEvent()` добавляет или заменяет запись по `id`; порядок массива не определяет хронологию.
- `exportBackup()` возвращает JSON с `version: 1` и `exportedAt`. `importBackup(json)` полностью заменяет профиль, события и таймеры после проверки всего документа. Повреждённый документ, неизвестная версия, повторяющиеся идентификаторы и неверные даты отклоняются без записи.
- Помимо моделей раздела 4, поддержаны `SolidsEvent` (`food`, необязательный `amountGrams`) и `PumpingEvent` (`volumeMl`, `side`: `left`, `right` или `both`). Они входят в `AnyTrackerEvent`. Экспортированные проверки типов принимают `unknown` и проверяют обязательные и необязательные поля.
- `ActiveTimerService`: `startSleep()`, `stopSleep()`, `cancelSleep()`, `startBreastfeeding(side)`, `switchBreast(side)`, `pauseBreastfeeding()`, `stopBreastfeeding()`, `cancelBreastfeeding()`. Переключение на грудь возобновляет кормление после паузы. Сон и кормление независимы. Завершение атомарно добавляет событие и очищает таймер; отмена не добавляет событие. Повторное завершение возвращает `null`.
- Таймеры используют только ISO-метки и разность времени; накопления ГВ сохраняют доли секунды между переключениями. Отображение и итоговые длительности округляются вниз до целых секунд. Часы корректируются при возврате видимости вкладки, слушатель и интервал снимаются при уничтожении сервиса.
- `WakeWindowService`: `wakeDurationSec()`, `norm()`, `normProgressRatio()`, `status()`, `isOvertired()`, `timeSinceLastFeedingSec()`, `lastUsedBreastSide()` и изменяемый `nextBreastSide`. При отсутствии сна или кормления соответствующая длительность — `null`, а не выдуманное начало суток. При активном сне ВБ равно нулю. Отношение к верхней норме не ограничено единицей, чтобы отражать перегул. Возраст для норм считается по календарным дням от рождения.
- Время с кормления считается от начала последнего ГВ, бутылочки или прикорма; сцеживание не считается кормлением. Следующая грудь противоположна последней использованной в завершённом ГВ; без истории — левая. Ручной выбор сохраняется при несвязанных изменениях и сбрасывается при изменении последнего кормления.
- `LeapsService` трактует ПДР как полночь UTC и применяет формулу раздела 5.4 без ограничения номера недели: до ПДР и после 75-й недели текущая ячейка отсутствует. В календаре ровно 75 недель. Внутри указанной фазы недели имеют статус `stormy`, но неделя перед пиком фазы длиной от трёх недель — `fussy`; вне фаз — `sunny`. Границы включительны. Данные и навыки ориентировочные, не медицинский прогноз; доступно русское предупреждение `LEAP_CALENDAR_NOTICE`.
- `DurationFormatPipe`: `durationFormat` или `durationFormat:'human'` → `1 ч 35 мин`; `durationFormat:'timer'` → `04:12` либо `01:01:01`. Неизвестная/нечисловая длительность → `—`, отрицательная → ноль.
