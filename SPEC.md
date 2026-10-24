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
- The stored snapshot contains **`profile`**, **`events`**, and **`activeTimers`**.
- Callers may await `ready()` before operations. Load state is exposed through `isLoading()` and `error()`.
- `saveProfile()`, `saveEvent()`, `deleteEvent()`, and transactional `update()` return `Promise<void>`.
- Write operations are serialized. Reactive signals update **only after a successful persistent write**; write errors propagate to callers.
- `saveEvent()` inserts or replaces an event by `id`. **Array order does not establish chronological order.**
- `exportBackup()` returns JSON containing `version: 1` and `exportedAt`.
- `importBackup(json)` validates the **entire document before writing**, then completely replaces profile, events, and timers. Reject corrupt documents, unsupported versions, duplicate IDs, and invalid dates **without modifying persisted data**.

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
- JSON export downloads the complete version-1 tracker database: profile, events and active timers. Connection settings and internal replication metadata are deliberately excluded. Import validates the entire document before offering explicit replacement confirmation; persistence failures preserve the current database and entered form values.
- Family settings contain an enable checkbox, Supabase project URL, masked public anon key and shared random UUID-v4 family ID, with a button to generate the latter. Empty overrides resolve independently through `environment.supabase.{url,anonKey,familyId}` in development and production. Defaults are empty and synchronization is disabled unless explicitly enabled.
- Configuration is persisted separately under `baby-tracker.sync.v1`. Never enter a service-role key. The shared family ID is an invitation secret: anyone who obtains it can join that family. Do not embed a private family ID in a publicly distributed application build.

### 6.11 Family Synchronization Deployment and Conflict Contract

1. Create a Supabase project and enable **Authentication → Anonymous Sign-Ins**. Apply `supabase/migrations/202610200001_family_sync.sql`, then `supabase/migrations/202610240001_incremental_family_sync.sql`. For an existing installation apply only the second, unapplied migration; never rerun the initial schema after upgrading.
2. The final schema has `tracker_families` (family UUID and server version only), `tracker_family_members`, and private `tracker_family_entries` (one latest register and last-changed server version per key). Member-only SELECT policies protect family metadata. Authenticated `join_tracker_family` and `exchange_tracker_family` RPCs enforce membership; direct client writes and direct register reads are not granted. Only the small family metadata row is in the `supabase_realtime` publication. Anonymous authentication supplies a device user; joining requires possession of the random shared family ID.
3. Enter the same project URL, public anon key and family ID on both devices, then enable synchronization. HTTPS is required except for loopback development servers. Each device retains its own baby profile; shared state comprises events and both active timers.

- `SyncService` starts with the application, not only when Settings opens. Postgres Changes carries only family metadata and triggers reconciliation when its version exceeds the durable local cursor. A 10-second catch-up interval runs only while the document is visible; visibility restoration and network restoration trigger immediate catch-up. Hidden documents start no new exchanges, although an in-flight response can still commit.
- `exchange_tracker_family(target_family, since_version, incoming)` accepts only the durable outbox, returns `{ version, entries }` for registers changed after the cursor, and returns an empty entries object on an unchanged poll. A cursor of zero fetches the initial snapshot. One family row lock covers incoming merges, a single server-version increment per changed transaction, and the delta read, so acknowledging a response cannot skip another committed write. Replaying an accepted write is idempotent. The per-register latest version is indexed; tombstones remain available to old/offline clients without retaining an unbounded transaction log.
- Local storage remains authoritative for UI availability: writes are committed before signals change, without waiting for the network. The per-entity journal, Supabase cursor and pending registers are saved in the **same** `baby-tracker.v1` snapshot as events/timers. A response acknowledges only the revision/device pairs actually sent; edits made during the request remain pending. A failed local response commit leaves both cursor and outbox unchanged. Remote merges do not create local revisions. Old local journals initialize a version-zero outbox once; reconnects and process restarts preserve its checkpoint. Supabase metadata is separate from transport-independent journal packets and excluded from JSON backups.
- Events are merged independently by ID; deletions are retained as null-valued tombstones. Sleep and breastfeeding are separate registers, preserving timestamp-based elapsed time, side switches and pauses. Stopping a timer sends its completed event and cleared timer in one SQL merge transaction.
- Revisions advance monotonically from the device clock and all observed revisions; a device UUID breaks equal-revision ties. Different events are retained; conflicting edits to the same event or timer converge to the greater revision/UUID pair. This is deterministic conflict resolution, not a guarantee of real-world ordering between offline devices with skewed clocks.
- The SQL row lock prevents simultaneous requests from overwriting unrelated changes. Existing local data seeds a newly selected family, but previously synchronized remote revisions take precedence over seed values. Changing the project/family selects a new replication scope; delayed responses from another scope are ignored.
- Importing a backup while synchronization is enabled replaces local data and publishes corresponding event deletions and timer changes to the family. Disable synchronization first if a restore must remain local. Network errors leave the durable journal intact and expose Russian status/error text; credentials are never included in error messages.
- Clean cutover requires both phones to finish the old exchange where possible, export backups and disable synchronization before applying the incremental migration. The migration preserves existing registers/memberships and removes the old `merge_tracker_family` RPC and journal column; old clients are deliberately not supported afterward. Install/publish the new clients before enabling synchronization again with the same family settings. A database schema change is not a completed PWA/APK deployment. See the Russian README for the operator sequence and local verification limits.
- `supabase/tests/incremental_family_sync.sql` exercises delta isolation, idle responses, replay, stale deletion protection, timer tie-breaking, new-device snapshots, offline additions, invalid inputs and access control in an isolated migrated database; synthetic users/data are rolled back.

