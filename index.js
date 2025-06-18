import { Hono } from 'hono';
import { pool, sql } from './db.js';
import { serve } from '@hono/node-server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { initializeTables } from './utils/initDb.js';
import { serveStatic } from '@hono/node-server/serve-static';
import fs from 'fs';

const app = new Hono();

// Apply CORS to ALL routes
app.use('*', async (c, next) => {
  try {
    // Get the origin from the request
    const origin = c.req.header('Origin') || '*';
    console.log(`Request from origin: ${origin}`);
    
    // Set CORS headers for all responses
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'X-Custom-Header, Upgrade-Insecure-Requests, Access-Control-Allow-Origin, Content-Type, Authorization, Accept, X-Requested-With');
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Access-Control-Max-Age', '86400');
    c.header('Access-Control-Expose-Headers', 'Content-Length, X-Requested-With');
    
    // Handle preflight requests immediately
    if (c.req.method === 'OPTIONS') {
      console.log('Handling OPTIONS preflight request');
      return c.text('', 204); // Respond with 204 No Content for OPTIONS requests
    }
    
    // Continue with the next middleware/handler for non-OPTIONS requests
    await next();
  } catch (err) {
    console.error('CORS middleware error:', err);
    return c.text('CORS Error', 500);
  }
});

// Serve static files from the public directory
app.use('/*', serveStatic({ root: './public' }));

// Log every request
app.use('*', async (c, next) => {
  console.log(`[${new Date().toISOString()}] ${c.req.method} ${c.req.path}`);
  
  // Safely log headers
  try {
    // Create a safer version of header logging that won't crash
    const headers = {};
    for (const [key, value] of Object.entries(c.req.raw.headers)) {
      headers[key] = value;
    }
    console.log('Headers:', headers);
  } catch (err) {
    console.log('Could not log headers:', err.message);
  }
  
  try {
    await next();
  } catch (err) {
    console.error('Global error handler:', err);
    return c.json({ error: 'Internal Server Error', details: err.message }, 500);
  }
});

// Supabase Storage setup
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// CORS preflight requests are now handled by the main CORS middleware above

// Root route to show API status
app.get('/', async (c) => {
  // If HTML is requested, serve the status page
  if (c.req.header('accept')?.includes('text/html')) {
    return c.html(await fs.promises.readFile('./public/index.html', 'utf-8'));
  }
  
  // Otherwise return a JSON status
  return c.json({
    status: 'running',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    api: 'Clips College Student Portal Backend API'
  });
});

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

// Student promotion route
app.post('/students/promote', async (c) => {
  try {
    const { registration_number, new_year_semester } = await c.req.json();
    
    // First, check if the student exists
    const studentResult = await sql`SELECT * FROM students WHERE registration_number = ${registration_number}`;
    if (!studentResult || studentResult.length === 0) {
      return c.json({ error: 'Student not found' }, 404);
    }
    
    // Update the student's level of study
    await sql`UPDATE students SET level_of_study = ${new_year_semester} WHERE registration_number = ${registration_number}`;
    
    return c.json({ 
      message: `Student ${registration_number} promoted to ${new_year_semester} successfully`
    });
  } catch (error) {
    console.error('Error promoting student:', error);
    return c.json({ error: 'Failed to promote student' }, 500);
  }
});

// Academic leave route
app.post('/students/academic-leave', async (c) => {
  try {
    const { registration_number } = await c.req.json();
    
    // First, check if the student exists
    const studentResult = await sql`SELECT * FROM students WHERE registration_number = ${registration_number}`;
    if (!studentResult || studentResult.length === 0) {
      return c.json({ error: 'Student not found' }, 404);
    }
    
    // Update the student's status
    await sql`UPDATE students SET status = 'on_leave' WHERE registration_number = ${registration_number}`;
    
    return c.json({ 
      message: `Academic leave granted for student ${registration_number}`
    });
  } catch (error) {
    console.error('Error granting academic leave:', error);
    return c.json({ error: 'Failed to grant academic leave' }, 500);
  }
});

// Readmit student route
app.post('/students/readmit', async (c) => {
  try {
    const { registration_number } = await c.req.json();
    
    // First, check if the student exists
    const studentResult = await sql`SELECT * FROM students WHERE registration_number = ${registration_number}`;
    if (!studentResult || studentResult.length === 0) {
      return c.json({ error: 'Student not found' }, 404);
    }
    
    // Check if the student is on leave
    if (studentResult[0].status !== 'on_leave') {
      return c.json({ error: 'Student is not on academic leave' }, 400);
    }
    
    // Update the student's status
    await sql`UPDATE students SET status = 'active' WHERE registration_number = ${registration_number}`;
    
    return c.json({ 
      message: `Student ${registration_number} readmitted successfully`
    });
  } catch (error) {
    console.error('Error readmitting student:', error);
    return c.json({ error: 'Failed to readmit student' }, 500);
  }
});

