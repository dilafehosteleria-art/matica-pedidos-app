alter table public.company_branches
add column if not exists fiscal_name text,
add column if not exists tax_id text,
add column if not exists fiscal_address text,
add column if not exists fiscal_city text,
add column if not exists fiscal_postal_code text;

with fiscal_data(id, fiscal_name, tax_id, fiscal_address, fiscal_city, fiscal_postal_code) as (
  values
    ('df58207d-23c4-4635-a05f-af568096d495'::uuid, 'BUREAU VERITAS SOLUTIONS', 'B74156910', 'AVENIDA DE EUROPA, 1', 'ALCOBENDAS', '28108'),
    ('9e99d394-cd7c-4c13-95ae-25da310469dd'::uuid, 'BUREAU VERITAS SUST.FUELS', 'B56205420', 'BO/REVILLA, 6', 'ABANTO Y CIERVANA', '48500'),
    ('dbe6b0b2-fce1-40b2-926e-d4ce281c49af'::uuid, 'ECOINTEGRAL', 'B14518385', 'C/ IMPRENTA ALBORADA,124D', 'CORDOBA', '14014'),
    ('67f0bf94-fe51-44ee-95f3-3ebdb047b5b8'::uuid, 'IDP GLOBAL ENGINEERING', 'B87858296', 'C/ BASILICA, 19 6º IZQ', 'MADRID', '28020'),
    ('6ea56323-04c9-4060-88ff-50c487b184ac'::uuid, 'IDP ING.Y ARQUITECTURA', 'B62731807', 'AV FRANCESC MACIA, 60 3º', 'SABADELL', '08208'),
    ('27584bb3-403b-4ad3-aa57-7349b1c8cd1d'::uuid, 'INDUTEC', 'B27104488', 'RÚA ANDURIÑAS, 5 -15', 'LUGO', '27004'),
    ('121dd82f-7399-48ac-83bc-b4121f074fb4'::uuid, 'PBV INVESTMENT', 'B66176736', 'AV FRANCESC MACIA, 60 3º', 'SABADELL', '08208'),
    ('1ff17af8-5fcc-4093-be9a-d73dca0cf90b'::uuid, 'SÓLIDA', 'B85294437', 'C/ MUSGO, 2 -1.º PLANTA C', 'MADRID', '28023'),
    ('530a03e0-2058-414d-85c7-baf168fd84a3'::uuid, 'BUREAU VERITAS INVERSIONES, S.L.', 'B63091557', 'Cami Can Ametller, 34', 'San Cugat del Valle, Barcelona', '08174'),
    ('28126727-f1b6-47cd-aad3-9785694b0937'::uuid, 'BUREAU VERITAS IBERIA, S.L.', 'B85294437', 'Calle Valportillo Primera, 22-24', 'ALCOBENDAS, MADRID', '28108'),
    ('6b9d7adf-73da-481b-80d7-e89732e3023b'::uuid, 'BUREAU VERITAS INSPECCION Y TESTING, S.L.', 'B08658601', 'Cami Cam Ametller 34, Edif. Bureau Veritas', 'San Cugat del Valles, Barcelona', '08195')
)
update public.company_branches branch
set
  fiscal_name = fiscal_data.fiscal_name,
  tax_id = fiscal_data.tax_id,
  fiscal_address = fiscal_data.fiscal_address,
  fiscal_city = fiscal_data.fiscal_city,
  fiscal_postal_code = fiscal_data.fiscal_postal_code
from fiscal_data
where branch.id = fiscal_data.id;
