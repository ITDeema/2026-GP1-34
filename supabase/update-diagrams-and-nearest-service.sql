-- ONE-TIME UPDATE for the live database. Run this whole file once in Supabase -> SQL Editor.
-- Safe to run twice; no rows are deleted.
--
--   Part A: the table "Plot_Surroundings" becomes "Analytical_diagrams" (key "diagramID"), and its three
--           functions (project_surroundings, save_surroundings, has_recent_surroundings) are re-created with the new name.
--   Part B: "Site_Indicator" gets a column "nearestService" (the service kind of the nearest-services rows),
--           the two functions that write it are re-created, and the old rows are moved from "facade" to the new column.
--
-- It does not change the default of "Analysis".status.

-- =====================================================================================================
-- PART A: Analytical_diagrams
-- =====================================================================================================

-- The data of the analytical diagrams (land use and roads), saved per plot in "Analytical_diagrams".
-- The sun and wind diagram is not saved: it is the same for all of Riyadh.
-- Run it once in Supabase -> SQL Editor, AFTER analysis-reuse.sql. Safe to run twice; nothing is deleted.
--
-- The rule:
--   * For every project, whatever the user's role: the surroundings are fetched and saved with the analysis
--     (only architects see the diagrams, but a homeowner who becomes an architect finds them ready).
--   * A plot's surroundings fetched less than 6 months ago (by anyone) are reused, not fetched again.
--   * After 6 months a NEW row is added; the old rows stay, so old projects keep the diagrams of their time.
--   * One row per plot in each 6 months: save_surroundings locks the plot while it checks and saves.
--   * A project older than 6 months shows the surroundings of its own time (fetched up to 6 months after its
--     analysis); when it has none, the newest ones. "Update this project" makes it new again, and then it
--     takes surroundings less than 6 months old (or fetches them).

-- 0. The table used to be called "Plot_Surroundings" (key "surroundingsID"). If it still has the old names,
--    they are renamed here; if it already has the new ones, nothing happens. No data is touched.
do $$
begin
  if to_regclass('public."Plot_Surroundings"') is not null
     and to_regclass('public."Analytical_diagrams"') is null then
    alter table public."Plot_Surroundings" rename to "Analytical_diagrams";
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'Analytical_diagrams' and column_name = 'surroundingsID') then
    alter table public."Analytical_diagrams" rename column "surroundingsID" to "diagramID";
  end if;
  if exists (select 1 from pg_constraint where conname = 'Plot_Surroundings_pkey'
             and conrelid = to_regclass('public."Analytical_diagrams"')) then
    alter table public."Analytical_diagrams" rename constraint "Plot_Surroundings_pkey" to "Analytical_diagrams_pkey";
  end if;
  if exists (select 1 from pg_constraint where conname = 'Plot_Surroundings_plotID_fkey'
             and conrelid = to_regclass('public."Analytical_diagrams"')) then
    alter table public."Analytical_diagrams" rename constraint "Plot_Surroundings_plotID_fkey" to "Analytical_diagrams_plotID_fkey";
  end if;
  if to_regclass('public."Plot_Surroundings_plot_idx"') is not null then
    alter index public."Plot_Surroundings_plot_idx" rename to "Analytical_diagrams_plot_idx";
  end if;
end $$;

-- 1. The table (Plot 1 —— 0..* Analytical_diagrams)
create table if not exists public."Analytical_diagrams" (
  "diagramID" uuid primary key default gen_random_uuid(),
  "plotID"         uuid not null references public."Plot" ("plotID") on delete cascade,
  "landUseData"    jsonb not null,
  "roadsData"      jsonb not null,
  "fetchedAt"      timestamptz not null default now()
);

alter table public."Analytical_diagrams" drop column if exists radius;
alter table public."Analytical_diagrams" drop column if exists source;

create index if not exists "Analytical_diagrams_plot_idx"
  on public."Analytical_diagrams" ("plotID", "fetchedAt" desc);

alter table public."Analytical_diagrams" enable row level security;

-- the user reads the surroundings of the plots in their own projects (writing is only through save_surroundings)
drop policy if exists "Users can view surroundings of their plots" on public."Analytical_diagrams";
create policy "Users can view surroundings of their plots" on public."Analytical_diagrams"
  for select to authenticated
  using (exists (
    select 1 from public."Analysis" a
    join public."Project" p on p."analysisID" = a."analysisID"
    where a."plotID" = "Analytical_diagrams"."plotID"
      and p."userID" = (select auth.uid())
  ));


