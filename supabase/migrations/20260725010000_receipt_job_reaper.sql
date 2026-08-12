begin;

create or replace function public.reap_receipt_scan_jobs()
returns table (
    job_id uuid,
    storage_path text,
    reason text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
    return query
    with stale as (
        select jobs.id, jobs.storage_path,
            case
                when jobs.attempts >= jobs.max_attempts then 'attempts-exhausted'
                else 'queue-retention-expired'
            end as failure_reason
        from public.receipt_scan_jobs as jobs
        where (
            jobs.status = 'processing'
            and jobs.lease_expires_at <= now()
            and jobs.attempts >= jobs.max_attempts
        ) or (
            jobs.status in ('queued', 'retry', 'processing')
            and jobs.created_at <= now() - interval '7 days'
        )
        for update skip locked
    ),
    updated_jobs as (
        update public.receipt_scan_jobs as jobs
        set status = 'failed',
            public_error = jsonb_build_object(
                'status', 'service-error',
                'message', 'Receipt processing expired before it could complete.'
            ),
            completed_at = now(),
            updated_at = now(),
            lease_owner = null,
            lease_expires_at = null
        from stale
        where jobs.id = stale.id
        returning jobs.id, jobs.storage_path, stale.failure_reason
    ),
    updated_scans as (
        update public.receipt_scans as scans
        set status = 'failed',
            http_status = 504,
            completed_at = now()
        from updated_jobs
        where scans.id = updated_jobs.id
        returning scans.id
    )
    select jobs.id, jobs.storage_path, jobs.failure_reason
    from updated_jobs as jobs;
end;
$$;

revoke all on function public.reap_receipt_scan_jobs() from public, anon, authenticated;
grant execute on function public.reap_receipt_scan_jobs() to service_role;

commit;
