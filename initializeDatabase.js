import { pool } from './db.js';
import dotenv from 'dotenv';
dotenv.config();

async function initializeDatabase() {
  try {
    console.log('Starting database initialization...');
    console.log('Testing database connection...');
    
    // Test connection first
    try {
      await pool.query('SELECT 1');
      console.log('Database connection successful!');
    } catch (error) {
      console.error('Database connection failed:', error.message);
      console.log('Please check your PostgreSQL server is running and your DATABASE_URL is correct in .env file');
      process.exit(1);
    }

    // Create students table first since other tables reference it
    console.log('Creating students table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.students (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        registration_number character varying NOT NULL UNIQUE,
        name character varying NOT NULL,
        course character varying NOT NULL,
        level_of_study character varying NOT NULL,
        photo_url text,
        national_id character varying,
        birth_certificate character varying,
        date_of_birth date,
        password text,
        CONSTRAINT students_pkey PRIMARY KEY (id)
      );
    `);
    console.log('Created students table');

    console.log('Creating admins table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.admins (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        username character varying NOT NULL UNIQUE,
        password_hash text NOT NULL,
        CONSTRAINT admins_pkey PRIMARY KEY (id)
      );
    `);
    console.log('Created admins table');

    console.log('Creating exam_cards table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.exam_cards (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        student_id uuid,
        file_url text NOT NULL,
        created_at timestamp with time zone DEFAULT now(),
        CONSTRAINT exam_cards_pkey PRIMARY KEY (id),
        CONSTRAINT exam_cards_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
      );
    `);
    console.log('Created exam_cards table');

    console.log('Creating fees table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.fees (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        student_id uuid,
        fee_balance numeric NOT NULL,
        total_paid numeric NOT NULL,
        semester_fee numeric NOT NULL,
        CONSTRAINT fees_pkey PRIMARY KEY (id),
        CONSTRAINT fees_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
      );
    `);
    console.log('Created fees table');

    console.log('Creating finance table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.finance (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        student_id uuid,
        statement text,
        statement_url text,
        receipt_url text,
        created_at timestamp with time zone DEFAULT now(),
        CONSTRAINT finance_pkey PRIMARY KEY (id),
        CONSTRAINT finance_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
      );
    `);
    console.log('Created finance table');

    console.log('Creating registered_units table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.registered_units (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        student_id uuid,
        unit_name character varying NOT NULL,
        unit_code character varying NOT NULL,
        status character varying NOT NULL,
        CONSTRAINT registered_units_pkey PRIMARY KEY (id),
        CONSTRAINT registered_units_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
      );
    `);
    console.log('Created registered_units table');

    console.log('Creating results table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.results (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        student_id uuid,
        semester integer NOT NULL,
        result_data jsonb NOT NULL,
        created_at timestamp with time zone DEFAULT now(),
        CONSTRAINT results_pkey PRIMARY KEY (id),
        CONSTRAINT results_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
      );
    `);
    console.log('Created results table');

    console.log('Creating timetables table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.timetables (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        student_id uuid,
        semester integer NOT NULL CHECK (semester = ANY (ARRAY[1, 2])),
        timetable_data jsonb NOT NULL,
        CONSTRAINT timetables_pkey PRIMARY KEY (id),
        CONSTRAINT timetables_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
      );
    `);
    console.log('Created timetables table');
    
    console.log('Creating units table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.units (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        unit_name character varying NOT NULL,
        unit_code character varying NOT NULL UNIQUE,
        CONSTRAINT units_pkey PRIMARY KEY (id)
      );
    `);
    console.log('Created units table');

    // Create default admin user
    console.log('Checking for default admin user...');
    const adminExists = await pool.query('SELECT * FROM admins WHERE username = $1', ['admin']);
    if (adminExists.rows.length === 0) {
      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await pool.query(
        'INSERT INTO admins (username, password_hash) VALUES ($1, $2)',
        ['admin', hashedPassword]
      );
      console.log('Created default admin user (username: admin, password: admin123)');
    } else {
      console.log('Default admin user already exists');
    }

    console.log('Database initialization completed successfully!');
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
}

// Run the initialization
initializeDatabase()
  .then(() => {
    console.log('Database setup complete. You can now start the server.');
    process.exit(0);
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });