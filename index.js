import { Hono } from 'hono';
import { pool } from './db.js';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

const app = new Hono();
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Accept','Access-Control-Allow-Origin'],
  credentials: true,
}));

// Log every request
app.use('*', async (c, next) => {
  console.log(`[${new Date().toISOString()}] ${c.req.method} ${c.req.path}`);
  try {
    await next();
  } catch (err) {
    console.error('Global error handler:', err);
    return c.json({ error: 'Internal Server Error', details: err.message }, 500);
  }
});

// Supabase Storage setup
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Get all students
app.get('/students', async (c) => {
  const { rows } = await pool.query('SELECT * FROM students');
  return c.json(rows);
});

// Get a single student by ID
app.get('/students/:id', async (c) => {
  const id = c.req.param('id');
  const { rows } = await pool.query('SELECT * FROM students WHERE id = $1', [id]);
  if (rows.length === 0) return c.json({ error: 'Student not found' }, 404);
  return c.json(rows[0]);
});

// Create a new student
app.post('/students', async (c) => {
  const data = await c.req.json();
  const { registration_number, name, course, level_of_study, photo_url } = data;
  const { rows } = await pool.query(
    'INSERT INTO students (registration_number, name, course, level_of_study, photo_url) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [registration_number, name, course, level_of_study, photo_url]
  );
  return c.json(rows[0]);
});

// Update a student
app.put('/students/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  const { registration_number, name, course, level_of_study, photo_url } = data;
  const { rows } = await pool.query(
    'UPDATE students SET registration_number=$1, name=$2, course=$3, level_of_study=$4, photo_url=$5 WHERE id=$6 RETURNING *',
    [registration_number, name, course, level_of_study, photo_url, id]
  );
  if (rows.length === 0) return c.json({ error: 'Student not found' }, 404);
  return c.json(rows[0]);
});

// Delete a student
app.delete('/students/:id', async (c) => {
  const id = c.req.param('id');
  await pool.query('DELETE FROM students WHERE id = $1', [id]);
  return c.json({ message: 'Student deleted' });
});

// REGISTERED_UNITS CRUD
app.get('/registered_units', async (c) => {
  const { rows } = await pool.query('SELECT * FROM registered_units');
  return c.json(rows);
});
app.get('/registered_units/:id', async (c) => {
  const id = c.req.param('id');
  const { rows } = await pool.query('SELECT * FROM registered_units WHERE id = $1', [id]);
  if (rows.length === 0) return c.json({ error: 'Unit not found' }, 404);
  return c.json(rows[0]);
});
app.post('/registered_units', async (c) => {
  const data = await c.req.json();
  const { student_id, unit_name, unit_code, status } = data;
  const { rows } = await pool.query(
    'INSERT INTO registered_units (student_id, unit_name, unit_code, status) VALUES ($1, $2, $3, $4) RETURNING *',
    [student_id, unit_name, unit_code, status]
  );
  return c.json(rows[0]);
});
app.put('/registered_units/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  const { student_id, unit_name, unit_code, status } = data;
  const { rows } = await pool.query(
    'UPDATE registered_units SET student_id=$1, unit_name=$2, unit_code=$3, status=$4 WHERE id=$5 RETURNING *',
    [student_id, unit_name, unit_code, status, id]
  );
  if (rows.length === 0) return c.json({ error: 'Unit not found' }, 404);
  return c.json(rows[0]);
});
app.delete('/registered_units/:id', async (c) => {
  const id = c.req.param('id');
  await pool.query('DELETE FROM registered_units WHERE id = $1', [id]);
  return c.json({ message: 'Unit deleted' });
});

