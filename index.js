import { Hono } from 'hono';
import { pool } from './db.js';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { serveStatic } from '@hono/node-server/serve-static';

const app = new Hono();

// SINGLE CORS configuration
app.use('*', cors({
  origin: [
    'http://localhost:5500', 
    'http://127.0.0.1:5500', 
    'http://127.0.0.1:5501',
    'http://localhost:5501',
    'https://studentportaladmin.netlify.app',
    'https://clipscollegestudentportal.netlify.app'
  ],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: [
    'Content-Type', 
    'Authorization', 
    'Accept',
    'Origin',
    'X-Requested-With'
  ],
  credentials: true,
  exposeHeaders: ['Content-Length', 'X-Total-Count'],
  optionsSuccessStatus: 200,
  maxAge: 86400 // Cache preflight for 24 hours
}));

// Log every request
app.use('*', async (c, next) => {
  console.log(`[${new Date().toISOString()}] ${c.req.method} ${c.req.path}`);
  console.log('Origin:', c.req.header('origin'));
  console.log('Headers:', Object.fromEntries(c.req.raw.headers.entries()));
  
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
  try {
    console.log('Fetching students');
    
    // Check if database connection is available - do a simple ping
    try {
      await pool.query('SELECT 1');
    } catch (dbError) {
      console.error('Database connection error:', dbError);
      return c.json({ 
        error: 'Database connection failed', 
        details: 'Unable to connect to the database. Please try again later.',
        serverInfo: process.env.NODE_ENV === 'development' ? dbError.message : undefined
      }, 503); // Service Unavailable
    }
    
    const status = c.req.query('status');
    let query = 'SELECT * FROM students';
    let params = [];
    
    // If status query parameter is provided, filter by status
    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }
    
    const { rows } = await pool.query(query, params);
    console.log(`Successfully fetched ${rows.length} students`);
    return c.json(rows);
  } catch (error) {
    console.error('Error fetching students:', error);
    return c.json({ 
      error: 'Failed to fetch students', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, 500);
  }
});

// Get students by status
app.get('/students/status/:statusType', async (c) => {
  try {
    const statusType = c.req.param('statusType'); // 'active', 'deregistered', or 'on_leave'
    const { rows } = await pool.query(
      'SELECT * FROM students WHERE status = $1',
      [statusType]
    );
    return c.json(rows);
  } catch (error) {
    console.error('Error fetching students by status:', error);
    return c.json({ error: 'Failed to fetch students', details: error.message }, 500);
  }
});

// Promote students endpoint
app.post('/students/promote', async (c) => {
  try {
    const body = await c.req.json();
    console.log('Student promotion request received:', body);
    
    // Check if we have student IDs or registration numbers
    const student_ids = body.student_ids || body.studentIds || [];
    const registration_numbers = body.registration_numbers || body.registrationNumbers || [];
    const new_level = body.new_level || body.newLevel;
    
    if ((!student_ids || student_ids.length === 0) && 
        (!registration_numbers || registration_numbers.length === 0)) {
      return c.json({ 
        error: 'Missing required field', 
        details: 'Student IDs or registration numbers are required' 
      }, 400);
    }
    
    if (!new_level) {
      return c.json({ 
        error: 'Missing required field', 
        details: 'New level of study is required' 
      }, 400);
    }
    
    let results = [];
    
    // Promote by student IDs
    if (student_ids && student_ids.length > 0) {
      const { rows } = await pool.query(
        `UPDATE students SET 
          level_of_study=$1
        WHERE id = ANY($2) RETURNING *`,
        [new_level, student_ids]
      );
      results = results.concat(rows);
    }
    
    // Promote by registration numbers
    if (registration_numbers && registration_numbers.length > 0) {
      const { rows } = await pool.query(
        `UPDATE students SET 
          level_of_study=$1
        WHERE registration_number = ANY($2) RETURNING *`,
        [new_level, registration_numbers]
      );
      results = results.concat(rows);
    }
    
    return c.json({ 
      message: `${results.length} students promoted successfully`, 
      students: results 
    });
  } catch (error) {
    console.error('Error promoting students:', error);
    return c.json({ 
      error: 'Failed to promote students', 
      details: error.message 
    }, 500);
  }
});

// Get student by registration number
app.get('/student/registration/:regNumber', async (c) => {
  try {
    const registration_number = c.req.param('regNumber');
    console.log('Fetching student with registration number:', registration_number);
    
    const { rows } = await pool.query(
      'SELECT * FROM students WHERE registration_number = $1',
      [registration_number]
    );
    
    if (rows.length === 0) {
      return c.json({ error: 'Student not found' }, 404);
    }
    
    return c.json(rows[0]);
  } catch (error) {
    console.error('Error fetching student by registration number:', error);
    return c.json({ error: 'Failed to fetch student', details: error.message }, 500);
  }
});

// Grant academic leave to a student (accepts JSON body)
app.post('/students/academic-leave', async (c) => {
  try {
    console.log('Academic leave request received');
    const body = await c.req.json();
    console.log('Request body:', body);
    
    // Support multiple parameter formats
    const student_id = body.student_id || body.studentId || body.id;
    const registration_number = body.registration_number || body.registrationNumber;
    const start_date = body.start_date || body.startDate || body.from;
    const end_date = body.end_date || body.endDate || body.to;
    const reason = body.reason || body.academic_leave_reason || '';
    
    if (!student_id && !registration_number) {
      return c.json({ 
        error: 'Missing required field', 
        details: 'Student ID or registration number is required' 
      }, 400);
    }
    
    // Default dates if not provided
    const now = new Date();
    const defaultEndDate = new Date();
    defaultEndDate.setMonth(defaultEndDate.getMonth() + 3); // Default 3 months
    
    // Format dates properly
    const formattedStartDate = start_date ? new Date(start_date).toISOString().split('T')[0] : now.toISOString().split('T')[0];
    const formattedEndDate = end_date ? new Date(end_date).toISOString().split('T')[0] : defaultEndDate.toISOString().split('T')[0];
    
    console.log('Processing academic leave with:', { 
      student_id, 
      registration_number, 
      formattedStartDate, 
      formattedEndDate,
      reason 
    });
    
    let query, params;
    
    if (student_id) {
      query = `UPDATE students SET 
        academic_leave=true, 
        academic_leave_start=$1, 
        academic_leave_end=$2,
        academic_leave_reason=$3,
        status='on_leave'
      WHERE id=$4 RETURNING *`;
      params = [formattedStartDate, formattedEndDate, reason, student_id];
    } else {
      query = `UPDATE students SET 
        academic_leave=true, 
        academic_leave_start=$1, 
        academic_leave_end=$2,
        academic_leave_reason=$3,
        status='on_leave'
      WHERE registration_number=$4 RETURNING *`;
      params = [formattedStartDate, formattedEndDate, reason, registration_number];
    }
    
    const { rows } = await pool.query(query, params);
    
    if (rows.length === 0) return c.json({ error: 'Student not found' }, 404);
    return c.json({ 
      message: 'Academic leave granted successfully', 
      student: rows[0] 
    });
  } catch (error) {
    console.error('Error granting academic leave:', error);
    return c.json({ 
      error: 'Failed to grant academic leave', 
      details: error.message 
    }, 500);
  }
});

