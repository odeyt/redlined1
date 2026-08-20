-- Pre-M7 pay rates that have not been re-entered as salary records.
--
-- Read-only. It reports; it deliberately does NOT copy anything across.
--
-- ## Why this is not a backfill
--
-- The old and new pay types do not map onto each other:
--
--   technicians.pay_type   salary_records.pay_type
--   ────────────────────   ───────────────────────
--   'Hourly'            →  'Hourly'          same thing
--   'Flat Rate'         →  'Per job'         probably the same thing
--   'Salary'            →  ???               the old form labelled this
--                                            "Annual Salary ($)", and the new
--                                            one has Monthly, not Annual
--   'Commission'        →  none              a percentage, not an amount
--
-- Copying a number whose unit is ambiguous into the table payroll reads is how
-- somebody gets paid a twelfth of what they should, or twelve times it. The
-- old values are shown here beside the person's name so an owner can enter
-- each one deliberately, in the unit they actually mean, on the Pay & Advances
-- screen.
--
-- The technicians columns are left in place and unwritten. They are the only
-- surviving record of what people were paid before M7, so dropping them would
-- destroy history to tidy a schema.

SELECT
  t.name                       AS person,
  t.pay_type                   AS legacy_pay_type,
  t.pay_rate                   AS legacy_rate,
  t.shop_id,
  e.id                         AS employee_id,
  CASE
    WHEN e.id IS NULL THEN 'no employee record — link it first'
    WHEN s.employee_id IS NULL THEN 'needs a rate entering in Pay & Advances'
    ELSE 'done'
  END                          AS status
FROM public.technicians t
LEFT JOIN public.employees e
  ON e.id = t.employee_id
LEFT JOIN (
  SELECT DISTINCT employee_id FROM public.salary_records
) s ON s.employee_id = e.id
WHERE COALESCE(t.pay_rate, 0) > 0
ORDER BY status, t.name;

-- A person appears once per shop they are in the directory of, because
-- technicians is per shop and employees is per business. Two rows for one
-- name means one person working at both locations — enter their pay once.