// FEES CRUD
app.get('/fees', async (c) => {
  const { rows } = await pool.query('SELECT * FROM fees');
  return c.json(rows);
});
app.get('/fees/:id', async (c) => {
  const id = c.req.param('id');
  const { rows } = await pool.query('SELECT * FROM fees WHERE id = $1', [id]);
  if (rows.length === 0) return c.json({ error: 'Fee not found' }, 404);
  return c.json(rows[0]);
});
app.post('/fees', async (c) => {
  const data = await c.req.json();
  const { student_id, fee_balance, total_paid, semester_fee } = data;
  const { rows } = await pool.query(
    'INSERT INTO fees (student_id, fee_balance, total_paid, semester_fee) VALUES ($1, $2, $3, $4) RETURNING *',
    [student_id, fee_balance, total_paid, semester_fee]
  );
  return c.json(rows[0]);
});
app.put('/fees/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  const { student_id, fee_balance, total_paid, semester_fee } = data;
  const { rows } = await pool.query(
    'UPDATE fees SET student_id=$1, fee_balance=$2, total_paid=$3, semester_fee=$4 WHERE id=$5 RETURNING *',
    [student_id, fee_balance, total_paid, semester_fee, id]
  );
  if (rows.length === 0) return c.json({ error: 'Fee not found' }, 404);
  return c.json(rows[0]);
});
app.delete('/fees/:id', async (c) => {
  const id = c.req.param('id');
  await pool.query('DELETE FROM fees WHERE id = $1', [id]);
  return c.json({ message: 'Fee deleted' });
});

// TIMETABLES CRUD
app.get('/timetables', async (c) => {
  const { rows } = await pool.query('SELECT * FROM timetables');
  return c.json(rows);
});
app.get('/timetables/:id', async (c) => {
  const id = c.req.param('id');
  const { rows } = await pool.query('SELECT * FROM timetables WHERE id = $1', [id]);
  if (rows.length === 0) return c.json({ error: 'Timetable not found' }, 404);
  return c.json(rows[0]);
});
app.post('/timetables', async (c) => {
  const data = await c.req.json();
  const { student_id, semester, timetable_data } = data;
  const { rows } = await pool.query(
    'INSERT INTO timetables (student_id, semester, timetable_data) VALUES ($1, $2, $3) RETURNING *',
    [student_id, semester, timetable_data]
  );
  return c.json(rows[0]);
});
app.put('/timetables/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  const { student_id, semester, timetable_data } = data;
  const { rows } = await pool.query(
    'UPDATE timetables SET student_id=$1, semester=$2, timetable_data=$3 WHERE id=$4 RETURNING *',
    [student_id, semester, timetable_data, id]
  );
  if (rows.length === 0) return c.json({ error: 'Timetable not found' }, 404);
  return c.json(rows[0]);
});
app.delete('/timetables/:id', async (c) => {
  const id = c.req.param('id');
  await pool.query('DELETE FROM timetables WHERE id = $1', [id]);
  return c.json({ message: 'Timetable deleted' });
});

// FINANCE CRUD
app.get('/finance', async (c) => {
  const { rows } = await pool.query('SELECT * FROM finance');
  return c.json(rows);
});
app.get('/finance/:id', async (c) => {
  const id = c.req.param('id');
  const { rows } = await pool.query('SELECT * FROM finance WHERE id = $1', [id]);
  if (rows.length === 0) return c.json({ error: 'Finance not found' }, 404);
  return c.json(rows[0]);
});
app.post('/finance', async (c) => {
  const data = await c.req.json();
  const { student_id, statement, receipt_url } = data;
  const { rows } = await pool.query(
    'INSERT INTO finance (student_id, statement, receipt_url) VALUES ($1, $2, $3) RETURNING *',
    [student_id, statement, receipt_url]
  );
  return c.json(rows[0]);
});
app.put('/finance/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  const { student_id, statement, receipt_url } = data;
  const { rows } = await pool.query(
    'UPDATE finance SET student_id=$1, statement=$2, receipt_url=$3 WHERE id=$4 RETURNING *',
    [student_id, statement, receipt_url, id]
  );
  if (rows.length === 0) return c.json({ error: 'Finance not found' }, 404);
  return c.json(rows[0]);
});
app.delete('/finance/:id', async (c) => {
  const id = c.req.param('id');
  await pool.query('DELETE FROM finance WHERE id = $1', [id]);
  return c.json({ message: 'Finance deleted' });
});

