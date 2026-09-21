/**
 * SI-11 isolation guarantees for the intelligence learning engine, as static
 * checks on the source. Replaces tests/intelligence/intelligence-learning-isolation.spec.ts,
 * which ran these at import time and called process.exit(1) on any failure. Inside
 * Playwright's collection that killed the runner, so the whole chromium project
 * listed zero tests.
 *
 * Every original check is kept; three are stricter:
 *  - a missing source file fails (the script read it as '' and passed everything);
 *  - "flag defined" and "defaults OFF" read the flag's own feature_flags row
 *    (the script matched table names that contain the flag and any 'false' in
 *    the file);
 *  - the no-AI patterns are matched against code with comments removed, so the
 *    engine's own "No AI. No embeddings." note is not a violation, while any
 *    identifier, import or string literal still is.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf-8');

const ENGINE_FILES = [
  'intelligence/learning/IntelligenceLearningEngine.ts',
  'intelligence/learning/LearningScoring.ts',
  'intelligence/learning/LearningAdjustmentAdapter.ts',
];
const MIGRATION = 'supabase/migrations/migration_intelligence_learning_engine.sql';

/** Source with every comment removed. String literals, identifiers and imports are kept. */
function codeOnly(src: string, fileName = 'x.ts'): string {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return ts.createPrinter({ removeComments: true }).printFile(sf);
}

function importSpecifiers(src: string): string[] {
  const sf = ts.createSourceFile('x.ts', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      out.push(n.moduleSpecifier.text);
    }
    if (ts.isCallExpression(n) && n.arguments.length === 1 && ts.isStringLiteral(n.arguments[0])
      && (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === 'require'))) {
      out.push(n.arguments[0].text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

describe('the learning engine sources exist (a missing file must not pass every check)', () => {
  it.each(ENGINE_FILES)('%s is present and non-empty', (rel) => {
    expect(existsSync(join(ROOT, rel))).toBe(true);
    expect(read(rel).trim().length).toBeGreaterThan(0);
  });

  it(`${MIGRATION} is present`, () => {
    expect(existsSync(join(ROOT, MIGRATION))).toBe(true);
  });
});

describe('Guarantee 1: no dependency on protected modules', () => {
  const allSrc = () => ENGINE_FILES.map(read).join('\n');

  // Unchanged from the original: the name must not appear anywhere, comments included.
  it.each([
    'RecommendationEngine', 'RuleRegistry', 'DecisionEngine', 'VehicleIntelligenceEngine',
    'IntelligenceBus', 'partsOrderService', 'invoiceService', 'paymentService',
  ])('no reference to %s', (name) => {
    expect(allSrc().includes(name)).toBe(false);
  });

  // The documented outbound dependencies, enforced rather than only described.
  const ALLOWED_IMPORTS = new Set([
    '@/lib/supabaseServer', '@/lib/supabase', './types', './LearningScoring', './IntelligenceLearningEngine',
  ]);
  it.each(ENGINE_FILES)('%s imports only the documented dependencies', (rel) => {
    const outside = importSpecifiers(read(rel)).filter(s => !ALLOWED_IMPORTS.has(s));
    expect(outside).toEqual([]);
  });
});

describe('Guarantee 3: every SI-11 flag exists and defaults OFF', () => {
  const FLAGS = [
    'intelligence_learning_engine', 'recommendation_feedback', 'learning_score_adjustments',
    'intelligence_learning_dashboard', 'value_attribution',
  ];
  /** The flag's own row in the feature_flags INSERT: ('key', 'name', 'description', <enabled>, 'scope'). */
  const flagRow = (flag: string) =>
    read(MIGRATION).match(new RegExp(`\\(\\s*'${flag}'\\s*,\\s*'[^']*'\\s*,\\s*'[^']*'\\s*,\\s*(true|false)\\s*,\\s*'[^']*'\\s*\\)`, 'i'));

  it('the migration inserts them into feature_flags', () => {
    expect(read(MIGRATION)).toMatch(/INSERT INTO feature_flags \(flag_key, display_name, description, enabled, scope\)/);
  });

  it.each(FLAGS)("flag '%s' is defined as a feature_flags row", (flag) => {
    expect(flagRow(flag)).not.toBeNull();
  });

  it.each(FLAGS)("flag '%s' defaults OFF", (flag) => {
    expect(flagRow(flag)?.[1].toLowerCase()).toBe('false');
  });
});

describe('Guarantee 5: no external AI, embeddings or network calls in the engine', () => {
  const code = () => ENGINE_FILES.map(rel => codeOnly(read(rel), rel)).join('\n').toLowerCase();

  it.each(['openai', 'anthropic', 'gemini', 'embedding', 'vectorize', 'sapelee'])("no '%s' in engine code", (pattern) => {
    expect(code().includes(pattern)).toBe(false);
  });

  it('makes no HTTP requests and holds no URLs', () => {
    expect(code()).not.toMatch(/\bfetch\s*\(|https?:\/\//);
  });

  it('reads no environment variables (no API keys can be picked up)', () => {
    expect(code()).not.toMatch(/process\.env/);
  });
});

describe('codeOnly: removing comments cannot hide a real call', () => {
  it('drops line and block comments', () => {
    const out = codeOnly('// No embeddings here\n/* openai */\nconst a = 1; // anthropic\n');
    expect(out).not.toMatch(/embeddings|openai|anthropic/);
    expect(out).toMatch(/const a = 1/);
  });

  it('keeps string literals, including URLs that contain //', () => {
    const out = codeOnly('const u = "https://api.openai.com/v1/embeddings"; // note');
    expect(out).toContain('https://api.openai.com/v1/embeddings');
  });

  it('keeps identifiers and imports', () => {
    const out = codeOnly("import { createEmbedding } from 'openai';\ncreateEmbedding();");
    expect(out.toLowerCase()).toContain('openai');
    expect(out.toLowerCase()).toContain('embedding');
  });
});
