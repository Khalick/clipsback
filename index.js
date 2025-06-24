import { Hono } from 'hono';
import { pool } from './db.js';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { serveStatic } from '@hono/node-server/serve-static';
import { validator } from 'hono/validator';

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
    'X-Requested-With',
    'X-Registration-Number',
    'X-Filename',
    'X-Name',
    'X-Course',
    'X-Level-Of-Study',
    'X-Email'
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
    isArrayBuffer: file instanceof ArrayBuffer,
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
  } else if (file instanceof ArrayBuffer) {
    // Direct ArrayBuffer (binary data)
    fileData = file;
    fileName = 'uploaded_file';
    fileType = 'application/octet-stream';
    console.log('Using ArrayBuffer method');
  } else if (file.data instanceof ArrayBuffer) {
    // Object with ArrayBuffer data
    fileData = file.data;
    fileName = file.name || 'uploaded_file';
    fileType = file.type || 'application/octet-stream';
    console.log('Using ArrayBuffer data property method');
  } else if (file.data) {
    // Custom object with data property (Uint8Array or Buffer)
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
      isArrayBuffer: file instanceof ArrayBuffer,
      keys: typeof file === 'object' ? Object.keys(file) : 'not an object'
    });
    throw new Error('Invalid file format provided - file must be a File instance, ArrayBuffer, have data property, or have arrayBuffer method');
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

// =============================================================================
// NEW UNIFIED DOCUMENT UPLOAD SYSTEM
// =============================================================================

// Validation middleware for file upload
const fileUploadValidator = validator('form', (value, c) => {
  const registrationNumber = value['registrationNumber']
  const file = value['file']

  if (!registrationNumber || typeof registrationNumber !== 'string') {
    return c.json({ error: 'Registration number is required' }, 400)
  }

  if (!file || !(file instanceof File)) {
    return c.json({ error: 'File is required' }, 400)
  }

  // Validate file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    return c.json({ error: 'File size must be less than 10MB' }, 400)
  }

  return {
    registrationNumber: registrationNumber.trim(),
    file: file
  }
})

// Generic function to handle file upload
async function handleFileUpload(
  registrationNumber,
  file,
  documentType
) {
  try {
    // Generate unique filename
    const fileExtension = file.name.split('.').pop()
    const fileName = `${documentType}/${registrationNumber}_${Date.now()}.${fileExtension}`

    // Convert file to buffer
    const fileBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(fileBuffer)

    // Upload to Supabase storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('student-documents')
      .upload(fileName, uint8Array, {
        contentType: file.type,
        upsert: false
      })

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`)
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('student-documents')
      .getPublicUrl(fileName)

    const fileUrl = urlData.publicUrl

    // Insert record into database
    const { rows } = await pool.query(
      `INSERT INTO student_documents (
        registration_number, document_type, file_url, 
        file_name, file_size, uploaded_at
      ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        registrationNumber, 
        documentType, 
        fileUrl,
        file.name, 
        file.size, 
        new Date().toISOString()
      ]
    )

    if (rows.length === 0) {
      // If database insert fails, delete the uploaded file
      await supabase.storage
        .from('student-documents')
        .remove([fileName])
      
      throw new Error('Database insertion failed')
    }

    return {
      success: true,
      data: {
        id: rows[0].id,
        registrationNumber,
        documentType,
        fileUrl,
        fileName: file.name,
        fileSize: file.size,
        uploadedAt: rows[0].uploaded_at
      }
    }
  } catch (error) {
    throw error
  }
}