// RESULTS CRUD
app.get('/results', async (c) => {
  const { rows } = await pool.query('SELECT * FROM results');
  return c.json(rows);
});
app.get('/results/:id', async (c) => {
  const id = c.req.param('id');
  const { rows } = await pool.query('SELECT * FROM results WHERE id = $1', [id]);
  if (rows.length === 0) return c.json({ error: 'Result not found' }, 404);
  return c.json(rows[0]);
});
app.post('/results', async (c) => {
  const data = await c.req.json();
  const { student_id, semester, result_data } = data;
  const { rows } = await pool.query(
    'INSERT INTO results (student_id, semester, result_data) VALUES ($1, $2, $3) RETURNING *',
    [student_id, semester, result_data]
  );
  return c.json(rows[0]);
});
app.put('/results/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  const { student_id, semester, result_data } = data;
  const { rows } = await pool.query(
    'UPDATE results SET student_id=$1, semester=$2, result_data=$3 WHERE id=$4 RETURNING *',
    [student_id, semester, result_data, id]
  );
  if (rows.length === 0) return c.json({ error: 'Result not found' }, 404);
  return c.json(rows[0]);
});
app.delete('/results/:id', async (c) => {
  const id = c.req.param('id');
  await pool.query('DELETE FROM results WHERE id = $1', [id]);
  return c.json({ message: 'Result deleted' });
});

// UNITS CRUD
app.get('/units', async (c) => {
  const { rows } = await pool.query('SELECT * FROM units');
  return c.json(rows);
});
app.post('/units', async (c) => {
  const { unit_name, unit_code } = await c.req.json();
  const { rows } = await pool.query(
    'INSERT INTO units (unit_name, unit_code) VALUES ($1, $2) RETURNING *',
    [unit_name, unit_code]
  );
  return c.json(rows[0]);
});
// Register a unit for a student (student registers a unit)
app.post('/students/:id/register-unit', async (c) => {
  const student_id = c.req.param('id');
  const { unit_id } = await c.req.json();
  // Get unit details
  const unitRes = await pool.query('SELECT * FROM units WHERE id = $1', [unit_id]);
  if (unitRes.rows.length === 0) return c.json({ error: 'Unit not found' }, 404);
  const unit = unitRes.rows[0];
  // Register the unit for the student
  const { rows } = await pool.query(
    'INSERT INTO registered_units (student_id, unit_name, unit_code, status) VALUES ($1, $2, $3, $4) RETURNING *',
    [student_id, unit.unit_name, unit.unit_code, 'registered']
  );
  return c.json(rows[0]);
});

// Admin login using Supabase admins table and JWT
app.options('/auth/admin-login', (c) => {
  return c.text('OK', 204);
});

app.post('/auth/admin-login', async (c) => {
  console.log('Received POST /auth/admin-login');
  const { username, password } = await c.req.json();
  const { rows } = await pool.query('SELECT * FROM admins WHERE username = $1', [username]);
  if (rows.length === 0) return c.json({ error: 'Invalid credentials' }, 401);
  const admin = rows[0];
  const valid = await bcrypt.compare(password, admin.password_hash);
  if (!valid) return c.json({ error: 'Invalid credentials' }, 401);
  const token = jwt.sign({ username: admin.username, admin_id: admin.id }, process.env.SECRET_KEY, { expiresIn: '2h' });
  return c.json({ token, username: admin.username });
});

app.get('/', (c) => c.text('Student Portal Backend is running!'));

// Exam Card Endpoints
app.get('/students/:id/exam-card', async (c) => {
  const studentId = c.req.param('id');
  // Check fee status
  const { rows: feeRows } = await pool.query(
    'SELECT fee_balance FROM fees WHERE student_id = $1',
    [studentId]
  );
  if (feeRows.length === 0) return c.json({ error: 'No fee record found' }, 404);
  if (parseFloat(feeRows[0].fee_balance) > 0) {
    return c.json({ error: 'Please complete your fee payment to download your exam card.' }, 403);
  }
  // Get exam card file URL
  const { rows: cardRows } = await pool.query(
    'SELECT file_url FROM exam_cards WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1',
    [studentId]
  );
  if (cardRows.length === 0) return c.json({ error: 'No exam card found' }, 404);
  return c.json({ file_url: cardRows[0].file_url });
});

