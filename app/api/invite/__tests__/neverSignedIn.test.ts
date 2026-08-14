/**
 * An invitee who has an account but has never used it.
 *
 * generateLink creates a real Supabase auth user as a side effect. So an
 * invitation that failed AFTER that point — a redirect URL nobody could open,
 * which is exactly what happened on 2026-08-14 — leaves an account behind with
 * no password.
 *
 * The next invitation then found a profile, took the "existing account"
 * branch, and emailed "Sign in with your existing Redlined1 account". The
 * invitee cannot: there is nothing to sign in with. Two technicians sat in
 * that state, unconfirmed and never signed in, while their invitations kept
 * arriving as sign-in prompts.
 *
 * The distinction that matters is not "does an account exist" but "can this
 * person get in".
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(__dirname, '..', 'route.ts'), 'utf8');
const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('an existing account that has never signed in', () => {
  it('is detected rather than assumed to have credentials', () => {
    expect(stripped).toMatch(/getUserById\(userId\)/);
    expect(stripped).toMatch(/neverSignedIn = !authUser\?\.user\?\.last_sign_in_at/);
  });

  it('gets a link that lets them choose a password', () => {
    // 'recovery', because Supabase refuses to 'invite' an address it already
    // knows — and recovery is the flow that ends at "set a password".
    expect(stripped).toMatch(/type: 'recovery'/);
    expect(stripped).toMatch(/next=\/reset-password/);
  });

  it('reports a failure to generate that link instead of sending nothing', () => {
    expect(stripped).toMatch(/recoveryError/);
  });
});

describe('which email is sent', () => {
  it('is decided by having a set-password link, not by the account being new', () => {
    // The bug: an existing-but-unusable account took the "sign in" branch
    // purely because isNewAccount was false.
    expect(stripped).toMatch(/if \(inviteActionLink\) \{/);
    expect(stripped).not.toMatch(/if \(isNewAccount && inviteActionLink\)/);
  });

  it('hands the owner the same link when the email fails to send', () => {
    // So an owner can pass it on directly rather than the invitee being stuck
    // behind a bounced email.
    expect(stripped).toMatch(/inviteActionLink \?\? loginUrl/);
  });

  it('still has a plain "you were added" email for someone who can sign in', () => {
    // Somebody who already uses Redlined1 should not be sent a password
    // reset they did not ask for.
    expect(src).toMatch(/You've been added to \$\{shopName\}/);
    expect(src).toMatch(/Sign in with your existing Redlined1 account/);
  });
});

describe('the account is still only created once', () => {
  it('does not invite an address that already has an account', () => {
    // That path is inside the else branch; inviting a known address fails.
    const existingBranch = stripped.slice(
      stripped.indexOf('if (existingProfile) {'),
      stripped.indexOf('} else {'),
    );
    expect(existingBranch).not.toMatch(/type: 'invite'/);
  });
});
