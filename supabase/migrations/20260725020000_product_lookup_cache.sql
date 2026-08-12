begin;

create table if not exists public.product_lookup_cache (
    barcode text primary key,
    product jsonb,
    cached_at timestamptz not null default now(),
    expires_at timestamptz not null,
    check (barcode ~ '^[0-9]{8,14}$'),
    check (product is null or jsonb_typeof(product) = 'object')
);

create index if not exists product_lookup_cache_expiry_idx
on public.product_lookup_cache (expires_at);

alter table public.product_lookup_cache enable row level security;
revoke all on public.product_lookup_cache from public, anon, authenticated;
grant all on public.product_lookup_cache to service_role;

commit;
