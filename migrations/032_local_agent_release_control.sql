alter table local_agent_nodes
  add column if not exists protocol_version integer not null default 0;

insert into system_settings(setting_key, setting_value, updated_at)
values ('features', '{"localAgentEnabled": false}'::jsonb, now())
on conflict(setting_key) do update set
  setting_value = case
    when system_settings.setting_value ? 'localAgentEnabled' then system_settings.setting_value
    else system_settings.setting_value || '{"localAgentEnabled": false}'::jsonb
  end,
  updated_at = now();
