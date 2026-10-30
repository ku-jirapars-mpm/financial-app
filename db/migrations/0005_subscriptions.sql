-- Subscriptions (recurring expenses such as Netflix) build on
-- recurring_transactions. Each recorded payment links back to its
-- subscription so payment history and "last paid" are queryable.

alter table transactions add column recurring_transaction_id uuid;
alter table transactions
  add foreign key (owner_id, recurring_transaction_id)
  references recurring_transactions (owner_id, id) on delete restrict;
create index transactions_recurring_date_idx on transactions (recurring_transaction_id, transaction_date desc)
  where recurring_transaction_id is not null;

-- Who is charging (e.g. "Netflix"), separate from the free-text description.
alter table recurring_transactions add column counterparty text check (char_length(counterparty) <= 100);

-- Subscriptions are cancelled (is_active = false + end_date), never removed,
-- so their payment history stays linked.
revoke delete on recurring_transactions from myfinance_app;
create index recurring_transactions_owner_next_idx on recurring_transactions (owner_id, is_active, next_occurrence_date);
