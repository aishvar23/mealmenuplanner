-- PMP-15 (MP-A-161) · set_provider_batch_email_status — the owner-gated write path
-- for the summary-email lifecycle on a persisted batch revision.
--
-- WHY AN RPC. provider_preparation_batches grants SELECT only (pmp_6 § field-control:
-- every batch column is system/owner-generated) — there is NO authenticated UPDATE
-- policy, so the request-path email service cannot set email_status directly. Rather
-- than reach for the RLS-bypassing service-role client on a user-request path, the
-- service calls this SECURITY DEFINER RPC (mirrors override/regenerate, which also
-- write batch columns past RLS) on the per-request client; the explicit
-- is_provider_owner guard keeps the bypass tenancy-safe.
--
-- ADR-12: the email send is POST-COMMIT and best-effort — a send failure must NOT
-- roll back the batch. This RPC only records the OUTCOME (email_status) after the
-- service has attempted the send; it never sends mail itself. It also emits the
-- § 19.4 observability event (provider_email_sent / provider_email_failed) via
-- emit_provider_event (audit only, no fan-out — the customer is never told the
-- provider's internal email status).

create or replace function public.set_provider_batch_email_status(
  p_batch_id uuid, p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id     uuid := auth.uid();
  v_provider_id uuid;
  v_menu_day_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_status not in ('queued', 'sent', 'failed') then
    raise exception 'invalid email status' using errcode = '22023';
  end if;

  select provider_id, menu_day_id into v_provider_id, v_menu_day_id
  from public.provider_preparation_batches
  where id = p_batch_id;
  if not found then
    raise exception 'batch not found' using errcode = 'P0002'; -- → 404
  end if;
  if not public.is_provider_owner(v_provider_id) then
    raise exception 'provider owner required' using errcode = 'PROWN'; -- → 403
  end if;

  update public.provider_preparation_batches
  set email_status = p_status
  where id = p_batch_id;

  -- § 19.4 audit (only the terminal send outcomes are observable events).
  if p_status in ('sent', 'failed') then
    perform public.emit_provider_event(
      v_provider_id,
      case when p_status = 'sent' then 'provider_email_sent'
           else 'provider_email_failed' end,
      'provider_preparation_batch', p_batch_id, null,
      jsonb_build_object('emailStatus', p_status, 'menuDayId', v_menu_day_id),
      null, null, null
    );
  end if;
end;
$$;

revoke execute on function public.set_provider_batch_email_status(uuid, text)
  from public, anon;
grant execute on function public.set_provider_batch_email_status(uuid, text)
  to authenticated, service_role;
