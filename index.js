import { Hono } from 'hono';
import { pool } from './db.js';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { serveStatic } from '@hono/node-server/serve-static';

const app = new Hono({
  // Add proper parsing configuration for multipart/form-data
  parseBody: {
    formData: {
      // Increase limit to handle larger file uploads
      limit: '10mb',
    },
    // Handle JSON data type as well
    json: {
      limit: '1mb',
    }
  }
});

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

// Enhanced request logging middleware
app.use('*', async (c, next) => {
  console.log(`[${new Date().toISOString()}] ${c.req.method} ${c.req.path}`);
  console.log('Origin:', c.req.header('origin'));
  
  // Full headers logging for debugging
  const headers = Object.fromEntries(c.req.raw.headers.entries());
  console.log('Headers:', headers);
  
  // Special handling for content-type to debug multipart form issues
  if (headers['content-type']) {
    console.log('Content-Type details:', headers['content-type']);
    if (headers['content-type'].includes('multipart/form-data')) {
      console.log('Detected multipart/form-data request');
      // Check if content-type has proper boundary
      if (!headers['content-type'].includes('boundary=')) {
        console.warn('Warning: multipart/form-data missing boundary parameter!');
      }
    }
  }
  
  try {
    await next();
  } catch (err) {
    console.error('Global error handler:', err);
    console.error('Error stack:', err.stack);
    return c.json({ 
      error: 'Internal Server Error', 
      details: err.message,
      path: c.req.path,
      method: c.req.method,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    }, 500);
  }
});

// Serve static files from the public directory
app.use('/test', serveStatic({ root: './public' }));

// Add specific routes for testing
app.get('/test-upload', (c) => {
  return c.redirect('/test/test-upload.html');
});

app.get('/test-exam-card', (c) => {
  return c.redirect('/test/test-exam-card.html');
});

