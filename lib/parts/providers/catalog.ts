import 'server-only';

/**
 * The OEM / cross-reference catalogue slot.
 *
 * A catalogue answers a different question from a marketplace: not "who sells
 * this" but "what part number IS this, and what supersedes it". It is the only
 * honest source of a `likely` fitment, which is why the fitment model
 * distinguishes `likely` from `unverified` at all.
 *
 * This file is now a thin re-export. AutoPartsAPI is the implementation behind
 * the slot — see `./autopartsapi/`. Keeping one registry entry rather than
 * adding a second means there is one place to switch a catalogue on, and one
 * answer to "is a catalogue available".
 *
 * `local_supplier` remains separate and unbuilt: it is the same idea pointed
 * at a shop's own price list, and it needs a supplier pricing data model
 * before an adapter would mean anything.
 */
export { autoPartsApiProvider as catalogProvider, autoPartsApiHealth as catalogHealth } from './autopartsapi/provider';
