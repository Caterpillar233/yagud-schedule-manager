revoke insert on public.availability_submissions from anon;

drop policy if exists "public can submit availability" on public.availability_submissions;