// Supabase Storage setup
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Helper function for Supabase file uploads with support for both File and custom objects
async function uploadFileToSupabase(file, folder, prefix = '') {
  if (!file) {
    throw new Error('No file provided');
  }
  
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase storage not configured');
  }

  // Get file data based on what format we received
  let fileData, fileName, fileType;
  
  console.log('Processing file for upload:', {
    fileType: typeof file,
    isFileInstance: file instanceof File,
    hasData: !!file.data,
    hasSize: !!file.size,
    fileName: file.name,
    fileTypeProp: file.type
  });
  
  if (file instanceof File) {
    // Standard File object from formData()
    fileData = await file.arrayBuffer();
    fileName = file.name;
    fileType = file.type;
    console.log('Using File instance method');
  } else if (file.data) {
    // Custom object with data property
    fileData = file.data;
    fileName = file.name;
    fileType = file.type;
    console.log('Using data property method');
  } else if (file.size && typeof file.arrayBuffer === 'function') {
    // Handle File-like objects that might have arrayBuffer method
    try {
      fileData = await file.arrayBuffer();
      fileName = file.name;
      fileType = file.type;
      console.log('Using arrayBuffer method');
    } catch (streamError) {
      console.error('Error reading file arrayBuffer:', streamError);
      throw new Error('Failed to read file data from arrayBuffer');
    }
  } else {
    console.error('Invalid file format:', {
      hasData: !!file.data,
      hasSize: !!file.size,
      hasArrayBuffer: typeof file.arrayBuffer === 'function',
      isFileInstance: file instanceof File,
      keys: typeof file === 'object' ? Object.keys(file) : 'not an object'
    });
    throw new Error('Invalid file format provided - file must be a File instance, have data property, or have arrayBuffer method');
  }

  const uploadPath = `${folder}/${prefix}_${Date.now()}_${fileName}`;
  
  console.log(`Uploading ${fileName} to ${folder} folder in clipstech bucket...`);
  
  const { data, error } = await supabase.storage
    .from('clipstech')
    .upload(uploadPath, fileData, { contentType: fileType });
    
  if (error) {
    console.error(`Error uploading to ${folder}:`, error);
    throw error;
  }

  // Get the public URL
  const { data: urlData } = supabase.storage
    .from('clipstech')
    .getPublicUrl(uploadPath);
    
  console.log(`File uploaded successfully to ${folder} folder`);
  return {
    filePath: uploadPath,
    publicUrl: urlData.publicUrl
  };
}

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
    let body;
    try {
      body = await c.req.json();
      console.log('Student promotion request received:', body);
    } catch (jsonError) {
      console.error('Error parsing JSON in promotion request:', jsonError);
      return c.json({
        error: 'Invalid JSON data',
        details: 'The request body must be valid JSON'
      }, 400);
    }
    
    // Only accept registration_number and new_level
    const registration_number = body.registration_number;
    const new_level = body.new_level;
    
    console.log('Parsed promotion data:', {
      registration_number,
      new_level
    });
    
    if (!registration_number) {
      return c.json({ 
        error: 'Missing required field', 
        details: 'Registration number is required. Please provide "registration_number" in your request.'
      }, 400);
    }
    
    if (!new_level) {
      return c.json({ 
        error: 'Missing required field', 
        details: 'New level of study is required. Please provide "new_level" with the target level of study.' 
      }, 400);
    }
    
    // Promote by registration number
    console.log('Promoting student by registration number:', registration_number);
    const { rows } = await pool.query(
      `UPDATE students SET 
        level_of_study=$1
      WHERE registration_number = $2 RETURNING *`,
      [new_level, registration_number]
    );
    
    if (rows.length === 0) {
      return c.json({
        error: 'Student not found',
        details: `No student found with registration number: ${registration_number}`
      }, 404);
    }
    
    return c.json({ 
      message: 'Student promoted successfully', 
      student: rows[0] 
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
    console.log('Full headers:', Object.fromEntries(c.req.raw.headers.entries()));
    
    // Log environment info to help debugging
    console.log('Node env:', process.env.NODE_ENV);
    console.log('Vercel env:', process.env.VERCEL_ENV);
    
    if (contentType.includes('multipart/form-data')) {
      console.log('Detected multipart/form-data request, redirecting to multipart handler');
      // Redirect to the multipart handler (which makes photo optional)
      try {
        return await handleStudentWithPhoto(c);
      } catch (photoError) {
        console.error('Error in multipart form handler:', photoError);
        return c.json({
          error: 'Error processing student registration',
          details: photoError.message,
          stack: process.env.NODE_ENV === 'development' ? photoError.stack : undefined
        }, 500);
      }
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
        details: jsonError.message,
        message: 'Make sure you are sending a valid JSON body with the correct content-type header'
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
  console.log('Handling student registration with photo');
  
  // Declare all variables at the beginning of the function to avoid scope issues
  let registration_number = '';
  let name = '';
  let course = '';
  let level_of_study = '';
  let national_id = null;
  let birth_certificate = null;
  let date_of_birth = null;
  let password = null;
  let email = null;
  let student_photo_url = null;
  let formData = {};
  
  try {
    // Log request information to help diagnose Vercel issues
    console.log('Request method:', c.req.method);
    console.log('Content-Type:', c.req.header('content-type'));
    console.log('Request headers:', Object.fromEntries(c.req.raw.headers.entries()));
    
    try {
      // Parse the multipart form data based on Hono documentation
      console.log('Attempting to parse form data...');
      console.log('Content-Type header details:', c.req.header('content-type'));
      
      // Use simple parseBody with proper error handling
      try {
        // According to Hono docs, this is all we need for file uploads
        formData = await c.req.parseBody();
        console.log('Form data successfully parsed, keys:', Object.keys(formData));
        
        // Debug logging for file keys
        Object.keys(formData).forEach(key => {
          const value = formData[key];
          if (value instanceof File || (value && value.name && value.type)) {
            console.log(`File field detected: ${key}`, { 
              name: value.name, 
              type: value.type, 
              size: value.size || (value.data ? value.data.length : 'unknown') 
            });
          } else {
            console.log(`Form field: ${key} = ${typeof value === 'object' ? JSON.stringify(value) : value}`);
          }
        });
      } catch (parseError) {
        console.error('Detailed parse error:', parseError);
        
        // Try standard formData() method as a fallback
        try {
          console.log('Trying alternative formData() method...');
          const rawFormData = await c.req.formData();
          formData = Object.fromEntries(rawFormData);
          console.log('Used formData() method instead, keys:', Object.keys(formData));
        } catch (altError) {
          console.error('Alternative form parsing also failed:', altError);
          throw new Error(`Form parsing failed: ${parseError.message}. Alternative method also failed: ${altError.message}`);
        }
      }
      
      // Extract student data with additional validation
      registration_number = formData.registration_number || '';
      name = formData.name || '';
      course = formData.course || '';
      level_of_study = formData.level_of_study || '';
      national_id = formData.national_id || null;
      birth_certificate = formData.birth_certificate || null;
      date_of_birth = formData.date_of_birth || null;
      password = formData.password || null;
      email = formData.email || null;
      
      console.log('Extracted form data:', {
        registration_number,
        name,
        course,
        level_of_study,
        national_id: national_id ? '[PRESENT]' : '[NOT PRESENT]',
        birth_certificate: birth_certificate ? '[PRESENT]' : '[NOT PRESENT]',
        date_of_birth,
        email: email || '[NOT PRESENT]',
        password: password ? '[PRESENT]' : '[NOT PRESENT]',
        photo: formData.photo ? '[PHOTO PRESENT]' : '[NO PHOTO]'
      });
      
      // Validate required fields
      if (!registration_number || !name || !course || !level_of_study) {
        return c.json({ 
          error: 'Missing required fields', 
          details: 'Registration number, name, course, and level of study are required' 
        }, 400);
      }
    } catch (parseError) {
      console.error('Error parsing form data:', parseError);
      console.error('Parse error stack:', parseError.stack);
      return c.json({
        error: 'Failed to process form data',
        details: 'The server could not process the uploaded form data. Make sure you are using multipart/form-data correctly.',
        originalError: parseError.message,
        stack: process.env.NODE_ENV === 'development' ? parseError.stack : undefined
      }, 400);
    }
    
    // Handle photo upload if provided (optional)
    const photo = formData.photo;
    
    if (photo) {
      console.log('Photo received, uploading to storage');
      
      // Handle both Hono File object or our custom object structure
      let fileToUpload;
      
      if (photo instanceof File) {
        // Hono provides standard File objects
        console.log('Photo details (standard File):', {
          name: photo.name,
          type: photo.type,
          size: photo.size
        });
        fileToUpload = {
          name: photo.name,
          type: photo.type,
          // Convert File to array buffer then to buffer for Supabase
          data: await photo.arrayBuffer()
        };
      } else if (photo.data) {
        // Support legacy format as well
        console.log('Photo details (legacy format):', {
          name: photo.name,
          type: photo.type,
          size: photo.data.length
        });
        fileToUpload = photo;
      } else {
        console.log('Unknown photo format:', photo);
        throw new Error('Invalid photo format received');
      }
      
      try {
        const uploadResult = await uploadFileToSupabase(
          fileToUpload, 
          'Student_photos', 
          registration_number
        );
        student_photo_url = uploadResult.publicUrl;
        console.log('Photo uploaded successfully:', student_photo_url);
      } catch (uploadError) {
        console.error('Exception during photo upload:', uploadError);
        // Continue without photo instead of failing the whole request
        console.log('Continuing registration without photo due to exception:', uploadError.message);
      }
    } else {
      console.log('No photo provided in the request - continuing with registration');
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
    
    try {
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
        } catch (dateErr) {
          console.error('Error formatting date:', dateErr);
        }
      }
      
      console.log('Inserting student with data:', {
        registration_number,
        name,
        course,
        level_of_study,
        photo_url: student_photo_url || '[NO PHOTO URL]',
        national_id: national_id || '[NO NATIONAL ID]',
        birth_certificate: birth_certificate || '[NO BIRTH CERTIFICATE]',
        date_of_birth: formattedDate || '[NO DOB]',
        email: email || '[NO EMAIL]',
        password: 'HASHED'
      });
      
      // Check database connection before insert
      try {
        await pool.query('SELECT 1');
        console.log('Database connection successful');
      } catch (dbError) {
        console.error('Database connection failed:', dbError);
        return c.json({
          error: 'Database connection failed',
          details: 'The server could not connect to the database',
          originalError: dbError.message
        }, 503);
      }
      
      const { rows } = await pool.query(
        `INSERT INTO students (
          registration_number, name, course, level_of_study, photo_url,
          national_id, birth_certificate, date_of_birth, password, email, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [
          registration_number, name, course, level_of_study, student_photo_url || null,
          national_id, birth_certificate, formattedDate, hashedPassword, email || null, 'active'
        ]
      );
      
      return c.json({
        message: 'Student created successfully',
        student: rows[0]
      });
    } catch (dbOperationError) {
      console.error('Error in database operation:', dbOperationError);
      return c.json({
        error: 'Database operation failed',
        details: dbOperationError.message,
        stack: process.env.NODE_ENV === 'development' ? dbOperationError.stack : undefined
      }, 500);
    }
  } catch (error) {
    console.error('Error creating student with photo:', error);
    console.error('Error stack:', error.stack);
    
    // Provide more specific error details based on error type
    let errorMessage = 'Failed to create student';
    let errorDetails = error.message || 'Unknown error occurred';
    let statusCode = 500;
    
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
      errorMessage = 'Invalid form data';
      errorDetails = 'Could not parse the form data. Please check your form submission.';
      statusCode = 400;
    } else if (error.message && error.message.includes('parseBody')) {
      errorMessage = 'Form parsing error';
      errorDetails = 'There was a problem processing your form data. Make sure your form is properly formatted.';
      statusCode = 400;
    } else if (error.message && error.message.includes('pool')) {
      errorMessage = 'Database connection error';
      errorDetails = 'Could not connect to the database. Please try again later.';
      statusCode = 503;
    }
    
    return c.json({ 
      error: errorMessage, 
      details: errorDetails,
      errorType: error.constructor ? error.constructor.name : 'Unknown',
      timestamp: new Date().toISOString(),
      path: '/students (multipart handler)'
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
    let update_photo_url = null;
    
    // Handle multipart/form-data (with photo)
    if (contentType.includes('multipart/form-data')) {
      try {
        console.log('Processing multipart form data for student update');
        const formData = await c.req.formData();
        
        // Extract form fields
        data = {
          registration_number: formData.get('registration_number'),
          name: formData.get('name'),
          course: formData.get('course'),
          level_of_study: formData.get('level_of_study'),
          national_id: formData.get('national_id'),
          birth_certificate: formData.get('birth_certificate'),
          date_of_birth: formData.get('date_of_birth'),
          password: formData.get('password'),
          email: formData.get('email')
        };
        
        // Handle photo if present (optional)
        const photo = formData.get('photo');
        if (photo && typeof photo !== 'string' && photo.size > 0) {
          console.log('Photo included in update, uploading...');
          
          try {
            // Convert File to our expected format
            const fileData = await photo.arrayBuffer();
            const fileObj = {
              name: photo.name,
              type: photo.type,
              data: new Uint8Array(fileData)
            };
            
            // Upload using our helper function
            const uploadResult = await uploadFileToSupabase(
              fileObj, 
              'Student_photos', 
              data.registration_number || id
            );
            
            update_photo_url = uploadResult.publicUrl;
            console.log('Photo updated successfully:', update_photo_url);
          } catch (uploadError) {
            console.error('Exception during photo upload in update:', uploadError);
            console.log('Continuing update without changing photo due to exception');
          }
        } else {
          console.log('No photo included in the update request');
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
      photo_url,  // Use the original name for consistency
      national_id,
      birth_certificate,
      date_of_birth,
      password,
      email
    } = data;
    
    // Use the photo URL from the form upload if available, otherwise use what came in the data
    const final_photo_url = update_photo_url || photo_url;
    
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
      photo_url: final_photo_url || null,
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
        registration_number, name, course, level_of_study, final_photo_url || null,
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

// Get fee record by ID
app.get('/fees/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const { rows } = await pool.query('SELECT * FROM fees WHERE id = $1', [id]);
    if (rows.length === 0) return c.json({ error: 'Fee not found' }, 404);
    return c.json(rows[0]);
  } catch (error) {
    console.error('Error fetching fee record:', error);
    return c.json({ error: 'Failed to fetch fee record', details: error.message }, 500);
  }
});

// Update fee record
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
    const { rows } = await pool.query('SELECT * FROM finance WHERE student_id = $1', [studentId]);
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

// Register units for a student in bulk
app.post('/students/:id/register-units', async (c) => {
  try {
    const studentId = c.req.param('id');
    console.log('Registering units for student:', studentId);
    
    let body;
    try {
      body = await c.req.json();
      console.log('Registration request received:', body);
    } catch (jsonError) {
      console.error('Error parsing JSON in unit registration request:', jsonError);
      return c.json({
        error: 'Invalid JSON data',
        details: 'The request body must be valid JSON'
      }, 400);
    }
    
    // Check if student exists
    const studentCheck = await pool.query('SELECT id FROM students WHERE id = $1', [studentId]);
    if (studentCheck.rows.length === 0) {
      return c.json({ 
        error: 'Student not found',
        details: `No student found with ID: ${studentId}`
      }, 404);
    }
    
    // Expect an array of unit codes or an array of objects with unit_code
    const unit_codes = Array.isArray(body) ? body : (body.units || []);
    
    if (!unit_codes || unit_codes.length === 0) {
      return c.json({ 
        error: 'Missing required field', 
        details: 'At least one unit must be provided for registration'
      }, 400);
    }
    
    const registered_units = [];
    const errors = [];
    
    // Process each unit registration
    for (const unit of unit_codes) {
      try {
        const unit_code = typeof unit === 'string' ? unit : unit.unit_code;
        
        if (!unit_code) {
          errors.push({
            unit: unit,
            error: 'Missing unit_code field'
          });
          continue;
        }
        
        // Check if the unit exists
        const unitCheck = await pool.query('SELECT * FROM units WHERE unit_code = $1', [unit_code]);
        
        if (unitCheck.rows.length === 0) {
          errors.push({
            unit_code: unit_code,
            error: 'Unit does not exist'
          });
          continue;
        }
        
        const unit_name = unitCheck.rows[0].unit_name;
        
        // Check if the unit is already registered by this student
        const alreadyRegistered = await pool.query(
          'SELECT id FROM registered_units WHERE student_id = $1 AND unit_code = $2',
          [studentId, unit_code]
        );
        
        if (alreadyRegistered.rows.length > 0) {
          errors.push({
            unit_code: unit_code,
            error: 'Unit already registered by this student'
          });
          continue;
        }
        
        // Register the unit
        const { rows } = await pool.query(
          'INSERT INTO registered_units (student_id, unit_name, unit_code, status) VALUES ($1, $2, $3, $4) RETURNING *',
          [studentId, unit_name, unit_code, 'registered']
        );
        
        registered_units.push(rows[0]);
      } catch (unitError) {
        console.error(`Error registering unit:`, unitError);
        errors.push({
          unit: unit,
          error: unitError.message
        });
      }
    }
    
    return c.json({
      message: `${registered_units.length} units registered successfully`,
      registered_units: registered_units,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error registering units:', error);
    return c.json({ 
      error: 'Failed to register units', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, 500);
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

// Add POST endpoint for exam cards
app.post('/exam-cards', async (c) => {
  try {
    console.log('POST /exam-cards request received');
    
    // Check if the request is multipart/form-data
    const contentType = c.req.header('content-type') || '';
    console.log('Request content-type:', contentType);
    
    let registration_number;
    let file_url;
    
    // Handle multipart/form-data (file upload first)
    if (contentType.includes('multipart/form-data')) {
      try {
        console.log('Processing multipart form data for file upload');
        const formData = await c.req.formData();
        console.log('Form data parsed with formData():', [...formData.keys()]);
        
        // Validate form data
        if (!formData) {
          return c.json({
            error: 'Invalid form data',
            details: 'Failed to parse multipart form data properly'
          }, 400);
        }
        
        registration_number = formData.get('registration_number');
        
        // Validate required fields
        if (!registration_number) {
          return c.json({
            error: 'Missing required field',
            details: 'Registration number is required'
          }, 400);
        }
        
        // Handle file upload - upload to Supabase first, then return URL
        const file = formData.get('file');
        console.log('File detection debug:', {
          file: file ? 'present' : 'missing',
          hasSize: file && file.size ? `${file.size} bytes` : 'no size',
          fileType: file ? typeof file : 'N/A',
          fileName: file && file.name ? file.name : 'no name',
          isFile: file instanceof File
        });
        
        if (file && file instanceof File && file.size > 0) {
          console.log('File included in request, uploading to Supabase...');
          console.log('File details:', {
            name: file.name,
            type: file.type,
            size: file.size
          });
          
          try {
            // Convert File to our expected format for uploadFileToSupabase
            const fileData = await file.arrayBuffer();
            const fileObj = {
              name: file.name,
              type: file.type,
              data: new Uint8Array(fileData)
            };
            
            // Upload to Supabase with custom expiry (e.g., 1 year = 31536000 seconds)
            const uploadPath = `exam_cards/${registration_number}_${Date.now()}_${file.name}`;
            
            console.log(`Uploading ${file.name} to exam_cards folder in clipstech bucket...`);
            
            const { data, error } = await supabase.storage
              .from('clipstech')
              .upload(uploadPath, fileObj.data, { 
                contentType: file.type,
                cacheControl: '31536000' // 1 year cache
              });
              
            if (error) {
              console.error(`Error uploading to exam_cards:`, error);
              throw error;
            }

            // Get the public URL with custom expiry (1 year from now)
            const expiresIn = 31536000; // 1 year in seconds
            const { data: urlData, error: urlError } = await supabase.storage
              .from('clipstech')
              .createSignedUrl(uploadPath, expiresIn);
              
            if (urlError) {
              console.error('Error creating signed URL:', urlError);
              // Fallback to public URL if signed URL fails
              const { data: publicUrlData } = supabase.storage
                .from('clipstech')
                .getPublicUrl(uploadPath);
              file_url = publicUrlData.publicUrl;
            } else {
              file_url = urlData.signedUrl;
            }
            
            console.log('File uploaded successfully with custom expiry:', file_url);
            
            // Return just the file URL for frontend to use in second request
            return c.json({
              message: 'File uploaded successfully',
              file_url: file_url,
              registration_number: registration_number,
              note: 'Use these values to save the exam card record to database'
            });
            
          } catch (uploadError) {
            console.error('Error uploading file for exam card:', uploadError);
            return c.json({
              error: 'Failed to upload file for exam card',
              details: uploadError.message
            }, 500);
          }
        } else {
          return c.json({
            error: 'Missing file',
            details: 'A file is required for exam card upload'
          }, 400);
        }
      } catch (formError) {
        console.error('Error processing form data for exam card:', formError);
        console.error('FormError details:', {
          message: formError.message,
          name: formError.name,
          stack: process.env.NODE_ENV === 'development' ? formError.stack : undefined
        });
        
        return c.json({
          error: 'Failed to process form data',
          details: formError.message,
          help: 'Make sure you are sending a properly formatted multipart/form-data request with registration_number and file',
          debug: process.env.NODE_ENV === 'development' ? {
            errorName: formError.name,
            contentType: contentType,
            headers: Object.fromEntries(c.req.raw.headers.entries())
          } : undefined
        }, 400);
      }
    } else {
      // Handle JSON request to save exam card record to database
      try {
        const data = await c.req.json();
        console.log('Saving exam card record to database:', data);
        
        registration_number = data.registration_number;
        file_url = data.file_url;
        
        // Validate required fields
        if (!registration_number || !file_url) {
          return c.json({ 
            error: 'Missing required fields', 
            details: 'Registration number and file URL are required',
            received: {
              registration_number: registration_number || 'missing',
              file_url: file_url || 'missing'
            }
          }, 400);
        }
        
        // Validate registration number format
        if (typeof registration_number !== 'string' || registration_number.trim().length === 0) {
          return c.json({
            error: 'Invalid registration number',
            details: 'Registration number must be a non-empty string'
          }, 400);
        }
        
        // Validate file URL format
        if (typeof file_url !== 'string' || file_url.trim().length === 0) {
          return c.json({
            error: 'Invalid file URL',
            details: 'File URL must be a non-empty string'
          }, 400);
        }
        
        // Get student_id from registration_number
        const studentResult = await pool.query(
          'SELECT id FROM students WHERE registration_number = $1',
          [registration_number.trim()]
        );
        
        if (studentResult.rows.length === 0) {
          return c.json({ 
            error: 'Student not found', 
            details: 'No student found with the provided registration number' 
          }, 404);
        }
        
        const student_id = studentResult.rows[0].id;
        
        console.log('Inserting exam card in database:', { registration_number, student_id, file_url });
        
        const { rows } = await pool.query(
          'INSERT INTO exam_cards (student_id, file_url) VALUES ($1, $2) RETURNING *',
          [student_id, file_url]
        );
        
        return c.json({ 
          message: 'Exam card record saved to database successfully', 
          exam_card: rows[0] 
        });
        
      } catch (jsonError) {
        console.error('Error parsing JSON for exam card:', jsonError);
        return c.json({
          error: 'Invalid JSON data',
          details: jsonError.message,
          message: 'Make sure you are sending a valid JSON body with registration_number and file_url'
        }, 400);
      }
    }
  } catch (error) {
    console.error('Error processing exam card request:', error);
    return c.json({ 
      error: 'Failed to process exam card request', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, 500);
  }
});

// Dedicated file upload endpoint for exam cards
app.post('/exam-cards/upload', async (c) => {
  try {
    console.log('POST /exam-cards/upload request received - file upload only');
    
    // Check if the request is multipart/form-data
    const contentType = c.req.header('content-type') || '';
    console.log('Request content-type:', contentType);
    
    if (!contentType.includes('multipart/form-data')) {
      return c.json({
        error: 'Invalid content type',
        details: 'This endpoint requires multipart/form-data for file uploads'
      }, 400);
    }
    
    try {
      const formData = await c.req.formData();
      console.log('Form data parsed:', [...formData.keys()]);
      
      const registration_number = formData.get('registration_number');
      const file = formData.get('file');
      
      // Validate required fields
      if (!registration_number) {
        return c.json({
          error: 'Missing registration number',
          details: 'Registration number is required for file upload'
        }, 400);
      }
      
      if (!file || !file instanceof File || file.size === 0) {
        return c.json({
          error: 'Missing or invalid file',
          details: 'A valid file is required'
        }, 400);
      }
      
      console.log('Uploading file:', {
        name: file.name,
        type: file.type,
        size: file.size,
        registration_number
      });
      
      // Upload file to Supabase with custom expiry
      const fileData = await file.arrayBuffer();
      const uploadPath = `exam_cards/${registration_number}_${Date.now()}_${file.name}`;
      
      const { data, error } = await supabase.storage
        .from('clipstech')
        .upload(uploadPath, fileData, { 
          contentType: file.type,
          cacheControl: '31536000' // 1 year cache
        });
        
      if (error) {
        console.error('Supabase upload error:', error);
        return c.json({
          error: 'Failed to upload file',
          details: error.message
        }, 500);
      }
      
      // Create signed URL with custom expiry (1 year)
      const expiresIn = 31536000; // 1 year in seconds
      const { data: urlData, error: urlError } = await supabase.storage
        .from('clipstech')
        .createSignedUrl(uploadPath, expiresIn);
        
      let file_url;
      if (urlError) {
        console.error('Error creating signed URL, using public URL:', urlError);
        const { data: publicUrlData } = supabase.storage
          .from('clipstech')
          .getPublicUrl(uploadPath);
        file_url = publicUrlData.publicUrl;
      } else {
        file_url = urlData.signedUrl;
      }
      
      console.log('File uploaded successfully:', file_url);
      
      return c.json({
        message: 'File uploaded successfully',
        file_url: file_url,
        registration_number: registration_number,
        upload_path: uploadPath,
        expires_in_seconds: expiresIn,
        note: 'Use the file_url and registration_number to save the exam card record'
      });
      
    } catch (uploadError) {
      console.error('Error during file upload:', uploadError);
      return c.json({
        error: 'File upload failed',
        details: uploadError.message
      }, 500);
    }
  } catch (error) {
    console.error('Error in file upload endpoint:', error);
    return c.json({
      error: 'Upload endpoint error',
      details: error.message
    }, 500);
  }
});

// Save exam card record to database (after file upload)
app.post('/exam-cards/save', async (c) => {
  try {
    console.log('POST /exam-cards/save request received - save record only');
    
    const data = await c.req.json();
    const { registration_number, file_url } = data;
    
    // Validate required fields
    if (!registration_number || !file_url) {
      return c.json({ 
        error: 'Missing required fields', 
        details: 'Both registration_number and file_url are required'
      }, 400);
    }
    
    // Validate field formats
    if (typeof registration_number !== 'string' || registration_number.trim().length === 0) {
      return c.json({
        error: 'Invalid registration number',
        details: 'Registration number must be a non-empty string'
      }, 400);
    }
    
    if (typeof file_url !== 'string' || file_url.trim().length === 0) {
      return c.json({
        error: 'Invalid file URL',
        details: 'File URL must be a non-empty string'
      }, 400);
    }
    
    // Get student_id from registration_number
    const studentResult = await pool.query(
      'SELECT id FROM students WHERE registration_number = $1',
      [registration_number.trim()]
    );
    
    if (studentResult.rows.length === 0) {
      return c.json({ 
        error: 'Student not found', 
        details: 'No student found with the provided registration number' 
      }, 404);
    }
    
    const student_id = studentResult.rows[0].id;
    
    console.log('Saving exam card record to database:', { 
      registration_number: registration_number.trim(), 
      student_id, 
      file_url: file_url.trim() 
    });
    
    // Insert or update exam card record in database
    const { rows } = await pool.query(
      'INSERT INTO exam_cards (student_id, file_url) VALUES ($1, $2) ON CONFLICT (student_id) DO UPDATE SET file_url = EXCLUDED.file_url RETURNING *',
      [student_id, file_url.trim()]
    );
    
    return c.json({ 
      message: 'Exam card record saved successfully', 
      exam_card: rows[0] 
    });
    
  } catch (error) {
    console.error('Error saving exam card record:', error);
    return c.json({ 
      error: 'Failed to save exam card record', 
      details: error.message 
    }, 500);
  }
});

// Upload exam card with file upload (admin)
app.post('/students/registration/:regNumber/upload-exam-card', async (c) => {
  try {
    const registration_number = c.req.param('regNumber');
    console.log('Uploading exam card for student with registration number:', registration_number);
    
    // Get student ID from registration number
    const studentResult = await pool.query(
      'SELECT id FROM students WHERE registration_number = $1',
      [registration_number]
    );
    
    if (studentResult.rows.length === 0) {
      return c.json({ 
        error: 'Student not found', 
        details: 'No student found with the provided registration number' 
      }, 404);
    }
    
    const student_id = studentResult.rows[0].id;
    
    // Parse multipart form data
    const formData = await c.req.formData();
    console.log('Form data received:', [...formData.keys()]);
    
    // Extract file
    const file = formData.get('file');
    if (!file) {
      return c.json({ error: 'No file uploaded' }, 400);
    }
    
    // Convert File to our expected format for uploadFileToSupabase
    const fileData = await file.arrayBuffer();
    const fileObj = {
      name: file.name,
      type: file.type,
      data: new Uint8Array(fileData)
    };
    
    // Upload file to Supabase using the helper function
    const uploadResult = await uploadFileToSupabase(
      fileObj, 
      'exam_cards', 
      registration_number
    );
    
    // Update or insert exam card record in database
    await pool.query(
      'INSERT INTO exam_cards (student_id, file_url) VALUES ($1, $2) ON CONFLICT (student_id) DO UPDATE SET file_url = EXCLUDED.file_url',
      [student_id, uploadResult.publicUrl]
    );
    
    return c.json({ 
      message: 'Exam card uploaded successfully.', 
      registration_number,
      url: uploadResult.publicUrl 
    });
  } catch (error) {
    console.error('Error uploading exam card:', error);
    return c.json({ error: 'Failed to upload exam card', details: error.message }, 500);
  }
});

// Keep the old endpoint for backward compatibility
app.post('/students/:id/upload-exam-card', async (c) => {
  try {
    const studentId = c.req.param('id');
    
    // Get registration number from student ID
    const studentResult = await pool.query(
      'SELECT registration_number FROM students WHERE id = $1',
      [studentId]
    );
    
    if (studentResult.rows.length === 0) {
      return c.json({ error: 'Student not found' }, 404);
    }
    
    const registration_number = studentResult.rows[0].registration_number;
    
    // Parse multipart form data
    const formData = await c.req.formData();
    console.log('Form data received:', [...formData.keys()]);
    
    // Extract file
    const file = formData.get('file');
    if (!file) {
      return c.json({ error: 'No file uploaded' }, 400);
    }
    
    // Convert File to our expected format for uploadFileToSupabase
    const fileData = await file.arrayBuffer();
    const fileObj = {
      name: file.name,
      type: file.type,
      data: new Uint8Array(fileData)
    };
    
    // Upload file to Supabase using the helper function
    const uploadResult = await uploadFileToSupabase(
      fileObj, 
      'exam_cards', 
      registration_number
    );
    
    // Update or insert exam card record in database
    await pool.query(
      'INSERT INTO exam_cards (student_id, file_url) VALUES ($1, $2) ON CONFLICT (student_id) DO UPDATE SET file_url = EXCLUDED.file_url',
      [studentId, uploadResult.publicUrl]
    );
    
    return c.json({ 
      message: 'Exam card uploaded successfully.', 
      url: uploadResult.publicUrl,
      note: 'This endpoint is deprecated, please use /students/registration/:regNumber/upload-exam-card instead'
    });
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
    console.log('Uploading fee statement for student:', studentId);
    
    // Check if the request is multipart/form-data
    const contentType = c.req.header('content-type') || '';
    console.log('Request content-type:', contentType);
    
    if (!contentType.includes('multipart/form-data')) {
      return c.json({
        error: 'Invalid content type',
        details: 'This endpoint requires multipart/form-data'
      }, 400);
    }
    
    // Parse multipart form data with error handling
    let formData;
    try {
      formData = await c.req.parseBody();
      console.log('Form data parsed successfully, keys:', Object.keys(formData));
    } catch (parseError) {
      console.error('Error parsing form data:', parseError);
      return c.json({
        error: 'Failed to process form data',
        details: 'The server could not process the uploaded form data. Make sure you are using multipart/form-data correctly.',
        originalError: parseError.message
      }, 400);
    }
    
    // Validate form data
    if (!formData || typeof formData !== 'object') {
      return c.json({
        error: 'Invalid form data',
        details: 'Failed to parse multipart form data properly'
      }, 400);
    }
    
    // Extract and validate file
    const file = formData['file'] || formData.file;
    if (!file) {
      return c.json({ 
        error: 'No file uploaded',
        details: 'A file is required for fee statement upload'
      }, 400);
    }
    
    // Validate file properties
    if (!file.name || !file.type) {
      return c.json({
        error: 'Invalid file',
        details: 'Uploaded file is missing required properties (name or type)'
      }, 400);
    }
    
    console.log('Fee statement file details:', {
      name: file.name,
      type: file.type,
      size: file.size || (file.data ? file.data.length : 'unknown')
    });
    
    // Upload file to Supabase
    const uploadResult = await uploadFileToSupabase(
      file, 
      'fees_statements', 
      `student_${studentId}`
    );
    
    // Insert into database
    await pool.query(
      'INSERT INTO finance (student_id, statement, statement_url) VALUES ($1, $2, $3)', 
      [studentId, formData.statement || 'Fee Statement', uploadResult.publicUrl]
    );
    
    return c.json({ 
      message: 'Fee statement uploaded successfully', 
      url: uploadResult.publicUrl,
      file_name: file.name
    });
  } catch (error) {
    console.error('Error uploading fee statement:', error);
    return c.json({ 
      error: 'Failed to upload fee statement', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, 500);
  }
});

// Upload fee receipt (admin)
app.post('/students/:id/upload-fee-receipt', async (c) => {
  try {
    const studentId = c.req.param('id');
    console.log('Uploading fee receipt for student:', studentId);
    
    // Check if the request is multipart/form-data
    const contentType = c.req.header('content-type') || '';
    console.log('Request content-type:', contentType);
    
    if (!contentType.includes('multipart/form-data')) {
      return c.json({
        error: 'Invalid content type',
        details: 'This endpoint requires multipart/form-data'
      }, 400);
    }
    
    // Parse multipart form data with error handling
    let formData;
    try {
      formData = await c.req.parseBody();
      console.log('Form data parsed successfully, keys:', Object.keys(formData));
    } catch (parseError) {
      console.error('Error parsing form data:', parseError);
      return c.json({
        error: 'Failed to process form data',
        details: 'The server could not process the uploaded form data. Make sure you are using multipart/form-data correctly.',
        originalError: parseError.message
      }, 400);
    }
    
    // Validate form data
    if (!formData || typeof formData !== 'object') {
      return c.json({
        error: 'Invalid form data',
        details: 'Failed to parse multipart form data properly'
      }, 400);
    }
    
    // Extract and validate file
    const file = formData['file'] || formData.file;
    if (!file) {
      return c.json({ 
        error: 'No file uploaded',
        details: 'A file is required for fee receipt upload'
      }, 400);
    }
    
    // Validate file properties
    if (!file.name || !file.type) {
      return c.json({
        error: 'Invalid file',
        details: 'Uploaded file is missing required properties (name or type)'
      }, 400);
    }
    
    console.log('Fee receipt file details:', {
      name: file.name,
      type: file.type,
      size: file.size || (file.data ? file.data.length : 'unknown')
    });
    
    // Upload file to Supabase
    const uploadResult = await uploadFileToSupabase(
      file, 
      'fees_statements', 
      `student_${studentId}`
    );
    
    // Insert into database
    await pool.query(
      'INSERT INTO finance (student_id, receipt_url) VALUES ($1, $2)', 
      [studentId, uploadResult.publicUrl]
    );
    
    return c.json({ 
      message: 'Fee receipt uploaded successfully', 
      url: uploadResult.publicUrl,
      file_name: file.name
    });
  } catch (error) {
    console.error('Error uploading fee receipt:', error);
    return c.json({ 
      error: 'Failed to upload fee receipt', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, 500);
  }
});

// Upload exam results with file (admin)
app.post('/students/:id/upload-results', async (c) => {
  try {
    const studentId = c.req.param('id');
    console.log('Uploading results for student:', studentId);
    
    // Check if the request is multipart/form-data
    const contentType = c.req.header('content-type') || '';
    console.log('Request content-type:', contentType);
    
    if (!contentType.includes('multipart/form-data')) {
      return c.json({
        error: 'Invalid content type',
        details: 'This endpoint requires multipart/form-data'
      }, 400);
    }
    
    // Parse multipart form data with error handling
    let formData;
    try {
      formData = await c.req.parseBody();
      console.log('Form data parsed successfully, keys:', Object.keys(formData));
    } catch (parseError) {
      console.error('Error parsing form data:', parseError);
      return c.json({
        error: 'Failed to process form data',
        details: 'The server could not process the uploaded form data. Make sure you are using multipart/form-data correctly.',
        originalError: parseError.message
      }, 400);
    }
    
    // Validate form data
    if (!formData || typeof formData !== 'object') {
      return c.json({
        error: 'Invalid form data',
        details: 'Failed to parse multipart form data properly'
      }, 400);
    }
    
    // Extract and validate required fields
    const semester = formData.semester;
    if (!semester) {
      return c.json({ 
        error: 'Missing required field', 
        details: 'Semester is required' 
      }, 400);
    }
    
    // Parse result data
    let result_data = {};
    try {
      result_data = formData.result_data ? JSON.parse(formData.result_data) : {};
    } catch (jsonError) {
      console.error('Error parsing result_data JSON:', jsonError);
      return c.json({
        error: 'Invalid result data',
        details: 'Result data must be valid JSON format'
      }, 400);
    }
    
    console.log('Results metadata:', { semester, result_data_keys: Object.keys(result_data) });
    
    // Handle file upload (optional)
    const file = formData.file;
    if (file) {
      // Validate file properties
      if (!file.name || !file.type) {
        return c.json({
          error: 'Invalid file',
          details: 'Uploaded file is missing required properties (name or type)'
        }, 400);
      }
      
      console.log('Results file details:', {
        name: file.name,
        type: file.type,
        size: file.size || (file.data ? file.data.length : 'unknown')
      });
      
      try {
        const uploadResult = await uploadFileToSupabase(
          file, 
          'Result-slips', 
          `student_${studentId}_${semester}`
        );
        
        // Add file URL to result data
        result_data.file_url = uploadResult.publicUrl;
        console.log('File uploaded successfully:', uploadResult.publicUrl);
      } catch (uploadError) {
        console.error('Error uploading results file:', uploadError);
        return c.json({
          error: 'Failed to upload file',
          details: uploadError.message
        }, 500);
      }
    }
    
    // Store result data in database
    const { rows } = await pool.query(
      'INSERT INTO results (student_id, semester, result_data) VALUES ($1, $2, $3) RETURNING *',
      [studentId, semester, result_data]
    );
    
    return c.json({
      message: 'Student results uploaded successfully',
      result: rows[0],
      file_uploaded: !!file,
      file_url: result_data.file_url || null
    });
  } catch (error) {
    console.error('Error uploading student results:', error);
    return c.json({ 
      error: 'Failed to upload student results', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, 500);
  }
});

// Add a new endpoint for timetable uploads
app.post('/upload-timetable', async (c) => {
  try {
    console.log('Timetable upload request received');
    
    // Check if the request is multipart/form-data
    const contentType = c.req.header('content-type') || '';
    console.log('Request content-type:', contentType);
    
    if (!contentType.includes('multipart/form-data')) {
      return c.json({
        error: 'Invalid content type',
        details: 'This endpoint requires multipart/form-data'
      }, 400);
    }
    
    // Parse multipart form data with error handling
    let formData;
    try {
      formData = await c.req.parseBody();
      console.log('Form data parsed successfully, keys:', Object.keys(formData));
    } catch (parseError) {
      console.error('Error parsing form data:', parseError);
      return c.json({
        error: 'Failed to process form data',
        details: 'The server could not process the uploaded form data. Make sure you are using multipart/form-data correctly.',
        originalError: parseError.message
      }, 400);
    }
    
    // Validate form data
    if (!formData || typeof formData !== 'object') {
      return c.json({
        error: 'Invalid form data',
        details: 'Failed to parse multipart form data properly'
      }, 400);
    }
    
    // Extract and validate file
    const file = formData['file'] || formData.file;
    if (!file) {
      return c.json({ 
        error: 'No file uploaded',
        details: 'A file is required for timetable upload'
      }, 400);
    }
    
    // Validate file properties
    if (!file.name || !file.type) {
      return c.json({
        error: 'Invalid file',
        details: 'Uploaded file is missing required properties (name or type)'
      }, 400);
    }
    
    // Extract and validate required fields
    const course = formData['course'] || formData.course;
    const semester = formData['semester'] || formData.semester;
    
    if (!course || !semester) {
      return c.json({ 
        error: 'Missing required fields', 
        details: 'Course and semester are required',
        received: {
          course: course || 'missing',
          semester: semester || 'missing'
        }
      }, 400);
    }
    
    // Validate field formats
    if (typeof course !== 'string' || course.trim().length === 0) {
      return c.json({
        error: 'Invalid course',
        details: 'Course must be a non-empty string'
      }, 400);
    }
    
    if (typeof semester !== 'string' || semester.trim().length === 0) {
      return c.json({
        error: 'Invalid semester',
        details: 'Semester must be a non-empty string'
      }, 400);
    }
    
    console.log('Timetable upload details:', {
      course: course.trim(),
      semester: semester.trim(),
      file_name: file.name,
      file_type: file.type,
      file_size: file.size || (file.data ? file.data.length : 'unknown')
    });
    
    // Upload file to Supabase
    const uploadResult = await uploadFileToSupabase(
      file, 
      'Timetables', 
      `${course.trim()}_${semester.trim()}`
    );
    
    // Store timetable reference in database
    const { rows } = await pool.query(
      `INSERT INTO timetables 
       (course, semester, timetable_url, timetable_data) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [
        course.trim(), 
        semester.trim(), 
        uploadResult.publicUrl, 
        JSON.stringify({ file_path: uploadResult.filePath, file_name: file.name })
      ]
    );
    
    return c.json({ 
      message: 'Timetable uploaded successfully', 
      timetable: rows[0],
      file_name: file.name,
      url: uploadResult.publicUrl
    });
  } catch (error) {
    console.error('Error uploading timetable:', error);
    return c.json({ 
      error: 'Failed to upload timetable', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, 500);
  }
});

// Add an endpoint to get timetable by course and semester
app.get('/timetable/:course/:semester', async (c) => {
  try {
    const course = c.req.param('course');
    const semester = c.req.param('semester');
    
    const { rows } = await pool.query(
      'SELECT * FROM timetables WHERE course = $1 AND semester = $2 ORDER BY created_at DESC LIMIT 1',
      [course, semester]
    );
    
    if (rows.length === 0) {
      return c.json({ 
        error: 'Timetable not found', 
        details: 'No timetable found for this course and semester' 
      }, 404);
    }
    
    return c.json(rows[0]);
  } catch (error) {
    console.error('Error fetching timetable:', error);
    return c.json({ 
      error: 'Failed to fetch timetable', 
      details: error.message 
    }, 500);
  }
});

// Export the app object for use in Vercel API handler
export { app };

// Start the server when running directly
// In Node.js, import.meta.url is available but import.meta.main is not
// So we check if the file being run is the current file
const isDirectRun = process.argv[1] === import.meta.url || process.argv[1] === 'index.js' || process.argv[1].endsWith('/index.js') || process.argv[1].endsWith('\\index.js');

// Always start the server unless explicitly importing it elsewhere
const PORT = process.env.PORT || 3000;
console.log(`Server starting on port ${PORT}`);
serve({
  fetch: app.fetch.bind(app),
  port: PORT
});