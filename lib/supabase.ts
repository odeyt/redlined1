import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  // Read from runtime globals injected by app/layout.tsx <script> tag.
  // Falls back to build-time NEXT_PUBLIC_* baking if globals aren't set yet
  // (e.g. during SSR or early module eval before the script runs).
  const w = typeof window !== 'undefined' ? (window as any) : undefined;
  const url = (w?.__SB_URL__ || process.env.NEXT_PUBLIC_SUPABASE_URL) as string;
  const key = (w?.__SB_KEY__ || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) as string;
  return createBrowserClient(url, key);
}

// Lazy singleton — defers createBrowserClient() until first property access.
let _instance: ReturnType<typeof createClient> | undefined;
function getInstance() {
  if (!_instance) _instance = createClient();
  return _instance;
}

export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop: string | symbol) {
    const inst = getInstance();
    const val = (inst as any)[prop];
    return typeof val === 'function' ? (val as Function).bind(inst) : val;
  },
});
