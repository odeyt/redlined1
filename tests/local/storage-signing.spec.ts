/**
 * Can we actually go private? — evidence before migration.
 *
 * The shop-assets bucket is public. Making it private means every read path
 * switches to createSignedUrl(). Signing is not free: on a private bucket the
 * caller needs SELECT on the object under storage.objects RLS. If no such
 * policy exists for authenticated users, every image in the app breaks the
 * moment the bucket flips — and we would find out in production.
 *
 * These tests answer three questions with evidence rather than assumption:
 *
 *   1. Can a signed-in shop owner sign a URL for their own object, and does
 *      that URL actually fetch?
 *   2. Can an anonymous caller sign one? (If yes, going private buys nothing.)
 *   3. Is signing scoped per shop, or can any authenticated user sign any
 *      path? (Determines whether private means "not on the open internet" or
 *      the stronger "only this shop".)
 *
 * Runs against whatever project .env.local points at. It uploads one small
 * probe object under its own synthetic shop and removes it; it never writes
 * to or deletes real shop data. The cross-shop check only READS a path.
 */
import { test, expect } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createSyntheticShop, destroySyntheticShop, SyntheticShop } from '../helpers/synthetic-shop';

const BUCKET = 'shop-assets';

// A 1x1 JPEG. Small enough to be free, real enough to pass the bucket's
// allowed_mime_types check.
const PIXEL = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
  'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);

let shop: SyntheticShop;
let admin: SupabaseClient;
let asOwner: SupabaseClient;
let anon: SupabaseClient;
let probePath: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  shop = await createSyntheticShop('storage-sign');

  admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );

  asOwner = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  const { error } = await asOwner.auth.signInWithPassword({
    email: shop.email,
    password: shop.password,
  });
  if (error) throw new Error(`could not sign in as the synthetic owner: ${error.message}`);

  probePath = `vehicles/${shop.shopId}-probe/pixel.jpg`;
});

test.afterAll(async () => {
  if (probePath) await admin.storage.from(BUCKET).remove([probePath]);
  if (shop) await destroySyntheticShop(shop);
});

test('a signed-in owner can upload to the bucket', async () => {
  // If this fails the INSERT policy is the blocker, not signing.
  const { error } = await asOwner.storage
    .from(BUCKET)
    .upload(probePath, PIXEL, { contentType: 'image/jpeg', upsert: true });
  expect(error, error ? `upload rejected: ${error.message}` : undefined).toBeNull();
});

test('a signed-in owner can sign a URL for their own object', async () => {
  // The load-bearing question. A failure here means the bucket cannot go
  // private until a SELECT policy exists on storage.objects.
  const { data, error } = await asOwner.storage.from(BUCKET).createSignedUrl(probePath, 60);
  expect(error, error ? `signing rejected: ${error.message}` : undefined).toBeNull();
  expect(data?.signedUrl).toContain('/object/sign/');
});

test('the signed URL actually serves the bytes', async () => {
  // Signing succeeding and the URL working are separate things.
  const { data } = await asOwner.storage.from(BUCKET).createSignedUrl(probePath, 60);
  const res = await fetch(data!.signedUrl);
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('image');
});

test('signing can be done in batch, which is how the app will use it', async () => {
  // A vehicle page renders many photos; one round trip per image would be
  // unusable. createSignedUrls is the batch form.
  const { data, error } = await asOwner.storage.from(BUCKET).createSignedUrls([probePath], 60);
  expect(error).toBeNull();
  expect(data?.[0]?.signedUrl).toBeTruthy();
  expect(data?.[0]?.error).toBeFalsy();
});

test('an anonymous caller cannot sign a URL', async () => {
  // If anon can sign, a private bucket is decorative — anyone with the
  // publishable key could mint URLs for anything.
  const { data, error } = await anon.storage.from(BUCKET).createSignedUrl(probePath, 60);
  const signed = !error && !!data?.signedUrl;
  expect(
    signed,
    'an anonymous caller was able to sign a URL — going private would not restrict reads',
  ).toBe(false);
});

test('records whether signing is scoped to the shop that owns the object', async () => {
  // Not an assertion about what SHOULD be — a measurement of what IS, so the
  // security claim we make afterwards is accurate. An authenticated user from
  // an unrelated shop attempting to sign a path they do not own.
  const other = await createSyntheticShop('storage-sign-other');
  const asOther = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  try {
    const { error: signInErr } = await asOther.auth.signInWithPassword({
      email: other.email,
      password: other.password,
    });
    expect(signInErr).toBeNull();

    const { data, error } = await asOther.storage.from(BUCKET).createSignedUrl(probePath, 60);
    const crossShopSigningAllowed = !error && !!data?.signedUrl;

    console.log(
      crossShopSigningAllowed
        ? '[storage] NOTE: any authenticated user can sign any path in shop-assets. ' +
          'Going private removes anonymous access but not cross-tenant access.'
        : '[storage] signing is scoped per shop — a user from another shop cannot sign this path.',
    );

    // Deliberately not asserting either way. Path-scoped storage policies are
    // a separate piece of work; this test exists so the report tells the truth.
    expect(typeof crossShopSigningAllowed).toBe('boolean');
  } finally {
    await destroySyntheticShop(other);
  }
});
