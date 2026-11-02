-- Money owed to the user (ลูกหนี้): unpaid work, money lent, reimbursements.
--
-- Two new transaction types keep lending out of income/expense reports:
--   lend    (amount < 0) money that left an account as a loan to someone
--   collect (amount > 0) money returned that is not income (loan repaid, deposit back)
-- Payments for unpaid work are ordinary `income`; reimbursements are `refund`.
-- Status is derived (amount vs. linked payments, write-off), never stored, so it
-- cannot drift from the transactions.

alter table transactions drop constraint transactions_type_check;
alter table transactions add constraint transactions_type_check check (type in
  ('income', 'expense', 'transfer', 'adjustment', 'debt_payment', 'fee', 'interest', 'refund', 'lend', 'collect'));

alter table transactions drop constraint transactions_check1;
alter table transactions add constraint transactions_amount_sign_check check (
     (type in ('income', 'refund', 'collect') and amount_satang > 0)
  or (type in ('expense', 'fee', 'interest', 'lend') and amount_satang < 0)
  or type in ('transfer', 'adjustment', 'debt_payment')
);

create table receivables (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null default app.current_user_id() references profiles (id) on delete restrict,
  kind                 text not null check (kind in ('work', 'loan', 'reimbursement', 'other')),
  person               text not null check (char_length(person) between 1 and 100),
  description          text not null default '' check (char_length(description) <= 200),
  amount_satang        bigint not null check (amount_satang > 0),
  issued_date          date not null,
  due_date             date,
  notes                text check (char_length(notes) <= 2000),
  written_off_at       timestamptz,
  written_off_reason   text check (char_length(written_off_reason) between 1 and 500),
  idempotency_key      text check (char_length(idempotency_key) between 8 and 100),
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (owner_id, id),
  check (due_date is null or due_date >= issued_date),
  check ((written_off_at is null) = (written_off_reason is null))
);
create index receivables_owner_due_idx on receivables (owner_id, due_date);
create unique index receivables_owner_idempotency_key on receivables (owner_id, idempotency_key)
  where idempotency_key is not null;

alter table transactions add column receivable_id uuid;
alter table transactions
  add foreign key (owner_id, receivable_id) references receivables (owner_id, id) on delete restrict;
create index transactions_receivable_idx on transactions (receivable_id) where receivable_id is not null;

create trigger receivables_touch before update on receivables for each row execute function app.touch_row();
create trigger receivables_audit after insert or update or delete on receivables for each row execute function app.audit_row();
create trigger receivables_no_delete before delete on receivables
  for each row execute function app.reject_change('financial records are archived or soft-deleted, never removed');
create trigger receivables_freeze_identity before update on receivables for each row execute function app.freeze_identity();

alter table receivables enable row level security;
alter table receivables force row level security;
create policy owner_isolation on receivables
  using (owner_id = app.current_user_id()) with check (owner_id = app.current_user_id());
grant select, insert, update on receivables to myfinance_app;