-- 2. The surroundings a project shows. null = none saved (the website then fetches them and saves them).
create or replace function public.project_surroundings(p_project uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_plot uuid;
  v_date timestamptz;
  v_row  public."Analytical_diagrams";
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select a."plotID", a."analysisDate" into v_plot, v_date
    from public."Project" p
    join public."Analysis" a on a."analysisID" = p."analysisID"
    where p."projectID" = p_project and p."userID" = v_user;
  if v_plot is null then
    raise exception 'Project not found';
  end if;
  if v_date > now() - interval '6 months' then
    -- a recent analysis: surroundings less than 6 months old
    select * into v_row from public."Analytical_diagrams"
      where "plotID" = v_plot and "fetchedAt" > now() - interval '6 months'
      order by "fetchedAt" desc limit 1;
  else
    -- an analysis older than 6 months: the surroundings of its own time, otherwise the newest ones
    select * into v_row from public."Analytical_diagrams"
      where "plotID" = v_plot and "fetchedAt" <= v_date + interval '6 months'
      order by "fetchedAt" desc limit 1;
    if v_row."diagramID" is null then
      select * into v_row from public."Analytical_diagrams"
        where "plotID" = v_plot
        order by "fetchedAt" desc limit 1;
    end if;
  end if;

  if v_row."diagramID" is null then
    return null;
  end if;
  return jsonb_build_object(
    'landUseData', v_row."landUseData",
    'roadsData',   v_row."roadsData",
    'fetchedAt',   v_row."fetchedAt"
  );
end;
$$;

revoke all on function public.project_surroundings(uuid) from public, anon;
grant execute on function public.project_surroundings(uuid) to authenticated;


-- 3. Saves the surroundings the website fetched for a project (every role).
--    Not saved again when the plot already has surroundings less than 6 months old (no duplicates).
create or replace function public.save_surroundings(
  p_project  uuid,
  p_land_use jsonb,
  p_roads    jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_plot uuid;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select a."plotID" into v_plot
    from public."Project" p
    join public."Analysis" a on a."analysisID" = p."analysisID"
    where p."projectID" = p_project and p."userID" = v_user;
  if v_plot is null then
    raise exception 'Project not found';
  end if;
  if jsonb_typeof(p_land_use) is distinct from 'object' or jsonb_typeof(p_roads) is distinct from 'object' then
    raise exception 'p_land_use and p_roads must be JSON objects';
  end if;

  -- one save at a time for the same plot: the analysis page and the results page can save at the same moment,
  -- and without this both would see no row and both insert (two rows for one plot)
  perform pg_advisory_xact_lock(hashtext(v_plot::text));

  if exists (
    select 1 from public."Analytical_diagrams"
    where "plotID" = v_plot and "fetchedAt" > now() - interval '6 months'
  ) then
    return false; -- already saved (by this or another user)
  end if;

  insert into public."Analytical_diagrams" ("plotID", "landUseData", "roadsData")
    values (v_plot, p_land_use, p_roads);
  return true;
end;
$$;

revoke all on function public.save_surroundings(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_surroundings(uuid, jsonb, jsonb) to authenticated;


-- 4. For the analysis page: does this plot have surroundings less than 6 months old?
--    Then it does not start fetching them. Only answers yes or no.
create or replace function public.has_recent_surroundings(p_boundary jsonb)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and p_boundary is not null and exists (
    select 1
    from public."Plot" pl
    join public."Analytical_diagrams" s on s."plotID" = pl."plotID"
    where pl."boundaryKey" = md5(p_boundary::text)
      and s."fetchedAt" > now() - interval '6 months'
  );
$$;

revoke all on function public.has_recent_surroundings(jsonb) from public, anon;
grant execute on function public.has_recent_surroundings(jsonb) to authenticated;


-- =====================================================================================================
-- PART B: Site_Indicator.nearestService
-- =====================================================================================================

-- 1. The column (nothing breaks while it is empty)
alter table public."Site_Indicator" add column if not exists "nearestService" text;

-- 2. The functions that write the nearest-services rows now fill it
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


drop function if exists public.add_services(uuid, jsonb, jsonb);

create or replace function public.add_services(
  p_project uuid,
  p_rows    jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_analysis uuid;
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

  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  -- only for a saved analysis that has no services yet
  if not exists (select 1 from public."Site_Indicator" where "analysisID" = v_analysis)
     or exists (
       select 1 from public."Site_Indicator"
       where "analysisID" = v_analysis and "indicatorName" in ('serviceDistance', 'serviceCount')
     ) then
    return false;
  end if;

  insert into public."Site_Indicator" ("analysisID", "indicatorName", facade, "nearestService", value, unit)
    select v_analysis, r."indicatorName", r.facade, r."nearestService", r.value, r.unit
    from jsonb_to_recordset(p_rows)
      as r ("indicatorName" text, facade text, "nearestService" text, value double precision, unit text)
    where r."indicatorName" in ('serviceDistance', 'serviceCount');
  return found;
end;
$$;

revoke all on function public.add_services(uuid, jsonb) from public, anon;
grant execute on function public.add_services(uuid, jsonb) to authenticated;


-- 3. The rows saved before: the service kind moves from "facade" to "nearestService"
update public."Site_Indicator"
   set "nearestService" = facade,
       facade = null
 where "indicatorName" in ('serviceDistance', 'serviceCount')
   and "nearestService" is null
   and facade is not null;

-- 4. Check (should return no rows): a service row still holding its kind in "facade", or without a kind
select "indicatorID", "indicatorName", facade, "nearestService"
  from public."Site_Indicator"
 where "indicatorName" in ('serviceDistance', 'serviceCount')
   and (facade is not null or "nearestService" is null);
