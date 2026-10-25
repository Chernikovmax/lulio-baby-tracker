# SPEC.md — Technical Specification: Baby Sleep, Feeding & Developmental Leaps Tracker

## 1. Application Purpose

A mobile application for parents of infants (from birth through 12+ months), reproducing the core functionality and user experience of the **“Developmental Leaps” (Baby Diary)** app:

- **One-handed, instant tracking** of sleep, breastfeeding (left/right breast), bottle feeding, solid foods, pumping, diaper changes, and anthropometric measurements (weight/length).
- **Live wake-window calculation** with age-based reference ranges and overtiredness warnings.
- **Automatic suggestion of which breast to offer next.**
- **Visual 24-hour sleep and feeding patterns** over 7, 14, or 30 days.
- **Calendar of 10 developmental leaps**, calculated strictly from the estimated due date (EDD), not the actual birth date.
- **Offline-first operation**, with optional real-time synchronization between both parents' phones via Supabase Realtime.
- **Android launcher icon:** native resources in `android/app/src/main/res/` provide legacy PNGs for all five densities, adaptive layers for API 26+, and a monochrome layer for themed icons on API 33+. Both launcher variants use `@mipmap/ic_launcher` / `@mipmap/ic_launcher_round`; themed colors depend on launcher support and the user's theme setting.

## 2. Architecture and File Structure (`src/app/`)

```text
src/app/
├── core/
│   ├── models/
│   │   ├── tracker.models.ts        # Profile, event, active timer interfaces and type guards
│   │   └── leap.models.ts           # Interfaces for the 10 developmental leaps and weekly calendar
│   ├── constants/
│   │   ├── wake-norms.const.ts      # Age-based wake-window and daily sleep norms (0–12+ months)
│   │   └── wonder-weeks.const.ts    # Complete static data for 10 leaps (weeks 1–75)
│   └── services/
│       ├── clock.service.ts         # Single zoneless clock ticker + visibilitychange handling
│       ├── storage.service.ts       # Storage using resource() + @capacitor/preferences + JSON backups
│       ├── sync.service.ts          # Optional parent-to-parent synchronization (Supabase Realtime)
│       ├── active-timer.service.ts  # Timestamp-based live sleep and breastfeeding (left/right) timers
│       ├── wake-window.service.ts   # Wake-window calculations, norms, time since feeding, breast linkedSignal
│       └── leaps.service.ts         # EDD-based week and leap-phase calculations (stormy/sunny)
├── shared/
│   ├── components/
│   │   ├── live-status-banner/      # Main header widget: wake window/sleep, norm progress, breastfeeding info
│   │   ├── quick-action-dock/       # Large bottom actions: Sleep, Breastfeed, Bottle, Diaper
│   │   └── modals/
│   │       ├── sleep-modal/         # Sleep bottom sheet (live timer + manual entry using Signal Forms)
│   │       ├── feeding-modal/       # Feeding bottom sheet (dual left/right timers + bottle +30/+60 mL chips)
│   │       ├── diaper-modal/        # Diaper bottom sheet (Wet / Dirty / Mixed)
│   │       └── growth-modal/        # Weight, length/height and head circumference entry
│   └── pipes/
│       └── duration-format.pipe.ts  # Format seconds as "1 h 35 min" or "04:12"
└── features/
    ├── tracker/                    # Tab 1 (/tabs/tracker): date navigation, wake status, daily summary, event feed
    ├── stats/                      # Tab 2 (/tabs/stats): 24h patterns, average wake windows, weight/length charts
    ├── leaps/                      # Tab 3 (/tabs/leaps): EDD-based week timeline (clouds/suns) and leap details
    └── settings/                   # Tab 4 (/tabs/settings): baby profile (Signal Forms), export/import, sync
```

## 3. Mapping the Reference App UI to Ionic v9 Components

| UI element | Required behavior | `@ionic/angular/standalone` components |
|---|---|---|
| **Bottom navigation** | Four tabs: **Today**, **Statistics**, **Leaps**, **Profile** | `IonTabs`, `IonTabBar`, `IonTabButton`, `IonIcon`, `IonLabel` |
| **Header and date navigation** | Baby's name and age; swipe or arrows to navigate days; quick return to **Today** | `IonHeader`, `IonToolbar`, `IonButtons`, `IonButton`, `IonDatetimeButton` |
| **Live status banner (wake window/sleep)** | Elapsed sleep/wake timer, time since feeding and next-breast badge. Age-based wake guidance, progress and overtired warnings appear only during local daytime (08:00 inclusive–20:00 exclusive); the wake timer continues overnight without recommendations | `IonCard`, `IonCardContent`, `IonProgressBar`, `IonBadge`, `IonText` |
| **Quick-action dock** | Thumb-friendly buttons at least 56 px high, positioned above the tab bar. An active timer produces a pulsating elapsed-time badge on its button | `IonGrid`, `IonRow`, `IonCol`, `IonButton`, `IonBadge`, `IonRippleEffect` |
| **Timer/data-entry bottom sheets** | Sleep, feeding and diaper sheets open at 90% height and allow scrolling at every breakpoint. Feeding save action stays in an `IonFooter`, outside scrollable content, without needing keyboard focus | `IonModal` with `breakpoints="[0, 0.55, 0.9]"`, `initialBreakpoint="0.9"` and `expandToScroll="false"` |
| **Recent event feed** | Chip filters (**All**, **Sleep**, **Feeding**, **Diaper**). Show the latest 20 matching events across all dates, newest first, with date and time on each row. Selected date affects only age/day summaries, not the feed. Wake separators follow the newer sleep in reverse chronology. Swipe left to delete an event | `IonSegment`, `IonSegmentButton`, `IonList`, `IonItemSliding`, `IonItem`, `IonItemOptions`, `IonItemOption` |
| **24-hour daily pattern** | One 24h band per day for 7/14/30 days; blue blocks indicate sleep and dots indicate feedings | `IonSegment` for the range + custom SVG/CSS Grid bands |
| **Developmental leaps calendar** | Horizontal timeline covering weeks 1–75 with cloud/sun icons and expanded descriptions of difficult phases and emerging skills | Horizontal flex week container + `IonAccordionGroup`, `IonAccordion` |