// Grant academic leave to a student (simpler URL path version)
app.post('/students/:id/academic-leave', async (c) => {
  try {
    const student_id = c.req.param('id');
    console.log('Academic leave request received for student:', student_id);
    
    // Get dates and reason from body if provided
    let start_date, end_date, reason = '';
    try {
      const body = await c.req.json();
      start_date = body.start_date || body.startDate || body.from;
      end_date = body.end_date || body.endDate || body.to;
      reason = body.reason || body.academic_leave_reason || '';
    } catch (e) {
      // If no body or invalid JSON, use defaults
    }
    
    // Default dates if not provided
    const now = new Date();
    const defaultEndDate = new Date();
    defaultEndDate.setMonth(defaultEndDate.getMonth() + 3); // Default 3 months
    
    // Format dates properly
    const formattedStartDate = start_date ? new Date(start_date).toISOString().split('T')[0] : now.toISOString().split('T')[0];
    const formattedEndDate = end_date ? new Date(end_date).toISOString().split('T')[0] : defaultEndDate.toISOString().split('T')[0];
    
    const { rows } = await pool.query(
      `UPDATE students SET 
        academic_leave=true, 
        academic_leave_start=$1, 
        academic_leave_end=$2,
        academic_leave_reason=$3,
        status='on_leave' 
      WHERE id=$4 RETURNING *`,
      [formattedStartDate, formattedEndDate, reason, student_id]
    );
    
    if (rows.length === 0) return c.json({ error: 'Student not found' }, 404);
    return c.json({ 
      message: 'Academic leave granted successfully', 
      student: rows[0] 
    });
  } catch (error) {
    console.error('Error granting academic leave:', error);
    return c.json({ 
      error: 'Failed to grant academic leave', 
      details: error.message 
    }, 500);
  }
});

// Grant academic leave by registration number
app.post('/students/registration/:regNumber/academic-leave', async (c) => {
  try {
    const registration_number = c.req.param('regNumber');
    console.log('Academic leave request received for registration number:', registration_number);
    
    // Get dates and reason from body if provided
    let start_date, end_date, reason = '';
    try {
      const body = await c.req.json();
      start_date = body.start_date || body.startDate || body.from;
      end_date = body.end_date || body.endDate || body.to;
      reason = body.reason || body.academic_leave_reason || '';
    } catch (e) {
      // If no body or invalid JSON, use defaults
    }
    
    // Default dates if not provided
    const now = new Date();
    const defaultEndDate = new Date();
    defaultEndDate.setMonth(defaultEndDate.getMonth() + 3); // Default 3 months
    
    // Format dates properly
    const formattedStartDate = start_date ? new Date(start_date).toISOString().split('T')[0] : now.toISOString().split('T')[0];
    const formattedEndDate = end_date ? new Date(end_date).toISOString().split('T')[0] : defaultEndDate.toISOString().split('T')[0];
    
    const { rows } = await pool.query(
      `UPDATE students SET 
        academic_leave=true, 
        academic_leave_start=$1, 
        academic_leave_end=$2,
        academic_leave_reason=$3,
        status='on_leave' 
      WHERE registration_number=$4 RETURNING *`,
      [formattedStartDate, formattedEndDate, reason, registration_number]
    );
    
    if (rows.length === 0) return c.json({ error: 'Student not found' }, 404);
    return c.json({ 
      message: 'Academic leave granted successfully', 
      student: rows[0] 
    });
  } catch (error) {
    console.error('Error granting academic leave:', error);
    return c.json({ 
      error: 'Failed to grant academic leave', 
      details: error.message 
    }, 500);
  }
});

// Deregister a student by registration number
app.post('/students/registration/:regNumber/deregister', async (c) => {
  try {
    const registration_number = c.req.param('regNumber');
    console.log('Deregistering student with registration number:', registration_number);
    
    // Get reason from body if provided
    let reason = '';
    try {
      const body = await c.req.json();
      reason = body.reason || body.deregistration_reason || '';
    } catch (e) {
      // If no body or invalid JSON, use default empty reason
    }
    
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    const { rows } = await pool.query(
      `UPDATE students SET 
        deregistered=true, 
        deregistration_date=$1, 
        deregistration_reason=$2,
        status='deregistered' 
      WHERE registration_number=$3 RETURNING *`,
      [today, reason, registration_number]
    );
    
    if (rows.length === 0) return c.json({ error: 'Student not found' }, 404);
    return c.json({ 
      message: 'Student deregistered successfully', 
      student: rows[0] 
    });
  } catch (error) {
    console.error('Error deregistering student:', error);
    return c.json({ 
      error: 'Failed to deregister student', 
      details: error.message 
    }, 500);
  }
});

// Bulk deregister students
app.post('/students/deregister', async (c) => {
  try {
    const body = await c.req.json();
    console.log('Bulk deregistration request received');
    
    if (!body.student_ids && !body.registration_numbers) {
      return c.json({ 
        error: 'Missing required field', 
        details: 'Student IDs or registration numbers are required' 
      }, 400);
    }
    
    const reason = body.reason || body.deregistration_reason || '';
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    let results = [];
    
    if (body.student_ids && body.student_ids.length > 0) {
      const { rows } = await pool.query(
        `UPDATE students SET 
          deregistered=true, 
          deregistration_date=$1, 
          deregistration_reason=$2,
          status='deregistered' 
        WHERE id = ANY($3) RETURNING *`,
        [today, reason, body.student_ids]
      );
      results = results.concat(rows);
    }
    
    if (body.registration_numbers && body.registration_numbers.length > 0) {
      const { rows } = await pool.query(
        `UPDATE students SET 
          deregistered=true, 
          deregistration_date=$1, 
          deregistration_reason=$2,
          status='deregistered' 
        WHERE registration_number = ANY($3) RETURNING *`,
        [today, reason, body.registration_numbers]
      );
      results = results.concat(rows);
    }
    
    return c.json({ 
      message: `${results.length} students deregistered successfully`, 
      students: results 
    });
  } catch (error) {
    console.error('Error deregistering students:', error);
    return c.json({ 
      error: 'Failed to deregister students', 
      details: error.message 
    }, 500);
  }
});

// Deregister a student by ID
app.post('/students/:id/deregister', async (c) => {
  try {
    const student_id = c.req.param('id');
    console.log('Deregistering student:', student_id);
    
    // Get reason from body if provided
    let reason = '';
    try {
      const body = await c.req.json();
      reason = body.reason || body.deregistration_reason || '';
    } catch (e) {
      // If no body or invalid JSON, use default empty reason
    }
    
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    const { rows } = await pool.query(
      `UPDATE students SET 
        deregistered=true, 
        deregistration_date=$1, 
        deregistration_reason=$2,
        status='deregistered' 
      WHERE id=$3 RETURNING *`,
      [today, reason, student_id]
    );
    
    if (rows.length === 0) return c.json({ error: 'Student not found' }, 404);
    return c.json({ 
      message: 'Student deregistered successfully', 
      student: rows[0] 
    });
  } catch (error) {
    console.error('Error deregistering student:', error);
    return c.json({ 
      error: 'Failed to deregister student', 
      details: error.message 
    }, 500);
  }
});

// Restore a deregistered student
app.post('/students/:id/restore', async (c) => {
  try {
    const student_id = c.req.param('id');
    console.log('Restoring deregistered student:', student_id);
    
    const { rows } = await pool.query(
      `UPDATE students SET 
        deregistered=false, 
        deregistration_date=NULL, 
        deregistration_reason=NULL,
        status='active' 
      WHERE id=$1 RETURNING *`,
      [student_id]
    );
    
    if (rows.length === 0) return c.json({ error: 'Student not found' }, 404);
    return c.json({ 
      message: 'Student restored successfully', 
      student: rows[0] 
    });
  } catch (error) {
    console.error('Error restoring student:', error);
    return c.json({ 
      error: 'Failed to restore student', 
      details: error.message 
    }, 500);
  }
});

