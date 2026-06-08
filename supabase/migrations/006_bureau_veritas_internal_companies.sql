update public.company_branches
set name = 'BUREAU VERITAS IBERIA', active = true
where id = '28126727-f1b6-47cd-aad3-9785694b0937';

update public.company_branches
set name = 'BUREAU VERITAS INSP Y TEST.', active = true
where id = '6b9d7adf-73da-481b-80d7-e89732e3023b';

update public.company_branches
set name = 'BUREAU VERITAS INVERSIONES', active = true
where id = '530a03e0-2058-414d-85c7-baf168fd84a3';

update public.company_branches
set name = 'BUREAU VERITAS SOLUTIONS', active = true
where id = 'df58207d-23c4-4635-a05f-af568096d495';

update public.company_branches
set name = 'BUREAU VERITAS SUST.FUELS', active = true
where id = '9e99d394-cd7c-4c13-95ae-25da310469dd';

with bureau_veritas_branch(id, name) as (
  values
    ('28126727-f1b6-47cd-aad3-9785694b0937'::uuid, 'BUREAU VERITAS IBERIA'),
    ('6b9d7adf-73da-481b-80d7-e89732e3023b'::uuid, 'BUREAU VERITAS INSP Y TEST.'),
    ('530a03e0-2058-414d-85c7-baf168fd84a3'::uuid, 'BUREAU VERITAS INVERSIONES'),
    ('df58207d-23c4-4635-a05f-af568096d495'::uuid, 'BUREAU VERITAS SOLUTIONS'),
    ('9e99d394-cd7c-4c13-95ae-25da310469dd'::uuid, 'BUREAU VERITAS SUST.FUELS'),
    ('dbe6b0b2-fce1-40b2-926e-d4ce281c49af'::uuid, 'ECOINTEGRAL'),
    ('67f0bf94-fe51-44ee-95f3-3ebdb047b5b8'::uuid, 'IDP GLOBAL ENGINEERING'),
    ('6ea56323-04c9-4060-88ff-50c487b184ac'::uuid, 'IDP ING.Y ARQUITECTURA'),
    ('27584bb3-403b-4ad3-aa57-7349b1c8cd1d'::uuid, 'INDUTEC'),
    ('121dd82f-7399-48ac-83bc-b4121f074fb4'::uuid, 'PBV INVESTMENT'),
    ('1ff17af8-5fcc-4093-be9a-d73dca0cf90b'::uuid, 'SÓLIDA')
)
insert into public.company_branches (id, company_id, name, active)
select
  branch.id,
  '7dca1236-f8ad-4d2f-9ec0-2ed0f51ce2a1'::uuid,
  branch.name,
  true
from bureau_veritas_branch branch
where not exists (
  select 1
  from public.company_branches existing
  where existing.company_id = '7dca1236-f8ad-4d2f-9ec0-2ed0f51ce2a1'::uuid
    and upper(existing.name) = upper(branch.name)
)
on conflict (id) do update set
  company_id = excluded.company_id,
  name = excluded.name,
  active = true;
