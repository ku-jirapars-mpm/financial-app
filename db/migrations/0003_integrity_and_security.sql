-- Integrity triggers, audit history, the RLS-restricted application role, and
-- row level security policies.

-- ---------------------------------------------------------------------------
-- updated_at / optimistic-concurrency version
-- ---------------------------------------------------------------------------
create or replace function app.touch_row() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if to_jsonb(new) ? 'version' then
    new := jsonb_populate_record(new, jsonb_build_object('version', (to_jsonb(old) ->> 'version')::int + 1));
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'accounts', 'categories', 'credit_cards', 'credit_card_statements', 'loans',
    'installment_plans', 'installment_payments', 'transactions', 'debt_payments',
    'recurring_transactions', 'budgets'
  ] loop
    execute format('create trigger %I before update on %I for each row execute function app.touch_row()',
                   t || '_touch', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- audit history
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so the app role can produce audit rows without being able
-- to insert, edit or delete audit_logs directly.
create or replace function app.audit_row() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_fields text[];
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;

  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into v_fields
    from jsonb_each(v_new) n
    where n.value is distinct from v_old -> n.key
      and n.key not in ('updated_at', 'version');
    if v_fields is null then
      return new;
    end if;
  end if;

  insert into audit_logs (owner_id, table_name, record_id, action, changed_fields, old_data, new_data, reason)
  values (
    coalesce(v_new ->> 'owner_id', v_old ->> 'owner_id', v_new ->> 'id', v_old ->> 'id')::uuid,
    tg_table_name,
    coalesce(v_new ->> 'id', v_old ->> 'id')::uuid,
    lower(tg_op),
    v_fields,
    v_old,
    v_new,
    nullif(current_setting('app.change_reason', true), '')
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'accounts', 'categories', 'credit_cards', 'credit_card_statements', 'loans',
    'installment_plans', 'installment_payments', 'transactions', 'debt_payments', 'reconciliations',
    'recurring_transactions', 'budgets', 'financial_snapshots'
  ] loop
    execute format('create trigger %I after insert or update or delete on %I for each row execute function app.audit_row()',
                   t || '_audit', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- append-only / no-hard-delete guards (apply to every role, including owner)
-- ---------------------------------------------------------------------------
create or replace function app.reject_change() returns trigger
language plpgsql as $$
begin
  raise exception '% on % is not allowed: %', tg_op, tg_table_name, tg_argv[0]
    using errcode = 'check_violation';
end $$;

create trigger audit_logs_append_only before update or delete on audit_logs
  for each row execute function app.reject_change('audit history is append-only');
create trigger reconciliations_immutable before update or delete on reconciliations
  for each row execute function app.reject_change('reconciliation events are immutable');

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'accounts', 'categories', 'transactions', 'credit_cards', 'credit_card_statements',
    'loans', 'installment_plans', 'installment_payments', 'debt_payments', 'financial_snapshots'
  ] loop
    execute format('create trigger %I before delete on %I for each row execute function app.reject_change(%L)',
                   t || '_no_delete', t, 'financial records are archived or soft-deleted, never removed');
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- snapshot immutability: only the supersede marker may be set, exactly once.
-- ---------------------------------------------------------------------------
create or replace function app.guard_snapshot_update() returns trigger
language plpgsql as $$
begin
  if old.superseded_by is not null then
    raise exception 'snapshot % is already superseded and cannot change', old.id using errcode = 'check_violation';
  end if;
  if (to_jsonb(new) - array['superseded_by', 'superseded_at', 'supersede_reason'])
     is distinct from (to_jsonb(old) - array['superseded_by', 'superseded_at', 'supersede_reason']) then
    raise exception 'financial snapshots are immutable; create a rebuild that supersedes it instead'
      using errcode = 'check_violation';
  end if;
  if new.superseded_by is null then
    raise exception 'snapshot update must set superseded_by' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger financial_snapshots_immutable before update on financial_snapshots
  for each row execute function app.guard_snapshot_update();

-- ---------------------------------------------------------------------------
-- account rules for transactions
-- ---------------------------------------------------------------------------
create or replace function app.check_transaction_account() returns trigger
language plpgsql as $$
declare
  acc accounts%rowtype;
begin
  -- Closed/archived accounts are frozen: reopen the account first so any change
  -- to its history is deliberate and audited.
  select * into acc from accounts where id = new.account_id and owner_id = new.owner_id;
  if not found then
    raise exception 'account not found' using errcode = 'foreign_key_violation';
  end if;
  if acc.status <> 'active' then
    raise exception 'account "%" is %; reopen it before changing its transactions', acc.name, acc.status
      using errcode = 'check_violation';
  end if;
  if new.transaction_date < acc.opening_balance_date then
    raise exception 'transaction date % is before the account opening balance date %',
      new.transaction_date, acc.opening_balance_date using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and new.account_id <> old.account_id then
    select * into acc from accounts where id = old.account_id and owner_id = old.owner_id;
    if acc.status <> 'active' then
      raise exception 'cannot move a transaction out of % account "%"', acc.status, acc.name
        using errcode = 'check_violation';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.deleted_at is not null and new.deleted_at is not null
     and (to_jsonb(new) - array['updated_at', 'version']) is distinct from (to_jsonb(old) - array['updated_at', 'version']) then
    raise exception 'deleted transactions cannot be edited; restore it first' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger transactions_check_account before insert or update on transactions
  for each row execute function app.check_transaction_account();

-- Transfers / debt payments: exactly two live legs, different accounts, summing to zero.
-- Deferred to commit so both legs can be written in one transaction.
create or replace function app.check_transfer_group() returns trigger
language plpgsql as $$
declare
  g uuid := coalesce(new.transfer_group_id, old.transfer_group_id);
  legs int;
  total bigint;
  accounts_n int;
  types_n int;
begin
  if g is null then return null; end if;
  select count(*), coalesce(sum(amount_satang), 0), count(distinct account_id), count(distinct type)
    into legs, total, accounts_n, types_n
  from transactions
  where transfer_group_id = g and deleted_at is null;
  if legs = 0 then return null; end if;   -- whole group soft-deleted together
  if legs <> 2 or total <> 0 or accounts_n <> 2 or types_n <> 1 then
    raise exception 'transfer group % must have exactly two live legs of the same type in different accounts summing to zero (legs=%, sum=%)',
      g, legs, total using errcode = 'check_violation';
  end if;
  return null;
end $$;

create constraint trigger transactions_transfer_group_balanced
  after insert or update on transactions
  deferrable initially deferred
  for each row execute function app.check_transfer_group();

-- Credit card / loan rows must point at accounts of the matching kind.
create or replace function app.check_account_kind() returns trigger
language plpgsql as $$
declare
  k text;
begin
  select kind into k from accounts where id = new.account_id and owner_id = new.owner_id;
  if k is distinct from tg_argv[0] then
    raise exception '% requires an account of kind %, got %', tg_table_name, tg_argv[0], coalesce(k, 'none')
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger credit_cards_account_kind before insert or update of account_id on credit_cards
  for each row execute function app.check_account_kind('credit_card');
create trigger loans_account_kind before insert or update of account_id on loans
  for each row execute function app.check_account_kind('loan');

-- Owner / id columns never change after insert.
create or replace function app.freeze_identity() returns trigger
language plpgsql as $$
begin
  if new.id <> old.id or (to_jsonb(new) ->> 'owner_id') is distinct from (to_jsonb(old) ->> 'owner_id') then
    raise exception 'id and owner_id are immutable' using errcode = 'check_violation';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'accounts', 'categories', 'credit_cards', 'credit_card_statements', 'loans',
    'installment_plans', 'installment_payments', 'transactions', 'debt_payments',
    'recurring_transactions', 'budgets', 'financial_snapshots'
  ] loop
    execute format('create trigger %I before update on %I for each row execute function app.freeze_identity()',
                   t || '_freeze_identity', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- application role + row level security
-- ---------------------------------------------------------------------------
-- The web app connects with the database owner credentials but runs every
-- user-scoped statement after `SET LOCAL ROLE myfinance_app`. That role has
-- no BYPASSRLS, owns nothing, and only holds the privileges granted here.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'myfinance_app') then
    create role myfinance_app nologin noinherit nobypassrls;
  end if;
