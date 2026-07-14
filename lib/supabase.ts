import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Lazy singleton — defers createBrowserClient() until first property access.
// Prevents build-time failures when NEXT_PUBLIC_* vars are not yet baked in
// during Next.js page-data-collection phase.
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
