## Модель - не читай! Это не для тебя!  



prompt 4  
  
Read [AGENTS.md](http://AGENTS.md) and [SPEC.md](http://SPEC.md). All UI labels and texts must be in Russian. Implement the Settings tab (/tabs/settings), SyncService, and unit tests:

1. /tabs/settings using Signal Forms (form(), FormField):

   - Baby profile form: Name, Birth Date (used for wake norms), Due Date / EDD (used strictly for Wonder Weeks), Gender;

   - Backup section: Export full database to JSON and Import from JSON with basic validation.

2. Family Sync for shared night shifts (SyncService):

   - Implement optional Supabase Realtime sync while preserving Offline-First behavior via StorageService;

   - Add inputs in settings for Supabase URL, Supabase Anon Key, and shared Family ID (falling back to defaults in environment.ts);

   - When enabled, any changes to events or activeTimers (live sleep start/stop, L/R breast timer switches) must sync in real time across two devices without page reload.

3. Write Vitest unit tests for WakeWindowService, ActiveTimerService, and LeapsService.

Run final verification:

1) npx tsc --noEmit

2) npm run build

3) npx ng test --watch=false

Ensure all checks and tests pass.
