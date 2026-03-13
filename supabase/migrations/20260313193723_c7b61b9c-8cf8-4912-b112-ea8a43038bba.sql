UPDATE client_data 
SET company = TRIM(SUBSTRING(company FROM '^\w+\d+\s*-\s*(.*)$'))
WHERE company ~ '^[A-Z]\d+\s*-\s*';