export const BRAND = {
  name: 'Ravel',
  fallbackName: 'TapSpan',
  parent: 'LifeOS',
  module: 'Money',
  tagline: 'Record in seconds. Keep the whole picture.',
  promise: 'Know where you stand.',
  hero: 'Your money doesn’t live in one place. Your ledger can.',
  description:
    'Track cash, cards, currencies and everyday spending in one local-first personal ledger.',
  longDescription:
    'One personal ledger for money across currencies, cards, cash and places. Fast to capture, works offline, and stays under your control.',
} as const;

export type Brand = typeof BRAND;
