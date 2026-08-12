begin;

create table public.receipt_scan_jobs (
    id uuid primary key references public.receipt_scans(id) on delete cascade,
    household_id uuid not null references public.households(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    status text not null default 'queued'
        check (status in ('queued', 'processing', 'retry', 'succeeded', 'failed', 'canceled')),
    storage_path text not null unique,
    content_type text not null,
    original_name text not null,
    result_data jsonb,
    public_error jsonb,
    attempts integer not null default 0 check (attempts >= 0),
    max_attempts integer not null default 3 check (max_attempts between 1 and 10),
    next_attempt_at timestamptz not null default now(),
    lease_owner text,
    lease_expires_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    completed_at timestamptz
);

create index receipt_scan_jobs_ready_idx
    on public.receipt_scan_jobs (next_attempt_at, created_at)
    where status in ('queued', 'retry', 'processing');
create index receipt_scan_jobs_household_idx
    on public.receipt_scan_jobs (household_id, created_at desc);

alter table public.receipt_scan_jobs enable row level security;

create policy "Members can read their receipt jobs"
on public.receipt_scan_jobs for select
to authenticated
using (
    user_id = (select auth.uid())
    and private.is_household_member(household_id)
);

grant select on public.receipt_scan_jobs to authenticated;
grant all on public.receipt_scan_jobs to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'receipt-uploads',
    'receipt-uploads',
    false,
    4194304,
    array[
        'application/pdf',
        'image/bmp',
        'image/heif',
        'image/jpeg',
        'image/png',
        'image/tiff'
    ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.claim_receipt_scan_job(
    worker_id text,
    requested_id uuid default null
)
returns table (
    id uuid,
    household_id uuid,
    user_id uuid,
    status text,
    storage_path text,
    content_type text,
    original_name text,
    attempts integer,
    max_attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
    if nullif(trim(worker_id), '') is null then
        raise exception 'Worker id is required';
    end if;

    return query
    with candidate as (
        select jobs.id
        from public.receipt_scan_jobs as jobs
        where (requested_id is null or jobs.id = requested_id)
          and jobs.attempts < jobs.max_attempts
          and (
              (jobs.status in ('queued', 'retry') and jobs.next_attempt_at <= now())
              or (jobs.status = 'processing' and jobs.lease_expires_at <= now())
          )
        order by
            case when jobs.id = requested_id then 0 else 1 end,
            jobs.next_attempt_at,
            jobs.created_at
        for update skip locked
        limit 1
    )
    update public.receipt_scan_jobs as jobs
    set status = 'processing',
        attempts = jobs.attempts + 1,
        lease_owner = left(worker_id, 200),
        lease_expires_at = now() + interval '70 seconds',
        updated_at = now()
    from candidate
    where jobs.id = candidate.id
    returning
        jobs.id,
        jobs.household_id,
        jobs.user_id,
        jobs.status,
        jobs.storage_path,
        jobs.content_type,
        jobs.original_name,
        jobs.attempts,
        jobs.max_attempts;
end;
$$;

revoke all on function public.claim_receipt_scan_job(text, uuid) from public, anon, authenticated;
grant execute on function public.claim_receipt_scan_job(text, uuid) to service_role;

commit;
