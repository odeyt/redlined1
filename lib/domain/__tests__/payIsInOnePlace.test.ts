/**
 * There is one answer to what a person is paid.
 *
 * Until M7 it was `technicians.pay_rate`: a single unversioned number, edited
 * on a screen open to anyone who can manage the staff directory. M7 moved pay
 * into salary_records, where it is versioned and readable only by people who
 * may see it.
 *
 * Two writable sources would mean payroll has to guess which is true. These
 * tests pin the boundary, because nothing else would notice a pay field
 * quietly reappearing on the directory form.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const DIRECTORY_SERVICE = read('services/technicianService.ts');
const DIRECTORY_VIEW = read('features/technicians/TechniciansView.tsx');
const SALARY_DOMAIN = read('lib/domain/salary.ts');

describe('the staff directory no longer writes pay', () => {
  it('does not send pay_type or pay_rate to the database', () => {
    // The columns still exist and still hold pre-M7 values. Nothing writes
    // them: a write here would create a second, unversioned answer.
    expect(DIRECTORY_SERVICE).not.toMatch(/pay_type:\s+t\.payType/);
    expect(DIRECTORY_SERVICE).not.toMatch(/pay_rate:\s+t\.payRate/);
    expect(DIRECTORY_SERVICE).not.toMatch(/payload\.pay_rate\s*=/);
  });

  it('still reads them, so the old values are not lost', () => {
    // They are the only surviving record of what people were paid before
    // salary_records existed. Dropping the columns would destroy history to
    // tidy a schema; leaving them readable costs nothing.
    expect(DIRECTORY_SERVICE).toMatch(/pay_rate/);
  });

  it('offers no pay field on the directory form', () => {
    // That form is open to anyone who can edit staff. Pay is not.
    expect(DIRECTORY_VIEW).not.toMatch(/Hourly Rate \(\$\)/);
    expect(DIRECTORY_VIEW).not.toMatch(/f\.payRate/);
    expect(DIRECTORY_VIEW).toMatch(/Pay & Advances|Pay &amp; Advances/);
  });
});

describe('salary is the versioned source', () => {
  it('is insert-only in the domain layer', () => {
    // Correcting a rate means adding a row from the date it takes effect.
    expect(SALARY_DOMAIN).toMatch(/from\('salary_records'\)\s*\n?\s*\.insert/);
    expect(SALARY_DOMAIN).not.toMatch(/from\('salary_records'\)\s*\n?\s*\.update/);
    expect(SALARY_DOMAIN).not.toMatch(/from\('salary_records'\)\s*\n?\s*\.delete/);
  });

  it('records a currency with every rate', () => {
    // Pay is agreed in a currency, and this shop uses three.
    expect(SALARY_DOMAIN).toMatch(/currency: input\.currency/);
  });
});
