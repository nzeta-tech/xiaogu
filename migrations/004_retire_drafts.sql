do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'drafts'
  ) and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'drafts_legacy'
  ) then
    alter table drafts rename to drafts_legacy;
  end if;
end $$;
