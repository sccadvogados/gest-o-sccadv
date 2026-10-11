alter table public.client_documents add column if not exists drive_file_id text;
alter table public.contracts add column if not exists drive_folder_id text;
notify pgrst, 'reload schema';