// Cancel academic leave for a student
app.delete('/students/:id/academic-leave', async (c) => {
  try {
    const student_id = c.req.param('id');
    console.log('Canceling academic leave for student:', student_id);
    
    const { rows } = await pool.query(
      `UPDATE students SET 
        academic_leave=false, 
        academic_leave_start=NULL, 
        academic_leave_end=NULL,
        academic_leave_reason=NULL,
        status='active' 
      WHERE id=$1 RETURNING *`,
      [student_id]
    );
    
    if (rows.length === 0) return c.json({ error: 'Student not found' }, 404);
    return c.json({ 
      message: 'Academic leave canceled successfully', 
      student: rows[0] 
    });
  } catch (error) {
    console.error('Error canceling academic leave:', error);
    return c.json({ 
      error: 'Failed to cancel academic leave', 
      details: error.message 
    }, 500);
  }
});

// Deregister a student by ID
app.post('/students/:id/deregister', async (c) => {
  try {
    const student_id = c.req.param('id');
    console.log('Deregistering student:', student_id);
    
    // Get reason from body if provided
    let reason = '';
    try {
      const body = await c.req.json();
      reason = body.reason || body.deregistration_reason || '';
    } catch (e) {
      // If no body or invalid JSON, use default empty reason
    }
    
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    const { rows } = await pool.query(
      `UPDATE students SET 
        deregistered=true, 
        deregistration_date=$1, 
        deregistration_reason=$2,
        status='deregistered' 
      WHERE id=$3 RETURNING *`,
      [today, reason, student_id]
    );
    
    if (rows.length === 0) return c.json({ error: 'Student not found' }, 404);
    return c.json({ 
      message: 'Student deregistered successfully', 
      student: rows[0] 
    });
  } catch (error) {
    console.error('Error deregistering student:', error);
    return c.json({ 
      error: 'Failed to deregister student', 
      details: error.message 
    }, 500);
  }
});

// Deregister a student by registration number
app.post('/students/registration/:regNumber/deregister', async (c) => {
  try {
    const registration_number = c.req.param('regNumber');
    console.log('Deregistering student with registration number:', registration_number);
    
    // Get reason from body if provided
    let reason = '';
    try {
      const body = await c.req.json();
      reason = body.reason || body.deregistration_reason || '';
    } catch (e) {
      // If no body or invalid JSON, use default empty reason
    }
    
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    const { rows } = await pool.query(
      `UPDATE students SET 
        deregistered=true, 
        deregistration_date=$1, 
        deregistration_reason=$2,
        status='deregistered' 
      WHERE registration_number=$3 RETURNING *`,
      [today, reason, registration_number]
    );
    
    if (rows.length === 0) return c.json({ error: 'Student not found' }, 404);
    return c.json({ 
      message: 'Student deregistered successfully', 
      student: rows[0] 
    });
  } catch (error) {
    console.error('Error deregistering student:', error);
    return c.json({ 
      error: 'Failed to deregister student', 
      details: error.message 
    }, 500);
  }
});

// Bulk deregister students
app.post('/students/deregister', async (c) => {
  try {
    const body = await c.req.json();
    console.log('Bulk deregistration request received');
    
    if (!body.student_ids && !body.registration_numbers) {
      return c.json({ 
        error: 'Missing required field', 
        details: 'Student IDs or registration numbers are required' 
      }, 400);
    }
    
    const reason = body.reason || body.deregistration_reason || '';
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    let results = [];
    
    if (body.student_ids && body.student_ids.length > 0) {
      const { rows } = await pool.query(
        `UPDATE students SET 
          deregistered=true, 
          deregistration_date=$1, 
          deregistration_reason=$2,
          status='deregistered' 
        WHERE id = ANY($3) RETURNING *`,
        [today, reason, body.student_ids]
      );
      results = results.concat(rows);
    }
    
    if (body.registration_numbers && body.registration_numbers.length > 0) {
      const { rows } = await pool.query(
        `UPDATE students SET 
          deregistered=true, 
          deregistration_date=$1, 
          deregistration_reason=$2,
          status='deregistered' 
        WHERE registration_number = ANY($3) RETURNING *`,
        [today, reason, body.registration_numbers]
      );
      results = results.concat(rows);
    }
    
    return c.json({ 
      message: `${results.length} students deregistered successfully`, 
      students: results 
    });
  } catch (error) {
    console.error('Error deregistering students:', error);
    return c.json({ 
      error: 'Failed to deregister students', 
      details: error.message 
    }, 500);
  }
});

// Restore a deregistered student
app.post('/students/:id/restore', async (c) => {
  try {
    const student_id = c.req.param('id');
    console.log('Restoring deregistered student:', student_id);
    
    const { rows } = await pool.query(
      `UPDATE students SET 
        deregistered=false, 
        deregistration_date=NULL, 
        deregistration_reason=NULL,
        status='active' 
      WHERE id=$1 RETURNING *`,
      [student_id]
    );
    
    if (rows.length === 0) return c.json({ error: 'Student not found' }, 404);
    return c.json({ 
      message: 'Student restored successfully', 
      student: rows[0] 
    });
  } catch (error) {
    console.error('Error restoring student:', error);
    return c.json({ 
      error: 'Failed to restore student', 
      details: error.message 
    }, 500);
  }
});

// Get a single student by ID
app.get('/students/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const { rows } = await pool.query('SELECT * FROM students WHERE id = $1', [id]);
    if (rows.length === 0) return c.json({ error: 'Student not found' }, 404);
    return c.json(rows[0]);
  } catch (error) {
    console.error('Error fetching student by ID:', error);
    return c.json({ 
      error: 'Failed to fetch student', 
      details: error.message 
    }, 500);
  }
});