Event entry defaults use the current local date/time on every sheet opening, not the component's creation time. Sleep and manual breastfeeding start/end inputs both default to now and require adjustment to a valid completed interval. Growth date defaults to today on each opening; new profile date fields default to today without replacing saved profile dates.

Diaper entry includes an editable date/time; all three state buttons save at that chosen instant. Feeding → Breast → Manual records start/end, whole minutes on each breast (excluding pauses), last breast and optional note. The total must be positive and fit within the interval; the last breast must have nonzero time. Manual entries use ordinary persisted/synchronized breastfeeding events and leave active timers unchanged.

Honor Magic Capsule remains **not implemented**: its official integration requires Honor app registration/App ID and granted access, neither available in this checkout. References: [integration guide](https://developer.honor.com/cn/doc/guides/101454), [approval/configuration flow](https://developer.honor.com/cn/doc/guides/101455). Android notification-shade timers below are a separate feature, not capsule support.

**Android notification-shade timers.** The local Capacitor package `plugins/timer-notification/` posts a silent, low-importance notification for sleep or wakefulness, plus a separate notification for active breastfeeding. Compact and expanded notifications contain an explicit Android system Chronometer in their body, rather than relying on the header chronometer that OEM notification shades may replace with a start time. Its monotonic base is derived from the original start timestamp; JavaScript sends state transitions only, not per-second updates. An unknown wake start produces no wake notification. Breastfeeding pauses replace the counter with frozen elapsed time; switching/resuming preserves accumulated time and excludes pauses. Finished/cancelled feeding removes only its own notification. Tapping a notification opens the app.

Android 13+ notification permission is requested once when the first timer appears. Denial does not block event persistence or timers. Profile → “Таймеры в шторке Android” shows access status and opens the relevant Android settings; returning to the app reconciles current state and permissions. The channel has no sound or vibration. Users can override channel settings or dismiss notifications according to their Android/MagicOS version.

No foreground service or exact alarm is needed for the system-rendered counter. Notification state is restored from persisted tracker state on app startup/resume. This does not promise automatic restoration after a phone reboot or a user force-stop; reopen the app. On web/iOS this Android-only feature makes no native plugin calls.

Install the local package with normal `npm install`; run `npx cap sync android` after building web assets. Plugin code and its permission manifest live outside generated `android/`; Capacitor generates registration/Gradle integration. Native behavior tests: from `android/`, run `./gradlew :baby-tracker-timer-notification:testDebugUnitTest` with JDK 21 and the Android SDK configured. Robolectric covers Android API 32 and 36, including rendered stopwatch ticks, pause/finish transitions and blocked notifications. Device-specific Honor appearance still requires a physical-device check.



## 4. Data Models (`src/app/core/models/`)

### 4.1 `tracker.models.ts`

```typescript
export type EventType = 'sleep' | 'breastfeeding' | 'bottle' | 'solids' | 'pumping' | 'diaper' | 'growth';
export type BreastSide = 'left' | 'right';
export type DiaperState = 'wet' | 'dirty' | 'mixed';
export type BottleContent = 'formula' | 'breast_milk' | 'water';
export type WakeStatusLevel = 'sleeping' | 'optimal' | 'approaching' | 'overtired';

export interface BabyProfile {
  id: string;
  name: string;
  birthDate: string; // ISO date — actual age and wake-window norms
  dueDate: string;   // ISO date (EDD) — STRICTLY for developmental leap calculations
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

// Also include SolidsEvent and PumpingEvent as required by Section 6.
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
```

**Important:** The union above reproduces the model excerpt in Section 4.1. The implemented core contract in Section 6 extends this union to include `SolidsEvent` and `PumpingEvent`; agents must honor the more complete contract when implementing or modifying the model.

### 4.2 `leap.models.ts`

```typescript
export type WeekWeather = 'sunny' | 'fussy' | 'stormy';

export interface WonderLeap {
  leapNumber: number;  // 1..10
  title: string;       // Example: "Leap 4: The World of Events"
  peakWeek: number;    // Peak week relative to EDD (5, 8, 12, 19, 26, 37, 46, 55, 64, 75)
  startWeek: number;   // Start of the unsettled phase
  endWeek: number;     // End of the unsettled phase
  whatHappens: string; // Description of changes in the baby's perception
  cues: string[];      // Signs (fussiness, frequent feeding, sleep regression)
  newSkills: string[]; // Skills that may emerge after the leap
}

export interface CalendarWeekItem {
  weekNumber: number;   // 1..75
  weather: WeekWeather;
  leapNumber?: number;
  isCurrentWeek: boolean;
}
```

## 5. Core Business Logic and Reference Angular v22 Patterns

### 5.1 Age-Based Wake-Window Reference Ranges (`wake-norms.const.ts`)

| Age | Age in days | Wake window |
|---|---:|---:|
| 0–1 month | 0–30 | 40–60 min |
| 1–2 months | 31–60 | 50–75 min |
| 2–3 months | 61–90 | 60–80 min (1 h – 1 h 20 min) |
| 3–4 months | 91–120 | 80–110 min (1 h 20 min – 1 h 50 min) |
| 4–5 months | 121–150 | 105–135 min (1 h 45 min – 2 h 15 min) |
| 5–6 months | 151–180 | 120–150 min (2 h – 2 h 30 min) |
| 6–8 months | 181–240 | 150–180 min (2 h 30 min – 3 h) |
| 9–12 months | 241–365 | 180–240 min (3 h – 4 h) |
| 12+ months | 366+ | 210–300 min (3 h 30 min – 5 h) |

**`WakeWindowService` status colors and thresholds:**

- `optimal` (**green / success**): current wake-window duration is **less than** `minWakeMinutes`.
- `approaching` (**yellow / warning**): duration is **between** `minWakeMinutes` and `maxWakeMinutes` — “Time to prepare for sleep.”
- `overtired` (**red / danger**): duration is **greater than** `maxWakeMinutes` — “Risk of overtiredness.”

### 5.2 Reference Zoneless Timer Pattern (`ClockService`)

All live counters must subscribe to a single `ClockService.now()` signal. The following is the translated source example; its Angular decorator must be validated against Angular v22 before use (see Implementation Notes).

```typescript
import { Service, signal, DestroyRef, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';

@Service()
export class ClockService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  readonly now = signal<number>(Date.now());

  constructor() {
    const id = setInterval(() => this.now.set(Date.now()), 1000);
    const onVisible = () => {
      if (this.document.visibilityState === 'visible') this.now.set(Date.now());
    };

    this.document.addEventListener('visibilitychange', onVisible);
    this.destroyRef.onDestroy(() => {
      clearInterval(id);
      this.document.removeEventListener('visibilitychange', onVisible);
    });
  }
}
```

### 5.3 Reference Signal Forms and `linkedSignal` Pattern (Input Modals)

**Do not use `ReactiveFormsModule` in input modals.** Use `form()` from `@angular/forms/signals` instead.

```typescript
import { Component, inject, signal, linkedSignal } from '@angular/core';
import { form, FormField, required, min, max } from '@angular/forms/signals';
import { WakeWindowService } from '../../../core/services/wake-window.service';
import { BottleContent } from '../../../core/models/tracker.models';

// Automatically select the starting breast: opposite of the previous feeding.
readonly selectedSide = linkedSignal(() =>
  this.wakeWindowService.lastUsedBreastSide() === 'left' ? 'right' : 'left'
);

// Signal Form model for bottle feeding.
readonly bottleModel = signal({
  content: 'breast_milk' as BottleContent,
  volumeMl: 90,
  startTime: new Date().toISOString(),
  note: ''
});

readonly bottleForm = form(this.bottleModel, (path) => {
  required(path.volumeMl);
  min(path.volumeMl, 5);
  max(path.volumeMl, 500);
});
```

### 5.4 Developmental Leaps Calendar Algorithm (`LeapsService`)

1. The reference date is **strictly `profile.dueDate` (EDD)**, **never** the actual birth date.
2. Current week number: `Math.floor((now - dueDateMs) / (7 * 24 * 60 * 60 * 1000)) + 1`.
3. The 10 classic leaps peak in weeks **5, 8, 12, 19, 26, 37, 46, 55, 64, and 75**.
4. Each calendar week from 1 through 75 is marked `stormy` (leap in progress), `fussy` (the week before the peak of a long leap), or `sunny` (a calmer skill-consolidation week). The precise precedence rules are in Section 6.

### 5.5 Requirements by App Tab

#### Today (`/tabs/tracker`)

- Date selector in the header.
- `LiveStatusBannerComponent`: large live timer showing the current wake window or active sleep; progress toward age-specific wake-window limits; time since last feeding; recommended breast badge (L/R).
- `QuickActionDockComponent`: four prominent start buttons — **Sleep**, **Breastfeeding**, **Bottle**, **Diaper**.
- Summary card for the selected calendar day: total daytime and nighttime sleep, feeding count and total bottle volume in mL, and diaper-change count.
- Filterable daily event feed, automatically displaying **“Wake window: X h Y min”** between adjacent completed sleep sessions.

#### Statistics (`/tabs/stats`)

- Period selector: **7 days / 14 days / 30 days**.
- Visual **24-hour daily pattern**: one row or column per day spanning 00:00–24:00, with clearly visible night/day sleep intervals and feeding markers.
- Average-value cards for the selected period: **average wake-window duration**, **average nighttime sleep**, and **average daytime sleep**.
- Weight and length/height measurement history with changes over time.

#### Leaps (`/tabs/leaps`)

- Horizontally scrolling calendar of **weeks 1–75**, automatically focused on the current EDD-based week.
- Detail card for the current or selected leap: **What happens**, **Signs**, **New skills**.

#### Profile (`/tabs/settings`)

- Edit baby's name, birth date, and EDD using **Signal Forms**.
- **Export backup to JSON** and **Import from JSON** buttons.
- Family synchronization configuration: **Supabase URL**, **Anon Key**, and shared **`family_id`** for real-time timer sync between parents' devices.

## 6. Implemented Core Contracts

**This section documents existing behavior. Preserve these contracts when extending the application. Where the earlier illustrative models differ, these implemented contracts take precedence.**

### 6.1 `StorageService`

- Reads persisted data using `resource()` and `@capacitor/preferences` under the key **`baby-tracker.v1`**.
- The snapshot contains `profile`, `events`, `activeTimers`, nullable `sleepRoutine`, `confirmedWakes`, `historyAssertions`, `sleepPreparations` and `sleepCycleSuppressions`. Missing legacy facts become empty arrays; the storage key is unchanged.
- Callers may await `ready()` before operations. Load state is exposed through `isLoading()` and `error()`.
- `saveProfile()`, `saveSleepRoutine()`, `saveEvent()`, `deleteEvent()`, `saveConfirmedWake()`, `deleteConfirmedWake()`, `saveHistoryAssertion()`, `deleteHistoryAssertion()` and transactional `update()` return `Promise<void>`.
- Write operations are serialized. Reactive signals update **only after a successful persistent write**; write errors propagate to callers.
- `saveEvent()` inserts or replaces an event by `id`. **Array order does not establish chronological order.**
- `exportBackup()` emits version **4**, `exportedAt`, routine and all four fact arrays. Valid versions 1–3 remain accepted, with missing facts defaulting to empty arrays.
- Import validates the entire document before replacing profile, events, timers, routine and facts. Duplicate fact UUIDs, invalid intervals/boundaries and private fields inside facts reject the backup before persistence. Import disables the restored assistant and invalidates the derived plan even when event IDs coincide. Device permissions/subscriptions, settings and replication metadata are excluded.

### 6.2 Additional Events and Runtime Type Guards

- In addition to the Section 4 models, the core supports `SolidsEvent` with **`food`** and optional **`amountGrams`**, and `PumpingEvent` with **`volumeMl`** and **`side: 'left' | 'right' | 'both'`**.
- **Both types are members of `AnyTrackerEvent`.**
- Exported type guards accept `unknown` and validate all required and optional fields.

### 6.3 `ActiveTimerService`

- Exposes `startSleep()`, `stopSleep()`, `cancelSleep()`, `startBreastfeeding(side)`, `switchBreast(side)`, `pauseBreastfeeding()`, `stopBreastfeeding()`, and `cancelBreastfeeding()`.
- Switching to a breast **resumes** breastfeeding after a pause.
- Sleep and breastfeeding timers operate **independently**.
- Stopping a timer **atomically creates an event and clears the active timer**; canceling it clears the timer **without creating an event**.
- Calling a stop method again after completion returns `null`.
- Timers use ISO timestamps and elapsed-time differences only. Accumulated breastfeeding durations retain **fractional seconds between side switches**. Displayed and final durations are **floored to whole seconds**.
- The clock updates when the tab becomes visible again; the interval and event listener are removed on service destruction.

### 6.4 `WakeWindowService`

- Exposes `wakeDurationSec()`, `norm()`, `normProgressRatio()`, `status()`, `isOvertired()`, `timeSinceLastFeedingSec()`, `lastUsedBreastSide()`, and a writable **`selectedNextBreastSide`**.
- With no relevant sleep or feeding history, the corresponding duration is **`null`**, not an invented time since midnight.
- During active sleep, wake-window duration is **zero**.
- `normProgressRatio()` is **not capped at 1**, so overtiredness can be represented accurately.
- Age for wake-window norms is calculated in **calendar days since the actual birth date**.
- Time since last feeding is measured from the **start** of the most recent **breastfeeding, bottle feeding, or solid-food event**. **Pumping is not a feeding.**
- Recommended next breast is the **opposite** of the last breast used in the most recently **completed** breastfeeding event. Default to **left** if there is no history.
- Preserve a user's manual next-breast selection across unrelated changes; reset it when the last breastfeeding event changes.

### 6.5 `LeapsService`

- Interpret EDD as **00:00 UTC** and apply the exact Section 5.4 week formula **without clamping** the week number.
- If the current date is before EDD or after week 75, there is **no current calendar cell**.
- The calendar contains **exactly 75 weeks**.
- Within an indicated leap phase, weeks are `stormy`, **except** the week immediately before the peak of a phase lasting **three or more weeks**, which is `fussy`.
- Weeks outside leap phases are `sunny`. Phase boundaries are **inclusive**.
- Leap descriptions and milestone predictions are **approximate**, not medical forecasts. A **Russian-language disclaimer** is available as `LEAP_CALENDAR_NOTICE`.

### 6.6 `DurationFormatPipe`

- `durationFormat` or `durationFormat:'human'` → **`1 ч 35 мин`** (Russian-language output specified by the existing contract).
- `durationFormat:'timer'` → **`04:12`** or **`01:01:01`**.
- Unknown or nonnumeric duration → **`—`** (em dash).
- Negative duration → **zero**.

### 6.7 Implemented Tracker UI

- `/tabs/tracker` is the default route. The bottom navigation contains Сегодня, Статистика, Скачки, Профиль at `/tabs/tracker`, `/tabs/stats`, `/tabs/leaps`, `/tabs/settings`.
- Russian text and the `ion-palette-dark` OLED palette are enabled by default, independently of the system theme.
- `LiveStatusBannerComponent` reads the existing clock-driven timers and wake norms; its Л/П button changes `selectedNextBreastSide`. Only the displayed progress bar is capped at 1.
- `QuickActionDockComponent` stays above the tab bar, with four 72px-tall actions. Active timers remain visible when sheets close; paused breastfeeding keeps its badge without pulsing. Reduced-motion preferences disable the pulse.
- Sleep, feeding, and diaper sheets use `IonModal` breakpoints `[0, 0.55, 0.9]`, initially `0.55`. The handle expands the sheet to reach longer forms. Its accessibility label is localized through the documented `handle` shadow part because Ionic 9 hardcodes English text.
- Entry controls use Signal Forms `form()` and `FormField`. Sleep supports day/night live tracking and manual intervals; breastfeeding preserves separate left/right totals with one running side at a time; bottle chips add volume; diaper choices save immediately with an optional note. Persistence failures leave entered data visible.
- Daily summaries use local calendar-day boundaries, including daylight-saving transitions. Completed sleep is clipped to its overlap with the day; overlapping intervals of the same sleep category count once. Feedings and diapers belong to the day of their start timestamp. These rules do not split or rewrite stored events.
- Events are sorted by timestamp rather than storage order. Wake badges show the gap between consecutive completed sleeps, including a preceding sleep from another day; overlapping sleeps produce no negative gap. Deletion is available both by swipe and by a visible accessible button.
- **Ionic 9 entrypoint:** `@ionic/angular@9.0.8` (also the latest release checked during implementation) exports standalone components from `@ionic/angular`, not `@ionic/angular/standalone`. Individual imports use the supported root entrypoint with user approval; no `IonicModule` or compatibility shim is used.

### 6.8 Implemented Statistics UI

- `/tabs/stats` has a Russian 7/14/30-day `IonSegment`, ending with the current local day. Each chart row spans local wall-clock time 00:00–24:00; night/day sleep use distinct colors and block heights, with feeding dots and an expandable text alternative.
- Sleep is clipped to each calendar day and overlapping intervals within each sleep category are merged. Only completed sleeps ending by the current time are included; ongoing timers are not counted. Daily sleep and feeding averages divide by the entire selected period, including today and days without records. Pumping is excluded from feeding counts.
- Average wake windows use full positive gaps between merged completed sleeps whose next sleep begins in the selected period, including a preceding sleep outside the period. Missing sleep or wake-window history displays `—`, not an invented duration.
- Growth history covers all dates independently of the period selector. Weight, height and head circumference each compare against their own preceding measurement; absent fields do not reset the baseline. Same-date entries are ordered by `updatedAt`, then ID.
- `GrowthModalComponent` uses Signal Forms and the existing storage API. At least one positive measurement and a valid nonfuture local date are required; comma and dot decimals are accepted. The sheet opens at `0.9` to expose the full form, prevents dismissal while saving, and preserves entered values on persistence failure.

### 6.9 Implemented Leaps UI

- `/tabs/leaps` displays completed weeks and the calendar week from EDD, the current phase, and the existing Russian medical disclaimer. Missing EDD, dates before EDD, and ages beyond week 75 have explicit states without a false current cell.
- All 75 weeks are selectable native buttons with weather icons, accessible Russian phase names, selected state and current-week indication. The timeline automatically centers the current week on entry and the selected week when browsing, without smooth motion.
- Selecting a leap-phase week shows that leap; selecting a sunny week shows the next leap. `IonAccordionGroup` exposes «Что происходит с малышом», «Признаки кризиса», and «Новые навыки» using the existing ten-leap dataset.

### 6.10 Implemented Settings UI

- `/tabs/settings` is a real Russian-language Settings page using Signal Forms (`form`, `FormField`, schema-based disabling). It edits name, actual birth date, EDD and gender while preserving the profile ID. Birth dates cannot be in the future; EDD may precede or follow the actual birth date. Wake norms still use birth date, and leaps still use EDD exclusively.
- JSON export downloads version 4 including preparation and cycle suppression; valid versions 1–3 remain readable. Connection/device settings and replication metadata are excluded. Import validates before replacement, preserves data on failure, disables the assistant and cancels unfinished preparation without discarding valid completed links or diary timers.
- Family settings contain an enable checkbox, Supabase project URL, masked public anon key and shared random UUID-v4 family ID, with a button to generate the latter. Empty overrides resolve independently through `environment.supabase.{url,anonKey,familyId}` in development and production. Defaults are empty and synchronization is disabled unless explicitly enabled.
- Configuration is persisted separately under `baby-tracker.sync.v1`. Never enter a service-role key. The shared family ID is an invitation secret: anyone who obtains it can join that family. Do not embed a private family ID in a publicly distributed application build.

### 6.11 Family Synchronization Deployment and Conflict Contract

1. Enable **Authentication → Anonymous Sign-Ins** and apply only unapplied migrations in order: `202610200001_family_sync.sql`, `202610240001_incremental_family_sync.sql`, `202610240002_sleep_routine.sql`, `202610240003_sleep_forecast_facts.sql`. Never rerun the initial schema after upgrading. These are operator instructions, not a claim of deployment.
2. The final schema has `tracker_families` (family UUID and server version only), `tracker_family_members`, and private `tracker_family_entries` (one latest register and last-changed server version per key). Member-only SELECT policies protect family metadata. Authenticated `join_tracker_family` and `exchange_tracker_family` RPCs enforce membership; direct client writes and direct register reads are not granted. Only the small family metadata row is in the `supabase_realtime` publication. Anonymous authentication supplies a device user; joining requires possession of the random shared family ID.
3. Use matching project/family settings on both devices. HTTPS is required except loopback. Profile remains local; shared state includes events, both timers, whole routine, confirmed wakes and completeness assertions. Upgrade both clients before sharing the new facts.

- `SyncService` starts with the application, not only when Settings opens. Postgres Changes carries only family metadata and triggers reconciliation when its version exceeds the durable local cursor. A 10-second catch-up interval runs only while the document is visible; visibility restoration and network restoration trigger immediate catch-up. Hidden documents start no new exchanges, although an in-flight response can still commit.
- `exchange_tracker_family(target_family, since_version, incoming)` accepts only the durable outbox, returns `{ version, entries }` for registers changed after the cursor, and returns an empty entries object on an unchanged poll. A cursor of zero fetches the initial snapshot. One family row lock covers incoming merges, a single server-version increment per changed transaction, and the delta read, so acknowledging a response cannot skip another committed write. Replaying an accepted write is idempotent. The per-register latest version is indexed; tombstones remain available to old/offline clients without retaining an unbounded transaction log.
- Local storage remains authoritative for UI availability: writes are committed before signals change, without waiting for the network. The per-entity journal, Supabase cursor and pending registers are saved in the **same** `baby-tracker.v1` snapshot as events/timers. A response acknowledges only the revision/device pairs actually sent; edits made during the request remain pending. A failed local response commit leaves both cursor and outbox unchanged. Remote merges do not create local revisions. Old local journals initialize a version-zero outbox once; reconnects and process restarts preserve its checkpoint. Supabase metadata is separate from transport-independent journal packets and excluded from JSON backups.
- Events are merged independently by ID; deletions are retained as null-valued tombstones. Sleep and breastfeeding are separate registers, preserving timestamp-based elapsed time, side switches and pauses. Stopping a timer sends its completed event and cleared timer in one SQL merge transaction.
- Revisions advance monotonically from the device clock and all observed revisions; a device UUID breaks equal-revision ties. Different events are retained; conflicting edits to the same event, timer or whole routine converge to the greater revision/UUID pair. Routine fields are not independently merged. This is deterministic conflict resolution, not a guarantee of real-world ordering between offline devices with skewed clocks.
- The SQL row lock prevents simultaneous requests from overwriting unrelated changes. Existing local data seeds a newly selected family, but previously synchronized remote revisions take precedence over seed values. Changing the project/family selects a new replication scope; delayed responses from another scope are ignored.
- Importing a backup while synchronization is enabled replaces local data and publishes corresponding event deletions, timer changes and a routine replacement/reset to the family. Disable synchronization first if a restore must remain local. Network errors leave the durable journal intact and expose Russian status/error text; credentials are never included in error messages.
- Clean cutover requires both phones to finish the old exchange where possible, export backups and disable synchronization before applying the incremental migration. The migration preserves existing registers/memberships and removes the old `merge_tracker_family` RPC and journal column; old clients are deliberately not supported afterward. Install/publish the new clients before enabling synchronization again with the same family settings. A database schema change is not a completed PWA/APK deployment. See the Russian README for the operator sequence and local verification limits.
- `supabase/tests/incremental_family_sync.sql` exercises delta isolation, idle responses, replay, stale deletion protection, timer tie-breaking, new-device snapshots, offline additions, invalid inputs and access control in an isolated migrated database; synthetic users/data are rolled back.

### 6.12 Manual Yandex Disk Family Synchronization

- `/tabs/settings` provides an optional manual Yandex Disk connection alongside Supabase; the two transports are mutually exclusive. `YandexSyncService` initializes the durable replication scope at application startup but performs network exchange only on user action.
- Parents authorize independently with Authorization Code + PKCE S256 and the Yandex verification-code redirect. Client secrets are never requested or bundled. Native access tokens use the device-local secure-storage plugin; web sessions remain in memory and never use the plugin's plaintext web storage. Expired/revoked sessions require reauthorization.
- The selected private shared folder requires editing rights and a matching `baby-tracker-family.json` marker. Settings/checkpoints are stored under `baby-tracker.yandex.v1`; the family scope is `yandex-disk:<family UUID>`, independent of each participant's local folder path.
- Exchange validates all unprocessed immutable full-journal packets before one local merge. New envelope version is **4**; valid versions 1–3 remain readable. Packets include events/tombstones, timers, routine and all four sleep-assistant fact arrays, not profile, credentials or device permissions. LWW/null tombstones are retained. Upload uses a new UUID filename with overwrite disabled.
- Upload failure does not acknowledge local changes; changes made during upload remain pending. Checkpoints persist only after the exchange succeeds. Reconnecting a newly initialized folder discards its old publication checkpoint. Old packets are not automatically pruned or end-to-end encrypted.
- A successful exchange covers packets visible to that read, not future or concurrent publications. Parents synchronize sequentially at handoff; concurrent button presses may require another exchange. See the Russian root `README.md` for OAuth registration, native setup, usage and privacy limitations.

### 6.13 Individual Sleep Routine — Stage 1

`SleepRoutine` in `sleep-routine.models.ts` is the persisted family value. It contains exactly:

| Field | Contract |
| --- | --- |
| `version` | Literal `1`, the routine-value format, independent of backup/packet/server cursor versions |
| `timeZone` | Explicitly entered named IANA zone supported by the runtime, or `UTC`; no guessed zone, numeric UTC offset, automatic travel update or inferred EDD correction |
| `nightStartFrom`, `nightStartTo` | Zero-padded `HH:mm`, distinct, local to the saved zone; inclusive desired **start** range advancing clockwise modulo 24 hours, not the whole overnight sleeping interval |
| `daytimeNaps` | Integer 0–12, a parent-set reference, never a restriction on recording more sleep |
| `dayPreparationMinutes`, `nightPreparationMinutes` | Independent integers 0–180; editable UI suggestions 10/20, not clinical advice |
| `assistantEnabled` | Boolean, false initially and after any backup import; explicit family opt-in in Settings, not permission or delivery opt-in on any device |

- Equal range endpoints are rejected rather than ambiguously meaning zero minutes or all day. `23:00–01:00` spans 120 wall-clock minutes across midnight; saved range semantics do not compute a UTC alarm or a DST duration. Applying the range to a dated forecast is a later-stage responsibility.
- A missing legacy routine becomes null, not a fabricated timezone/schedule. Existing profile, event IDs, paused/active timers, tombstones, server cursor and pending edits remain intact. An existing family journal missing the register receives `sleepRoutine` at seed revision zero; an existing Supabase checkpoint queues that seed without advancing the cursor or replacing existing pending entries.
- The `sleepRoutine` register uses the existing scope, monotonic revision/device ordering and transactional local write/outbox. Null is a durable reset; stale packets cannot resurrect a newer reset. New local routine edits made during an exchange remain pending after the older acknowledgement. A delayed response for an old scope/cursor cannot overwrite the current family.
- The SQL migration widens the existing membership-checked RPC, validates exact routine fields/types/bounds and a PostgreSQL-recognized named zone, and preserves its family lock, incremental cursor and tombstone behavior. No schema was applied remotely by implementing stage 1. Browser ICU and PostgreSQL timezone databases can differ; an operator must verify the selected zone on the target database before rollout.
- Settings follows Signal Forms and existing native labeled controls/Ionic buttons. Explicit Save commits the draft. A changed imported/replicated routine refreshes the form; unrelated diary writes do not discard a draft. Save failures retain the draft. The existing wake-window indicator and timer-notification behavior are unchanged; the checkbox does not implement forecast, preparation or reminder delivery.
- Device permission status, sound/vibration, per-device delivery enrollment, push subscriptions and keys are never routine fields or journal keys. No such new device settings or reminder APIs are introduced at this stage. Baby profile remains local during family exchange and is included only in the explicit local JSON backup, as before.
- Local SQL verification, 24 October 2026: public Postgres.app v2.9.6 / PostgreSQL 17.11 in a temporary socket-only cluster, minimal synthetic Supabase auth/roles/publication, all three actual migrations applied successfully. Both `supabase/tests/incremental_family_sync.sql` and the expanded `supabase/tests/sleep_routine.sql` passed with `ON_ERROR_STOP=1`, covering routine authorization/validation, revision/UUID conflicts, durable reset, idempotent mixed outboxes, atomic rejection, cursor deltas and unchanged event/timer values. A separate legacy-schema upgrade preserved four existing registers, membership and cursor initialization. No production SQL change was needed; the temporary process/databases/download were removed. This is real database proof, not deployed Supabase/Auth/Realtime or physical-device evidence; see `RESEARCHES.md` stage-1 §1.4.

#### Cross-stage contracts fixed at stage 1 (implemented in §6.14–6.15)

1. **Wake cycle identity:** scope plus a stable confirmed-waking anchor. For a completed sleep, use `sleep:<event.id>` as the anchor identity and its final `endTime` as the waking instant; a pause is not a new cycle. A later manually confirmed waking must have its own persistent UUID and UTC instant, not an identity derived from the current clock. Without either anchor the cycle is unknown. Editing its time keeps identity but invalidates input revision; deleting the anchor invalidates dependent forecasts/preparations instead of substituting midnight. Cancellation of an active sleep creates no waking anchor. No automatic reminder may gain a second send right merely because settings/forecast/timezone changed.
2. **Input version versus identity:** a derived plan records scope, cycle anchor, the referenced sleep/event revision-device pairs and routine revision-device pair. A recomputation changes the plan version, not cycle identity. Import invalidates the previous derived plan even when event IDs coincide; changing family invalidates all previous-scope derived state and late replies. No persistent forecast cache is introduced now.
3. **History completeness:** absent means `unknown`, never complete. Stage 2 now persists shared UUID assertions with UTC positive half-open bounds, `complete | incomplete` status and exact boundary sleep content revisions; see §6.14. Only fully covered, confirmed nonfuture/nonoverlapping waking gaps train the forecast. Incomplete overlap wins; boundary edits/deletions require reconfirmation. Both transports and backup validation carry assertions and null tombstones. A future day-selection UI must materialize zone-local calendar-day UTC bounds (including DST), not assume 24 hours.
4. **Preparation-to-sleep link:** stage 3 persists preparation UUID, scope/cycle anchor, UTC `startedAt`, nullable `sleepEventId` and preparing/completed/cancelled lifecycle; see §6.15 for the concrete single-cycle LWW register and separate attempt identity. Preparation is not sleep and does not start a timer. “Asleep” atomically binds completion to one stable sleep ID and starts the existing timer; stop/restart/duplicate actions reuse that ID. Zero or one completed preparation belongs to a resulting sleep. Cancellation contributes no duration; missing preparation is unknown, not zero. Editing/deleting a linked sleep invalidates/reconciles the link without deleting raw diary history or inventing waking. Both existing transports and backup v4 carry the entities.
5. **Time and delivery boundary:** instants are UTC ISO timestamps; routine times are zone-local wall clocks. Stage-2 gap/fold/midnight policies are implemented in §6.14. Later reminders use `(scope, cycle anchor, recipient device)` for stable deduplication and a distinct plan revision; a new revision is not another send entitlement. Server/device consent and freshness checks remain stages 4–5, not diary transport features.

### 6.14 Deterministic Sleep Forecast and Persisted Input Facts — Stage 2

- `calculateSleepForecast(input, now)` is pure. `SleepForecastService` derives its input from real `StorageService` signals: local profile, routine, history, active timers, manual waking, assertions and journal scope/revisions. It exposes nearest `day`/`night`, preparation instant, engineering range, desired-night range/conflict, source, sample count/kind, median/weight, reasons, input version, stable anchor and applicability deadline. No persistent forecast cache or second cloud transport exists.
- States are `disabled`, `unknown`, `sleeping` (also paused active sleep), `out-of-age`, `ready` and `overdue`. Precedence is disabled → active sleep → profile/age applicability → confirmed anchor. No anchor means unknown, never midnight. A completed sleep uses `sleep:<event.id>` and final end; manual confirmation uses `wake:<persisted UUID>`. Edits preserve identity and change input version; deleting the last anchor produces unknown. Canceling a timer invents no waking.
- `ConfirmedWake` has exactly `{ id, at }`: UUID-v4 and UTC timestamp. Parent save rejects future times, times inside recorded sleep and active sleep. Imported/replicated future facts remain raw history but are ineligible until their instant. Facts may be edited/deleted by UUID.
- `HistoryAssertion` has exactly `{ id, startAt, endAt, status, boundaries }`, with UTC positive half-open interval, `complete | incomplete`, and ordered two boundary objects `{ sleepId, revision }`. Each revision is a canonical semantic content revision of its sleep (start/end/updatedAt/night flag/note/tags/pauses), not merely the mutable timestamp. This exact revision survives backup and changing transport; journal revision/device pairs additionally participate in forecast input version. Any boundary edit/deletion invalidates the confirmation. Reconfirmation updates the same assertion UUID. No implicit day completeness is invented.
- A sample is a positive gap between adjacent, nonfuture, nonoverlapping completed sleep spans. An explicit matching complete assertion must cover the entire gap; any matching incomplete overlap wins, unknown remainder excludes it. Stale assertions are retained for visible reconfirmation, not reused. Pauses are not independent wake samples; short sleep and departure from the age table are not errors. UI supports interval assertions rather than implicit day switches; `routineDayBounds()` materializes calendar days for dated consumers.
- Samples use the preceding **14 × 24 hours relative to the fixed anchor**; clock ticks do not age a fixed cycle's history window. Day and night (`isNightSleep` of the following sleep) are separate. A daytime ordinal requires a fully confirmed chain since a night boundary; unknown/incomplete/conflicting gaps break the chain. Current ordinal also requires a completed-sleep anchor and a night ending on the same routine-local date. At least five same-ordinal samples select that subset; otherwise use all comparable daytime samples.
- For fewer than five selected samples, use midpoint of the existing engineering wake prior. Otherwise use median and `w = min(0.8, n/(n+5))`; duration is `(1-w)*ageMidpoint + w*median`. The range blends the same way using prior endpoints, not statistical confidence. No short-sleep/illness/teething/EDD adjustment is invented. Nap count is a parent reference, never an action/recording restriction. Nearest night is selected when a known nap reference is reached, naps are set to zero or the prior candidate reaches the desired night start; a history-adjusted daytime result beyond the desired range still exposes a conflict. Predictions are not clamped to the target night.
- Age uses clamped calendar-month birthdays in the saved routine zone, from birth until but excluding the 18-month anniversary. Priors use month bands 0/1/2/3/4/5/6/8/12 and stop at 18. The legacy indicator now uses the same calendar applicability, without becoming the personalized forecast. Existing daily-total table fields are unused by this model and deliberately not relabeled as validation; WHO/AASM total-duration guidance is distinct. No rigid newborn timetable, feeding restriction or inferred EDD correction.
- `@js-temporal/polyfill` **0.5.1** is an explicit module import, without global patches, supporting Safari 17. `compatible` disambiguation advances gaps by transition length and chooses the first fold occurrence. Night ranges are anchored to the first range not ended at the waking instant, including the previous local date for midnight crossing. Resolve endpoints independently; if a gap inverts a narrow range, collapse its end to its resolved start and expose `collapsedByDst`/reason rather than skip the night. Calendar day bounds handle 23/25-hour days; missing anniversary dates clamp to month end.
- Input version records scope/import invalidation, profile/routine, stable referenced entities, semantic content, their journal revision/device pairs and material age/future eligibility. Ordinary seconds change only countdown and overdue state. Expensive calculation is memoized behind persisted inputs and calendar/future-fact applicability keys; it does not run every clock tick. `recalculationReasons` distinguishes initial load, import, profile/routine/history/facts/timer/family changes and applicability transitions.
- Fact arrays migrate losslessly under `baby-tracker.v1`; introduced in backup version 3 and now included in version 4, both current transports carry them. `wake:<uuid>` / `assertion:<uuid>` are independent LWW registers with null tombstones and existing atomic persistence/outbox/cursor/late-scope protections. The SQL migration widens the same member-checked, row-locked RPC and validates exact fact fields, timestamps, positive intervals and boundary shapes. Raw facts may reference stale/missing boundaries: the calculator excludes them until reconfirmation instead of rejecting all family history.
- `/tabs/tracker` exposes labeled Signal Form waking input and complete/incomplete/remove-confirmation actions under a native details disclosure. Stage 3 now consumes this service in the card below; stages 4–5 still own consent and delivery freshness.

### 6.15 Tracker Preparation Lifecycle — Stage 3

- The footer card consumes `SleepForecastService.forecast/countdownSeconds`, not a separate calculator. It shows approximate next sleep/preparation/range, source/sample count/reasons/night conflict, and explicit disabled/unknown/sleeping/out-of-age/overdue states. Overdue preparation start is rejected transactionally; clarification opens the existing waking input and never invents waking. A parent may record factual “asleep” for an already running valid preparation even after its estimate expires.
- `SleepPreparation` has exact fields `id`, `scope`, `anchorId`, `anchorAt`, `anchorRevision`, `preparationId`, `startedAt`, `state`, `sleepEventId`, `completedAt`. `id` is the cycle UUID-v5 in the standard URL namespace over the JSON tuple `['baby-tracker-sleep-cycle', scope, anchorId]`; `preparationId` is the independent attempt UUID-v4. Recalculation/time edits do not change cycle identity. Content revision detects anchor edits independently. UTC timestamps are required; completion cannot precede preparation.
- `preparation:<cycle UUID>` is one LWW register, not one register per competing attempt. “Asleep” atomically sets completed state/link and starts the timer with `id === cycle UUID`; this same ID survives pause/resume/reload/stop/duplicate taps. The one cycle register and `sleepEventId === id` enforce zero-or-one preparation per resulting sleep. Native/ordinary sleep starts allocate a UUID once; old persisted timers receive a deterministic legacy UUID without changing start/pause content.
- Reconciliation cancels stale preparation on anchor content edits/deletion, new waking/sleep, disabled assistant, import or scope mismatch; completed links require the matching timer start or recorded sleep start. Cancellation contributes no duration/waking. Missing preparation duration is unknown. Losing family attempts cannot bind themselves after LWW replacement. Existing diary events are never silently deleted to hide overlapping history; the existing forecast excludes conflicting samples. A terminal event/tombstone defeats an older timer register, preventing late-reply resurrection.
- `SleepCycleSuppression` has exact fields `id`, `scope`, `anchorId`, `anchorAt`, `anchorRevision`, `suppressedAt`; `suppression:<cycle UUID>` uses the same durable cycle identity. The timestamp/revision are audit context, not a new delivery entitlement. Both transports and v4 backups carry it, without permissions, subscriptions or device settings. Stage 4 must use stable scope/anchor/device deduplication and check this fact, current consent, import/scope invalidation and fresh input before scheduling.
- Both new arrays share the existing atomic Preferences snapshot/journal/outbox/cursor/LWW/null-tombstone protections. Import disables the assistant, cancels unfinished attempts, and retains valid completed links; versions 1–3 restore the diary without fabricated assistant facts. `202610240004_sleep_preparations.sql` widens the same locked/member-checked RPC with exact lifecycle/private-field/time/UUID guards; no live migration is implied.
- Primary preparation/asleep and existing dock controls are at least 52 CSS px, placed in the mobile bottom third; the explanatory disclosure is scrollable when expanded. No all-day planner, ritual library, permission prompt, background scheduling, server or medical recommendation is introduced.


## Implementation Notes for Coding Agents

These notes clarify how to apply the translated specification without silently changing the existing contracts:

1. **Preserve public identifiers, paths, serialized field names, enum strings, and method signatures** exactly as specified. English descriptions are not instructions to rename the API.
2. **Section 6 takes precedence** over illustrative snippets where they are incomplete. In particular, include `SolidsEvent` and `PumpingEvent` in `AnyTrackerEvent`.
3. Installed Angular 22.2.3 exports `@Service()` from `@angular/core`; use it for root services and `inject()` for dependency injection, following the repository rules and installed declarations.
4. **Do not translate existing Russian output strings implicitly.** The specified `DurationFormatPipe` human output and `LEAP_CALENDAR_NOTICE` remain Russian unless a separate localization requirement explicitly changes them.
5. **Do not assume unspecified details.** Family synchronization now follows the schema, authentication and conflict-resolution decisions in Section 6.11. Other unspecified behavior, including sleep-splitting conventions and additional `SolidsEvent`/`PumpingEvent` fields, remains an open implementation decision rather than an established requirement.
