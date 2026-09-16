/**
 * The owner-reviewed alert and push artefacts, pinned by SHA-256.
 *
 * Where the capture wires them in is checked in captureIsolation.test.ts, so a
 * structural mistake fails on its own rather than only moving a hash.
 *
 * A pin is not a quality check: it is a review boundary. Changing any of these
 * files changes what the owner approved, so the hash must be updated in the
 * same change and reviewed with it.
 *
 * Hashes are over the file with CRLF normalised to LF, so a Windows checkout
 * and a Linux one agree.
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8').replace(/\r/g, '');
const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');

describe('owner-reviewed artefacts are pinned', () => {
  it.each([
    ['OWNER START SQL', 'scripts/marketing/sql/owner-start.sql', '9f4c4d2a464b7648001505d9e16e1032764315809dc0a10eed5e29922a275c0a'],
    ['OWNER FINISH SQL', 'scripts/marketing/sql/owner-finish.sql', '838520b5f64e9ada3580acb0db41ab37bb583bc0c036aaf6f57ed4c474bc2ca4'],
    ['automated start gates', 'lib/marketing-capture/alertStartGates.ts', '32fb5048c4fe9a69a3f99db74e87028c27912bf61fb693d6a601963772cf40cc'],
    ['automated finish gates', 'lib/marketing-capture/alertFinishGates.ts', '0d76389e5260e6a1679c2dae11549041f0b232bb0575f6e41af304ce06adc5a6'],
    ['expected alerts', 'lib/marketing-capture/alertExpectation.ts', 'f56c2a4afb81e1af1202845ba4dfc4c40d1f0576f374c3f692a6a7788338e421'],
    ['browser request ledger', 'lib/marketing-capture/requestLedger.ts', 'bc36f75394098858c6764146355e7f54742027f701b90c4b5d7775e605ac4e28'],
    ['failure-recovery instructions', 'docs/marketing-capture-recovery.md', '433118ede51638bf89d19d670aa2f1a12b7c147ff988e41f26d252369215f575'],
  ])('%s still hashes to the reviewed value', (_name, path, expected) => {
    expect(sha(read(path))).toBe(expected);
  });
});
