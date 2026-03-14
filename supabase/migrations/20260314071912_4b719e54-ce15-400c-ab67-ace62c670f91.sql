
-- Rename teams
UPDATE teams SET name = 'T0001' WHERE id = 'f36f747c-1883-4060-b9fe-0edf26911ab2';
UPDATE teams SET name = 'T0002' WHERE id = 'fe0336fc-dce2-4f73-8b37-57082614a280';
UPDATE teams SET name = 'T0003' WHERE id = '9ce4931d-419e-4e30-be41-6165d776ff6b';
UPDATE teams SET name = 'T0004' WHERE id = '34e5fdae-428e-4767-85ad-758cf5aefae7';
UPDATE teams SET name = 'T0005' WHERE id = 'fdc66ea7-7390-450e-b7aa-e5f90d38d5f3';
UPDATE teams SET name = 'T0006' WHERE id = 'f45ed260-5bd3-42b2-82f6-893309d7c81f';
UPDATE teams SET name = 'T0007' WHERE id = '4b36b2be-d09a-4890-853e-452ffc14f8b7';
UPDATE teams SET name = 'T0008' WHERE id = 'f3deddec-7b54-4cce-982e-62294d6d314d';
UPDATE teams SET name = 'T0009' WHERE id = 'adc1be39-e472-4b1e-8e83-31da9f9983de';
UPDATE teams SET name = 'T0010' WHERE id = 'bbe0cc6f-33f0-45b2-ac2a-d108d397b14a';
UPDATE teams SET name = 'T0011' WHERE id = '7544ee81-6da3-42f4-a9da-214d0392a25c';

-- Also update client_data.team to match new names
UPDATE client_data SET team = 'T0001' WHERE TRIM(team) = 'EQUIPE 1';
UPDATE client_data SET team = 'T0002' WHERE TRIM(team) = 'EQUIPE 2';
UPDATE client_data SET team = 'T0003' WHERE TRIM(team) = 'EQUIPE 3';
UPDATE client_data SET team = 'T0004' WHERE TRIM(team) = 'EQUIPE 4';
UPDATE client_data SET team = 'T0005' WHERE TRIM(team) = 'EQUIPE 5';
UPDATE client_data SET team = 'T0006' WHERE TRIM(team) = 'EQUIPE 6';
UPDATE client_data SET team = 'T0007' WHERE TRIM(team) = 'EQUIPE 7';
UPDATE client_data SET team = 'T0008' WHERE TRIM(team) = 'EQUIPE 8';
UPDATE client_data SET team = 'T0009' WHERE TRIM(team) = 'EQUIPE 9';
UPDATE client_data SET team = 'T0010' WHERE TRIM(team) = 'EQUIPE 10';
UPDATE client_data SET team = 'T0011' WHERE TRIM(team) = 'EQUIPE 11';
