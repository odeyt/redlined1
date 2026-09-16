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
    ['OWNER START SQL', 'scripts/marketing/sql/owner-start.sql', '8da2693dc4d65a2faba7fe119c8aeaf0a4feebf2e4cdf296fb47d17e3343a8f0'],
    ['OWNER FINISH SQL', 'scripts/marketing/sql/owner-finish.sql', '41961626cdf10a8df2d0d77361729458e803ef677cea94beaaa620613602dfbf'],
    ['automated start gates', 'lib/marketing-capture/alertStartGates.ts', '32fb5048c4fe9a69a3f99db74e87028c27912bf61fb693d6a601963772cf40cc'],
    ['automated finish gates', 'lib/marketing-capture/alertFinishGates.ts', '0d76389e5260e6a1679c2dae11549041f0b232bb0575f6e41af304ce06adc5a6'],
    ['expected alerts', 'lib/marketing-capture/alertExpectation.ts', 'c519c363d24bac6afd3998106ce37c50c46ec962013c054208e7423d810da499'],
    ['production definitions', 'lib/marketing-capture/productionDefinitions.ts', 'fb24b8b770226215377878762ff30e35b7772c8db7ba4e134b08bb6050322a9e'],
    ['browser request ledger', 'lib/marketing-capture/requestLedger.ts', 'bc36f75394098858c6764146355e7f54742027f701b90c4b5d7775e605ac4e28'],
    ['failure-recovery instructions', 'docs/marketing-capture-recovery.md', '5c6bb233e6d45627e005e5f19edd47b2cd95236d3a828b11e95a20c05a0d67a9'],
  ])('%s still hashes to the reviewed value', (_name, path, expected) => {
    expect(sha(read(path))).toBe(expected);
  });
});
