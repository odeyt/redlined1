-- Grant permissions to all Redlined1 tables for anon and authenticated roles
grant select, insert, update, delete on customers to anon, authenticated;
grant select, insert, update, delete on vehicles to anon, authenticated;
grant select, insert, update, delete on job_cards to anon, authenticated;
grant select, insert, update, delete on repair_orders to anon, authenticated;
grant select, insert, update, delete on appointments to anon, authenticated;
grant select, insert, update, delete on invoices to anon, authenticated;
grant select, insert, update, delete on messages to anon, authenticated;
grant select, insert, update, delete on inspections to anon, authenticated;
grant select, insert, update, delete on estimates to anon, authenticated;
grant select, insert, update, delete on technician_tasks to anon, authenticated;
grant select, insert, update, delete on payments to anon, authenticated;
grant select, insert, update, delete on audit_logs to anon, authenticated;
grant select, insert, update, delete on parts to anon, authenticated;
grant select, insert, update, delete on users to anon, authenticated;
