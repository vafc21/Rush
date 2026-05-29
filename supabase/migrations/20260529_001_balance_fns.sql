-- Atomic balance helpers used by the dice/crash/mines bet endpoints.
-- See docs/superpowers/specs/2026-05-29-rush-v1-design.md.

create or replace function deduct_balance(
  p_player_id uuid,
  p_amount_cents int
) returns int
language plpgsql
as $$
declare
  new_balance int;
begin
  update lobby_players
    set balance_cents = balance_cents - p_amount_cents
    where id = p_player_id and balance_cents >= p_amount_cents
    returning balance_cents into new_balance;
  return new_balance;  -- null if no row matched (insufficient funds)
end;
$$;

create or replace function credit_balance(
  p_player_id uuid,
  p_amount_cents int
) returns int
language plpgsql
as $$
declare
  new_balance int;
begin
  update lobby_players
    set balance_cents = balance_cents + p_amount_cents
    where id = p_player_id
    returning balance_cents into new_balance;
  return new_balance;
end;
$$;

-- Grant execute to service_role (so PostgREST can call via supabase.rpc()).
grant execute on function deduct_balance(uuid, int) to service_role;
grant execute on function credit_balance(uuid, int) to service_role;
