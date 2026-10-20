import type { Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

export const routes: Routes = [
  {
    path: 'tabs',
    component: TabsPage,
    children: [
      {
        path: 'tracker',
        loadComponent: () => import('../features/tracker/tracker.page').then(m => m.TrackerPage),
      },
      {
        path: 'stats',
        loadComponent: () => import('../features/stats/stats.page').then(m => m.StatsPage),
      },
      {
        path: 'leaps',
        loadComponent: () => import('../features/leaps/leaps.page').then(m => m.LeapsPage),
      },
      {
        path: 'settings',
        loadComponent: () => import('../features/settings/settings.page').then(m => m.SettingsPage),
      },
      {
        path: '',
        redirectTo: '/tabs/tracker',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: '',
    redirectTo: '/tabs/tracker',
    pathMatch: 'full',
  },
];
