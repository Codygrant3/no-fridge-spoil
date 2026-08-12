begin;

create schema if not exists private;
revoke all on schema private from public, anon;

create table public.households (
    id uuid primary key default gen_random_uuid(),
    name text not null check (char_length(name) between 1 and 80),
    owner_user_id uuid not null references auth.users(id) on delete cascade,
    daily_receipt_limit integer not null default 50 check (daily_receipt_limit between 1 and 500),
    receipt_retention_days integer not null default 30 check (receipt_retention_days between 0 and 365),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.user_profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name text not null check (char_length(display_name) between 1 and 80),
    default_household_id uuid references public.households(id) on delete set null,
    daily_receipt_limit integer not null default 20 check (daily_receipt_limit between 1 and 200),
    receipt_retention_days integer not null default 30 check (receipt_retention_days between 0 and 365),
    usage_retention_days integer not null default 365 check (usage_retention_days between 30 and 730),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.household_members (
    household_id uuid not null references public.households(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null check (role in ('owner', 'admin', 'member')),
    created_at timestamptz not null default now(),
    primary key (household_id, user_id)
);

create table public.household_profiles (
    id uuid primary key,
    household_id uuid not null references public.households(id) on delete cascade,
    name text not null check (char_length(name) between 1 and 80),
    avatar text not null default '',
    color text not null default '#2f6d55',
    created_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz
);

create table public.inventory_items (
    id uuid primary key,
    household_id uuid not null references public.households(id) on delete cascade,
    profile_id uuid references public.household_profiles(id) on delete set null,
    name text not null check (char_length(name) between 1 and 200),
    brand text,
    quantity numeric(10, 2) not null default 1 check (quantity > 0),
    category text not null default 'Grocery',
    storage_location text not null default 'fridge',
    expiration_date date not null,
    date_type text not null default 'Best By',
    status text not null default 'good' check (status in ('good', 'expiring_soon', 'expired')),
    opened_date date,
    consumed_at timestamptz,
    notes text,
    is_deleted boolean not null default false,
    added_at timestamptz not null default now(),
    created_by uuid,
    updated_at timestamptz not null default now()
);

create table public.shopping_items (
    id uuid primary key,
    household_id uuid not null references public.households(id) on delete cascade,
    profile_id uuid references public.household_profiles(id) on delete set null,
    name text not null check (char_length(name) between 1 and 200),
    brand text,
    quantity numeric(10, 2) not null default 1 check (quantity > 0),
    category text,
    metadata text,
    last_bought date,
    unit text,
    is_checked boolean not null default false,
    is_deleted boolean not null default false,
    added_at timestamptz not null default now(),
    created_by uuid,
    updated_at timestamptz not null default now()
);

create table public.meal_plans (
    id uuid primary key,
    household_id uuid not null references public.households(id) on delete cascade,
    week_start_date date not null,
    meals jsonb not null default '[]'::jsonb check (jsonb_typeof(meals) = 'array'),
    is_deleted boolean not null default false,
    created_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (household_id, week_start_date)
);

create table public.receipt_scans (
    id uuid primary key,
    household_id uuid not null references public.households(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    store_name text,
    receipt_date date,
    item_count integer not null default 0 check (item_count >= 0),
    skipped_item_count integer not null default 0 check (skipped_item_count >= 0),
    provider text not null default 'azure-document-intelligence',
    status text not null check (status in ('accepted', 'succeeded', 'failed', 'denied')),
    http_status integer,
    cost_cents numeric(10, 4) not null default 0 check (cost_cents >= 0),
    source text,
    cache_hit boolean not null default false,
    created_at timestamptz not null default now(),
    completed_at timestamptz,
    expires_at timestamptz not null
);

create table public.usage_events (
    id bigint generated always as identity primary key,
    household_id uuid not null references public.households(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    event_type text not null,
    provider text,
    units numeric(12, 4) not null default 1 check (units >= 0),
    cost_cents numeric(10, 4) not null default 0 check (cost_cents >= 0),
    status text not null,
    http_status integer,
    metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
    created_at timestamptz not null default now(),
    expires_at timestamptz not null
);

create table private.rate_limit_buckets (
    bucket_key text primary key,
    request_count integer not null default 0,
    window_started_at timestamptz not null,
    expires_at timestamptz not null
);

create index household_members_user_idx on public.household_members(user_id, household_id);
create index household_profiles_household_updated_idx on public.household_profiles(household_id, updated_at);
create index inventory_household_updated_idx on public.inventory_items(household_id, updated_at);
create index inventory_household_profile_idx on public.inventory_items(household_id, profile_id) where not is_deleted;
create index shopping_household_updated_idx on public.shopping_items(household_id, updated_at);
create index meal_plans_household_updated_idx on public.meal_plans(household_id, updated_at);
create index receipt_scans_household_created_idx on public.receipt_scans(household_id, created_at desc);
create index receipt_scans_user_created_idx on public.receipt_scans(user_id, created_at desc);
create index receipt_scans_expiry_idx on public.receipt_scans(expires_at);
create index usage_events_household_created_idx on public.usage_events(household_id, created_at desc);
create index usage_events_user_created_idx on public.usage_events(user_id, created_at desc);
create index usage_events_expiry_idx on public.usage_events(expires_at);
create index rate_limit_expiry_idx on private.rate_limit_buckets(expires_at);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger households_set_updated_at before update on public.households
for each row execute function private.set_updated_at();
create trigger user_profiles_set_updated_at before update on public.user_profiles
for each row execute function private.set_updated_at();
create trigger household_profiles_set_updated_at before update on public.household_profiles
for each row execute function private.set_updated_at();
create trigger inventory_set_updated_at before update on public.inventory_items
for each row execute function private.set_updated_at();
create trigger shopping_set_updated_at before update on public.shopping_items
for each row execute function private.set_updated_at();
create trigger meal_plans_set_updated_at before update on public.meal_plans
for each row execute function private.set_updated_at();

create or replace function private.protect_tenant_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.id is distinct from old.id
       or new.household_id is distinct from old.household_id then
        raise exception 'Tenant ownership columns cannot be changed';
    end if;
    if new.created_by is distinct from old.created_by
       and coalesce(auth.role(), '') <> 'service_role' then
        raise exception 'Creator attribution cannot be changed';
    end if;
    return new;
end;
$$;

create trigger household_profiles_protect_tenant before update on public.household_profiles
for each row execute function private.protect_tenant_columns();
create trigger inventory_protect_tenant before update on public.inventory_items
for each row execute function private.protect_tenant_columns();
create trigger shopping_protect_tenant before update on public.shopping_items
for each row execute function private.protect_tenant_columns();
create trigger meal_plans_protect_tenant before update on public.meal_plans
for each row execute function private.protect_tenant_columns();

create or replace function private.validate_profile_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.profile_id is not null and not exists (
        select 1
        from public.household_profiles hp
        where hp.id = new.profile_id
          and hp.household_id = new.household_id
    ) then
        raise exception 'Profile does not belong to this household';
    end if;
    return new;
end;
$$;

create trigger inventory_validate_profile before insert or update of household_id, profile_id
on public.inventory_items for each row execute function private.validate_profile_household();
create trigger shopping_validate_profile before insert or update of household_id, profile_id
on public.shopping_items for each row execute function private.validate_profile_household();

create or replace function private.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.household_members hm
        where hm.household_id = target_household_id
          and hm.user_id = (select auth.uid())
    );
$$;

create or replace function private.is_household_admin(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.household_members hm
        where hm.household_id = target_household_id
          and hm.user_id = (select auth.uid())
          and hm.role in ('owner', 'admin')
    );
$$;

grant usage on schema private to authenticated;
grant execute on function private.is_household_member(uuid) to authenticated;
grant execute on function private.is_household_admin(uuid) to authenticated;

alter table public.households enable row level security;
alter table public.user_profiles enable row level security;
alter table public.household_members enable row level security;
alter table public.household_profiles enable row level security;
alter table public.inventory_items enable row level security;
alter table public.shopping_items enable row level security;
alter table public.meal_plans enable row level security;
alter table public.receipt_scans enable row level security;
alter table public.usage_events enable row level security;
alter table private.rate_limit_buckets enable row level security;

create policy user_profiles_select_own on public.user_profiles
for select to authenticated using (id = (select auth.uid()));
create policy user_profiles_update_own on public.user_profiles
for update to authenticated
using (id = (select auth.uid()))
with check (
    id = (select auth.uid())
    and (default_household_id is null or private.is_household_member(default_household_id))
);

create policy households_select_member on public.households
for select to authenticated using (private.is_household_member(id));
create policy households_update_admin on public.households
for update to authenticated using (private.is_household_admin(id)) with check (private.is_household_admin(id));

create policy members_select_household on public.household_members
for select to authenticated using (private.is_household_member(household_id));

create policy household_profiles_select_member on public.household_profiles
for select to authenticated using (private.is_household_member(household_id));
create policy household_profiles_insert_member on public.household_profiles
for insert to authenticated with check (
    private.is_household_member(household_id) and created_by = (select auth.uid())
);
create policy household_profiles_update_member on public.household_profiles
for update to authenticated using (private.is_household_member(household_id))
with check (private.is_household_member(household_id));

create policy inventory_select_member on public.inventory_items
for select to authenticated using (private.is_household_member(household_id));
create policy inventory_insert_member on public.inventory_items
for insert to authenticated with check (
    private.is_household_member(household_id) and created_by = (select auth.uid())
);
create policy inventory_update_member on public.inventory_items
for update to authenticated using (private.is_household_member(household_id))
with check (private.is_household_member(household_id));

create policy shopping_select_member on public.shopping_items
for select to authenticated using (private.is_household_member(household_id));
create policy shopping_insert_member on public.shopping_items
for insert to authenticated with check (
    private.is_household_member(household_id) and created_by = (select auth.uid())
);
create policy shopping_update_member on public.shopping_items
for update to authenticated using (private.is_household_member(household_id))
with check (private.is_household_member(household_id));

create policy meal_plans_select_member on public.meal_plans
for select to authenticated using (private.is_household_member(household_id));
create policy meal_plans_insert_member on public.meal_plans
for insert to authenticated with check (
    private.is_household_member(household_id) and created_by = (select auth.uid())
);
create policy meal_plans_update_member on public.meal_plans
for update to authenticated using (private.is_household_member(household_id))
with check (private.is_household_member(household_id));

create policy receipt_scans_select_member on public.receipt_scans
for select to authenticated using (private.is_household_member(household_id));
create policy usage_events_select_member on public.usage_events
for select to authenticated using (private.is_household_member(household_id));

grant select on public.user_profiles to authenticated;
revoke update on public.user_profiles from authenticated;
grant update (display_name, default_household_id, receipt_retention_days, usage_retention_days) on public.user_profiles to authenticated;
grant select on public.households, public.household_members, public.receipt_scans, public.usage_events to authenticated;
grant select, insert, update on public.household_profiles, public.inventory_items, public.shopping_items, public.meal_plans to authenticated;
revoke update on public.households from authenticated;
grant update (name, receipt_retention_days) on public.households to authenticated;
revoke all on private.rate_limit_buckets from public, anon, authenticated;

grant select, insert, update, delete on
    public.households,
    public.user_profiles,
    public.household_members,
    public.household_profiles,
    public.inventory_items,
    public.shopping_items,
    public.meal_plans,
    public.receipt_scans,
    public.usage_events
to service_role;
grant usage, select on sequence public.usage_events_id_seq to service_role;
grant usage on schema private to service_role;
grant select, insert, update, delete on private.rate_limit_buckets to service_role;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    new_household_id uuid := gen_random_uuid();
    resolved_name text;
begin
    resolved_name := left(
        coalesce(
            nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
            nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
            'Member'
        ),
        80
    );

    insert into public.households (id, name, owner_user_id)
    values (new_household_id, left(resolved_name || '''s Household', 80), new.id);

    insert into public.user_profiles (id, display_name, default_household_id)
    values (new.id, resolved_name, new_household_id);

    insert into public.household_members (household_id, user_id, role)
    values (new_household_id, new.id, 'owner');

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function private.bump_rate_bucket(
    target_key text,
    target_window timestamptz,
    target_expiry timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    next_count integer;
begin
    insert into private.rate_limit_buckets (bucket_key, request_count, window_started_at, expires_at)
    values (target_key, 1, target_window, target_expiry)
    on conflict (bucket_key) do update
    set request_count = private.rate_limit_buckets.request_count + 1,
        expires_at = greatest(private.rate_limit_buckets.expires_at, excluded.expires_at)
    returning request_count into next_count;

    return next_count;
end;
$$;

create or replace function public.reserve_receipt_scan(
    request_id uuid,
    request_user_id uuid,
    request_household_id uuid,
    request_ip_hash text
)
returns table (
    allowed boolean,
    reason text,
    scan_id uuid,
    user_remaining integer,
    household_remaining integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    user_limit integer;
    household_limit integer;
    receipt_retention integer;
    usage_retention integer;
    utc_day timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
    ten_minute_window timestamptz := to_timestamp(floor(extract(epoch from now()) / 600) * 600);
    user_count integer;
    household_count integer;
    ip_short_count integer;
    ip_daily_count integer;
    denied_reason text;
begin
    select up.daily_receipt_limit,
           h.daily_receipt_limit,
           least(up.receipt_retention_days, h.receipt_retention_days),
           up.usage_retention_days
    into user_limit, household_limit, receipt_retention, usage_retention
    from public.household_members hm
    join public.households h on h.id = hm.household_id
    join public.user_profiles up on up.id = hm.user_id
    where hm.household_id = request_household_id
      and hm.user_id = request_user_id;

    if not found then
        return query select false, 'not-a-household-member', null::uuid, 0, 0;
        return;
    end if;

    perform pg_advisory_xact_lock(hashtextextended(request_user_id::text || utc_day::text, 0));
    perform pg_advisory_xact_lock(hashtextextended(request_household_id::text || utc_day::text, 0));

    user_count := private.bump_rate_bucket(
        'receipt:user-day:' || request_user_id::text || ':' || utc_day::date::text,
        utc_day,
        utc_day + interval '2 days'
    );
    household_count := private.bump_rate_bucket(
        'receipt:household-day:' || request_household_id::text || ':' || utc_day::date::text,
        utc_day,
        utc_day + interval '2 days'
    );
    ip_short_count := private.bump_rate_bucket(
        'receipt:ip-10m:' || request_ip_hash || ':' || extract(epoch from ten_minute_window)::bigint::text,
        ten_minute_window,
        ten_minute_window + interval '20 minutes'
    );
    ip_daily_count := private.bump_rate_bucket(
        'receipt:ip-day:' || request_ip_hash || ':' || utc_day::date::text,
        utc_day,
        utc_day + interval '2 days'
    );

    denied_reason := case
        when user_count > user_limit then 'user-daily-limit'
        when household_count > household_limit then 'household-daily-limit'
        when ip_short_count > 10 then 'ip-burst-limit'
        when ip_daily_count > 100 then 'ip-daily-limit'
        else null
    end;

    if denied_reason is not null then
        insert into public.usage_events (
            household_id, user_id, event_type, provider, units, cost_cents, status, metadata, expires_at
        ) values (
            request_household_id,
            request_user_id,
            'receipt_ocr',
            'azure-document-intelligence',
            0,
            0,
            'denied',
            jsonb_build_object('reason', denied_reason),
            now() + make_interval(days => usage_retention)
        );

        return query select
            false,
            denied_reason,
            null::uuid,
            greatest(user_limit - user_count, 0),
            greatest(household_limit - household_count, 0);
        return;
    end if;

    insert into public.receipt_scans (
        id, household_id, user_id, status, expires_at
    ) values (
        request_id,
        request_household_id,
        request_user_id,
        'accepted',
        now() + make_interval(days => receipt_retention)
    );

    return query select
        true,
        'accepted'::text,
        request_id,
        greatest(user_limit - user_count, 0),
        greatest(household_limit - household_count, 0);
end;
$$;

create or replace function public.complete_receipt_scan(
    request_id uuid,
    completion_status text,
    completion_http_status integer default null,
    completion_store_name text default null,
    completion_receipt_date date default null,
    completion_item_count integer default 0,
    completion_skipped_count integer default 0,
    completion_units numeric default 1,
    completion_cost_cents numeric default 0,
    completion_source text default null,
    completion_cache_hit boolean default false,
    completion_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    scan_household_id uuid;
    scan_user_id uuid;
    usage_retention integer;
begin
    if completion_status not in ('succeeded', 'failed') then
        raise exception 'Invalid completion status';
    end if;

    update public.receipt_scans
    set status = completion_status,
        http_status = completion_http_status,
        store_name = completion_store_name,
        receipt_date = completion_receipt_date,
        item_count = greatest(completion_item_count, 0),
        skipped_item_count = greatest(completion_skipped_count, 0),
        cost_cents = greatest(completion_cost_cents, 0),
        source = completion_source,
        cache_hit = completion_cache_hit,
        completed_at = now()
    where id = request_id
      and status = 'accepted'
    returning household_id, user_id into scan_household_id, scan_user_id;

    if not found then return; end if;

    select usage_retention_days into usage_retention
    from public.user_profiles
    where id = scan_user_id;

    insert into public.usage_events (
        household_id, user_id, event_type, provider, units, cost_cents,
        status, http_status, metadata, expires_at
    ) values (
        scan_household_id,
        scan_user_id,
        'receipt_ocr',
        'azure-document-intelligence',
        greatest(completion_units, 0),
        greatest(completion_cost_cents, 0),
        completion_status,
        completion_http_status,
        completion_metadata,
        now() + make_interval(days => coalesce(usage_retention, 365))
    );
end;
$$;

revoke all on function public.reserve_receipt_scan(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.complete_receipt_scan(uuid, text, integer, text, date, integer, integer, numeric, numeric, text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.reserve_receipt_scan(uuid, uuid, uuid, text) to service_role;
grant execute on function public.complete_receipt_scan(uuid, text, integer, text, date, integer, integer, numeric, numeric, text, boolean, jsonb) to service_role;

create or replace function public.cleanup_expired_account_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    receipt_count integer;
    usage_count integer;
    bucket_count integer;
begin
    delete from public.receipt_scans where expires_at <= now();
    get diagnostics receipt_count = row_count;

    delete from public.usage_events where expires_at <= now();
    get diagnostics usage_count = row_count;

    delete from private.rate_limit_buckets where expires_at <= now();
    get diagnostics bucket_count = row_count;

    return jsonb_build_object(
        'receiptScansDeleted', receipt_count,
        'usageEventsDeleted', usage_count,
        'rateLimitBucketsDeleted', bucket_count
    );
end;
$$;

revoke all on function public.cleanup_expired_account_data() from public, anon, authenticated;
grant execute on function public.cleanup_expired_account_data() to service_role;

create view public.household_usage_daily
with (security_invoker = true)
as
select
    household_id,
    user_id,
    date_trunc('day', created_at) as usage_day,
    count(*) filter (where status = 'succeeded') as successful_scans,
    count(*) filter (where status = 'failed') as failed_scans,
    count(*) filter (where status = 'denied') as denied_scans,
    coalesce(sum(units), 0) as total_units,
    coalesce(sum(cost_cents), 0) as total_cost_cents
from public.usage_events
where event_type = 'receipt_ocr'
group by household_id, user_id, date_trunc('day', created_at);

grant select on public.household_usage_daily to authenticated;
grant select on public.household_usage_daily to service_role;

commit;
