-- MyFinance core financial schema.
--
-- Conventions
--   * Money: bigint integer satang (1 THB = 100 satang). Never numeric/float.
--   * Account balance sign: positive = money you have, negative = money you owe.
--     Liability accounts (credit cards, loans) therefore carry negative balances.
--   * Calendar dates (transaction_date, snapshot_date, ...) are `date` values in
--     the user's Asia/Bangkok calendar. Instants are `timestamptz` (stored UTC).
--   * Every user-owned row has owner_id, defaulting to the authenticated user
--     bound by the app (app.current_user_id()). Cross-table references use
--     composite (owner_id, id) foreign keys so a row can never point at a row
--     owned by somebody else.
--   * Financial rows are never hard-deleted: accounts are archived/closed,
--     transactions are soft-deleted with a reason, snapshots are superseded.

create schema if not exists app;

create or replace function app.current_user_id() returns uuid
language sql stable
as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table profiles (
  id             uuid primary key default app.current_user_id()
                 references auth_users (id) on delete restrict,
  display_name   text check (char_length(display_name) <= 100),
  base_currency  char(3) not null default 'THB' check (base_currency = 'THB'),
  timezone       text not null default 'Asia/Bangkok',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------
create table accounts (
  id                      uuid primary key default gen_random_uuid(),
  owner_id                uuid not null default app.current_user_id() references profiles (id) on delete restrict,
  name                    text not null check (char_length(name) between 1 and 100),
  kind                    text not null check (kind in
                            ('cash', 'bank', 'e_wallet', 'credit_card', 'loan', 'other_asset', 'other_liability')),
  institution             text check (char_length(institution) <= 100),
  currency                char(3) not null default 'THB' check (currency = 'THB'),
  -- Balance at the start of opening_balance_date. Transactions may not predate it.
  opening_balance_satang  bigint not null default 0,
  opening_balance_date    date not null,
  status                  text not null default 'active' check (status in ('active', 'archived', 'closed')),
  archived_at             timestamptz,
  closed_at               timestamptz,
  closed_reason           text check (char_length(closed_reason) <= 500),
  notes                   text check (char_length(notes) <= 2000),
  version                 integer not null default 1,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (owner_id, id),
  check (status <> 'archived' or archived_at is not null),
  check (status <> 'closed' or closed_at is not null)
);
create index accounts_owner_status_idx on accounts (owner_id, status);

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create table categories (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default app.current_user_id() references profiles (id) on delete restrict,
  name         text not null check (char_length(name) between 1 and 60),
  kind         text not null check (kind in ('income', 'expense')),
  parent_id    uuid,
  color        text check (color ~ '^#[0-9a-fA-F]{6}$'),
  is_archived  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (owner_id, id),
  foreign key (owner_id, parent_id) references categories (owner_id, id) on delete restrict
);
create unique index categories_owner_kind_name_key on categories (owner_id, kind, lower(name));

-- ---------------------------------------------------------------------------
-- credit cards and statements
-- ---------------------------------------------------------------------------
create table credit_cards (
  id                         uuid primary key default gen_random_uuid(),
  owner_id                   uuid not null default app.current_user_id() references profiles (id) on delete restrict,
  account_id                 uuid not null unique,
  credit_limit_satang        bigint not null check (credit_limit_satang >= 0),
  statement_day              smallint not null check (statement_day between 1 and 31),
  due_day                    smallint not null check (due_day between 1 and 31),
  annual_interest_rate_bps   integer not null default 1600 check (annual_interest_rate_bps between 0 and 10000),
  min_payment_rate_bps       integer not null default 1000 check (min_payment_rate_bps between 0 and 10000),
  min_payment_floor_satang   bigint not null default 30000 check (min_payment_floor_satang >= 0),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (owner_id, id),
  unique (owner_id, id, account_id),
  foreign key (owner_id, account_id) references accounts (owner_id, id) on delete restrict
);

create table credit_card_statements (
  id                        uuid primary key default gen_random_uuid(),
  owner_id                  uuid not null default app.current_user_id() references profiles (id) on delete restrict,
  credit_card_id            uuid not null,
  account_id                uuid not null,
  statement_date            date not null,
  due_date                  date not null,
  statement_balance_satang  bigint not null check (statement_balance_satang >= 0),
  minimum_due_satang        bigint not null check (minimum_due_satang >= 0),
  interest_charged_satang   bigint not null default 0 check (interest_charged_satang >= 0),
  fees_charged_satang       bigint not null default 0 check (fees_charged_satang >= 0),
  status                    text not null default 'open' check (status in ('open', 'partially_paid', 'paid', 'overdue')),
  notes                     text check (char_length(notes) <= 2000),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (owner_id, id),
  unique (credit_card_id, statement_date),
  check (due_date >= statement_date),
  check (minimum_due_satang <= statement_balance_satang),
  -- account_id must be the card's own account (and same owner).
  foreign key (owner_id, credit_card_id, account_id)
    references credit_cards (owner_id, id, account_id) on delete restrict
);
create index credit_card_statements_account_date_idx on credit_card_statements (account_id, statement_date desc);

-- ---------------------------------------------------------------------------
-- loans
-- ---------------------------------------------------------------------------
create table loans (
  id                         uuid primary key default gen_random_uuid(),
  owner_id                   uuid not null default app.current_user_id() references profiles (id) on delete restrict,
  account_id                 uuid not null unique,
  lender                     text check (char_length(lender) <= 100),
  loan_type                  text not null default 'personal'
                             check (loan_type in ('personal', 'auto', 'mortgage', 'student', 'other')),
  principal_satang           bigint not null check (principal_satang > 0),
  annual_interest_rate_bps   integer not null check (annual_interest_rate_bps between 0 and 10000),
  interest_method            text not null default 'reducing_balance'
                             check (interest_method in ('reducing_balance', 'flat')),
  term_months                integer check (term_months between 1 and 600),
  start_date                 date not null,
  payment_day                smallint check (payment_day between 1 and 31),
  scheduled_payment_satang   bigint check (scheduled_payment_satang >= 0),
  status                     text not null default 'active' check (status in ('active', 'paid_off', 'closed')),
  notes                      text check (char_length(notes) <= 2000),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (owner_id, id),
  foreign key (owner_id, account_id) references accounts (owner_id, id) on delete restrict
);

-- ---------------------------------------------------------------------------
-- installment plans
-- ---------------------------------------------------------------------------
create table installment_plans (
  id                      uuid primary key default gen_random_uuid(),
  owner_id                uuid not null default app.current_user_id() references profiles (id) on delete restrict,
  account_id              uuid not null,          -- account that is billed (usually a credit card)
  credit_card_id          uuid,
  merchant                text check (char_length(merchant) <= 100),
  description             text check (char_length(description) <= 200),
  principal_satang        bigint not null check (principal_satang > 0),
  total_interest_satang   bigint not null default 0 check (total_interest_satang >= 0),
  total_fees_satang       bigint not null default 0 check (total_fees_satang >= 0),
  interest_rate_bps       integer not null default 0 check (interest_rate_bps between 0 and 10000),
  term_months             integer not null check (term_months between 1 and 120),
  monthly_amount_satang   bigint not null check (monthly_amount_satang > 0),
  start_date              date not null,
  first_payment_date      date not null,
  status                  text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  origin_transaction_id   uuid,
  notes                   text check (char_length(notes) <= 2000),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (owner_id, id),
  check (first_payment_date >= start_date),
  foreign key (owner_id, account_id) references accounts (owner_id, id) on delete restrict,
  foreign key (owner_id, credit_card_id) references credit_cards (owner_id, id) on delete restrict
);

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------
create table transactions (
  id                         uuid primary key default gen_random_uuid(),
  owner_id                   uuid not null default app.current_user_id() references profiles (id) on delete restrict,
  account_id                 uuid not null,
  category_id                uuid,
  type                       text not null check (type in
                               ('income', 'expense', 'transfer', 'adjustment', 'debt_payment', 'fee', 'interest', 'refund')),
  -- Signed effect on the account balance, in satang.
  amount_satang              bigint not null check (amount_satang <> 0),
  transaction_date           date not null,
  description                text not null default '' check (char_length(description) <= 200),
  counterparty               text check (char_length(counterparty) <= 100),
  notes                      text check (char_length(notes) <= 2000),
  status                     text not null default 'posted' check (status in ('posted', 'pending')),
  -- Both legs of a transfer / debt payment share a group id; the deferred
  -- trigger below guarantees exactly two live legs that sum to zero.
  transfer_group_id          uuid,
  loan_id                    uuid,
  credit_card_statement_id   uuid,
  installment_plan_id        uuid,
  idempotency_key            text check (char_length(idempotency_key) between 8 and 100),
  deleted_at                 timestamptz,
  deleted_reason             text check (char_length(deleted_reason) between 1 and 500),
  version                    integer not null default 1,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (owner_id, id),
  check ((deleted_at is null) = (deleted_reason is null)),
  check (
       (type in ('income', 'refund') and amount_satang > 0)
    or (type in ('expense', 'fee', 'interest') and amount_satang < 0)
    or type in ('transfer', 'adjustment', 'debt_payment')
  ),
  check (type not in ('transfer', 'debt_payment') or transfer_group_id is not null),
  check (type in ('transfer', 'debt_payment') or transfer_group_id is null),
  foreign key (owner_id, account_id) references accounts (owner_id, id) on delete restrict,
  foreign key (owner_id, category_id) references categories (owner_id, id) on delete restrict,
  foreign key (owner_id, loan_id) references loans (owner_id, id) on delete restrict,
  foreign key (owner_id, credit_card_statement_id) references credit_card_statements (owner_id, id) on delete restrict,
  foreign key (owner_id, installment_plan_id) references installment_plans (owner_id, id) on delete restrict
);
create index transactions_owner_date_idx on transactions (owner_id, transaction_date desc, created_at desc);
create index transactions_account_date_idx on transactions (account_id, transaction_date desc);
create index transactions_owner_category_date_idx on transactions (owner_id, category_id, transaction_date);
create index transactions_transfer_group_idx on transactions (transfer_group_id) where transfer_group_id is not null;
create unique index transactions_owner_idempotency_key on transactions (owner_id, idempotency_key)
  where idempotency_key is not null;

alter table installment_plans
  add foreign key (owner_id, origin_transaction_id) references transactions (owner_id, id) on delete restrict;

create table installment_payments (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null default app.current_user_id() references profiles (id) on delete restrict,
  installment_plan_id   uuid not null,
  sequence_no           integer not null check (sequence_no >= 1),
  due_date              date not null,
  amount_due_satang     bigint not null check (amount_due_satang >= 0),
  principal_satang      bigint not null default 0 check (principal_satang >= 0),
  interest_satang       bigint not null default 0 check (interest_satang >= 0),
  fee_satang            bigint not null default 0 check (fee_satang >= 0),
  payment_date          date,
  amount_paid_satang    bigint not null default 0 check (amount_paid_satang >= 0),
  transaction_id        uuid,
  status                text not null default 'scheduled'
                        check (status in ('scheduled', 'partially_paid', 'paid', 'skipped', 'cancelled')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (owner_id, id),
  unique (installment_plan_id, sequence_no),
  check (amount_due_satang = principal_satang + interest_satang + fee_satang),
  check (status <> 'paid' or payment_date is not null),
  foreign key (owner_id, installment_plan_id) references installment_plans (owner_id, id) on delete restrict,
  foreign key (owner_id, transaction_id) references transactions (owner_id, id) on delete restrict
);
create index installment_payments_plan_payment_date_idx on installment_payments (installment_plan_id, payment_date);
create index installment_payments_plan_due_date_idx on installment_payments (installment_plan_id, due_date);

-- ---------------------------------------------------------------------------
-- debt payments (breakdown of a debt_payment transaction leg)
-- ---------------------------------------------------------------------------
create table debt_payments (
  id                         uuid primary key default gen_random_uuid(),
  owner_id                   uuid not null default app.current_user_id() references profiles (id) on delete restrict,
  transaction_id             uuid not null unique,     -- the liability-side leg
  debt_kind                  text not null check (debt_kind in ('credit_card', 'loan', 'installment', 'other')),
  loan_id                    uuid,
  credit_card_id             uuid,
  credit_card_statement_id   uuid,
  installment_plan_id        uuid,
  installment_payment_id     uuid,
  payment_date               date not null,
  amount_satang              bigint not null check (amount_satang > 0),
  principal_satang           bigint not null default 0 check (principal_satang >= 0),
  interest_satang            bigint not null default 0 check (interest_satang >= 0),
  fees_satang                bigint not null default 0 check (fees_satang >= 0),
  deleted_at                 timestamptz,
  deleted_reason             text check (char_length(deleted_reason) between 1 and 500),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (owner_id, id),
  check (principal_satang + interest_satang + fees_satang = amount_satang),
  check ((deleted_at is null) = (deleted_reason is null)),
  check (
       (debt_kind = 'loan' and loan_id is not null)
    or (debt_kind = 'credit_card' and credit_card_id is not null)
    or (debt_kind = 'installment' and installment_plan_id is not null)
    or debt_kind = 'other'
  ),
  foreign key (owner_id, transaction_id) references transactions (owner_id, id) on delete restrict,
  foreign key (owner_id, loan_id) references loans (owner_id, id) on delete restrict,
  foreign key (owner_id, credit_card_id) references credit_cards (owner_id, id) on delete restrict,
  foreign key (owner_id, credit_card_statement_id) references credit_card_statements (owner_id, id) on delete restrict,
  foreign key (owner_id, installment_plan_id) references installment_plans (owner_id, id) on delete restrict,
  foreign key (owner_id, installment_payment_id) references installment_payments (owner_id, id) on delete restrict
);
create index debt_payments_owner_date_idx on debt_payments (owner_id, payment_date desc);

-- ---------------------------------------------------------------------------
-- reconciliations
-- ---------------------------------------------------------------------------
create table reconciliations (
  id                          uuid primary key default gen_random_uuid(),
  owner_id                    uuid not null default app.current_user_id() references profiles (id) on delete restrict,
  account_id                  uuid not null,
  reconciled_as_of            date not null,
  statement_balance_satang    bigint not null,
  recorded_balance_satang     bigint not null,
  difference_satang           bigint generated always as (statement_balance_satang - recorded_balance_satang) stored,
  adjustment_transaction_id   uuid,
  reason                      text check (char_length(reason) <= 500),
  created_at                  timestamptz not null default now(),
  unique (owner_id, id),
  check (statement_balance_satang = recorded_balance_satang or char_length(coalesce(reason, '')) > 0),
  foreign key (owner_id, account_id) references accounts (owner_id, id) on delete restrict,
  foreign key (owner_id, adjustment_transaction_id) references transactions (owner_id, id) on delete restrict
);
create index reconciliations_account_date_idx on reconciliations (account_id, reconciled_as_of desc);

-- ---------------------------------------------------------------------------
-- recurring transactions and budgets
-- ---------------------------------------------------------------------------
create table recurring_transactions (
  id                      uuid primary key default gen_random_uuid(),
  owner_id                uuid not null default app.current_user_id() references profiles (id) on delete restrict,
  account_id              uuid not null,
  to_account_id           uuid,
  category_id             uuid,
  type                    text not null check (type in ('income', 'expense', 'transfer')),
  amount_satang           bigint not null check (amount_satang > 0),   -- magnitude; sign comes from type
  description             text not null default '' check (char_length(description) <= 200),
  frequency               text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  interval_count          integer not null default 1 check (interval_count between 1 and 52),
  start_date              date not null,
  end_date                date,
  next_occurrence_date    date,
  is_active               boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (owner_id, id),
  check (end_date is null or end_date >= start_date),
  check ((type = 'transfer') = (to_account_id is not null)),
  foreign key (owner_id, account_id) references accounts (owner_id, id) on delete restrict,
  foreign key (owner_id, to_account_id) references accounts (owner_id, id) on delete restrict,
  foreign key (owner_id, category_id) references categories (owner_id, id) on delete restrict
);

create table budgets (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default app.current_user_id() references profiles (id) on delete restrict,
  category_id    uuid not null,
  period_month   date not null check (extract(day from period_month) = 1),
  amount_satang  bigint not null check (amount_satang >= 0),
  notes          text check (char_length(notes) <= 500),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (owner_id, id),
  unique (owner_id, category_id, period_month),
  foreign key (owner_id, category_id) references categories (owner_id, id) on delete restrict
);

-- ---------------------------------------------------------------------------
-- financial snapshots (immutable historical observations)
-- ---------------------------------------------------------------------------
create table financial_snapshots (
  id                                        uuid primary key default gen_random_uuid(),
  owner_id                                  uuid not null default app.current_user_id() references profiles (id) on delete restrict,
  snapshot_date                             date not null,   -- balances are as of the end of this day
  period_start                              date not null,   -- month covered by the flow figures
  period_end                                date not null,
  total_cash_balance_satang                 bigint not null,
  total_bank_balance_satang                 bigint not null,
  total_other_assets_satang                 bigint not null,
  total_outstanding_liabilities_satang      bigint not null,
  total_credit_card_debt_satang             bigint not null,
  total_loan_debt_satang                    bigint not null,
  remaining_installment_obligations_satang  bigint not null,
  monthly_income_satang                     bigint not null,
  monthly_expenses_satang                   bigint not null,
  monthly_debt_payments_satang              bigint not null,
  net_cash_flow_satang                      bigint not null,
  net_financial_position_satang             bigint not null,
  calculation_version                       text not null,
  -- 'recorded': observed at (or right after) the snapshot date.
  -- 'reconstructed_estimate': computed later from possibly incomplete history.
  data_basis                                text not null check (data_basis in ('recorded', 'reconstructed_estimate')),
  assumptions                               jsonb not null default '{}'::jsonb,
  metadata                                  jsonb not null default '{}'::jsonb,
  source                                    text not null default 'manual' check (source in ('manual', 'rebuild')),
  supersedes_id                             uuid,
  superseded_by                             uuid,
  superseded_at                             timestamptz,
  supersede_reason                          text check (char_length(supersede_reason) <= 500),
  created_at                                timestamptz not null default now(),
  unique (owner_id, id),
  check (period_start <= period_end and period_end <= snapshot_date),
  check ((superseded_by is null) = (superseded_at is null)),
  check (source <> 'rebuild' or supersedes_id is not null),
  foreign key (owner_id, supersedes_id) references financial_snapshots (owner_id, id) on delete restrict,
  foreign key (owner_id, superseded_by) references financial_snapshots (owner_id, id)
    on delete restrict deferrable initially deferred
);
create index financial_snapshots_owner_date_idx on financial_snapshots (owner_id, snapshot_date desc);
create unique index financial_snapshots_current_key on financial_snapshots (owner_id, snapshot_date)
  where superseded_by is null;

-- ---------------------------------------------------------------------------
-- audit logs (append-only; written only by the audit trigger)
-- ---------------------------------------------------------------------------
create table audit_logs (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references profiles (id) on delete restrict,
  table_name      text not null,
  record_id       uuid not null,
  action          text not null check (action in ('insert', 'update', 'delete')),
  changed_fields  text[],
  old_data        jsonb,
  new_data        jsonb,
  reason          text,
  changed_at      timestamptz not null default clock_timestamp(),
  txid            bigint not null default txid_current()
);
create index audit_logs_record_idx on audit_logs (owner_id, table_name, record_id, changed_at);
create index audit_logs_owner_changed_idx on audit_logs (owner_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- derived views
-- ---------------------------------------------------------------------------
create view account_balances with (security_invoker = true) as
select
  a.id as account_id,
  a.owner_id,
  (a.opening_balance_satang
    + coalesce(sum(t.amount_satang) filter (where t.deleted_at is null and t.status = 'posted'), 0))::bigint
    as balance_satang,
  max(t.transaction_date) filter (where t.deleted_at is null) as last_transaction_date
from accounts a
left join transactions t on t.owner_id = a.owner_id and t.account_id = a.id
group by a.id, a.owner_id, a.opening_balance_satang;
