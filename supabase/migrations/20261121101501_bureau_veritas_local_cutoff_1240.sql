update public.companies
set local_ordering_guarantee_cutoff = time '12:40'
where slug = 'bureau-veritas'
  and local_ordering_guarantee_cutoff is distinct from time '12:40';
