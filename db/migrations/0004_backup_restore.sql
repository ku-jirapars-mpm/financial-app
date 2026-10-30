-- Restoring a backup re-inserts the original audit history for the current
-- user. The app role cannot write audit_logs directly, so this narrowly
-- scoped SECURITY DEFINER function does it, always stamping the caller's
-- owner id and never touching other users' rows.
create or replace function app.restore_audit_logs(entries jsonb) returns integer
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  uid uuid := app.current_user_id();
  n integer;
begin
  if uid is null then
    raise exception 'no authenticated user' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(entries) <> 'array' then
    raise exception 'entries must be a JSON array' using errcode = 'invalid_parameter_value';
  end if;
  insert into audit_logs (id, owner_id, table_name, record_id, action, changed_fields, old_data, new_data, reason, changed_at, txid)
  select (e ->> 'id')::uuid,
         uid,
         e ->> 'table_name',
         (e ->> 'record_id')::uuid,
         e ->> 'action',
         case when jsonb_typeof(e -> 'changed_fields') = 'array'
              then array(select jsonb_array_elements_text(e -> 'changed_fields')) end,
         nullif(e -> 'old_data', 'null'::jsonb),
         nullif(e -> 'new_data', 'null'::jsonb),
         e ->> 'reason',
         (e ->> 'changed_at')::timestamptz,
         coalesce((e ->> 'txid')::bigint, 0)
  from jsonb_array_elements(entries) e
  on conflict (id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function app.restore_audit_logs(jsonb) from public;
grant execute on function app.restore_audit_logs(jsonb) to myfinance_app;

-- Backups record which schema version produced them.
grant select on schema_migrations to myfinance_app;
