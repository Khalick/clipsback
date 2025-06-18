-- Main SQL file to create all tables in the correct order

-- Create extension for UUID generation if it doesn't exist
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create tables
\i create_students_table.sql
\i create_admins_table.sql
\i create_exam_cards_table.sql
\i create_fees_table.sql
\i create_finance_table.sql
\i create_registered_units_table.sql
\i create_results_table.sql
\i create_timetables_table.sql
\i create_units_table.sql