// Create a new student
app.post('/students', async (c) => {
  try {
    // Check if the request is multipart form data
    const contentType = c.req.header('content-type') || '';
    console.log('Request content-type:', contentType);
    
    if (contentType.includes('multipart/form-data')) {
      console.log('Detected multipart/form-data request, redirecting to photo handler');
      // Redirect to the multipart handler
      return await handleStudentWithPhoto(c);
    }
    
    console.log('Processing standard JSON request');
    // Handle JSON request
    let data;
    try {
      data = await c.req.json();
    } catch (jsonError) {
      console.error('Error parsing JSON:', jsonError);
      return c.json({
        error: 'Invalid JSON data',
        details: jsonError.message
      }, 400);
    }
    console.log('Received student data:', data);
    
    const { 
      registration_number, 
      name, 
      course, 
      level_of_study, 
      photo_url,
      national_id,
      birth_certificate,
      date_of_birth,
      password,
      email
    } = data;
    
    // Validate required fields
    if (!registration_number || !name || !course || !level_of_study) {
      return c.json({ 
        error: 'Missing required fields', 
        details: 'Registration number, name, course, and level of study are required' 
      }, 400);
    }
    
    // Determine default password if not provided
    let finalPassword = password;
    if (!finalPassword) {
      // Use national_id or birth_certificate as password
      if (national_id) {
        finalPassword = national_id;
      } else if (birth_certificate) {
        finalPassword = birth_certificate;
      } else {
        finalPassword = 'defaultpassword';
      }
    }
    
    // Hash the password before storing
    const hashedPassword = await bcrypt.hash(finalPassword, 10);
    
    // Format date properly for database
    let formattedDate = null;
    if (date_of_birth) {
      try {
        const dateObj = new Date(date_of_birth);
        if (!isNaN(dateObj.getTime())) {
          formattedDate = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD format
        }
      } catch (err) {
        console.error('Error formatting date:', err);
      }
    }
    
    console.log('Inserting student with data:', {
      registration_number,
      name,
      course,
      level_of_study,
      photo_url: photo_url || null,
      national_id: national_id || null,
      birth_certificate: birth_certificate || null,
      date_of_birth: formattedDate,
      email: email || null,
      password: 'HASHED'
    });
    
    const { rows } = await pool.query(
      `INSERT INTO students (
        registration_number, name, course, level_of_study, photo_url,
        national_id, birth_certificate, date_of_birth, password, email, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        registration_number, name, course, level_of_study, photo_url || null,
        national_id || null, birth_certificate || null, formattedDate, hashedPassword, email || null, 'active'
      ]
    );
    
    return c.json(rows[0]);
  } catch (error) {
    console.error('Error creating student:', error);
    return c.json({ 
      error: 'Failed to create student', 
      details: error.message,
      stack: error.stack
    }, 500);
  }
});

// Handle student registration with photo upload
async function handleStudentWithPhoto(c) {
  try {
    console.log('Handling student registration with photo');
    
    try {
      // Parse the multipart form data
      const formData = await c.req.parseBody();
      console.log('Form data keys:', Object.keys(formData));
      
      // Extract student data
      const registration_number = formData.registration_number || '';
      const name = formData.name || '';
      const course = formData.course || '';
      const level_of_study = formData.level_of_study || '';
      const national_id = formData.national_id || null;
      const birth_certificate = formData.birth_certificate || null;
      const date_of_birth = formData.date_of_birth || null;
      const password = formData.password || null;
      const email = formData.email || null;
      
      // Validate required fields
      if (!registration_number || !name || !course || !level_of_study) {
        return c.json({ 
          error: 'Missing required fields', 
          details: 'Registration number, name, course, and level of study are required' 
        }, 400);
      }
      
      // Handle photo upload
      let photo_url = null;
      const photo = formData.photo;
      
      if (photo && photo.data) {
        console.log('Photo received, uploading to storage');
        console.log('Photo details:', {
          name: photo.name,
          type: photo.type,
          size: photo.data.length
        });
        
        const fileName = `student-photos/${registration_number}_${Date.now()}_${photo.name}`;
        
        try {
          const { data, error } = await supabase.storage
            .from('student-docs')
            .upload(fileName, photo.data, { contentType: photo.type });
            
          if (error) {
            console.error('Error uploading photo:', error);
            return c.json({ error: 'Failed to upload photo', details: error.message }, 500);
          }
          
          // Get the public URL
          const { data: urlData } = supabase.storage
            .from('student-docs')
            .getPublicUrl(fileName);
            
          photo_url = urlData.publicUrl;
          console.log('Photo uploaded successfully:', photo_url);
        } catch (uploadError) {
          console.error('Exception during photo upload:', uploadError);
          return c.json({ error: 'Failed to upload photo', details: uploadError.message }, 500);
        }
      }
    } catch (parseError) {
      console.error('Error parsing form data:', parseError);
      return c.json({
        error: 'Failed to process form data',
        details: parseError.message,
        stack: parseError.stack
      }, 400);
    }
    
    // Determine default password if not provided
    let finalPassword = password;
    if (!finalPassword) {
      // Use national_id or birth_certificate as password
      if (national_id) {
        finalPassword = national_id;
      } else if (birth_certificate) {
        finalPassword = birth_certificate;
      } else {
        finalPassword = 'defaultpassword';
      }
    }
    
    // Hash the password before storing
    const hashedPassword = await bcrypt.hash(finalPassword, 10);
    
    // Format date properly for database
    let formattedDate = null;
    if (date_of_birth) {
      try {
        const dateObj = new Date(date_of_birth);
        if (!isNaN(dateObj.getTime())) {
          formattedDate = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD format
        }
      } catch (err) {
        console.error('Error formatting date:', err);
      }
    }
    
    console.log('Inserting student with data:', {
      registration_number,
      name,
      course,
      level_of_study,
      photo_url,
      national_id,
      birth_certificate,
      date_of_birth: formattedDate,
      email,
      password: 'HASHED'
    });
    
    const { rows } = await pool.query(
      `INSERT INTO students (
        registration_number, name, course, level_of_study, photo_url,
        national_id, birth_certificate, date_of_birth, password, email, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        registration_number, name, course, level_of_study, photo_url,
        national_id, birth_certificate, formattedDate, hashedPassword, email, 'active'
      ]
    );
    
    return c.json({
      message: 'Student created successfully',
      student: rows[0]
    });
  } catch (error) {
    console.error('Error creating student with photo:', error);
    console.error('Error stack:', error.stack);
    
    // Provide more specific error details based on error type
    let errorMessage = 'Failed to create student';
    let errorDetails = error.message;
    let statusCode = 500;
    
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
      errorMessage = 'Invalid form data';
      errorDetails = 'Could not parse the form data. Please check your form submission.';
      statusCode = 400;
    } else if (error.message.includes('parseBody')) {
      errorMessage = 'Form parsing error';
      errorDetails = 'There was a problem processing your form data. Make sure your form is properly formatted.';
      statusCode = 400;
    }
    
    return c.json({ 
      error: errorMessage, 
      details: errorDetails,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      type: error.constructor.name
    }, statusCode);
  }
}

