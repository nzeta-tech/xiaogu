-- Metadata is used to preserve provenance and make platform scoping explicit.
-- Existing memories remain global unless a scope is chosen.
update avatar_memory_items
set metadata_json = metadata_json || jsonb_build_object('sourceLabel', '历史记忆', 'memoryScope', 'global')
where not (metadata_json ? 'memoryScope');

update avatar_memory_sources
set metadata_json = metadata_json || jsonb_build_object('sourceLabel', coalesce(nullif(source_type, ''), '历史资料'), 'memoryScope', 'global')
where not (metadata_json ? 'memoryScope');
