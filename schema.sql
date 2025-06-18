-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.admins (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  username character varying NOT NULL UNIQUE,
  password_hash text NOT NULL,
  CONSTRAINT admins_pkey PRIMARY KEY (id)
);
CREATE TABLE public.exam_cards (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid,
  file_url text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT exam_cards_pkey PRIMARY KEY (id),
  CONSTRAINT exam_cards_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
);
CREATE TABLE public.fees (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid,
  fee_balance numeric NOT NULL,
  total_paid numeric NOT NULL,
  semester_fee numeric NOT NULL,
  CONSTRAINT fees_pkey PRIMARY KEY (id),
  CONSTRAINT fees_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
);
CREATE TABLE public.finance (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid,
  statement text,
  receipt_url text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT finance_pkey PRIMARY KEY (id),
  CONSTRAINT finance_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
);
CREATE TABLE public.registered_units (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid,
  unit_name character varying NOT NULL,
  unit_code character varying NOT NULL,
  status character varying NOT NULL,
  CONSTRAINT registered_units_pkey PRIMARY KEY (id),
  CONSTRAINT registered_units_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
);
CREATE TABLE public.results (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid,
  semester integer NOT NULL,
  result_data jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT results_pkey PRIMARY KEY (id),
  CONSTRAINT results_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
);
CREATE TABLE public.students (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  registration_number character varying NOT NULL UNIQUE,
  name character varying NOT NULL,
  course character varying NOT NULL,
  level_of_study character varying NOT NULL,
  photo_url text,
  CONSTRAINT students_pkey PRIMARY KEY (id)
);
CREATE TABLE public.timetables (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid,
  semester integer NOT NULL CHECK (semester = ANY (ARRAY[1, 2])),
  timetable_data jsonb NOT NULL,
  CONSTRAINT timetables_pkey PRIMARY KEY (id),
  CONSTRAINT timetables_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
);