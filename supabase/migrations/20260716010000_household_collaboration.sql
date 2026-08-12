begin;

create table public.household_invites (
    id uuid primary key default gen_random_uuid(),
    household_id uuid not null references public.households(id) on delete cascade,
    invited_email text not null check (char_length(invited_email) between 3 and 320),
    role text not null default 'member' check (role in ('admin', 'member')),
    token_hash text not null unique check (char_length(token_hash) = 64),
    invited_by uuid not null references auth.users(id) on delete cascade,
    expires_at timestamptz not null default (now() + interval '7 days'),
    accepted_at timestamptz,
    accepted_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now()
);

create unique index household_invites_pending_email_idx
    on public.household_invites (household_id, lower(invited_email))
    where accepted_at is null;
create index household_invites_expiry_idx on public.household_invites (expires_at)
    where accepted_at is null;

alter table public.household_invites enable row level security;
grant all on public.household_invites to service_role;

create or replace function public.accept_household_invite(
    requested_token_hash text,
    requested_user_id uuid,
    requested_user_email text
)
returns table (household_id uuid, role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
    invite public.household_invites%rowtype;
begin
    select * into invite
    from public.household_invites
    where token_hash = requested_token_hash
      and accepted_at is null
    for update;

    if not found then raise exception 'Invite not found or already used'; end if;
    if invite.expires_at <= now() then raise exception 'Invite has expired'; end if;
    if lower(trim(invite.invited_email)) <> lower(trim(requested_user_email)) then
        raise exception 'Invite email does not match signed-in account';
    end if;

    insert into public.household_members (household_id, user_id, role)
    values (invite.household_id, requested_user_id, invite.role)
    on conflict (household_id, user_id) do update set role = excluded.role;

    update public.household_invites
    set accepted_at = now(), accepted_by = requested_user_id
    where id = invite.id;

    update public.user_profiles
    set default_household_id = coalesce(default_household_id, invite.household_id),
        updated_at = now()
    where id = requested_user_id;

    return query select invite.household_id, invite.role;
end;
$$;

create or replace function public.transfer_household_ownership(
    requested_household_id uuid,
    current_owner_id uuid,
    next_owner_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if current_owner_id = next_owner_id then raise exception 'Choose another member'; end if;
    if not exists (
        select 1 from public.household_members
        where household_id = requested_household_id
          and user_id = current_owner_id
          and role = 'owner'
    ) then raise exception 'Current user is not the household owner'; end if;
    if not exists (
        select 1 from public.household_members
        where household_id = requested_household_id
          and user_id = next_owner_id
    ) then raise exception 'New owner must be a household member'; end if;

    update public.household_members
    set role = case
        when user_id = current_owner_id then 'admin'
        when user_id = next_owner_id then 'owner'
        else role
    end
    where household_id = requested_household_id
      and user_id in (current_owner_id, next_owner_id);

    update public.households
    set owner_user_id = next_owner_id, updated_at = now()
    where id = requested_household_id;
end;
$$;

create or replace function public.cleanup_expired_household_invites()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    deleted_count integer;
begin
    delete from public.household_invites
    where (accepted_at is null and expires_at <= now())
       or created_at <= now() - interval '30 days';
    get diagnostics deleted_count = row_count;
    return deleted_count;
end;
$$;

revoke all on function public.accept_household_invite(text, uuid, text) from public, anon, authenticated;
revoke all on function public.transfer_household_ownership(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.cleanup_expired_household_invites() from public, anon, authenticated;
grant execute on function public.accept_household_invite(text, uuid, text) to service_role;
grant execute on function public.transfer_household_ownership(uuid, uuid, uuid) to service_role;
grant execute on function public.cleanup_expired_household_invites() to service_role;

commit;