// Exam Card upload route
app.post('/exam-card', fileUploadValidator, async (c) => {
  try {
    const { registrationNumber, file } = c.req.valid('form')
    
    const result = await handleFileUpload(registrationNumber, file, 'exam-card')
    
    return c.json({
      message: 'Exam card uploaded successfully',
      ...result
    }, 201)
  } catch (error) {
    console.error('Exam card upload error:', error)
    return c.json({
      error: 'Failed to upload exam card',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// Fees Structure upload route
app.post('/fees-structure', fileUploadValidator, async (c) => {
  try {
    const { registrationNumber, file } = c.req.valid('form')
    
    const result = await handleFileUpload(registrationNumber, file, 'fees-structure')
    
    return c.json({
      message: 'Fees structure uploaded successfully',
      ...result
    }, 201)
  } catch (error) {
    console.error('Fees structure upload error:', error)
    return c.json({
      error: 'Failed to upload fees structure',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// Fees Statement upload route
app.post('/fees-statement', fileUploadValidator, async (c) => {
  try {
    const { registrationNumber, file } = c.req.valid('form')
    
    const result = await handleFileUpload(registrationNumber, file, 'fees-statement')
    
    return c.json({
      message: 'Fees statement uploaded successfully',
      ...result
    }, 201)
  } catch (error) {
    console.error('Fees statement upload error:', error)
    return c.json({
      error: 'Failed to upload fees statement',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// Results upload route
app.post('/results', fileUploadValidator, async (c) => {
  try {
    const { registrationNumber, file } = c.req.valid('form')
    
    const result = await handleFileUpload(registrationNumber, file, 'results')
    
    return c.json({
      message: 'Results uploaded successfully',
      ...result
    }, 201)
  } catch (error) {
    console.error('Results upload error:', error)
    return c.json({
      error: 'Failed to upload results',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// Timetable upload route
app.post('/timetable', fileUploadValidator, async (c) => {
  try {
    const { registrationNumber, file } = c.req.valid('form')
    
    const result = await handleFileUpload(registrationNumber, file, 'timetable')
    
    return c.json({
      message: 'Timetable uploaded successfully',
      ...result
    }, 201)
  } catch (error) {
    console.error('Timetable upload error:', error)
    return c.json({
      error: 'Failed to upload timetable',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// Health check route
app.get('/health', (c) => {
  return c.json({ status: 'OK', message: 'File upload service is running' })
})

// Get documents for a student
app.get('/documents/:registrationNumber', async (c) => {
  try {
    const registrationNumber = c.req.param('registrationNumber')
    
    const { rows } = await pool.query(
      `SELECT * FROM student_documents 
       WHERE registration_number = $1 
       ORDER BY uploaded_at DESC`,
      [registrationNumber]
    )

    return c.json({
      success: true,
      data: rows,
      count: rows.length
    })
  } catch (error) {
    console.error('Get documents error:', error)
    return c.json({
      error: 'Failed to retrieve documents',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// =============================================================================
// END NEW UNIFIED DOCUMENT UPLOAD SYSTEM
// =============================================================================

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
    
    // Check content type to determine handling method
    const contentType = c.req.header('content-type') || '';
    console.log('Request content-type:', contentType);
    
    let registration_number;
    let file_url;
    
    // Handle binary file upload (application/octet-stream or specific file types)
    if (contentType.includes('application/octet-stream') || 
        contentType.includes('image/') || 
        contentType.includes('application/pdf') ||
        contentType.includes('application/msword') ||
        contentType.includes('application/vnd.openxmlformats')) {
      
      try {
        console.log('Processing binary file upload for exam card');
        
        // Get registration number and filename from query parameters or headers
        const registration_number = c.req.query('registration_number') || c.req.header('x-registration-number');
        const fileName = c.req.query('filename') || c.req.header('x-filename') || 'exam_card';
        const fileType = contentType;
        
        if (!registration_number) {
          return c.json({
            error: 'Missing registration number',
            details: 'Registration number must be provided via query parameter (?registration_number=) or x-registration-number header'
          }, 400);
        }
        
        // Get the binary data from request body
        const binaryData = await c.req.arrayBuffer();
        
        if (!binaryData || binaryData.byteLength === 0) {
          return c.json({
            error: 'Missing file data',
            details: 'Binary file data is required'
          }, 400);
        }
        
        console.log('Binary file details:', {
          registration_number,
          fileName,
          fileType,
          size: binaryData.byteLength
        });
        
        // Upload to Supabase with custom expiry
        const uploadPath = `exam_cards/${registration_number}_${Date.now()}_${fileName}`;
        
        console.log(`Uploading binary file to exam_cards folder in clipstech bucket...`);
        
        const { data, error } = await supabase.storage
          .from('clipstech')
          .upload(uploadPath, binaryData, { 
            contentType: fileType,
            cacheControl: '31536000' // 1 year cache
          });
          
        if (error) {
          console.error(`Error uploading binary file to exam_cards:`, error);
          throw error;
        }

        // Get the public URL with custom expiry (1 year from now)
        const expiresIn = 31536000; // 1 year in seconds
        const { data: urlData, error: urlError } = await supabase.storage
          .from('clipstech')
          .createSignedUrl(uploadPath, expiresIn);
          
        let file_url;
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
        
        console.log('Binary file uploaded successfully:', file_url);
        
        // Return file URL for further processing
        return c.json({
          message: 'Binary file uploaded successfully',
          file_url: file_url,
          registration_number: registration_number,
          upload_path: uploadPath,
          expires_in_seconds: expiresIn,
          file_size: binaryData.byteLength,
          note: 'Use the file_url and registration_number to save the exam card record'
        });
        
      } catch (uploadError) {
        console.error('Error uploading binary file for exam card:', uploadError);
        return c.json({
          error: 'Failed to upload binary file for exam card',
          details: uploadError.message
        }, 500);
      }
    } 
    // Handle multipart/form-data (legacy support)
    else if (contentType.includes('multipart/form-data')) {
      try {
        console.log('Processing multipart form data for file upload (legacy mode)');
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
            // Convert File to binary data
            const fileData = await file.arrayBuffer();
            
            // Upload to Supabase with custom expiry (e.g., 1 year = 31536000 seconds)
            const uploadPath = `exam_cards/${registration_number}_${Date.now()}_${file.name}`;
            
            console.log(`Uploading ${file.name} to exam_cards folder in clipstech bucket...`);
            
            const { data, error } = await supabase.storage
              .from('clipstech')
              .upload(uploadPath, fileData, { 
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
              message: 'File uploaded successfully (legacy mode)',
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
        
        // Insert exam card record using registration_number directly
        const { rows } = await pool.query(
          `INSERT INTO exam_cards (student_id, file_url) 
           SELECT s.id, $1 FROM students s 
           WHERE s.registration_number = $2 
           RETURNING *`,
          [file_url, registration_number.trim()]
        );
        
        if (rows.length === 0) {
          return c.json({ 
            error: 'Student not found', 
            details: 'No student found with the provided registration number' 
          }, 404);
        }
        
        console.log('Inserting exam card in database:', { registration_number, student_id: rows[0].student_id, file_url });
        
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

// Handle POST requests to /exam-cards/{registration_number}
app.post('/exam-cards/:regNumber', async (c) => {
  try {
    const registration_number = c.req.param('regNumber');
    console.log('POST /exam-cards/:regNumber request received for:', registration_number);
    
    // Check content type to determine handling method
    const contentType = c.req.header('content-type') || '';
    console.log('Request content-type:', contentType);
    
    // Handle binary file upload
    if (contentType.includes('application/octet-stream') || 
        contentType.includes('image/') || 
        contentType.includes('application/pdf') ||
        contentType.includes('application/msword') ||
        contentType.includes('application/vnd.openxmlformats')) {
      
      try {
        console.log('Processing binary file upload for exam card');
        
        // Get registration number and filename from query parameters or headers
        const registration_number = c.req.query('registration_number') || c.req.header('x-registration-number');
        const fileName = c.req.query('filename') || c.req.header('x-filename') || 'exam_card';
        const fileType = contentType;
        
        if (!registration_number) {
          return c.json({
            error: 'Missing registration number',
            details: 'Registration number must be provided via query parameter (?registration_number=) or x-registration-number header'
          }, 400);
        }
        
        // Get the binary data from request body
        const binaryData = await c.req.arrayBuffer();
        
        if (!binaryData || binaryData.byteLength === 0) {
          return c.json({
            error: 'Missing file data',
            details: 'Binary file data is required'
          }, 400);
        }
        
        console.log('Binary file details:', {
          registration_number,
          fileName,
          fileType,
          size: binaryData.byteLength
        });
        
        // Upload to Supabase with custom expiry
        const uploadPath = `exam_cards/${registration_number}_${Date.now()}_${fileName}`;
        
        console.log(`Uploading binary file to exam_cards folder in clipstech bucket...`);
        
        const { data, error } = await supabase.storage
          .from('clipstech')
          .upload(uploadPath, binaryData, { 
            contentType: fileType,
            cacheControl: '31536000' // 1 year cache
          });
          
        if (error) {
          console.error(`Error uploading binary file to exam_cards:`, error);
          throw error;
        }

        // Get the public URL with custom expiry (1 year from now)
        const expiresIn = 31536000; // 1 year in seconds
        const { data: urlData, error: urlError } = await supabase.storage
          .from('clipstech')
          .createSignedUrl(uploadPath, expiresIn);
          
        let file_url;
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
        
        console.log('Binary file uploaded successfully:', file_url);
        
        // Insert or update exam card record in database
        // First check if an exam card already exists for this student
        const existingCard = await pool.query(
          'SELECT id FROM exam_cards WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1',
          [studentId]
        );
        
        if (existingCard.rows.length > 0) {
          // Update the existing exam card
          await pool.query(
            'UPDATE exam_cards SET file_url = $1, created_at = now() WHERE student_id = $2 AND id = $3',
            [file_url, studentId, existingCard.rows[0].id]
          );
        } else {
          // Insert a new exam card
          await pool.query(
            'INSERT INTO exam_cards (student_id, file_url) VALUES ($1, $2)',
            [studentId, file_url]
          );
        }
        
        return c.json({ 
          message: 'Binary exam card uploaded successfully.', 
          registration_number,
          url: file_url,
          file_size: binaryData.byteLength
        });
      } catch (uploadError) {
        console.error('Error uploading binary file for exam card:', uploadError);
        return c.json({
          error: 'Failed to upload binary file for exam card',
          details: uploadError.message
        }, 500);
      }
    }
    // Handle multipart/form-data (legacy support)
    else if (contentType.includes('multipart/form-data')) {
      try {
        console.log('Processing multipart form data for registration:', registration_number);
        const formData = await c.req.formData();
        console.log('Form data parsed:', [...formData.keys()]);
        
        // Extract file
        const file = formData.get('file');
        if (!file) {
          return c.json({ error: 'No file uploaded' }, 400);
        }
        
        // Convert File to binary data
        const fileData = await file.arrayBuffer();
        
        // Upload file to Supabase using the helper function
        const uploadResult = await uploadFileToSupabase(
          fileData, 
          'exam_cards', 
          registration_number
        );
        
        // Update or insert exam card record in database
        // First check if an exam card already exists for this student
        const existingCard = await pool.query(
          'SELECT id FROM exam_cards WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1',
          [studentId]
        );
        
        if (existingCard.rows.length > 0) {
          // Update the existing exam card
          await pool.query(
            'UPDATE exam_cards SET file_url = $1, created_at = now() WHERE student_id = $2 AND id = $3',
            [uploadResult.publicUrl, studentId, existingCard.rows[0].id]
          );
        } else {
          // Insert a new exam card
          await pool.query(
            'INSERT INTO exam_cards (student_id, file_url) VALUES ($1, $2)',
            [studentId, uploadResult.publicUrl]
          );
        }
        
        return c.json({ 
          message: 'Exam card uploaded successfully (legacy mode).', 
          registration_number,
          url: uploadResult.publicUrl 
        });
      } catch (uploadError) {
        console.error('Error during multipart file upload:', uploadError);
        return c.json({
          error: 'File upload failed',
          details: uploadError.message
        }, 500);
      }
    } else {
      return c.json({
        error: 'Invalid content type',
        details: 'This endpoint requires either binary data or multipart/form-data'
      }, 400);
    }
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

// Test route for new unified upload page
app.get('/test-unified-upload', (c) => {
  return c.redirect('/test/test-unified-upload.html');
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