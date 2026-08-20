/**
 * There is exactly one source of truth for pay, and it is salary_records.
 *
 * `technicians.pay_rate` and `technicians.pay_type` still exist and still hold
 * pre-M7 values. They are the only surviving record of what people were paid
 * before salary_records existed, so they are deliberately left in place rather
 * than dropped — but nothing writes them and nothing reads them for money.
 *
 * That distinction is currently held together by a comment. This pins it:
 *
 *   - payroll resolves a rate through salaryOn() over salary_records
 *   - createTechnician and updateTechnician must not write the legacy columns
 *
 * Why it matters: the legacy column is stale and contradictory — 22 of 25 rows
 * are the default 25/Hourly, the same person disagrees with themselves across
 * the two shops, and 'Commission' and 'Salary' are not pay types the salary
 * domain accepts. A well-meaning "keep them in sync" change would put a
 * fabricated wage back into circulation, or make payroll read the wrong one.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');

describe('pay rate source of truth', () => {
  it('payroll resolves the rate from salary_records, not technicians', () => {
    const payroll = read('lib', 'domain', 'payroll.ts');
    expect(payroll).toContain('salaryOn');
    expect(payroll).not.toMatch(/pay_rate/);
  });

  it('createTechnician does not write the legacy pay columns', () => {
    const source = read('services', 'technicianService.ts');
    const start = source.indexOf('export async function createTechnician');
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf('export async function', start + 10);
    const body = source.slice(start, end === -1 ? undefined : end);

    // Reading them back off the inserted row is fine; writing them is not.
    expect(body).not.toMatch(/pay_rate:\s*[^,\n]/);
    expect(body).not.toMatch(/pay_type:\s*[^,\n]/);
  });

  it('updateTechnician does not write the legacy pay columns', () => {
    const source = read('services', 'technicianService.ts');
    const start = source.indexOf('export async function updateTechnician');
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf('export async function', start + 10);
    const body = source.slice(start, end === -1 ? undefined : end);

    expect(body).not.toMatch(/payload\.pay_rate/);
    expect(body).not.toMatch(/payload\.pay_type/);
  });

  it('the salary domain accepts only its own pay types', () => {
    const salary = read('lib', 'domain', 'salary.ts');
    // 'Commission' and 'Salary' live in technicians.pay_type and are NOT
    // valid here, which is why that column cannot simply be migrated across.
    expect(salary).toContain("'Monthly' | 'Daily' | 'Hourly' | 'Per job'");
    expect(salary).not.toContain("'Commission'");
  });
});