end $$;
grant myfinance_app to current_user;

revoke all on all tables in schema public from myfinance_app;
grant usage on schema public, app to myfinance_app;
grant execute on function app.current_user_id() to myfinance_app;

grant select, insert, update on
  profiles, accounts, categories, transactions, credit_cards, credit_card_statements, loans,
  installment_plans, installment_payments, debt_payments, recurring_transactions, budgets
  to myfinance_app;
grant delete on recurring_transactions, budgets to myfinance_app;
grant select, insert on reconciliations to myfinance_app;
grant select, insert on financial_snapshots to myfinance_app;
grant update (superseded_by, superseded_at, supersede_reason) on financial_snapshots to myfinance_app;
grant select on audit_logs, account_balances to myfinance_app;

do $$
declare t text;
begin
  foreach t in array array[
    'accounts', 'categories', 'credit_cards', 'credit_card_statements', 'loans',
    'installment_plans', 'installment_payments', 'transactions', 'debt_payments', 'reconciliations',
    'recurring_transactions', 'budgets', 'financial_snapshots', 'audit_logs'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy owner_isolation on %I using (owner_id = app.current_user_id()) with check (owner_id = app.current_user_id())',
      t);
  end loop;
end $$;

alter table profiles enable row level security;
alter table profiles force row level security;
create policy owner_isolation on profiles
  using (id = app.current_user_id()) with check (id = app.current_user_id());
