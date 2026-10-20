

# [AGENTS.md](http://AGENTS.md) — Baby Tracker Development Rules (Angular 22 + Ionic 9 + Capacitor 8)

## 1. Technology Stack &amp; Environment

\* **Runtime:** Node.js 22+ and TypeScript 6.0+.

\* **Framework:** Angular v22 (Zoneless by default, Standalone &amp; OnPush by default).

\* **UI Framework:** Ionic Framework v9 (`@ionic/angular/standalone`).

\* **Native Runtime:** Capacitor v8 (`@capacitor/core`, `@capacitor/preferences`, `@capacitor/local-notifications`, `@capacitor/haptics`).

\* **State Management:** Native Angular Signals only (`signal`, `computed`, `linkedSignal`, `effect`, `resource`).

\* **Test Runner:** Vitest (via `npx ng test --watch=false`).

---

## 2. Strict Angular v22 Code Rules

### Zoneless &amp; Change Detection

\* The project runs without `zone.js`. **DO NOT** add `zone.js` to polyfills or invoke `provideZoneChangeDetection()`.

\* In Angular v22, `ChangeDetectionStrategy.OnPush` is enabled by default for all components — **DO NOT** declare it manually in the `@Component` decorator.

\* It is **STRICTLY FORBIDDEN** to use `ChangeDetectionStrategy.Eager` (formerly Default) or inject/access `NgZone`.

### Services &amp; Dependency Injection

\* For all root services, use the `@Service()` decorator from `@angular/core` (instead of `@Injectable({ providedIn: 'root' })`).

\* Dependency injection must be performed strictly via `inject()` (or `injectAsync()` for heavy lazy-loaded services). Constructor injection is forbidden.

### State &amp; Asynchrony (Signal-First)

\* Exclusively use Angular Signals: `signal()`, `computed()`, `linkedSignal()`, `effect()`, `debounced()`.

\* For asynchronous data reads from `@capacitor/preferences` or cloud backends (Supabase), use the stable `resource()` API (or `httpResource()`) instead of `ngOnInit` with manual loading flags.

\* Component inputs and outputs must strictly use signal functions: `input()`, `input.required()`, `output()`, and `model()`.

### Forms (Signal Forms)

\* Use the stable Signal Forms API (`form()` and the `FormField` directive from `@angular/forms/signals`) for all input modals (manual sleep entry, bottle volume, weight/height, baby profile, and due date/EDD).

\* **FORBIDDEN:** Importing `ReactiveFormsModule`, `FormsModule`, `FormBuilder`, `FormGroup`, `FormControl`, or `ngModel`.

### Templates &amp; Routing

\* Use only built-in control flow syntax (`@if`, `@for`, `@switch`, `@let`). The legacy structural directives `*ngIf`, `*ngFor`, and `*ngSwitch` are forbidden.

\* In Angular v22, router parameters are inherited across the entire tree by default (`paramsInheritanceStrategy: 'always'`). Read route parameters directly through component `input()` signals (`withComponentInputBinding()`).

### Ionic v9 Imports

\* **ALWAYS** import UI components individually and strictly from `@ionic/angular/standalone` (e.g., `import { IonContent, IonButton, IonModal } from '@ionic/angular/standalone'`).

\* **DO NOT** import `IonicModule` from `@ionic/angular`.

\* All icons used from `ionicons/icons` must be explicitly registered via `addIcons({ ... })` from `ionicons`.

---

## 3. Mobile UX &amp; Business Logic Rules

### Timestamp-Based Timers (OS Background Process Kill Resilience)

\* **DO NOT** increment timer seconds for sleep or feeding via a local variable counter (`seconds++`) inside `setInterval`. Both Android and iOS freeze the WebView when the app is backgrounded.

\* Store the exact `startedAt: string` (ISO format) and accumulated seconds from previous intervals in state and persistent storage.

\* To refresh the UI once per second, use a centralized `ClockService` exposing a `now = signal([Date.now](http://Date.now)())` signal paired with a `visibilitychange` listener. Derive the duration reactively using `computed(() => Math.floor(([this.clock.now](http://this.clock.now)() - startMs) / 1000))`.

### One-Handed &amp; Night-First UI (3 AM Mode)

\* The app is designed for one-handed nighttime use while holding an infant. All primary action buttons (Sleep, Left/Right Breast, Bottle, Diaper) must have a minimum tap target height of **52px** and reside in the **bottom third of the screen**.

\* Enable deep dark mode by default (OLED-friendly dark mode, using the `ion-palette-dark` class). Avoid stark white backgrounds and diminutive controls.

### Native Platforms Folder

\* **DO NOT** manually modify generated code inside `android/` and `ios/`, with the exception of standard permission manifests (`AndroidManifest.xml`, `Info.plist`) when explicitly required by a Capacitor plugin.

---

## 4. Agent Verification Loop

After completing each discrete development task, the agent **MUST** run the following commands sequentially:

1. `npx tsc --noEmit` — verify zero TypeScript 6.0+ type errors.

2. `npm run build` — confirm the Angular v22 production bundle compiles cleanly with no `@ionic/angular/standalone` import issues.

3. `npx ng test --watch=false` — ensure all Vitest unit tests pass.  
  
Security Policy

This repository contains confidential source code.

Rules:

- Never read, print, summarize, or transmit .env files.
- Never access private keys, tokens, certificates or credentials.
- Never send source code to third-party services.
- Do not use web search with proprietary code.
- Do not upload code to external services.
- Never include secrets in logs, commits or error reports.
- Minimize source code included in model context.
- Ask for explicit approval before network access.
- If a task requires restricted files, stop and ask.

