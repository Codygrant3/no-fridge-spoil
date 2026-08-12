begin;

create table public.receipt_item_aliases (
    id uuid primary key default gen_random_uuid(),
    household_id uuid not null references public.households(id) on delete cascade,
    merchant_name text not null check (char_length(merchant_name) between 1 and 160),
    merchant_key text not null check (char_length(merchant_key) between 1 and 160),
    raw_description text not null check (char_length(raw_description) between 1 and 240),
    raw_description_key text not null check (char_length(raw_description_key) between 1 and 240),
    canonical_name text not null check (char_length(canonical_name) between 1 and 200),
    brand text check (brand is null or char_length(brand) <= 100),
    category text check (category is null or char_length(category) <= 80),
    created_by uuid references auth.users(id) on delete set null,
    updated_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (household_id, merchant_key, raw_description_key)
);

create index receipt_item_aliases_household_store_idx
    on public.receipt_item_aliases (household_id, merchant_key, updated_at desc);

create trigger receipt_item_aliases_set_updated_at
before update on public.receipt_item_aliases
for each row execute function private.set_updated_at();

create trigger receipt_item_aliases_protect_tenant
before update on public.receipt_item_aliases
for each row execute function private.protect_tenant_columns();

alter table public.receipt_item_aliases enable row level security;

create policy receipt_item_aliases_select_member on public.receipt_item_aliases
for select to authenticated
using (private.is_household_member(household_id));

create policy receipt_item_aliases_insert_member on public.receipt_item_aliases
for insert to authenticated
with check (
    private.is_household_member(household_id)
    and created_by = (select auth.uid())
    and updated_by = (select auth.uid())
);

create policy receipt_item_aliases_update_member on public.receipt_item_aliases
for update to authenticated
using (private.is_household_member(household_id))
with check (
    private.is_household_member(household_id)
    and updated_by = (select auth.uid())
);

create policy receipt_item_aliases_delete_member on public.receipt_item_aliases
for delete to authenticated
using (private.is_household_member(household_id));

revoke all on public.receipt_item_aliases from public, anon;
grant select, insert, update, delete on public.receipt_item_aliases to authenticated;
grant select, insert, update, delete on public.receipt_item_aliases to service_role;

create table public.receipt_catalog_aliases (
    id uuid primary key default gen_random_uuid(),
    merchant_name text check (merchant_name is null or char_length(merchant_name) <= 160),
    merchant_key text not null default '*' check (char_length(merchant_key) between 1 and 160),
    raw_description text not null check (char_length(raw_description) between 1 and 240),
    raw_description_key text not null check (char_length(raw_description_key) between 1 and 240),
    canonical_name text not null check (char_length(canonical_name) between 1 and 200),
    brand text check (brand is null or char_length(brand) <= 100),
    category text check (category is null or char_length(category) <= 80),
    barcode text check (barcode is null or barcode ~ '^[0-9]{8,14}$'),
    source text not null check (char_length(source) between 1 and 120),
    verified_by text not null check (char_length(verified_by) between 1 and 200),
    verified_at timestamptz not null default now(),
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (merchant_key, raw_description_key)
);

create index receipt_catalog_aliases_lookup_idx
    on public.receipt_catalog_aliases (merchant_key, raw_description_key)
    where active;

create trigger receipt_catalog_aliases_set_updated_at
before update on public.receipt_catalog_aliases
for each row execute function private.set_updated_at();

alter table public.receipt_catalog_aliases enable row level security;
revoke all on public.receipt_catalog_aliases from public, anon, authenticated;
grant select, insert, update, delete on public.receipt_catalog_aliases to service_role;

commit;