### 6.12 Manual Yandex Disk Family Synchronization

- `/tabs/settings` provides an optional manual Yandex Disk connection alongside Supabase; the two transports are mutually exclusive. `YandexSyncService` initializes the durable replication scope at application startup but performs network exchange only on user action.
- Parents authorize independently with Authorization Code + PKCE S256 and the Yandex verification-code redirect. Client secrets are never requested or bundled. Native access tokens use the device-local secure-storage plugin; web sessions remain in memory and never use the plugin's plaintext web storage. Expired/revoked sessions require reauthorization.
- The selected private shared folder requires editing rights and a matching `baby-tracker-family.json` marker. Settings/checkpoints are stored under `baby-tracker.yandex.v1`; the family scope is `yandex-disk:<family UUID>`, independent of each participant's local folder path.
- Exchange downloads unprocessed immutable full-journal packets, validates every packet before one local merge, and uploads changed state under a new UUID filename with overwrite disabled. Packets include events, deletion tombstones and both timers, not the baby profile or credentials. Existing per-entry revision/device conflict resolution is reused.
- Upload failure does not acknowledge local changes; changes made during upload remain pending. Checkpoints persist only after the exchange succeeds. Reconnecting a newly initialized folder discards its old publication checkpoint. Old packets are not automatically pruned or end-to-end encrypted.
- A successful exchange covers packets visible to that read, not future or concurrent publications. Parents synchronize sequentially at handoff; concurrent button presses may require another exchange. See the Russian root `README.md` for OAuth registration, native setup, usage and privacy limitations.

## Implementation Notes for Coding Agents

These notes clarify how to apply the translated specification without silently changing the existing contracts:

1. **Preserve public identifiers, paths, serialized field names, enum strings, and method signatures** exactly as specified. English descriptions are not instructions to rename the API.
2. **Section 6 takes precedence** over illustrative snippets where they are incomplete. In particular, include `SolidsEvent` and `PumpingEvent` in `AnyTrackerEvent`.
3. **The source `ClockService` example uses `@Service()`**, which is not a standard Angular core decorator. Validate and use the appropriate Angular v22 injectable-service pattern (normally `@Injectable({ providedIn: 'root' })`) rather than copying an invalid decorator into production code.
4. **Do not translate existing Russian output strings implicitly.** The specified `DurationFormatPipe` human output and `LEAP_CALENDAR_NOTICE` remain Russian unless a separate localization requirement explicitly changes them.
5. **Do not assume unspecified details.** Family synchronization now follows the schema, authentication and conflict-resolution decisions in Section 6.11. Other unspecified behavior, including sleep-splitting conventions and additional `SolidsEvent`/`PumpingEvent` fields, remains an open implementation decision rather than an established requirement.