// Register units route
app.post('/units/register', async (c) => {
  try {
    const { student_reg, unit_name, unit_code } = await c.req.json();
    
    // First, check if the student exists
    const studentResult = await sql`SELECT * FROM students WHERE registration_number = ${student_reg}`;
    if (!studentResult || studentResult.length === 0) {
      return c.json({ error: 'Student not found' }, 404);
    }
    
    // Check if the unit already exists, if not, create it
    let unitResult = await sql`SELECT * FROM units WHERE code = ${unit_code}`;
    if (!unitResult || unitResult.length === 0) {
      unitResult = await sql`INSERT INTO units (name, code) VALUES (${unit_name}, ${unit_code}) RETURNING *`;
    }
    
    // Register the unit for the student
    await sql`
      INSERT INTO registered_units (student_id, unit_id) 
      VALUES (${studentResult[0].id}, ${unitResult[0].id})
      ON CONFLICT (student_id, unit_id) DO NOTHING
    `;
    
    return c.json({ 
      message: `Unit ${unit_code} registered successfully for student ${student_reg}`
    });
  } catch (error) {
    console.error('Error registering unit:', error);
    return c.json({ error: 'Failed to register unit' }, 500);
  }
});

// Admin login using Supabase admins table and JWT
app.post('/auth/admin-login', async (c) => {
  console.log('Received POST /auth/admin-login');
  console.log('Origin:', c.req.header('Origin'));
  
  try {
    const { username, password } = await c.req.json();
    console.log('Login attempt for username:', username);
    
    const admins = await sql`SELECT * FROM admins WHERE username = ${username}`;
    if (!admins || admins.length === 0) {
      console.log('Admin not found');
      return c.json({ error: 'Invalid credentials' }, 401);
    }
    
    const admin = admins[0];
    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) {
      console.log('Invalid password');
      return c.json({ error: 'Invalid credentials' }, 401);
    }
    
    const token = jwt.sign({ username: admin.username, admin_id: admin.id }, process.env.SECRET_KEY, { expiresIn: '2h' });
    console.log('Login successful');
    return c.json({ token, username: admin.username, adminId: admin.id });
  } catch (err) {
    console.error('Login error:', err);
    return c.json({ error: 'Authentication failed' }, 500);
  }
});

// New endpoint to match the frontend
app.post('/admin/login', async (c) => {
  console.log('Received POST /admin/login');
  console.log('Origin:', c.req.header('Origin'));
  
  try {
    const { username, password } = await c.req.json();
    console.log('Login attempt for username:', username);
    
    const admins = await sql`SELECT * FROM admins WHERE username = ${username}`;
    if (!admins || admins.length === 0) {
      console.log('Admin not found');
      return c.json({ error: 'Invalid credentials' }, 401);
    }
    
    const admin = admins[0];
    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) {
      console.log('Invalid password');
      return c.json({ error: 'Invalid credentials' }, 401);
    }
    
    const token = jwt.sign({ username: admin.username, admin_id: admin.id }, process.env.SECRET_KEY, { expiresIn: '2h' });
    console.log('Login successful');
    return c.json({ token, username: admin.username, adminId: admin.id });
  } catch (err) {
    console.error('Login error:', err);
    return c.json({ error: 'Authentication failed' }, 500);
  }
});

// Verify admin token
app.get('/admin/verify-token', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    return c.json({ valid: true, username: decoded.username });
  } catch (error) {
    return c.json({ error: 'Invalid token' }, 401);
  }
});

// Debug route to test CORS configuration
app.get('/debug/cors', async (c) => {
  const headers = {};
  for (const [key, value] of Object.entries(c.req.raw.headers)) {
    headers[key] = value;
  }
  
  return c.json({
    message: 'CORS debug information',
    origin: c.req.header('Origin'),
    method: c.req.method,
    path: c.req.path,
    headers: headers,
    corsHeaders: {
      'access-control-allow-origin': c.header('Access-Control-Allow-Origin'),
      'access-control-allow-methods': c.header('Access-Control-Allow-Methods'),
      'access-control-allow-headers': c.header('Access-Control-Allow-Headers'),
      'access-control-allow-credentials': c.header('Access-Control-Allow-Credentials')
    }
  });
});

// Special route for initializing the database in production
// This should be secured and only called once or when needed
app.post('/admin/init-db', async (c) => {
  // Simple security check - you should use a more secure approach in production
  const secretKey = c.req.header('x-admin-key');
  
  if (!secretKey || secretKey !== process.env.SECRET_KEY) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  try {
    await initializeTables();
    return c.json({ success: true, message: 'Database initialized successfully' });
  } catch (error) {
    console.error('Error initializing database:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Admin route to create an initial admin user
app.post('/admin/create-admin', async (c) => {
  // Security check
  const secretKey = c.req.header('x-admin-key');
  
  if (!secretKey || secretKey !== process.env.SECRET_KEY) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  try {
    const { username, password } = await c.req.json();
    
    if (!username || !password) {
      return c.json({ error: 'Username and password are required' }, 400);
    }
    
    // Hash the password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    // Create admin table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(255) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL
      )
    `);
    
    // Insert the admin user
    const result = await pool.query(
      'INSERT INTO admins (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username, passwordHash]
    );
    
    return c.json({ success: true, admin: result.rows[0] });
  } catch (error) {
    console.error('Error creating admin user:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

const port = process.env.PORT || 3001;

// Export the app for serverless functions
export { app };

// Only start the server directly when running locally (not in Netlify functions)
if (!process.env.NETLIFY) {
  console.log(`Starting server on port ${port}...`);
  
  serve({
    fetch: app.fetch,
    port: port
  });
  
  console.log(`Server running on http://localhost:${port}`);
  console.log('If you don\'t see any errors, the server is running!');
  console.log('Press Ctrl+C to stop the server');
}