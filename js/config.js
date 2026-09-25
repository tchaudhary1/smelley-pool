// Public configuration. The Supabase anon key is designed to be public; the database's
// row-level security (supabase/schema.sql) is what keeps data behind the family login.
// Leave SUPABASE_URL empty to run in local preview mode (reads ./local-data/, any password).
export const SUPABASE_URL = 'https://zivdbnkmgogmyclewabr.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_4onxoj68g8spadHL7jkGjA_5sxM4hnY';

// Family members sign in with their own email (invite-only; see tools/setup-users.mjs).

export const CURRENT_WEEK = 4;
export const SEASON = 2026;

// The family group. Full pool-sheet names are not kept in this public repo: they come from
// the database (profiles.pool_name) after login, or local-data/roster.json in preview.
export const FAMILY = [
  { key: 'jamie',   short: 'Jamie',   pool: null, color: '#c28a2c', icon: '🍑' },
  { key: 'debbie',  short: 'Debbie',  pool: null, color: '#a4462c', icon: '🚂' },
  { key: 'bobby',   short: 'Bobby',   pool: null, color: '#6e4a2e', icon: '🦬' },
  { key: 'shannon', short: 'Shannon', pool: null, color: '#2f7f7a', icon: '⚾' },
  { key: 'joe',     short: 'Joe',     pool: null, color: '#4f6d8f', icon: '🏈' },
  { key: 'tarun',   short: 'Tarun',   pool: null, shadow: true, color: '#7a6aa8', icon: '🪶',
    label: 'Shadow card', note: 'Watson–Tarun shadow card — tracked for fun, not an official pool entry.' },
];

// The chat bot (tools/commentator.mjs). Not a pool entry.
export const BOT = { key: 'commentator', short: 'The Commentator', initial: '🎙️', color: '#1d2b4a', bot: true };

export const MOTTO = 'NULLUM PRAESIDIUM SECURUM EST';
export const MOTTO_EN = 'No lead is safe';
export const REACTIONS = ['🔥', '😂', '💀', '🍑', '🦬', '🚂', '🙏', '👀'];
