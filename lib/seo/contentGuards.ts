/**
 * Banned phrase detection for public marketing content.
 * Call isSafeContent() in tests to catch prohibited claims before deploy.
 */

export const BANNED_PHRASES: string[] = [
  // Invented social proof
  'thousands of shops',
  'trusted by thousands',
  'trusted by hundreds',
  'over 1,000 shops',
  'over 500 shops',
  'join 10,000',
  'join 5,000',
  // Invented ratings
  '4.9 stars',
  '4.8 stars',
  '5 stars',
  'rated #1',
  'top-rated',
  // Unimplemented features
  'bulk sms',
  'mass sms',
  'sms campaign',
  'email campaign',
  'drip campaign',
  'marketing automation',
  'automated follow-up',
  'cross-location inventory transfer',
  'centralized inventory',
  'labor guide catalog',
  'mitchell1 integration',
  'alldata integration',
  'motor integration',
  // Unverified integrations
  'quickbooks integration',
  'stripe integration',
  // Invented competitor facts
  'shopmonkey charges',
  'tekmetric charges',
  'autoleap charges',
  'mitchell1 charges',
  // Fabricated reviews
  '"five stars"',
  '"love this software"',
  '"best shop software"',
];

/**
 * Returns an array of banned phrases found in content.
 * Empty array means content is safe to publish.
 */
export function findBannedPhrases(content: string): string[] {
  const lower = content.toLowerCase();
  return BANNED_PHRASES.filter(phrase => lower.includes(phrase.toLowerCase()));
}

/**
 * Returns true if content contains no banned phrases.
 */
export function isSafeContent(content: string): boolean {
  return findBannedPhrases(content).length === 0;
}
