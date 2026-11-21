create index if not exists schedule_exceptions_company_id_idx
on public.schedule_exceptions(company_id)
where company_id is not null;
