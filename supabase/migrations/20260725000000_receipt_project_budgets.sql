begin;

create or replace function public.check_receipt_project_budget(
    request_id uuid,
    provider_name text,
    monthly_page_budget numeric,
    monthly_cost_budget_cents numeric,
    reserved_cost_cents numeric default 0
)
returns table (
    allowed boolean,
    reason text,
    pages_used numeric,
    cost_cents_used numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    month_start timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
    completed_pages numeric;
    pending_pages numeric;
    completed_cost numeric;
begin
    if monthly_page_budget <= 0 or monthly_cost_budget_cents <= 0 then
        return query select false, 'project-budget-not-configured', 0::numeric, 0::numeric;
        return;
    end if;

    perform pg_advisory_xact_lock(hashtextextended('receipt-project-budget:' || month_start::text, 0));

    update public.receipt_scans
    set provider = provider_name
    where id = request_id
      and status = 'accepted';

    if not found then
        return query select false, 'receipt-reservation-not-found', 0::numeric, 0::numeric;
        return;
    end if;

    select coalesce(sum(units), 0), coalesce(sum(cost_cents), 0)
    into completed_pages, completed_cost
    from public.usage_events
    where event_type = 'receipt_ocr'
      and status = 'succeeded'
      and created_at >= month_start;

    select count(*)
    into pending_pages
    from public.receipt_scans
    where status = 'accepted'
      and created_at >= month_start;

    pages_used := completed_pages + pending_pages;
    cost_cents_used := completed_cost + (pending_pages * greatest(reserved_cost_cents, 0));

    if pages_used > monthly_page_budget then
        allowed := false;
        reason := 'project-monthly-page-budget';
    elsif cost_cents_used > monthly_cost_budget_cents then
        allowed := false;
        reason := 'project-monthly-cost-budget';
    else
        allowed := true;
        reason := 'accepted';
    end if;

    return next;
end;
$$;

revoke all on function public.check_receipt_project_budget(uuid, text, numeric, numeric, numeric)
from public, anon, authenticated;
grant execute on function public.check_receipt_project_budget(uuid, text, numeric, numeric, numeric)
to service_role;

commit;