// Update a student
app.put('/students/:id', async (c) => {
  try {
    const id = c.req.param('id');
    
    // Check if the request is multipart form data
    const contentType = c.req.header('content-type') || '';
    console.log('Update request content-type:', contentType);
    
    let data;
    let photo_url = null;
    
    // Handle multipart/form-data (with photo)
    if (contentType.includes('multipart/form-data')) {
      try {
        console.log('Processing multipart form data for student update');
        const formData = await c.req.parseBody();
        
        // Extract form fields
        data = {
          registration_number: formData.registration_number,
          name: formData.name,
          course: formData.course,
          level_of_study: formData.level_of_study,
          national_id: formData.national_id,
          birth_certificate: formData.birth_certificate,
          date_of_birth: formData.date_of_birth,
          password: formData.password,
          email: formData.email
        };
        
        // Handle photo if present
        const photo = formData.photo;
        if (photo && photo.data) {
          console.log('Photo included in update, uploading...');
          const fileName = `student-photos/${data.registration_number || id}_${Date.now()}_${photo.name}`;
          
          const { data: uploadData, error } = await supabase.storage
            .from('student-docs')
            .upload(fileName, photo.data, { contentType: photo.type });
            
          if (error) {
            console.error('Error uploading photo during update:', error);
            return c.json({ error: 'Failed to upload photo', details: error.message }, 500);
          }
          
          // Get the public URL
          const { data: urlData } = supabase.storage
            .from('student-docs')
            .getPublicUrl(fileName);
            
          photo_url = urlData.publicUrl;
          data.photo_url = photo_url;
          console.log('Photo updated successfully:', photo_url);
        }
      } catch (formError) {
        console.error('Error processing form data for update:', formError);
        return c.json({
          error: 'Failed to process form data',
          details: formError.message
        }, 400);
      }
    } else {
      // Handle standard JSON request
      try {
        data = await c.req.json();
      } catch (jsonError) {
        console.error('Error parsing JSON for update:', jsonError);
        return c.json({
          error: 'Invalid JSON data',
          details: jsonError.message
        }, 400);
      }
    }
    
    console.log('Updating student data:', { id, ...data });
    
    const { 
      registration_number, 
      name, 
      course, 
      level_of_study, 
      photo_url,
      national_id,
      birth_certificate,
      date_of_birth,
      password,
      email
    } = data;
    
    // Get current student data to determine if we need to update password
    const currentStudent = await pool.query('SELECT * FROM students WHERE id = $1', [id]);
    if (currentStudent.rows.length === 0) return c.json({ error: 'Student not found' }, 404);
    
    // Determine if password should be updated based on ID/birth certificate changes
    let finalPassword = password;
    let shouldHashPassword = false;
    
    if (!finalPassword) {
      // Keep existing password if not changing
      finalPassword = currentStudent.rows[0].password;
      
      // If national_id or birth_certificate changed, update password accordingly
      if (national_id && (national_id !== currentStudent.rows[0].national_id)) {
        finalPassword = national_id;
        shouldHashPassword = true;
      } else if (birth_certificate && 
                (birth_certificate !== currentStudent.rows[0].birth_certificate)) {
        finalPassword = birth_certificate;
        shouldHashPassword = true;
      }
    } else {
      // If password was explicitly provided, hash it
      shouldHashPassword = true;
    }
    
    // Hash the password if it's new or changed
    if (shouldHashPassword) {
      finalPassword = await bcrypt.hash(finalPassword || 'defaultpassword', 10);
    }
    
    // Format date properly for database
    let formattedDate = null;
    if (date_of_birth) {
      try {
        const dateObj = new Date(date_of_birth);
        if (!isNaN(dateObj.getTime())) {
          formattedDate = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD format
        }
      } catch (err) {
        console.error('Error formatting date:', err);
      }
    }
    
    console.log('Updating student with data:', {
      registration_number,
      name,
      course,
      level_of_study,
      photo_url: photo_url || null,
      national_id: national_id || null,
      birth_certificate: birth_certificate || null,
      date_of_birth: formattedDate,
      email: email || null,
      password: shouldHashPassword ? 'HASHED' : 'UNCHANGED'
    });
    
    const { rows } = await pool.query(
      `UPDATE students SET 
        registration_number=$1, name=$2, course=$3, level_of_study=$4, photo_url=$5,
        national_id=$6, birth_certificate=$7, date_of_birth=$8, password=$9, email=$10
      WHERE id=$11 RETURNING *`,
      [
        registration_number, name, course, level_of_study, photo_url || null,
        national_id || null, birth_certificate || null, formattedDate, finalPassword, email || null, id
      ]
    );
    
    if (rows.length === 0) return c.json({ error: 'Student not found' }, 404);
    return c.json(rows[0]);
  } catch (error) {
    console.error('Error updating student:', error);
    return c.json({ 
      error: 'Failed to update student', 
      details: error.message,
      stack: error.stack
    }, 500);
  }
});

// Delete a student
app.delete('/students/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await pool.query('DELETE FROM students WHERE id = $1', [id]);
    return c.json({ message: 'Student deleted' });
  } catch (error) {
    console.error('Error deleting student:', error);
    return c.json({ 
      error: 'Failed to delete student', 
      details: error.message 
    }, 500);
  }
});

// REGISTERED_UNITS CRUD
app.get('/registered_units', async (c) => {
  try {
    const { rows } = await pool.query('SELECT * FROM registered_units');
    return c.json(rows);
  } catch (error) {
    console.error('Error fetching registered units:', error);
    return c.json({ error: 'Failed to fetch registered units', details: error.message }, 500);
  }
});

app.get('/registered_units/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const { rows } = await pool.query('SELECT * FROM registered_units WHERE id = $1', [id]);
    if (rows.length === 0) return c.json({ error: 'Unit not found' }, 404);
    return c.json(rows[0]);
  } catch (error) {
    console.error('Error fetching registered unit:', error);
    return c.json({ error: 'Failed to fetch registered unit', details: error.message }, 500);
  }
});

app.post('/registered_units', async (c) => {
  try {
    const data = await c.req.json();
    const { student_id, unit_name, unit_code, status } = data;
    const { rows } = await pool.query(
      'INSERT INTO registered_units (student_id, unit_name, unit_code, status) VALUES ($1, $2, $3, $4) RETURNING *',
      [student_id, unit_name, unit_code, status]
    );
    return c.json(rows[0]);
  } catch (error) {
    console.error('Error creating registered unit:', error);
    return c.json({ error: 'Failed to create registered unit', details: error.message }, 500);
  }
});

app.put('/registered_units/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const data = await c.req.json();
    const { student_id, unit_name, unit_code, status } = data;
    const { rows } = await pool.query(
      'UPDATE registered_units SET student_id=$1, unit_name=$2, unit_code=$3, status=$4 WHERE id=$5 RETURNING *',
      [student_id, unit_name, unit_code, status, id]
    );
    if (rows.length === 0) return c.json({ error: 'Unit not found' }, 404);
    return c.json(rows[0]);
  } catch (error) {
    console.error('Error updating registered unit:', error);
    return c.json({ error: 'Failed to update registered unit', details: error.message }, 500);
  }
});

app.delete('/registered_units/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await pool.query('DELETE FROM registered_units WHERE id = $1', [id]);
    return c.json({ message: 'Unit deleted' });
  } catch (error) {
    console.error('Error deleting registered unit:', error);
    return c.json({ error: 'Failed to delete registered unit', details: error.message }, 500);
  }
});

// FEES CRUD
app.get('/fees', async (c) => {
  try {
    const { rows } = await pool.query('SELECT * FROM fees');
    return c.json(rows);
  } catch (error) {
    console.error('Error fetching fees:', error);
    return c.json({ error: 'Failed to fetch fees', details: error.message }, 500);
  }
});

app.get('/students/:id/fees', async (c) => {
  try {
    const studentId = c.req.param('id');
    const { rows } = await pool.query('SELECT * FROM fees WHERE student_id = $1', [studentId]);
    if (rows.length === 0) return c.json({ error: 'No fee records found for this student' }, 404);
    return c.json(rows[0]);
  } catch (error) {
    console.error('Error fetching student fees:', error);
    return c.json({ error: 'Failed to fetch student fees', details: error.message }, 500);
  }
});

app.get('/fees/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const { rows } = await pool.query('SELECT * FROM fees WHERE id = $1', [id]);
    if (rows.length === 0) return c.json({ error: 'Fee not found' }, 404);
    return c.json(rows[0]);
  } catch (error) {
    console.error('Error fetching fee:', error);
    return c.json({ error: 'Failed to fetch fee', details: error.message }, 500);
  }
});

app.post('/fees', async (c) => {
  try {
    const data = await c.req.json();
    const { student_id, fee_balance, total_paid, semester_fee } = data;
    const { rows } = await pool.query(
      'INSERT INTO fees (student_id, fee_balance, total_paid, semester_fee) VALUES ($1, $2, $3, $4) RETURNING *',
      [student_id, fee_balance, total_paid, semester_fee]
    );
    return c.json(rows[0]);
  } catch (error) {
    console.error('Error creating fee record:', error);
    return c.json({ error: 'Failed to create fee record', details: error.message }, 500);
  }
});

app.put('/fees/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const data = await c.req.json();
    const { student_id, fee_balance, total_paid, semester_fee } = data;
    const { rows } = await pool.query(
      'UPDATE fees SET student_id=$1, fee_balance=$2, total_paid=$3, semester_fee=$4 WHERE id=$5 RETURNING *',
      [student_id, fee_balance, total_paid, semester_fee, id]
    );
    if (rows.length === 0) return c.json({ error: 'Fee not found' }, 404);
    return c.json(rows[0]);
  } catch (error) {
    console.error('Error updating fee record:', error);
    return c.json({ error: 'Failed to update fee record', details: error.message }, 500);
  }
});

