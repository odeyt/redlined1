/**
 * Creates (or resets) the dedicated E2E audit test account.
 * Writes credentials to .env.e2e.local (gitignored).
 *
 * Usage:  node scripts/create-e2e-test-account.js
 *
 * Safe to rerun — idempotent. If the account already exists it resets the
 * password and re-confirms email so the audit suite can log in immediately.
 */

const fs   = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const TEST_EMAIL    = 'e2e-audit@redlined1.com';
const TEST_PASSWORD = 'E2eAudit#2024!';
const TEST_SHOP     = 'E2E Audit Shop';

const headers = {
  'Content-Type':  'application/json',
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'apikey':        SERVICE_KEY,
};

async function adminFetch(method, path, body) {
  const url = `${SUPABASE_URL}/auth/v1/admin${path}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: res.status, body: json };
}

async function dbFetch(method, table, body, query = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  const res = await fetch(url, {
    method,
    headers: { ...headers, 'Prefer': 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

async function main() {
  console.log('\n=== Redlined1 E2E Test Account Setup ===\n');

  // 1. Look for existing user
  const list = await adminFetch('GET', `/users?page=1&per_page=50`);
  const users = list.body?.users ?? [];
  let user = users.find(u => u.email === TEST_EMAIL);

  if (user) {
    console.log(`User already exists: ${TEST_EMAIL} (${user.id})`);

    // Reset password + confirm email
    const update = await adminFetch('PUT', `/users/${user.id}`, {
      password:      TEST_PASSWORD,
      email_confirm: true,
    });
    if (update.status !== 200) {
      console.error('Failed to reset user:', JSON.stringify(update.body));
      process.exit(1);
    }
    console.log('Password reset + email confirmed.');
  } else {
    // 2. Create user
    const create = await adminFetch('POST', '/users', {
      email:         TEST_EMAIL,
      password:      TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'E2E Audit User', shop_name: TEST_SHOP },
    });

    if (create.status !== 200 && create.status !== 201) {
      console.error('Failed to create user:', JSON.stringify(create.body));
      process.exit(1);
    }
    user = create.body;
    console.log(`Created user: ${TEST_EMAIL} (${user.id})`);
  }

  const userId = user.id;

  // 3. Ensure profile has plan='free'
  const profileCheck = await dbFetch('GET', 'profiles', null, `?id=eq.${userId}&select=id,plan`);
  const profileExists = Array.isArray(profileCheck.body) && profileCheck.body.length > 0;

  if (profileExists) {
    await dbFetch('PATCH', 'profiles', { plan: 'free', trial_ends_at: null }, `?id=eq.${userId}`);
    console.log('Profile updated → plan=free, trial_ends_at=null');
  } else {
    await dbFetch('POST', 'profiles', { id: userId, plan: 'free', trial_ends_at: null });
    console.log('Profile created → plan=free');
  }

  // 4. Ensure shop + owner membership exist
  const shopCheck = await dbFetch('GET', 'shop_users', null, `?user_id=eq.${userId}&role=eq.owner&select=shop_id`);
  let shopId;

  if (Array.isArray(shopCheck.body) && shopCheck.body.length > 0) {
    shopId = shopCheck.body[0].shop_id;
    console.log(`Shop already exists: ${shopId}`);
  } else {
    const shopCreate = await dbFetch('POST', 'shops', { name: TEST_SHOP });
    if (!Array.isArray(shopCreate.body) || !shopCreate.body[0]?.id) {
      console.error('Failed to create shop:', JSON.stringify(shopCreate.body));
      process.exit(1);
    }
    shopId = shopCreate.body[0].id;
    console.log(`Shop created: ${shopId}`);

    // Create owner membership
    await dbFetch('POST', 'shop_users', { user_id: userId, shop_id: shopId, role: 'owner' });
    console.log('Owner membership created');
  }

  // 5. Write .env.e2e.local
  const envPath = path.resolve(__dirname, '../.env.e2e.local');
  const envContent = `# E2E audit test account — DO NOT COMMIT
PLAYWRIGHT_TEST_MODE=local
PLAYWRIGHT_BASE_URL=http://localhost:3000

E2E_TRIAL_USER_EMAIL=${TEST_EMAIL}
E2E_TRIAL_USER_PASSWORD=${TEST_PASSWORD}

E2E_ALLOW_MUTATIONS=true
E2E_ALLOW_DESTRUCTIVE_ACTIONS=false
E2E_ALLOW_AI_CALLS=false
E2E_ALLOW_CHECKOUT=false
`;

  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log(`\n.env.e2e.local written (gitignored)`);

  console.log('\n=== Setup complete ===');
  console.log(`Email:   ${TEST_EMAIL}`);
  console.log(`Shop ID: ${shopId}`);
  console.log('\nRun audit tests:');
  console.log('  npx playwright test --project=audit');
}

main().catch(err => { console.error(err); process.exit(1); });