app.post('/students/:id/exam-card', async (c) => {
  const studentId = c.req.param('id');
  const { file_url } = await c.req.json();
  await pool.query(
    'INSERT INTO exam_cards (student_id, file_url) VALUES ($1, $2)',
    [studentId, file_url]
  );
  return c.json({ message: 'Exam card uploaded.' });
});

// Fee Statement and Receipt Endpoints
app.get('/students/:id/fee-statement', async (c) => {
  const studentId = c.req.param('id');
  const { rows } = await pool.query(
    'SELECT statement_url FROM finance WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1',
    [studentId]
  );
  if (rows.length === 0) return c.json({ error: 'No fee statement found' }, 404);
  return c.json({ statement_url: rows[0].statement_url });
});

app.get('/students/:id/fee-receipt', async (c) => {
  const studentId = c.req.param('id');
  const { rows } = await pool.query(
    'SELECT receipt_url FROM finance WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1',
    [studentId]
  );
  if (rows.length === 0) return c.json({ error: 'No fee receipt found' }, 404);
  return c.json({ receipt_url: rows[0].receipt_url });
});

app.post('/students/:id/fee-statement', async (c) => {
  const studentId = c.req.param('id');
  const { statement_url } = await c.req.json();
  await pool.query(
    'INSERT INTO finance (student_id, statement) VALUES ($1, $2)',
    [studentId, statement_url]
  );
  return c.json({ message: 'Fee statement uploaded.' });
});

app.post('/students/:id/fee-receipt', async (c) => {
  const studentId = c.req.param('id');
  const { receipt_url } = await c.req.json();
  await pool.query(
    'INSERT INTO finance (student_id, receipt_url) VALUES ($1, $2)',
    [studentId, receipt_url]
  );
  return c.json({ message: 'Fee receipt uploaded.' });
});

// Upload fee statement (admin)
app.post('/students/:id/upload-fee-statement', async (c) => {
  const studentId = c.req.param('id');
  const formData = await c.req.parseBody();
  const file = formData['file'];
  if (!file) return c.json({ error: 'No file uploaded' }, 400);
  const fileName = `fee-statements/${studentId}_${Date.now()}_${file.name}`;
  const { data, error } = await supabase.storage.from('finance').upload(fileName, file.data, { contentType: file.type });
  if (error) return c.json({ error: error.message }, 500);
  const { publicURL } = supabase.storage.from('finance').getPublicUrl(fileName).data;
  await pool.query('INSERT INTO finance (student_id, statement, statement_url) VALUES ($1, $2, $3)', [studentId, fileName, publicURL]);
  return c.json({ message: 'Fee statement uploaded.', url: publicURL });
});

// Upload fee receipt (admin)
app.post('/students/:id/upload-fee-receipt', async (c) => {
  const studentId = c.req.param('id');
  const formData = await c.req.parseBody();
  const file = formData['file'];
  if (!file) return c.json({ error: 'No file uploaded' }, 400);
  const fileName = `fee-receipts/${studentId}_${Date.now()}_${file.name}`;
  const { data, error } = await supabase.storage.from('finance').upload(fileName, file.data, { contentType: file.type });
  if (error) return c.json({ error: error.message }, 500);
  const { publicURL } = supabase.storage.from('finance').getPublicUrl(fileName).data;
  await pool.query('INSERT INTO finance (student_id, receipt_url) VALUES ($1, $2)', [studentId, publicURL]);
  return c.json({ message: 'Fee receipt uploaded.', url: publicURL });
});

const port = process.env.PORT || 3000;
console.log(`Server running on http://localhost:${port}`);
serve({
  fetch: app.fetch,
  port: port
});