app.delete('/fees/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await pool.query('DELETE FROM fees WHERE id = $1', [id]);
    return c.json({ message: 'Fee deleted' });
  } catch (error) {
    console.error('Error deleting fee record:', error);
    return c.json({ error: 'Failed to delete fee record', details: error.message }, 500);
  }
});

// TIMETABLES CRUD
app.get('/timetables', async (c) => {
  try {
    const { rows } = await pool.query('SELECT * FROM timetables');
    return c.json(rows);
  } catch (error) {
    console.error('Error fetching timetables:', error);
    return c.json({ error: 'Failed to fetch timetables', details: error.message }, 500);
  }
});

app.get('/students/:id/timetables', async (c) => {
  try {
    const studentId = c.req.param('id');
    const { rows } = await pool.query('SELECT * FROM timetables WHERE student_id = $1', [studentId]);
    return c.json(rows);
  } catch (error) {
    console.error('Error fetching student timetables:', error);
    return c.json({ error: 'Failed to fetch student timetables', details: error.message }, 500);
  }
});

app.get('/timetables/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const { rows } = await pool.query('SELECT * FROM timetables WHERE id = $1', [id]);
    if (rows.length === 0) return c.json({ error: 'Timetable not found' }, 404);
    return c.json(rows[0]);
  } catch (error) {
    console.error('Error fetching timetable:', error);
    return c.json({ error: 'Failed to fetch timetable', details: error.message }, 500);
  }
});

app.post('/timetables', async (c) => {
  try {
    const data = await c.req.json();
    const { student_id, semester, timetable_data } = data;
    const { rows } = await pool.query(
      'INSERT INTO timetables (student_id, semester, timetable_data) VALUES ($1, $2, $3) RETURNING *',
      [student_id, semester, timetable_data]
    );
    return c.json(rows[0]);
  } catch (error) {
    console.error('Error creating timetable:', error);
    return c.json({ error: 'Failed to create timetable', details: error.message }, 500);
  }
});

app.put('/timetables/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const data = await c.req.json();
    const { student_id, semester, timetable_data } = data;
    const { rows } = await pool.query(
      'UPDATE timetables SET student_id=$1, semester=$2, timetable_data=$3 WHERE id=$4 RETURNING *',
      [student_id, semester, timetable_data, id]
    );
    if (rows.length === 0) return c.json({ error: 'Timetable not found' }, 404);
    return c.json(rows[0]);
  } catch (error) {
    console.error('Error updating timetable:', error);
    return c.json({ error: 'Failed to update timetable', details: error.message }, 500);
  }
});

app.delete('/timetables/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await pool.query('DELETE FROM timetables WHERE id = $1', [id]);
    return c.json({ message: 'Timetable deleted' });
  } catch (error) {
    console.error('Error deleting timetable:', error);
    return c.json({ error: 'Failed to delete timetable', details: error.message }, 500);
  }
});

// FINANCE CRUD
app.get('/finance', async (c) => {
  try {
    const { rows } = await pool.query('SELECT * FROM finance');
    return c.json(rows);
  } catch (error) {
    console.error('Error fetching finance records:', error);
    return c.json({ error: 'Failed to fetch finance records', details: error.message }, 500);
  }
});

app.get('/students/:id/finance', async (c) => {
  try {
    const studentId = c.req.param('id');
    const { rows } = await pool.query('SELECT * FROM finance WHERE student_id = $1 ORDER BY created_at DESC', [studentId]);
    return c.json(rows);
  } catch (error) {
    console.error('Error fetching student finance records:', error);
    return c.json({ error: 'Failed to fetch student finance records', details: error.message }, 500);
  }
});

app.get('/finance/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const { rows } = await pool.query('SELECT * FROM finance WHERE id = $1', [id]);
    if (rows.length === 0) return c.json({ error: 'Finance record not found' }, 404);
    return c.json(rows[0]);
  } catch (error) {
    console.error('Error fetching finance record:', error);
    return c.json({ error: 'Failed to fetch finance record', details: error.message }, 500);
  }
});

app.post('/finance', async (c) => {
  try {
    const data = await c.req.json();
    const { student_id, statement, statement_url, receipt_url } = data;
    const { rows } = await pool.query(
      'INSERT INTO finance (student_id, statement, statement_url, receipt_url) VALUES ($1, $2, $3, $4) RETURNING *',
      [student_id, statement, statement_url, receipt_url]
    );
    return c.json(rows[0]);
  } catch (error) {
    console.error('Error creating finance record:', error);
    return c.json({ error: 'Failed to create finance record', details: error.message }, 500);
  }
});

app.put('/finance/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const data = await c.req.json();
    const { student_id, statement, statement_url, receipt_url } = data;
    const { rows } = await pool.query(
      'UPDATE finance SET student_id=$1, statement=$2, statement_url=$3, receipt_url=$4 WHERE id=$5 RETURNING *',
      [student_id, statement, statement_url, receipt_url, id]
    );
    if (rows.length === 0) return c.json({ error: 'Finance record not found' }, 404);
    return c.json(rows[0]);
  } catch (error) {
    console.error('Error updating finance record:', error);
    return c.json({ error: 'Failed to update finance record', details: error.message }, 500);
  }
});

app.delete('/finance/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await pool.query('DELETE FROM finance WHERE id = $1', [id]);
    return c.json({ message: 'Finance record deleted' });
  } catch (error) {
    console.error('Error deleting finance record:', error);
    return c.json({ error: 'Failed to delete finance record', details: error.message }, 500);
  }
});

// RESULTS CRUD
app.get('/results', async (c) => {
  try {
    const { rows } = await pool.query('SELECT * FROM results');
    return c.json(rows);
  } catch (error) {
    console.error('Error fetching results:', error);
    return c.json({ error: 'Failed to fetch results', details: error.message }, 500);
  }
});

app.get('/students/:id/results', async (c) => {
  try {
    const studentId = c.req.param('id');
    const { rows } = await pool.query('SELECT * FROM results WHERE student_id = $1 ORDER BY semester', [studentId]);
    return c.json(rows);
  } catch (error) {
    console.error('Error fetching student results:', error);
    return c.json({ error: 'Failed to fetch student results', details: error.message }, 500);
  }
});

app.get('/results/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const { rows } = await pool.query('SELECT * FROM results WHERE id = $1', [id]);
    if (rows.length === 0) return c.json({ error: 'Result not found' }, 404);
    return c.json(rows[0]);
  } catch (error) {
    console.error('Error fetching result:', error);
    return c.json({ error: 'Failed to fetch result', details: error.message }, 500);
  }
});

app.post('/results', async (c) => {
  try {
    const data = await c.req.json();
    const { student_id, semester, result_data } = data;
    const { rows } = await pool.query(
      'INSERT INTO results (student_id, semester, result_data) VALUES ($1, $2, $3) RETURNING *',
      [student_id, semester, result_data]
    );
    return c.json(rows[0]);
  } catch (error) {
    console.error('Error creating result:', error);
    return c.json({ error: 'Failed to create result', details: error.message }, 500);
  }
});

app.put('/results/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const data = await c.req.json();
    const { student_id, semester, result_data } = data;
    const { rows } = await pool.query(
      'UPDATE results SET student_id=$1, semester=$2, result_data=$3 WHERE id=$4 RETURNING *',
      [student_id, semester, result_data, id]
    );
    if (rows.length === 0) return c.json({ error: 'Result not found' }, 404);
    return c.json(rows[0]);
  } catch (error) {
    console.error('Error updating result:', error);
    return c.json({ error: 'Failed to update result', details: error.message }, 500);
  }
});

