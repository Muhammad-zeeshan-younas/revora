import { PageId } from './ui.enums';
import type { IconName } from '../components/ui/UiIcon.vue';
import type { Page } from '../types';

export enum NavigationGroup {
  Workspace = 'WORKSPACE',
  Intelligence = 'INTELLIGENCE',
}

export interface NavigationItem {
  page: Page;
  label: string;
  icon: IconName;
  group: NavigationGroup;
}

interface PageMetadata {
  title: string;
  description: string;
}

export const navigation: readonly NavigationItem[] = [
  { page: PageId.Overview, label: 'Overview', icon: 'grid', group: NavigationGroup.Workspace },
  { page: PageId.Customers, label: 'Customers', icon: 'users', group: NavigationGroup.Workspace },
  { page: PageId.Invoices, label: 'Invoices', icon: 'invoice', group: NavigationGroup.Workspace },
  {
    page: PageId.Orders,
    label: 'Orders & stock',
    icon: 'package',
    group: NavigationGroup.Workspace,
  },
  {
    page: PageId.Collections,
    label: 'Collections',
    icon: 'wallet',
    group: NavigationGroup.Workspace,
  },
  { page: PageId.Payments, label: 'Payments', icon: 'payments', group: NavigationGroup.Workspace },
  {
    page: PageId.Credit,
    label: 'Credit management',
    icon: 'shield',
    group: NavigationGroup.Intelligence,
  },
  {
    page: PageId.Activity,
    label: 'Activity center',
    icon: 'sparkle',
    group: NavigationGroup.Intelligence,
  },
];

export const pageMetadata: Record<Page, PageMetadata> = {
  overview: {
    title: 'A clearer view. A stronger business.',
    description: 'Here’s where your money stands. And where it goes next.',
  },
  customers: {
    title: 'Customers',
    description: 'Every relationship, with the full financial picture.',
  },
  invoices: {
    title: 'Invoices',
    description: 'Keep every invoice accounted for, from issued to settled.',
  },
  orders: {
    title: 'Orders & stock',
    description: 'Reserve stock and credit together, then dispatch with an invoice.',
  },
  collections: {
    title: 'Collections',
    description: 'The right follow-up, with the right customer, at the right time.',
  },
  payments: {
    title: 'Payments',
    description: 'Turn incoming payments into reconciled peace of mind.',
  },
  credit: {
    title: 'Credit management',
    description: 'Grow your relationships. Keep exposure in perspective.',
  },
  activity: {
    title: 'Activity center',
    description: 'A transparent record of every action in your workspace.',
  },
  settings: { title: 'Settings', description: 'Your workspace, your team, your collection rules.' },
};
