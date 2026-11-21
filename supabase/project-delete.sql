-- A user can delete a project from their history.
-- Only the "Project" row goes: the "Analysis" it points to stays (with its results, indicators, plot and
-- surroundings), because other users' projects may share it (analysis-reuse.sql) and it can be reused for
-- 6 months. Project -> Analysis is one-way: deleting a project never touches the analysis.
-- Run it once in Supabase -> SQL Editor, AFTER maamar_database.sql. Safe to run twice; nothing is deleted.

grant delete on public."Project" to authenticated;

drop policy if exists "Users can delete their own projects" on public."Project";
create policy "Users can delete their own projects" on public."Project"
  for delete to authenticated
  using ((select auth.uid()) = "userID");