app.delete('/results/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await pool.query('DELETE FROM results WHERE id = $1', [id]);
    return c.json({ message: 'Result deleted' });
  } catch (error) {
    console.error('Error deleting result:', error);
    return c.json({ error: 'Failed to delete result', details: error.message }, 500);
  }
});

// UNITS CRUD
app.get('/units', async (c) => {
  try {
    const { rows } = await pool.query('SELECT * FROM units');
    return c.json(rows);
  } catch (error) {
    console.error('Error fetching units:', error);
    return c.json({ error: 'Failed to fetch units', details: error.message }, 500);
  }
});

app.get('/units/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const { rows } = await pool.query('SELECT * FROM units WHERE id = $1', [id]);
    if (rows.length === 0) return c.json({ error: 'Unit not found' }, 404);
    return c.json(rows[0]);
  } catch (error) {
    console.error('Error fetching unit:', error);
    return c.json({ error: 'Failed to fetch unit', details: error.message }, 500);
  }
});

app.post('/units', async (c) => {
  try {
    const { unit_name, unit_code } = await c.req.json();
    const { rows } = await pool.query(
      'INSERT INTO units (unit_name, unit_code) VALUES ($1, $2) RETURNING *',
      [unit_name, unit_code]
    );
    return c.json(rows[0]);
  } catch (error) {
    console.error('Error creating unit:', error);
    return c.json({ error: 'Failed to create unit', details: error.message }, 500);
  }
});

app.put('/units/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const { unit_name, unit_code } = await c.req.json();
    const { rows } = await pool.query(
      'UPDATE units SET unit_name=$1, unit_code=$2 WHERE id=$3 RETURNING *',
      [unit_name, unit_code, id]
    );
    if (rows.length === 0) return c.json({ error: 'Unit not found' }, 404);
    return c.json(rows[0]);
  } catch (error) {
    console.error('Error updating unit:', error);
    return c.json({ error: 'Failed to update unit', details: error.message }, 500);
  }
});

app.delete('/units/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await pool.query('DELETE FROM units WHERE id = $1', [id]);
    return c.json({ message: 'Unit deleted' });
  } catch (error) {
    console.error('Error deleting unit:', error);
    return c.json({ error: 'Failed to delete unit', details: error.message }, 500);
  }
});

// Get units registered by a student
app.get('/students/:id/registered-units', async (c) => {
  try {
    const student_id = c.req.param('id');
    const { rows } = await pool.query(
      'SELECT * FROM registered_units WHERE student_id = $1',
      [student_id]
    );
    return c.json(rows);
  } catch (error) {
    console.error('Error fetching registered units for student:', error);
    return c.json({ error: 'Failed to fetch registered units', details: error.message }, 500);
  }
});

// Get units registered by a student using registration number
app.get('/students/registration/:regNumber/registered-units', async (c) => {
  try {
    const registration_number = c.req.param('regNumber');
    console.log('Fetching units for student with registration number:', registration_number);
    
    // First get the student ID from registration number
    const studentResult = await pool.query(
      'SELECT id FROM students WHERE registration_number = $1',
      [registration_number]
    );
    
    if (studentResult.rows.length === 0) {
      return c.json({ error: 'Student not found' }, 404);
    }
    
    const student_id = studentResult.rows[0].id;
    
    // Then get the registered units using the student ID
    const { rows } = await pool.query(
      'SELECT * FROM registered_units WHERE student_id = $1',
      [student_id]
    );
    
    return c.json(rows);
  } catch (error) {
    console.error('Error fetching registered units for student by registration number:', error);
    return c.json({ error: 'Failed to fetch registered units', details: error.message }, 500);
  }
});

// Alias endpoint for compatibility with existing code
app.get('/students/registration/:regNumber/units', async (c) => {
  try {
    const registration_number = c.req.param('regNumber');
    console.log('Fetching units for student with registration number (alias):', registration_number);
    
    // First get the student ID from registration number
    const studentResult = await pool.query(
      'SELECT id FROM students WHERE registration_number = $1',
      [registration_number]
    );
    
    if (studentResult.rows.length === 0) {
      return c.json({ error: 'Student not found' }, 404);
    }
    
    const student_id = studentResult.rows[0].id;
    
    // Then get the registered units using the student ID
    const { rows } = await pool.query(
      'SELECT * FROM registered_units WHERE student_id = $1',
      [student_id]
    );
    
    return c.json(rows);
  } catch (error) {
    console.error('Error fetching registered units for student by registration number:', error);
    return c.json({ error: 'Failed to fetch registered units', details: error.message }, 500);
  }
});

// Register a unit for a student (student registers a unit)
app.post('/students/:id/register-unit', async (c) => {
  try {
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
  } catch (error) {
    console.error('Error registering unit for student:', error);
    return c.json({ error: 'Failed to register unit', details: error.message }, 500);
  }
});

// Admin login - SIMPLIFIED without separate OPTIONS handler
app.post('/auth/admin-login', async (c) => {
  console.log('Received POST /auth/admin-login');
  console.log('Request headers:', Object.fromEntries(c.req.raw.headers.entries()));
  
  try {
    const body = await c.req.json();
    console.log('Request body:', body);
    
    const { username, password } = body;
    
    if (!username || !password) {
      return c.json({ error: 'Username and password required' }, 400);
    }

    const { rows } = await pool.query('SELECT * FROM admins WHERE username = $1', [username]);
    if (rows.length === 0) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }
    
    const admin = rows[0];
    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }
    
    const token = jwt.sign(
      { username: admin.username, admin_id: admin.id }, 
      process.env.SECRET_KEY, 
      { expiresIn: '2h' }
    );
    
    return c.json({ token, username: admin.username });
  } catch (error) {
    console.error('Admin login error:', error);
    return c.json({ error: 'Server error during login' }, 500);
  }
});

// Serve static files from the public directory
app.use('/*', serveStatic({ root: './public' }));

