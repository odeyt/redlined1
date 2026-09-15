import { homedir } from 'os';
import { join } from 'path';

/**
 * Where the demo owner's generated password lives: outside the repository,
 * readable only by the current account. Written by seed-demo-tenant.ts, read by
 * tests/marketing-capture/demo-session.prepare.ts.
 *
 * Its own module so the prepare step can import the path without loading the
 * seed script, which connects to production when run.
 */
export const CREDENTIAL_FILE = join(homedir(), '.redlined1-marketing', 'demo-owner.json');
