-- Saves and reads the indicators of an analysis as rows in "Site_Indicator" (one row per indicator, and per
-- facade for the facade indicators; the nearest-services rows keep their service kind in "nearestService"), as the ER diagram says. These rows are the ONLY place the results are kept:
-- opening a result from the history rebuilds the dashboard from them (Analysis.results is no longer used).
-- Run it once in Supabase -> SQL Editor, AFTER maamar_database.sql. Safe to run twice; nothing is deleted
-- except the old rows of an analysis when it is saved again.

-- 1. An analysis is "running" until its indicators are saved (then the function below marks it "completed").
alter table public."Analysis" alter column status set default 'running';

-- 2. The browser may READ the rows of its own analyses (the projects it owns point to them).
--    Writing goes only through the functions below.
grant select on public."Site_Indicator" to authenticated;
drop policy if exists "Users can view their analysis indicators" on public."Site_Indicator";
create policy "Users can view their analysis indicators"
  on public."Site_Indicator"
  for select
  to authenticated
  using (
    exists (
      select 1 from public."Project" p
      where p."analysisID" = "Site_Indicator"."analysisID"
        and p."userID" = auth.uid()
    )
  );

-- 3. Saving: replaces the rows of the project's analysis, marks it completed and sets its version
--    (and its date when p_renew is true: "Update this project").
--    Why a function: the browser has no write policy on "Site_Indicator", so the function (security definer)
--    checks that the project belongs to the signed-in user, then writes.
drop function if exists public.save_site_indicators(uuid, jsonb);

create or replace function public.save_site_indicators(
  p_project uuid,
  p_rows    jsonb,
  p_version text default 'v1',
  p_renew   boolean default false
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_analysis uuid;
  v_count    integer;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select "analysisID" into v_analysis
    from public."Project"
    where "projectID" = p_project and "userID" = v_user;
  if v_analysis is null then
    raise exception 'Project not found';
  end if;

  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'p_rows must be a non-empty JSON array';
  end if;

  delete from public."Site_Indicator" where "analysisID" = v_analysis;

  insert into public."Site_Indicator" ("analysisID", "indicatorName", facade, "nearestService", value, unit)
    select v_analysis, r."indicatorName", r.facade, r."nearestService", r.value, r.unit
    from jsonb_to_recordset(p_rows)
      as r ("indicatorName" text, facade text, "nearestService" text, value double precision, unit text)
    where r."indicatorName" is not null;
  get diagnostics v_count = row_count;

  update public."Analysis"
    set status  = 'completed',
        version = coalesce(p_version, version),
        "analysisDate" = case when p_renew then now() else "analysisDate" end
    where "analysisID" = v_analysis;

  return v_count;
end;
$$;

revoke all on function public.save_site_indicators(uuid, jsonb, text, boolean) from public, anon;
grant execute on function public.save_site_indicators(uuid, jsonb, text, boolean) to authenticated;