// API health check endpoint
app.get('/api/health', async (c) => {
  const health = {
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
    environment: process.env.NODE_ENV || 'development'
  };
  
  try {
    // Test database connection
    console.log('Testing database connection...');
    const startTime = Date.now();
    await pool.query('SELECT 1');
    const duration = Date.now() - startTime;
    
    health.database = {
      status: 'connected',
      responseTime: `${duration}ms`
    };
    
    return c.json({ 
      ...health,
      message: 'Student Portal Backend is running! Database connection is healthy.' 
    });
  } catch (error) {
    console.error('Health check failed:', error);
    
    health.status = 'error';
    health.database = {
      status: 'disconnected',
      error: error.message,
      code: error.code || 'UNKNOWN'
    };
    
    return c.json({ 
      ...health,
      message: 'Database connection failed!',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, 503);
  }
});

// Forgot password endpoint
app.post('/student/auth/forgot-password', async (c) => {
  try {
    const { registration_number, email } = await c.req.json();
    
    if (!registration_number || !email) {
      return c.json({ 
        error: 'Missing required fields', 
        details: 'Registration number and email are required' 
      }, 400);
    }
    
    // Check if student exists with matching registration number and email
    const { rows } = await pool.query(
      'SELECT * FROM students WHERE registration_number = $1 AND email = $2',
      [registration_number, email]
    );
    
    if (rows.length === 0) {
      return c.json({ 
        error: 'Invalid credentials', 
        details: 'No student found with the provided registration number and email' 
      }, 404);
    }
    
    // Generate a temporary password
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    
    // Update the student's password
    await pool.query(
      'UPDATE students SET password = $1 WHERE id = $2',
      [hashedPassword, rows[0].id]
    );
    
    // In a real application, you would send an email with the temporary password
    // For this implementation, we'll just return it in the response
    return c.json({ 
      message: 'Password reset successful', 
      temp_password: tempPassword,
      note: 'In a production environment, this would be sent via email instead of being returned in the response'
    });
  } catch (error) {
    console.error('Error in forgot password:', error);
    return c.json({ 
      error: 'Failed to process password reset', 
      details: error.message 
    }, 500);
  }
});

// Student login endpoint
app.post('/auth/student-login', async (c) => {
  try {
    const body = await c.req.json();
    console.log('Student login attempt:', { registration_number: body.registration_number });
    
    const { registration_number, password } = body;
    
    if (!registration_number || !password) {
      return c.json({ error: 'Registration number and password required' }, 400);
    }

    const { rows } = await pool.query('SELECT * FROM students WHERE registration_number = $1', [registration_number]);
    if (rows.length === 0) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }
    
    const student = rows[0];
    let isAuthenticated = false;
    
    // First try bcrypt compare (for hashed passwords)
    try {
      isAuthenticated = await bcrypt.compare(password, student.password);
    } catch (err) {
      console.log('bcrypt compare failed, might be plain text password:', err.message);
      // If bcrypt compare fails, it might be a plain text password
      isAuthenticated = (password === student.password);
    }
    
    if (!isAuthenticated) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }
    
    // If login successful with plain text password, update to hashed version
    if (password === student.password) {
      console.log('Updating plain text password to hashed version');
      const hashedPassword = await bcrypt.hash(password, 10);
      await pool.query(
        'UPDATE students SET password = $1 WHERE id = $2',
        [hashedPassword, student.id]
      );
    }
    
    const token = jwt.sign(
      { registration_number: student.registration_number, student_id: student.id }, 
      process.env.SECRET_KEY, 
      { expiresIn: '2h' }
    );
    
    return c.json({ 
      token, 
      student_id: student.id,
      registration_number: student.registration_number,
      name: student.name
    });
  } catch (error) {
    console.error('Student login error:', error);
    return c.json({ 
      error: 'Server error during login', 
      details: error.message,
      stack: error.stack 
    }, 500);
  }
});

// Student forgot password endpoint
app.post('/student/auth/forgot-password', async (c) => {
  try {
    console.log('Student forgot password request received');
    const body = await c.req.json();
    
    // Extract necessary fields from request
    const { registration_number, new_password } = body;
    
    if (!registration_number) {
      return c.json({ error: 'Registration number is required' }, 400);
    }
    
    if (!new_password) {
      return c.json({ error: 'New password is required' }, 400);
    }
    
    // Find the student
    const { rows } = await pool.query('SELECT * FROM students WHERE registration_number = $1', [registration_number]);
    if (rows.length === 0) {
      return c.json({ error: 'Student not found' }, 404);
    }
    
    const student = rows[0];
    
    // Hash the new password
    const hashedPassword = await bcrypt.hash(new_password, 10);
    
    // Update the password in the database
    await pool.query(
      'UPDATE students SET password = $1 WHERE registration_number = $2',
      [hashedPassword, registration_number]
    );
    
    return c.json({ 
      message: 'Password reset successful', 
      registration_number: student.registration_number 
    });
  } catch (error) {
    console.error('Error resetting student password:', error);
    return c.json({ 
      error: 'Failed to reset password', 
      details: error.message 
    }, 500);
  }
});

// Exam Card Endpoints
app.get('/students/:id/exam-card', async (c) => {
  try {
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
  } catch (error) {
    console.error('Error fetching exam card:', error);
    return c.json({ error: 'Failed to fetch exam card', details: error.message }, 500);
  }
});

app.get('/exam-cards', async (c) => {
  try {
    const { rows } = await pool.query('SELECT * FROM exam_cards');
    return c.json(rows);
  } catch (error) {
    console.error('Error fetching exam cards:', error);
    return c.json({ error: 'Failed to fetch exam cards', details: error.message }, 500);
  }
});

app.post('/students/:id/exam-card', async (c) => {
  try {
    const studentId = c.req.param('id');
    const { file_url } = await c.req.json();
    await pool.query(
      'INSERT INTO exam_cards (student_id, file_url) VALUES ($1, $2)',
      [studentId, file_url]
    );
    return c.json({ message: 'Exam card uploaded.' });
  } catch (error) {
    console.error('Error uploading exam card:', error);
    return c.json({ error: 'Failed to upload exam card', details: error.message }, 500);
  }
});

// Upload exam card with file upload (admin)
app.post('/students/:id/upload-exam-card', async (c) => {
  try {
    const studentId = c.req.param('id');
    const formData = await c.req.parseBody();
    const file = formData['file'];
    if (!file) return c.json({ error: 'No file uploaded' }, 400);
    const fileName = `exam-cards/${studentId}_${Date.now()}_${file.name}`;
    const { data, error } = await supabase.storage.from('student-docs').upload(fileName, file.data, { contentType: file.type });
    if (error) return c.json({ error: error.message }, 500);
    const { publicURL } = supabase.storage.from('student-docs').getPublicUrl(fileName).data;
    await pool.query('INSERT INTO exam_cards (student_id, file_url) VALUES ($1, $2)', [studentId, publicURL]);
    return c.json({ message: 'Exam card uploaded.', url: publicURL });
  } catch (error) {
    console.error('Error uploading exam card:', error);
    return c.json({ error: 'Failed to upload exam card', details: error.message }, 500);
  }
});

// Fee Statement and Receipt Endpoints
app.get('/students/:id/fee-statement', async (c) => {
  const studentId = c.req.param('id');
  const { rows } = await pool.query(
    'SELECT statement_url FROM finance WHERE student_id = $1 AND statement_url IS NOT NULL ORDER BY created_at DESC LIMIT 1',
    [studentId]
  );
  if (rows.length === 0) return c.json({ error: 'No fee statement found' }, 404);
  return c.json({ statement_url: rows[0].statement_url });
});

app.get('/students/:id/fee-receipt', async (c) => {
  const studentId = c.req.param('id');
  const { rows } = await pool.query(
    'SELECT receipt_url FROM finance WHERE student_id = $1 AND receipt_url IS NOT NULL ORDER BY created_at DESC LIMIT 1',
    [studentId]
  );
  if (rows.length === 0) return c.json({ error: 'No fee receipt found' }, 404);
  return c.json({ receipt_url: rows[0].receipt_url });
});

app.post('/students/:id/fee-statement', async (c) => {
  const studentId = c.req.param('id');
  const { statement_url } = await c.req.json();
  await pool.query(
    'INSERT INTO finance (student_id, statement_url) VALUES ($1, $2)',
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
  try {
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
  } catch (error) {
    console.error('Error uploading fee statement:', error);
    return c.json({ error: 'Failed to upload fee statement', details: error.message }, 500);
  }
});

// Upload fee receipt (admin)
app.post('/students/:id/upload-fee-receipt', async (c) => {
  try {
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
  } catch (error) {
    console.error('Error uploading fee receipt:', error);
    return c.json({ error: 'Failed to upload fee receipt', details: error.message }, 500);
  }
});

const port = process.env.PORT || 3000;
console.log(`Server running on http://localhost:${port}`);
serve({
  fetch: app.fetch,
  port: port
});

// Export the app for use in api/index.js
export { app };