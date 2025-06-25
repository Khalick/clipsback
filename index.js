import { Hono } from 'hono';
import { pool, sql } from './db.js';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { serveStatic } from '@hono/node-server/serve-static';
import { validator } from 'hono/validator';
import fs from 'fs/promises';
import path from 'path';

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
  
  console.log(`Uploading ${fileName} to ${folder} folder in student-documents bucket...`);
  
  const { data, error } = await supabase.storage
    .from('student-documents')
    .upload(uploadPath, fileData, { contentType: fileType });
    
  if (error) {
    console.error(`Error uploading to ${folder}:`, error);
    throw error;
  }

  // Get the public URL
  const { data: urlData } = supabase.storage
    .from('student-documents')
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

// Create new student
app.post('/students', async (c) => {
  try {
    console.log('Creating new student');
    let studentData = {};
    let photoUrl = null;
    
    // Check content type to determine how to parse the request
    const contentType = c.req.header('content-type') || '';
    
    if (contentType.includes('multipart/form-data')) {
      // Handle multipart form data (with file upload)
      console.log('Processing multipart form data for student creation');
        try {
        const formData = await c.req.formData();
        
        // Extract student data from form first (without using it yet)
        const tempStudentData = {
          name: formData.get('name')?.toString(),
          registration_number: formData.get('registration_number')?.toString(),
          course: formData.get('course')?.toString(),
          level_of_study: formData.get('level_of_study')?.toString(),
          national_id: formData.get('national_id')?.toString() || null,
          birth_certificate: formData.get('birth_certificate')?.toString() || null,
          date_of_birth: formData.get('date_of_birth')?.toString() || null,
          password: formData.get('password')?.toString() || null,
          email: formData.get('email')?.toString() || null
        };
        
        // Validate required fields early
        if (!tempStudentData.name || !tempStudentData.registration_number || !tempStudentData.course || !tempStudentData.level_of_study) {
          return c.json({ 
            error: 'Missing required fields', 
            details: 'Name, registration number, course, and level of study are required' 
          }, 400);
        }
        
        // Handle photo upload FIRST if present
        const photoFile = formData.get('photo');
        if (photoFile && photoFile instanceof File && photoFile.size > 0) {
          console.log('Processing photo upload:', photoFile.name, photoFile.size);
          
          // Validate photo file type
          const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
          if (!allowedTypes.includes(photoFile.type)) {
            return c.json({ 
              error: 'Invalid photo type', 
              details: 'Photo must be JPEG, JPG, PNG, or GIF format' 
            }, 400);
          }
          
          // Validate photo file size (max 5MB)
          if (photoFile.size > 5 * 1024 * 1024) {
            return c.json({ 
              error: 'Photo file too large', 
              details: 'Photo must be less than 5MB' 
            }, 400);
          }
          
          try {
            console.log('Uploading student photo to Supabase...');
            const uploadResult = await uploadFileToSupabase(
              photoFile,
              'photos',
              `student_${tempStudentData.registration_number}`
            );
            photoUrl = uploadResult.publicUrl;
            console.log('Photo uploaded successfully:', photoUrl);
          } catch (uploadError) {
            console.error('Photo upload failed:', uploadError.message);
            return c.json({ 
              error: 'Photo upload failed', 
              details: uploadError.message 
            }, 500);
          }
        }
        
        // Now assign the validated student data
        studentData = tempStudentData;
        
      } catch (formError) {
        console.error('Error parsing form data:', formError);
        return c.json({ 
          error: 'Invalid form data', 
          details: formError.message 
        }, 400);
      }
    } else {
      // Handle JSON request
      console.log('Processing JSON data for student creation');
      
      try {
        studentData = await c.req.json();
      } catch (jsonError) {
        console.error('Error parsing JSON:', jsonError);
        return c.json({ 
          error: 'Invalid JSON data', 
          details: jsonError.message 
        }, 400);
      }
    }
    
    // Validate required fields
    if (!studentData.name || !studentData.registration_number || !studentData.course || !studentData.level_of_study) {
      return c.json({ 
        error: 'Missing required fields', 
        details: 'Name, registration number, course, and level of study are required' 
      }, 400);
    }
      console.log('Student data received:', {
      ...studentData,
      password: studentData.password ? '[PROVIDED]' : '[NOT PROVIDED]'
    });
    
    // Hash password if provided
    let hashedPassword = null;
    if (studentData.password) {
      try {
        hashedPassword = await bcrypt.hash(studentData.password, 10);
      } catch (hashError) {
        console.error('Error hashing password:', hashError);
        return c.json({ 
          error: 'Password processing failed', 
          details: hashError.message 
        }, 500);
      }
    }
    
    // Log all values that will be inserted to identify undefined values
    const insertValues = [
      studentData.name,
      studentData.registration_number,
      studentData.course,
      studentData.level_of_study,
      studentData.national_id,
      studentData.birth_certificate,
      studentData.date_of_birth,
      hashedPassword,
      photoUrl,
      studentData.email,
      'active'
    ];
    
    console.log('Insert values:', insertValues.map((val, idx) => `$${idx + 1}: ${val === undefined ? 'UNDEFINED' : val === null ? 'NULL' : typeof val === 'string' ? `"${val}"` : val}`));
    
    // Check if student with this registration number already exists
    try {
      const { rows: existingStudents } = await pool.query(
        'SELECT id FROM students WHERE registration_number = $1',
        [studentData.registration_number]
      );
      
      if (existingStudents.length > 0) {
        return c.json({ 
          error: 'Student already exists', 
          details: `A student with registration number '${studentData.registration_number}' already exists` 
        }, 409);
      }
    } catch (checkError) {
      console.error('Error checking for existing student:', checkError);
      return c.json({ 
        error: 'Database error during validation', 
        details: checkError.message 
      }, 500);
    }    // Insert student into database
    try {
      const { rows } = await pool.query(`
        INSERT INTO students (
          name, 
          registration_number, 
          course, 
          level_of_study, 
          national_id, 
          birth_certificate, 
          date_of_birth, 
          password, 
          photo_url,
          email,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, name, registration_number, course, level_of_study, national_id, birth_certificate, date_of_birth, photo_url, email, status
      `, insertValues);
      
      const newStudent = rows[0];
      console.log('Student created successfully:', newStudent.id);
      
      return c.json({
        message: 'Student created successfully',
        student: newStudent
      }, 201);
      
    } catch (insertError) {
      console.error('Error inserting student:', insertError);
      
      // Handle specific database errors
      if (insertError.code === '23505') { // Unique constraint violation
        return c.json({ 
          error: 'Student already exists', 
          details: 'A student with this registration number already exists' 
        }, 409);
      }
      
      return c.json({ 
        error: 'Failed to create student', 
        details: insertError.message 
      }, 500);
    }
    
  } catch (error) {
    console.error('Error creating student:', error);
    return c.json({ 
      error: 'Internal server error', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, 500);
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

// Deregister a student by registration number (with slash support)
app.post('/students/registration/:course/:number/:year/deregister', async (c) => {
  try {
    const course = c.req.param('course');
    const number = c.req.param('number');
    const year = c.req.param('year');
    const registration_number = `${course}/${number}/${year}`;
    console.log('Deregistering student with registration number:', registration_number);
    
    // Also keep the original route for backward compatibility
    return await deregisterStudentByRegNumber(c, registration_number);
  } catch (error) {
    console.error('Error deregistering student:', error);
    return c.json({ 
      error: 'Failed to deregister student', 
      details: error.message 
    }, 500);
  }
});

// Original deregister route for registration numbers without slashes
app.post('/students/registration/:regNumber/deregister', async (c) => {
  try {
    const registration_number = c.req.param('regNumber');
    console.log('Deregistering student with registration number:', registration_number);
    
    return await deregisterStudentByRegNumber(c, registration_number);
  } catch (error) {
    console.error('Error deregistering student:', error);
    return c.json({ 
      error: 'Failed to deregister student', 
      details: error.message 
    }, 500);
  }
});

// Helper function to deregister student by registration number
async function deregisterStudentByRegNumber(c, registration_number) {    
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
}

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
    }, 500);  }
});

// Get registered units for a student
app.get('/students/:id/registered-units', async (c) => {
  try {
    const studentId = c.req.param('id');
    console.log('Fetching registered units for student:', studentId);
    
    const { rows } = await pool.query(
      'SELECT * FROM registered_units WHERE student_id = $1 ORDER BY unit_code',
      [studentId]
    );
    
    return c.json(rows);
  } catch (error) {
    console.error('Error fetching registered units:', error);
    return c.json({ 
      error: 'Failed to fetch registered units', 
      details: error.message 
    }, 500);
  }
});

// Get fees information for a student
app.get('/students/:id/fees', async (c) => {
  try {
    const studentId = c.req.param('id');
    console.log('Fetching fees for student:', studentId);
    
    const { rows } = await pool.query(
      'SELECT fee_balance, total_paid, semester_fee FROM fees WHERE student_id = $1',
      [studentId]
    );
    
    if (rows.length === 0) {
      // Return default values if no fee record exists
      return c.json({
        fee_balance: 0,
        total_paid: 0,
        semester_fee: 0,
        session_progress: 0
      });
    }
    
    const fees = rows[0];
    // Calculate session progress as percentage
    const sessionProgress = fees.semester_fee > 0 
      ? Math.round((fees.total_paid / fees.semester_fee) * 100) 
      : 0;
    
    return c.json({
      ...fees,
      session_progress: sessionProgress
    });
  } catch (error) {
    console.error('Error fetching fees:', error);
    return c.json({ 
      error: 'Failed to fetch fees', 
      details: error.message 
    }, 500);
  }
});

// =============================================================================
// NEW UNIFIED DOCUMENT UPLOAD SYSTEM
// =============================================================================

// Serve uploaded files from local storage
app.use('/uploads/*', serveStatic({ root: './uploads' }));

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

// Generic function to handle file upload with fallback to local storage
async function handleFileUpload(
  registrationNumber,
  file,
  documentType
) {
  try {
    console.log(`Handling file upload for ${registrationNumber}, document type: ${documentType}`)
    
    // Generate unique filename
    const fileExtension = file.name.split('.').pop()
    const fileName = `${documentType}/${registrationNumber}_${Date.now()}.${fileExtension}`
    
    let fileUrl = null
    let storageMethod = 'unknown'

    // Check if Supabase is properly configured
    const isSupabaseConfigured = process.env.SUPABASE_URL && 
                                 process.env.SUPABASE_SERVICE_ROLE_KEY && 
                                 process.env.SUPABASE_URL !== 'your_supabase_url'

    if (isSupabaseConfigured) {
      try {
        console.log('Attempting Supabase upload...')
        
        // Convert file to buffer
        const fileBuffer = await file.arrayBuffer()
        const uint8Array = new Uint8Array(fileBuffer)

        // First, check if the bucket exists and is accessible
        const { data: buckets, error: listError } = await supabase.storage.listBuckets()
        
        if (listError) {
          console.warn('Error listing Supabase buckets:', listError.message)
          throw new Error(`Bucket access error: ${listError.message}`)
        }

        const studentDocsBucket = buckets?.find(bucket => bucket.name === 'student-documents')
        if (!studentDocsBucket) {
          console.warn('student-documents bucket not found. Available buckets:', buckets?.map(b => b.name))
          
          // Try to create the bucket
          const { error: createError } = await supabase.storage.createBucket('student-documents', {
            public: true,
            fileSizeLimit: 10485760 // 10MB
          })
          
          if (createError) {
            console.warn('Failed to create bucket:', createError.message)
            throw new Error(`Bucket creation failed: ${createError.message}`)
          }
          
          console.log('Successfully created student-documents bucket')
        }

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

        fileUrl = urlData.publicUrl
        storageMethod = 'supabase'
        console.log('Successfully uploaded to Supabase')

      } catch (supabaseError) {
        console.warn('Supabase upload failed, falling back to local storage:', supabaseError.message)
        fileUrl = await saveFileLocally(file, fileName)
        storageMethod = 'local'
      }
    } else {
      console.log('Supabase not configured, using local storage')
      fileUrl = await saveFileLocally(file, fileName)
      storageMethod = 'local'
    }

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
      // If database insert fails, clean up the uploaded file
      if (storageMethod === 'supabase') {
        try {
          await supabase.storage
            .from('student-documents')
            .remove([fileName])
        } catch (cleanupError) {
          console.warn('Failed to cleanup Supabase file after DB error:', cleanupError.message)
        }
      } else if (storageMethod === 'local') {
        try {
          const localPath = path.join(process.cwd(), 'uploads', fileName)
          await fs.unlink(localPath)
        } catch (cleanupError) {
          console.warn('Failed to cleanup local file after DB error:', cleanupError.message)
        }
      }
      
      throw new Error('Database insertion failed')
    }

    console.log(`File uploaded successfully using ${storageMethod} storage`)

    return {
      success: true,
      data: {
        id: rows[0].id,
        registrationNumber,
        documentType,
        fileUrl,
        fileName: file.name,
        fileSize: file.size,
        uploadedAt: rows[0].uploaded_at,
        storageMethod
      }
    }
  } catch (error) {
    console.error('File upload error:', error)
    throw error
  }
}

// Helper function to save files locally
async function saveFileLocally(file, fileName) {
  try {
    // Create uploads directory structure
    const uploadsDir = path.join(process.cwd(), 'uploads')
    const documentDir = path.dirname(path.join(uploadsDir, fileName))
    
    // Ensure directory exists
    await fs.mkdir(documentDir, { recursive: true })
    
    // Convert file to buffer and save
    const fileBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(fileBuffer)
    const filePath = path.join(uploadsDir, fileName)
    
    await fs.writeFile(filePath, uint8Array)
    
    // Return a URL that can be served by the application
    return `/uploads/${fileName}`
  } catch (error) {
    console.error('Local file save error:', error)
    throw new Error(`Local storage failed: ${error.message}`)
  }
}

// Exam Card upload route with flexible FormData handling
app.post('/exam-card', async (c) => {
  try {
    console.log('Exam card upload request received')
    
    // Get content type for debugging
    const contentType = c.req.header('content-type') || ''
    console.log('Content-Type:', contentType)
    
    // Try to parse FormData with error handling
    let formData
    try {
      formData = await c.req.formData()
      console.log('FormData parsed successfully')
      console.log('Form fields:', [...formData.keys()])
    } catch (formError) {
      console.error('FormData parsing error:', formError)
      return c.json({
        error: 'Malformed FormData request',
        details: 'Failed to parse body as FormData. Please ensure you are sending valid multipart/form-data.',
        contentType: contentType
      }, 400)
    }
    
    // Extract fields with flexible field name matching
    let registrationNumber = formData.get('registrationNumber') || 
                            formData.get('registration_number') || 
                            formData.get('regNumber') ||
                            formData.get('reg_number')
    
    let file = formData.get('file') || 
               formData.get('examCard') || 
               formData.get('exam_card') ||
               formData.get('document')
    
    console.log('Extracted fields:', {
      registrationNumber: registrationNumber ? 'present' : 'missing',
      file: file ? `present (${file.name}, ${file.size} bytes)` : 'missing',
      allFields: [...formData.keys()]
    })
    
    // Validate required fields
    if (!registrationNumber || typeof registrationNumber !== 'string') {
      return c.json({
        error: 'Registration number is required',
        details: 'Please provide registrationNumber field in FormData',
        receivedFields: [...formData.keys()]
      }, 400)
    }
    
    if (!file || !(file instanceof File)) {
      return c.json({
        error: 'File is required',
        details: 'Please provide a valid file in FormData',
        receivedFields: [...formData.keys()],
        fileType: file ? typeof file : 'undefined'
      }, 400)
    }
    
    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return c.json({
        error: 'File size must be less than 10MB',
        actualSize: `${(file.size / 1024 / 1024).toFixed(2)}MB`
      }, 400)
    }
    
    // Validate file size (min 1KB)
    if (file.size < 1024) {
      return c.json({
        error: 'File appears to be empty or too small',
        actualSize: `${file.size} bytes`
      }, 400)
    }
    
    const result = await handleFileUpload(registrationNumber.trim(), file, 'exam-card')
    
    return c.json({
      message: 'Exam card uploaded successfully',
      ...result
    }, 201)
  } catch (error) {
    console.error('Exam card upload error:', error)
    return c.json({
      error: 'Failed to upload exam card',
      details: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, 500)
  }
})

// Fees Structure upload route with flexible FormData handling
app.post('/fees-structure', async (c) => {
  try {
    console.log('Fees structure upload request received')
    
    let formData
    try {
      formData = await c.req.formData()
      console.log('FormData parsed successfully for fees-structure')
    } catch (formError) {
      console.error('FormData parsing error:', formError)
      return c.json({
        error: 'Malformed FormData request',
        details: 'Failed to parse body as FormData'
      }, 400)
    }
    
    let registrationNumber = formData.get('registrationNumber') || 
                            formData.get('registration_number') || 
                            formData.get('regNumber')
    
    let file = formData.get('file') || 
               formData.get('feesStructure') || 
               formData.get('fees_structure') ||
               formData.get('document')
    
    if (!registrationNumber || typeof registrationNumber !== 'string') {
      return c.json({
        error: 'Registration number is required',
        receivedFields: [...formData.keys()]
      }, 400)
    }
    
    if (!file || !(file instanceof File) || file.size === 0) {
      return c.json({
        error: 'Valid file is required',
        receivedFields: [...formData.keys()]
      }, 400)
    }
    
    if (file.size > 10 * 1024 * 1024) {
      return c.json({ error: 'File size must be less than 10MB' }, 400)
    }
    
    const result = await handleFileUpload(registrationNumber.trim(), file, 'fees-structure')
    
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

// Fees Statement upload route with flexible FormData handling
app.post('/fees-statement', async (c) => {
  try {
    console.log('Fees statement upload request received')
    
    let formData
    try {
      formData = await c.req.formData()
    } catch (formError) {
      return c.json({
        error: 'Malformed FormData request',
        details: 'Failed to parse body as FormData'
      }, 400)
    }
    
    let registrationNumber = formData.get('registrationNumber') || 
                            formData.get('registration_number') || 
                            formData.get('regNumber')
    
    let file = formData.get('file') || 
               formData.get('feesStatement') || 
               formData.get('fees_statement') ||
               formData.get('document')
    
    if (!registrationNumber || typeof registrationNumber !== 'string') {
      return c.json({
        error: 'Registration number is required',
        receivedFields: [...formData.keys()]
      }, 400)
    }
    
    if (!file || !(file instanceof File) || file.size === 0) {
      return c.json({
        error: 'Valid file is required',
        receivedFields: [...formData.keys()]
      }, 400)
    }
    
    if (file.size > 10 * 1024 * 1024) {
      return c.json({ error: 'File size must be less than 10MB' }, 400)
    }
    
    const result = await handleFileUpload(registrationNumber.trim(), file, 'fees-statement')
    
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

// Fees Receipt upload route with flexible FormData handling
app.post('/fees-receipt', async (c) => {
  try {
    console.log('Fees receipt upload request received')
    
    let formData
    try {
      formData = await c.req.formData()
    } catch (formError) {
      return c.json({
        error: 'Malformed FormData request',
        details: 'Failed to parse body as FormData'
      }, 400)
    }
    
    let registrationNumber = formData.get('registrationNumber') || 
                            formData.get('registration_number') || 
                            formData.get('regNumber')
    
    let file = formData.get('file') || 
               formData.get('feesReceipt') || 
               formData.get('fees_receipt') ||
               formData.get('document')
    
    if (!registrationNumber || typeof registrationNumber !== 'string') {
      return c.json({
        error: 'Registration number is required',
        receivedFields: [...formData.keys()]
      }, 400)
    }
    
    if (!file || !(file instanceof File) || file.size === 0) {
      return c.json({
        error: 'Valid file is required',
        receivedFields: [...formData.keys()]
      }, 400)
    }
    
    if (file.size > 10 * 1024 * 1024) {
      return c.json({ error: 'File size must be less than 10MB' }, 400)
    }
    
    const result = await handleFileUpload(registrationNumber.trim(), file, 'fees-receipt')
    
    return c.json({
      message: 'Fees receipt uploaded successfully',
      ...result
    }, 201)
  } catch (error) {
    console.error('Fees receipt upload error:', error)
    return c.json({
      error: 'Failed to upload fees receipt',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// Results upload route with flexible FormData handling
app.post('/results', async (c) => {
  try {
    console.log('Results upload request received')
    
    let formData
    try {
      formData = await c.req.formData()
    } catch (formError) {
      return c.json({
        error: 'Malformed FormData request',
        details: 'Failed to parse body as FormData'
      }, 400)
    }
    
    let registrationNumber = formData.get('registrationNumber') || 
                            formData.get('registration_number') || 
                            formData.get('regNumber')
    
    let file = formData.get('file') || 
               formData.get('results') || 
               formData.get('result') ||
               formData.get('document')
    
    if (!registrationNumber || typeof registrationNumber !== 'string') {
      return c.json({
        error: 'Registration number is required',
        receivedFields: [...formData.keys()]
      }, 400)
    }
    
    if (!file || !(file instanceof File) || file.size === 0) {
      return c.json({
        error: 'Valid file is required',
        receivedFields: [...formData.keys()]
      }, 400)
    }
    
    if (file.size > 10 * 1024 * 1024) {
      return c.json({ error: 'File size must be less than 10MB' }, 400)
    }
    
    const result = await handleFileUpload(registrationNumber.trim(), file, 'results')
    
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

// Timetable upload route with flexible FormData handling
app.post('/timetable', async (c) => {
  try {
    console.log('Timetable upload request received')
    
    // Get content type for debugging
    const contentType = c.req.header('content-type') || ''
    console.log('Content-Type:', contentType)
    console.log('Request headers:', Object.fromEntries(c.req.raw.headers.entries()))
    
    let formData
    try {
      formData = await c.req.formData()
      console.log('FormData parsed successfully for timetable')
      console.log('Form fields:', [...formData.keys()])
    } catch (formError) {
      console.error('FormData parsing error details:', formError)
      
      // Try to get the raw body for debugging
      try {
        const rawBody = await c.req.text()
        console.log('Raw body preview (first 500 chars):', rawBody.substring(0, 500))
        console.log('Raw body type:', typeof rawBody)
        console.log('Raw body length:', rawBody.length)
        
        // Check if the body looks like valid multipart data
        const hasFormDataMarkers = rawBody.includes('Content-Disposition') && rawBody.includes('form-data')
        console.log('Body appears to be FormData:', hasFormDataMarkers)
        
        // If it looks like FormData but failed to parse, might be a boundary issue
        if (hasFormDataMarkers && !contentType.includes('boundary=')) {
          console.log('WARNING: Body appears to be FormData but Content-Type missing boundary')
        }
      } catch (bodyError) {
        console.error('Could not read raw body:', bodyError)
      }
      
      return c.json({
        error: 'Malformed FormData request',
        details: 'Failed to parse body as FormData',
        contentType: contentType,
        formError: formError.message,
        help: 'Ensure you are sending a valid multipart/form-data request with proper boundary',
        debug: {
          hasContentType: !!contentType,
          isMultipart: contentType.includes('multipart/form-data'),
          hasBoundary: contentType.includes('boundary='),
          userAgent: c.req.header('user-agent') || 'Not provided',
          contentLength: c.req.header('content-length') || 'Not provided'
        }
      }, 400)
    }
    
    let registrationNumber = formData.get('registrationNumber') || 
                            formData.get('registration_number') || 
                            formData.get('regNumber')
    
    let file = formData.get('file') || 
               formData.get('timetable') || 
               formData.get('schedule') ||
               formData.get('document')
    
    console.log('Extracted fields:', {
      registrationNumber: registrationNumber ? 'present' : 'missing',
      file: file ? `present (${file.name}, ${file.size} bytes)` : 'missing',
      allFields: [...formData.keys()]
    })
    
    if (!registrationNumber || typeof registrationNumber !== 'string') {
      return c.json({
        error: 'Registration number is required',
        details: 'Please provide registrationNumber field in FormData',
        receivedFields: [...formData.keys()]
      }, 400)
    }
    
    if (!file || !(file instanceof File) || file.size === 0) {
      return c.json({
        error: 'Valid file is required',
        details: 'Please provide a valid file in FormData',
        receivedFields: [...formData.keys()],
        fileType: file ? typeof file : 'undefined'
      }, 400)
    }
    
    if (file.size > 10 * 1024 * 1024) {
      return c.json({
        error: 'File size must be less than 10MB',
        actualSize: `${(file.size / 1024 / 1024).toFixed(2)}MB`
      }, 400)
    }
    
    // Validate file size (min 1KB)
    if (file.size < 1024) {
      return c.json({
        error: 'File appears to be empty or too small',
        actualSize: `${file.size} bytes`
      }, 400)
    }
    
    const result = await handleFileUpload(registrationNumber.trim(), file, 'timetable')
    
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

// Register unit for student endpoint
app.post('/units/register', async (c) => {
  try {
    const body = await c.req.json();
    console.log('Unit registration request:', body);
    
    const { student_reg, unit_name, unit_code, status = 'active' } = body;
    
    if (!student_reg || !unit_name || !unit_code) {
      return c.json({ 
        error: 'Missing required fields', 
        details: 'Student registration number, unit name, and unit code are required' 
      }, 400);
    }

    // First, find the student by registration number
    const { rows: studentRows } = await pool.query(
      'SELECT id FROM students WHERE registration_number = $1',
      [student_reg]
    );
    
    if (studentRows.length === 0) {
      return c.json({ 
        error: 'Student not found', 
        details: 'No student found with the provided registration number' 
      }, 404);
    }
    
    const student_id = studentRows[0].id;

    // Check if the unit exists in the units table, if not create it
    let { rows: unitRows } = await pool.query(
      'SELECT id FROM units WHERE unit_code = $1',
      [unit_code]
    );
    
    if (unitRows.length === 0) {
      // Create the unit if it doesn't exist
      await pool.query(
        'INSERT INTO units (unit_name, unit_code) VALUES ($1, $2)',
        [unit_name, unit_code]
      );
    }

    // Check if the student is already registered for this unit in registered_units table
    const { rows: existingRows } = await pool.query(
      'SELECT id FROM registered_units WHERE student_id = $1 AND unit_code = $2',
      [student_id, unit_code]
    );
    
    if (existingRows.length > 0) {
      return c.json({ 
        error: 'Unit already registered', 
        details: 'Student is already registered for this unit' 
      }, 409);
    }

    // Register the unit for the student
    const { rows } = await pool.query(
      'INSERT INTO registered_units (student_id, unit_name, unit_code, status) VALUES ($1, $2, $3, $4) RETURNING *',
      [student_id, unit_name, unit_code, status]
    );
    
    if (rows.length === 0) {
      throw new Error('Failed to register unit');
    }
    
    return c.json({ 
      message: 'Unit registered successfully for student',
      registered_unit: rows[0],
      student_registration: student_reg
    });
  } catch (error) {
    console.error('Error registering unit:', error);
    return c.json({ 
      error: 'Failed to register unit', 
      details: error.message 
    }, 500);
  }
});

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

// Get documents for a student by student ID
app.get('/students/:id/documents', async (c) => {
  try {
    const studentId = c.req.param('id')
    console.log('Fetching documents for student ID:', studentId)
    
    // First get the student's registration number
    const { rows: studentRows } = await pool.query(
      'SELECT registration_number FROM students WHERE id = $1',
      [studentId]
    )
    
    if (studentRows.length === 0) {
      return c.json({ 
        error: 'Student not found',
        details: 'No student found with the provided ID'
      }, 404)
    }
    
    const registrationNumber = studentRows[0].registration_number
    
    // Get all documents for this student
    const { rows } = await pool.query(
      `SELECT * FROM student_documents 
       WHERE registration_number = $1 
       ORDER BY uploaded_at DESC`,
      [registrationNumber]
    )

    return c.json({
      success: true,
      data: rows,
      count: rows.length,
      student_id: studentId,
      registration_number: registrationNumber
    })
  } catch (error) {
    console.error('Get student documents error:', error)
    return c.json({
      error: 'Failed to retrieve student documents',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// Get documents for a student by student ID
app.get('/students/:id/documents', async (c) => {
  try {
    const studentId = c.req.param('id')
    console.log('Fetching documents for student ID:', studentId)
    
    // First get the student's registration number
    const { rows: studentRows } = await pool.query(
      'SELECT registration_number FROM students WHERE id = $1',
      [studentId]
    )
    
    if (studentRows.length === 0) {
      return c.json({ 
        error: 'Student not found',
        details: 'No student found with the provided ID'
      }, 404)
    }
    
    const registrationNumber = studentRows[0].registration_number
    
    // Get all documents for this student
    const { rows } = await pool.query(
      `SELECT * FROM student_documents 
       WHERE registration_number = $1 
       ORDER BY uploaded_at DESC`,
      [registrationNumber]
    )

    return c.json({
      success: true,
      data: rows,
      count: rows.length,
      student_id: studentId,
      registration_number: registrationNumber
    })
  } catch (error) {
    console.error('Get student documents error:', error)
    return c.json({
      error: 'Failed to retrieve student documents',
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

// Admin login endpoint
app.post('/auth/admin-login', async (c) => {
  try {
    const body = await c.req.json();
    console.log('Admin login attempt:', { username: body.username });
    
    const { username, password } = body;
    
    if (!username || !password) {
      return c.json({ error: 'Username and password required' }, 400);
    }

    const { rows } = await pool.query('SELECT * FROM admins WHERE username = $1', [username]);
    if (rows.length === 0) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }
    
    const admin = rows[0];
    
    // Compare password with hash
    const isAuthenticated = await bcrypt.compare(password, admin.password_hash);
    
    if (!isAuthenticated) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }
    
    const token = jwt.sign(
      { username: admin.username, admin_id: admin.id, type: 'admin' }, 
      process.env.SECRET_KEY, 
      { expiresIn: '8h' }
    );
      return c.json({ 
      token, 
      adminId: admin.id,
      username: admin.username
    });
  } catch (error) {
    console.error('Admin login error:', error);
    return c.json({ 
      error: 'Server error during admin login', 
      details: error.message
    }, 500);
  }
});

// Admin token verification endpoint
app.get('/admin/verify-token', async (c) => {
  try {
    // Get token from Authorization header
    const authHeader = c.req.header('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'No token provided' }, 401);
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Verify the JWT token
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    
    // Check if it's an admin token
    if (decoded.type !== 'admin') {
      return c.json({ error: 'Invalid token type' }, 401);
    }
    
    // Verify admin still exists in database
    const { rows } = await pool.query('SELECT id, username FROM admins WHERE id = $1', [decoded.admin_id]);
    
    if (rows.length === 0) {
      return c.json({ error: 'Admin not found' }, 401);
    }
    
    return c.json({ 
      valid: true,
      admin: {
        id: rows[0].id,
        username: rows[0].username
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return c.json({ error: 'Invalid token' }, 401);
    } else if (error.name === 'TokenExpiredError') {
      return c.json({ error: 'Token expired' }, 401);
    }
    
    return c.json({ 
      error: 'Token verification failed', 
      details: error.message 
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
    console.log('Fetching exam card for student:', studentId);
    
    // First, verify the student exists
    const { rows: studentRows } = await pool.query(
      'SELECT id, registration_number, name FROM students WHERE id = $1',
      [studentId]
    );
    
    if (studentRows.length === 0) {
      console.log('Student not found:', studentId);
      return c.json({ error: 'Student not found' }, 404);
    }
    
    // Check fee status (optional - don't block if no fee record)
    const { rows: feeRows } = await pool.query(
      'SELECT fee_balance FROM fees WHERE student_id = $1',
      [studentId]
    );
    
    let feeStatus = 'no_record';
    if (feeRows.length > 0) {
      const feeBalance = parseFloat(feeRows[0].fee_balance) || 0;
      if (feeBalance > 0) {
        console.log('Student has outstanding fee balance:', feeBalance);
        return c.json({ 
          error: 'Please complete your fee payment to download your exam card.',
          fee_balance: feeBalance
        }, 403);
      }
      feeStatus = 'paid';
    }
    
    // Try to get exam card file URL from new unified system first
    const { rows: docRows } = await pool.query(
      `SELECT file_url, file_name, uploaded_at FROM student_documents 
       WHERE registration_number = $1 AND document_type = 'exam-card' 
       ORDER BY uploaded_at DESC LIMIT 1`,
      [studentRows[0].registration_number]
    );
    
    if (docRows.length > 0) {
      console.log('Found exam card in unified document system');
      return c.json({ 
        file_url: docRows[0].
    
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
        
        console.log(`Uploading binary file to exam_cards folder in student-documents bucket...`);
        
        const { data, error } = await supabase.storage
          .from('student-documents')
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
          .from('student-documents')
          .createSignedUrl(uploadPath, expiresIn);
          
        let file_url;
        if (urlError) {
          console.error('Error creating signed URL:', urlError);
          // Fallback to public URL if signed URL fails
          const { data: publicUrlData } = supabase.storage
            .from('student-documents')
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
        
      } catch (supabaseError) {
        console.error('Supabase upload error:', supabaseError);
        return c.json({
          error: 'Failed to upload binary file for exam card',
          details: supabaseError.message
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
            
            console.log(`Uploading ${file.name} to exam_cards folder in student-documents bucket...`);
            
            const { data, error } = await supabase.storage
              .from('student-documents')
              .upload(uploadPath, fileData, { 
                contentType: file.type,
                cacheControl: '31536000' // 1 year cache
              });
              
            if (error) {
              console.error
              throw error;
            }

            // Get the public URL with custom expiry (1 year from now)
            const expiresIn = 31536000; // 1 year in seconds
            const { data: urlData, error: urlError } = await supabase.storage
              .from('student-documents')
              .createSignedUrl(uploadPath, expiresIn);
              
            if (urlError) {
              console.error('Error creating signed URL:', urlError);
              // Fallback to public URL if signed URL fails
              const { data: publicUrlData } = supabase.storage
                .from('student-documents')
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
        
        console.log(`Uploading binary file to exam_cards folder in student-documents bucket...`);
        
        const { data, error } = await supabase.storage
          .from('student-documents')
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
          .from('student-documents')
          .createSignedUrl(uploadPath, expiresIn);
          
        let file_url;
        if (urlError) {
          console.error('Error creating signed URL:', urlError);
          // Fallback to public URL if signed URL fails
          const { data: publicUrlData } = supabase.storage
            .from('student-documents')
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

// Upload fee statement (admin) - Updated to use modern pattern
app.post('/students/:id/upload-fee-statement', fileUploadValidator, async (c) => {
  try {
    const studentId = c.req.param('id');
    const { registrationNumber, file } = c.req.valid('form');
    
    console.log('Uploading fee statement for student:', studentId);
    
    // Get student info to verify
    const { rows: studentRows } = await pool.query(
      'SELECT registration_number FROM students WHERE id = $1',
      [studentId]
    );
    
    if (studentRows.length === 0) {
      return c.json({ error: 'Student not found' }, 404);
    }
    
    // Upload file using the generic handler
    const result = await handleFileUpload(registrationNumber, file, 'fees-statement');
    
    // Also insert into the legacy finance table for compatibility
    await pool.query(
      'INSERT INTO finance (student_id, statement, statement_url) VALUES ($1, $2, $3)', 
      [studentId, 'Fee Statement', result.data.fileUrl]
    );
    
    return c.json({ 
      message: 'Fee statement uploaded successfully', 
      url: result.data.fileUrl,
      file_name: file.name,
      ...result
    });
  } catch (error) {
    console.error('Error uploading fee statement:', error);
    return c.json({ 
      error: 'Failed to upload fee statement', 
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Upload fee receipt (admin) - Updated to use modern pattern
app.post('/students/:id/upload-fee-receipt', fileUploadValidator, async (c) => {
  try {
    const studentId = c.req.param('id');
    const { registrationNumber, file } = c.req.valid('form');
    
    console.log('Uploading fee receipt for student:', studentId);
    
    // Get student info to verify
    const { rows: studentRows } = await pool.query(
      'SELECT registration_number FROM students WHERE id = $1',
      [studentId]
    );
    
    if (studentRows.length === 0) {
      return c.json({ error: 'Student not found' }, 404);
    }
    
    // Upload file using the generic handler
    const result = await handleFileUpload(registrationNumber, file, 'fees-receipt');
    
    // Also insert into the legacy finance table for compatibility
    await pool.query(
      'INSERT INTO finance (student_id, receipt_url) VALUES ($1, $2)', 
      [studentId, result.data.fileUrl]
    );
    
    return c.json({ 
      message: 'Fee receipt uploaded successfully', 
      url: result.data.fileUrl,
      file_name: file.name,
      ...result
    });
  } catch (error) {
    console.error('Error uploading fee receipt:', error);
    return c.json({ 
      error: 'Failed to upload fee receipt', 
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Upload exam results with file (admin) - Updated to use modern pattern
app.post('/students/:id/upload-results', fileUploadValidator, async (c) => {
  try {
    const studentId = c.req.param('id');
    const { registrationNumber, file } = c.req.valid('form');
    
    console.log('Uploading results for student:', studentId);
    
    // Get student info to verify
    const { rows: studentRows } = await pool.query(
      'SELECT registration_number FROM students WHERE id = $1',
      [studentId]
    );
    
    if (studentRows.length === 0) {
      return c.json({ error: 'Student not found' }, 404);
    }
    
    // Upload file using the generic handler
    const result = await handleFileUpload(registrationNumber, file, 'results');
    
    // For compatibility, also store in the legacy results table
    // We'll use a default semester since it's not provided in the modern format
    const defaultSemester = 'Current';
    const result_data = {
      file_url: result.data.fileUrl,
      file_name: file.name,
      file_size: file.size,
      uploaded_at: new Date().toISOString()
    };
    
    const { rows } = await pool.query(
      'INSERT INTO results (student_id, semester, result_data) VALUES ($1, $2, $3) RETURNING *',
      [studentId, defaultSemester, result_data]
    );
    
    return c.json({
      message: 'Student results uploaded successfully',
      result: rows[0],
      file_uploaded: true,
      file_url: result.data.fileUrl,
      ...result
    });
  } catch (error) {
    console.error('Error uploading student results:', error);
    return c.json({ 
      error: 'Failed to upload student results', 
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Timetable upload endpoint - Updated to use modern pattern  
app.post('/upload-timetable', fileUploadValidator, async (c) => {
  try {
    const { registrationNumber, file } = c.req.valid('form');
    
    console.log('Timetable upload request received');
    
    // For timetables, we'll use the registration number as both identifier and course
    // In a real application, you might want to extract course from the registration number
    // or require it as a separate field
    const course = 'General'; // Default course, could be extracted from registration number
    const semester = 'Current'; // Default semester, could be a form field
    
    // Upload file using the generic handler
    const result = await handleFileUpload(registrationNumber, file, 'timetable');
    
    // Store timetable reference in database for compatibility
    const { rows } = await pool.query(
      `INSERT INTO timetables 
       (course, semester, timetable_url, timetable_data) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [
        course, 
        semester, 
        result.data.fileUrl, 
        JSON.stringify({ 
          file_path: result.data.fileUrl, 
          file_name: file.name,
          registration_number: registrationNumber 
        })
      ]
    );
    
    return c.json({ 
      message: 'Timetable uploaded successfully', 
      timetable: rows[0],
      file_name: file.name,
      url: result.data.fileUrl,
      ...result
    });
  } catch (error) {
    console.error('Error uploading timetable:', error);
    return c.json({ 
      error: 'Failed to upload timetable', 
      details: error instanceof Error ? error.message : 'Unknown error'
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

// Debug route for FormData testing
app.get('/debug-formdata', (c) => {
  return c.redirect('/debug-formdata.html');
});

// =============================================================================
// UNIT ALLOCATION SYSTEM - Admin allocates units, students register them
// =============================================================================

// Get all units (for admin to see available units to allocate)
app.get('/units', async (c) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM units ORDER BY unit_code'
    );
    
    return c.json(rows);
  } catch (error) {
    console.error('Error fetching units:', error);
    return c.json({ 
      error: 'Failed to fetch units', 
      details: error.message 
    }, 500);
  }
});

// Create a new unit (admin only)
app.post('/units', async (c) => {
  try {
    const body = await c.req.json();
    const { unit_name, unit_code } = body;
    
    if (!unit_name || !unit_code) {
      return c.json({ 
        error: 'Missing required fields', 
        details: 'Unit name and unit code are required' 
      }, 400);
    }

    // Check if unit with same code already exists
    const { rows: existingRows } = await pool.query(
      'SELECT id FROM units WHERE unit_code = $1',
      [unit_code]
    );
    
    if (existingRows.length > 0) {
      return c.json({ 
        error: 'Unit already exists', 
        details: 'A unit with this code already exists' 
      }, 409);
    }

    const { rows } = await pool.query(
      'INSERT INTO units (unit_name, unit_code) VALUES ($1, $2) RETURNING *',
      [unit_name, unit_code]
    );
    
    return c.json({ 
      message: 'Unit created successfully',
      unit: rows[0]
    });
  } catch (error) {
    console.error('Error creating unit:', error);
    return c.json({ 
      error: 'Failed to create unit', 
      details: error.message 
    }, 500);
  }
});

// Allocate units to a student (admin function)
app.post('/students/:studentId/allocate-units', async (c) => {
  try {
    const { studentId } = c.req.param();
    const body = await c.req.json();
    const { unit_ids, semester = 1, academic_year = '2024/2025', notes } = body;
    
    if (!unit_ids || !Array.isArray(unit_ids) || unit_ids.length === 0) {
      return c.json({ 
        error: 'Missing required fields', 
        details: 'unit_ids array is required and must not be empty' 
      }, 400);
    }

    // Verify student exists
    const { rows: studentRows } = await pool.query(
      'SELECT id, registration_number, name FROM students WHERE id = $1',
      [studentId]
    );
    
    if (studentRows.length === 0) {
      return c.json({ 
        error: 'Student not found', 
        details: 'No student found with the provided ID' 
      }, 404);
    }    const student = studentRows[0];
    
    // Use direct sql transactions instead of pool.connect
    const allocatedUnits = [];
    const errors = [];
    
    try {
      await sql.begin(async (txSql) => {
        for (const unit_id of unit_ids) {
          try {
            // Verify unit exists
            const unitRows = await txSql`
              SELECT id, unit_name, unit_code FROM units WHERE id = ${unit_id}
            `;
            
            if (unitRows.length === 0) {
              errors.push(`Unit with ID ${unit_id} not found`);
              continue;
            }
            
            const unit = unitRows[0];
            
            // Check if already allocated
            const existingRows = await txSql`
              SELECT id FROM allocated_units 
              WHERE student_id = ${studentId} 
              AND unit_id = ${unit_id} 
              AND semester = ${semester} 
              AND academic_year = ${academic_year} 
              AND status != 'cancelled'
            `;
            
            if (existingRows.length > 0) {
              errors.push(`Unit ${unit.unit_code} already allocated for this semester`);
              continue;
            }
            
            // Insert allocation
            const insertedRows = await txSql`
              INSERT INTO allocated_units (student_id, unit_id, semester, academic_year, status, notes) 
              VALUES (${studentId}, ${unit_id}, ${semester}, ${academic_year}, 'allocated', ${notes || null}) 
              RETURNING *
            `;
            
            allocatedUnits.push({
              ...insertedRows[0],
              unit_name: unit.unit_name,
              unit_code: unit.unit_code
            });
            
          } catch (unitError) {
            errors.push(`Error allocating unit ${unit_id}: ${unitError.message}`);
          }
        }
      });
    } catch (txError) {
      console.error('Transaction error:', txError);
      throw txError;
    }
    
    return c.json({ 
      message: 'Unit allocation completed',
      student: student,
      allocated_units: allocatedUnits,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        total_requested: unit_ids.length,
        successfully_allocated: allocatedUnits.length,
        errors: errors.length
      }
    });
    
  } catch (error) {
    console.error('Error allocating units:', error);
    return c.json({ 
      error: 'Failed to allocate units', 
      details: error.message 
    }, 500);
  }
});

// Allocate units to a student by registration number (admin function)
app.post('/students/registration/:regNumber/allocate-units', async (c) => {
  try {
    const { regNumber } = c.req.param();
    console.log('Allocating units for registration number:', regNumber);
    
    // Find student by registration number
    const { rows: studentRows } = await pool.query(
      'SELECT id FROM students WHERE registration_number = $1',
      [regNumber]
    );
    
    if (studentRows.length === 0) {
      return c.json({ 
        error: 'Student not found', 
        details: 'No student found with the provided registration number' 
      }, 404);
    }

    const studentId = studentRows[0].id;
    const body = await c.req.json();
    const { unit_ids, semester = 1, academic_year = '2024/2025', notes } = body;
    
    console.log('Allocation request body:', { unit_ids, semester, academic_year, notes });
    
    if (!unit_ids || !Array.isArray(unit_ids) || unit_ids.length === 0) {
      return c.json({ 
        error: 'Missing required fields', 
        details: 'unit_ids array is required and cannot be empty' 
      }, 400);
    }

    // Verify student exists
    const { rows: studentVerifyRows } = await pool.query(
      'SELECT id, registration_number, name FROM students WHERE id = $1',
      [studentId]
    );
    
    if (studentVerifyRows.length === 0) {
      return c.json({ 
        error: 'Student not found', 
        details: 'No student found with the provided ID' 
      }, 404);
    }    const student = studentVerifyRows[0];
    
    // Use direct sql transactions instead of pool.connect
    const allocatedUnits = [];
    const errors = [];
    
    try {
      await sql.begin(async (txSql) => {
        for (const unit_id of unit_ids) {
          try {
            // Verify unit exists
            const unitRows = await txSql`
              SELECT id, unit_name, unit_code FROM units WHERE id = ${unit_id}
            `;
            
            if (unitRows.length === 0) {
              errors.push(`Unit with ID ${unit_id} not found`);
              continue;
            }
            
            const unit = unitRows[0];
            
            // Check if already allocated
            const existingRows = await txSql`
              SELECT id FROM allocated_units 
              WHERE student_id = ${studentId} 
              AND unit_id = ${unit_id} 
              AND semester = ${semester} 
              AND academic_year = ${academic_year} 
              AND status != 'cancelled'
            `;
            
            if (existingRows.length > 0) {
              errors.push(`Unit ${unit.unit_code} already allocated for this semester`);
              continue;
            }
            
            // Insert allocation
            const insertedRows = await txSql`
              INSERT INTO allocated_units (student_id, unit_id, semester, academic_year, status, notes) 
              VALUES (${studentId}, ${unit_id}, ${semester}, ${academic_year}, 'allocated', ${notes}) 
              RETURNING *
            `;
            
            allocatedUnits.push({
              ...insertedRows[0],
              unit_name: unit.unit_name,
              unit_code: unit.unit_code
            });
            
          } catch (unitError) {
            console.error(`Error allocating unit ${unit_id}:`, unitError);
            errors.push(`Failed to allocate unit ${unit_id}: ${unitError.message}`);
          }
        }
      });
    } catch (txError) {      console.error('Transaction error:', txError);
      throw txError;
    }
    
    return c.json({
      message: 'Unit allocation completed',
      student: {
        id: student.id,
        registration_number: student.registration_number,
        name: student.name
      },
      allocated_units: allocatedUnits,
      summary: {
        total_requested: unit_ids.length,
        successfully_allocated: allocatedUnits.length,
        errors: errors.length
      },
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error('Error allocating units:', error);
    return c.json({ 
      error: 'Failed to allocate units', 
      details: error.message 
    }, 500);
  }
});

// Allocate units to a student by registration number with slash support (admin function)
app.post('/students/registration/:course/:number/:year/allocate-units', async (c) => {
  try {
    const { course, number, year } = c.req.param();
    const registration_number = `${course}/${number}/${year}`;
    
    console.log('Allocating units for registration number:', registration_number);
    
    // Find student by registration number
    const { rows: studentRows } = await pool.query(
      'SELECT id FROM students WHERE registration_number = $1',
      [registration_number]
    );
    
    if (studentRows.length === 0) {
      return c.json({ 
        error: 'Student not found', 
        details: 'No student found with the provided registration number' 
      }, 404);
    }
    
    const studentId = studentRows[0].id;
    const body = await c.req.json();
    const { unit_ids, semester = 1, academic_year = '2024/2025', notes } = body;
    
    if (!unit_ids || !Array.isArray(unit_ids) || unit_ids.length === 0) {
      return c.json({ 
        error: 'Missing required fields', 
        details: 'unit_ids array is required and cannot be empty' 
      }, 400);
    }

    // Verify student exists
    const { rows: studentVerifyRows } = await pool.query(
      'SELECT id, registration_number, name FROM students WHERE id = $1',
      [studentId]
    );
    
    if (studentVerifyRows.length === 0) {
      return c.json({ 
        error: 'Student not found', 
        details: 'Student ID not found in database' 
      }, 404);
    }

    const student = studentVerifyRows[0];
      // Begin transaction using postgres package
    let allocatedUnits = [];
    let errors = [];
    
    try {
      await sql.begin(async sql => {
        for (const unit_id of unit_ids) {
          try {
            // Check if unit exists
            const unitRows = await sql`
              SELECT id, unit_name, unit_code FROM units WHERE id = ${unit_id}
            `;
            
            if (unitRows.length === 0) {
              errors.push(`Unit with ID ${unit_id} not found`);
              continue;
            }
            
            const unit = unitRows[0];
            
            // Check if already allocated
            const existingRows = await sql`
              SELECT id FROM allocated_units 
              WHERE student_id = ${studentId} 
                AND unit_id = ${unit_id} 
                AND semester = ${semester} 
                AND academic_year = ${academic_year} 
                AND status != ${'cancelled'}
            `;
            
            if (existingRows.length > 0) {
              errors.push(`Unit ${unit.unit_code} already allocated for this semester`);
              continue;
            }
            
            // Insert allocation
            const insertedRows = await sql`
              INSERT INTO allocated_units (student_id, unit_id, semester, academic_year, status, notes) 
              VALUES (${studentId}, ${unit_id}, ${semester}, ${academic_year}, ${'allocated'}, ${notes || null}) 
              RETURNING *
            `;
            
            allocatedUnits.push({
              ...insertedRows[0],
              unit_name: unit.unit_name,
              unit_code: unit.unit_code
            });
            
          } catch (unitError) {
            console.error(`Error allocating unit ${unit_id}:`, unitError);
            errors.push(`Failed to allocate unit ${unit_id}: ${unitError.message}`);
          }
        }
      });
      
      return c.json({
        message: 'Unit allocation completed',
        student: {
          id: student.id,
          registration_number: student.registration_number,
          name: student.name
        },
        allocated_units: allocatedUnits,
        summary: {
          total_requested: unit_ids.length,
          successfully_allocated: allocatedUnits.length,
          errors: errors.length
        },
        errors: errors.length > 0 ? errors : undefined
      });
      
    } catch (txError) {
      throw txError;
    }
    
  } catch (error) {
    console.error('Error allocating units:', error);
    return c.json({ 
      error: 'Failed to allocate units', 
      details: error.message 
    }, 500);
  }
});

// Get allocated units for a student by registration number (simple format)
app.get('/students/registration/:regNumber/allocated-units', async (c) => {
  try {
    const { regNumber } = c.req.param();
    
    console.log('Getting allocated units for registration number:', regNumber);
    
    // Find student by registration number
    const { rows: studentRows } = await pool.query(
      'SELECT id, name, registration_number FROM students WHERE registration_number = $1',
      [regNumber]
    );
    
    if (studentRows.length === 0) {
      return c.json({ 
        error: 'Student not found', 
        details: 'No student found with the provided registration number' 
      }, 404);
    }
    
    const student = studentRows[0];
    
    // Get allocated units for this student
    const { rows: allocatedUnits } = await pool.query(`
      SELECT 
        au.*,
        u.unit_name,
        u.unit_code
      FROM allocated_units au
      JOIN units u ON au.unit_id = u.id
      WHERE au.student_id = $1
      ORDER BY au.semester, u.unit_code
    `, [student.id]);
    
    return c.json({
      success: true,
      student: {
        id: student.id,
        name: student.name,
        registration_number: student.registration_number
      },
      allocated_units: allocatedUnits,
      count: allocatedUnits.length
    });
    
  } catch (error) {
    console.error('Error getting allocated units:', error);
    return c.json({ 
      error: 'Failed to get allocated units', 
      details: error.message 
    }, 500);
  }
});

// Get allocated units for a student by registration number (with slash support)
app.get('/students/registration/:course/:number/:year/allocated-units', async (c) => {
  try {
    const { course, number, year } = c.req.param();
    const registration_number = `${course}/${number}/${year}`;
    
    console.log('Getting allocated units for registration number:', registration_number);
    
    // Find student by registration number
    const { rows: studentRows } = await pool.query(
      'SELECT id, name, registration_number FROM students WHERE registration_number = $1',
      [registration_number]
    );
    
    if (studentRows.length === 0) {
      return c.json({ 
        error: 'Student not found', 
        details: 'No student found with the provided registration number' 
      }, 404);
    }
    
    const student = studentRows[0];
    
    // Get allocated units for this student
    const { rows: allocatedUnits } = await pool.query(`
      SELECT 
        au.*,
        u.unit_name,
        u.unit_code
      FROM allocated_units au
      JOIN units u ON au.unit_id = u.id
      WHERE au.student_id = $1
      ORDER BY au.semester, u.unit_code
    `, [student.id]);
    
    return c.json({
      success: true,
      student: {
        id: student.id,
        name: student.name,
        registration_number: student.registration_number
      },
      allocated_units: allocatedUnits,
      count: allocatedUnits.length
    });
    
  } catch (error) {
    console.error('Error getting allocated units:', error);
    return c.json({ 
      error: 'Failed to get allocated units', 
      details: error.message    }, 500);
  }
});

// Upload/Update student photo endpoint
app.post('/students/registration/:regNumber/upload-photo', async (c) => {
  try {
    const { regNumber } = c.req.param();
    console.log('Photo upload request for student:', regNumber);
    
    const formData = await c.req.formData();
    const photoFile = formData.get('photo');
    
    if (!photoFile || !(photoFile instanceof File) || photoFile.size === 0) {
      return c.json({ 
        error: 'Missing photo file', 
        details: 'A valid photo file is required' 
      }, 400);
    }
    
    // Validate photo file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (!allowedTypes.includes(photoFile.type)) {
      return c.json({ 
        error: 'Invalid photo type', 
        details: 'Photo must be JPEG, JPG, PNG, or GIF format' 
      }, 400);
    }
    
    // Validate photo file size (max 5MB)
    if (photoFile.size > 5 * 1024 * 1024) {
      return c.json({ 
        error: 'Photo file too large', 
        details: 'Photo must be less than 5MB' 
      }, 400);
    }
    
    // Find student by registration number
    const { rows: studentRows } = await pool.query(
      'SELECT id FROM students WHERE registration_number = $1',
      [regNumber]
    );
    
    if (studentRows.length === 0) {
      return c.json({ 
        error: 'Student not found', 
        details: 'No student found with the provided registration number' 
      }, 404);
    }
    
    try {
      console.log('Uploading student photo to Supabase...');
      const uploadResult = await uploadFileToSupabase(
        photoFile,
        'photos',
        `student_${regNumber}`
      );
      
      // Update student photo URL in database
      const { rows } = await pool.query(
        'UPDATE students SET photo_url = $1 WHERE registration_number = $2 RETURNING id, name, registration_number, photo_url',
        [uploadResult.publicUrl, regNumber]
      );
      
      console.log('Photo uploaded and student updated successfully:', uploadResult.publicUrl);
      
      return c.json({ 
        message: 'Photo uploaded successfully',
        photo_url: uploadResult.publicUrl,
        student: rows[0]
      });
      
    } catch (uploadError) {
      console.error('Photo upload failed:', uploadError.message);
      return c.json({ 
        error: 'Photo upload failed', 
        details: uploadError.message 
      }, 500);
    }
    
  } catch (error) {
    console.error('Error uploading student photo:', error);
    return c.json({ 
      error: 'Failed to upload photo', 
      details: error.message 
    }, 500);
  }
});

// Register allocated unit for student by registration number (student function)
app.post('/students/registration/:regNumber/register-allocated-unit', async (c) => {
  try {
    const { regNumber } = c.req.param();
    const body = await c.req.json();
    const { allocated_unit_id } = body;
    
    if (!allocated_unit_id) {
      return c.json({ 
        error: 'Missing required fields', 
        details: 'allocated_unit_id is required' 
      }, 400);
    }

    // Find student by registration number
    const { rows: studentRows } = await pool.query(
      'SELECT id, registration_number FROM students WHERE registration_number = $1',
      [regNumber]
    );
    
    if (studentRows.length === 0) {
      return c.json({ 
        error: 'Student not found', 
        details: 'No student found with the provided registration number' 
      }, 404);
    }

    const student = studentRows[0];
    
    // Get the allocated unit details and verify it belongs to this student
    const { rows: allocatedRows } = await pool.query(`
      SELECT au.*, u.unit_name, u.unit_code 
      FROM allocated_units au
      JOIN units u ON au.unit_id = u.id
      WHERE au.id = $1 AND au.student_id = $2 AND au.status = 'allocated'
    `, [allocated_unit_id, student.id]);
    
    if (allocatedRows.length === 0) {
      return c.json({ 
        error: 'Allocated unit not found', 
        details: 'No allocated unit found with the provided ID for this student, or unit is already registered/cancelled' 
      }, 404);
    }

    const allocatedUnit = allocatedRows[0];
    
    // Check if student is already registered for this unit in registered_units table
    const { rows: existingRows } = await pool.query(
      'SELECT id FROM registered_units WHERE student_id = $1 AND unit_code = $2',
      [student.id, allocatedUnit.unit_code]
    );
    
    if (existingRows.length > 0) {
      return c.json({ 
        error: 'Unit already registered', 
        details: 'Student is already registered for this unit' 
      }, 409);
    }    // Begin transaction using postgres package
    let registeredUnit = null;
    try {
      await sql.begin(async sql => {
        // Update allocated unit status to 'registered'
        await sql`UPDATE allocated_units SET status = ${'registered'} WHERE id = ${allocated_unit_id}`;
        
        // Insert into registered_units table
        const registeredRows = await sql`
          INSERT INTO registered_units (student_id, unit_name, unit_code, status) 
          VALUES (${student.id}, ${allocatedUnit.unit_name}, ${allocatedUnit.unit_code}, ${'registered'}) 
          RETURNING *
        `;
        
        registeredUnit = registeredRows[0];
      });
      
      return c.json({ 
        message: 'Unit registered successfully',
        registered_unit: registeredUnit,
        student_registration: student.registration_number,
        allocated_unit_updated: true
      });
    } catch (txError) {
      throw txError;
    }
    
  } catch (error) {
    console.error('Error registering allocated unit:', error);
    return c.json({ 
      error: 'Failed to register allocated unit', 
      details: error.message 
    }, 500);
  }
});

// Register allocated unit for student by registration number with slash support (student function)
app.post('/students/registration/:course/:number/:year/register-allocated-unit', async (c) => {
  try {
    const { course, number, year } = c.req.param();
    const registration_number = `${course}/${number}/${year}`;
    
    // Forward to the main registration endpoint
    c.req.param = () => ({ regNumber: registration_number });
    return app.fetch(c.req.raw.clone().url.replace(`/registration/${course}/${number}/${year}/`, `/registration/${registration_number}/`), {
      method: c.req.method,
      headers: c.req.raw.headers,
      body: c.req.raw.body
    }).then(res => res.json()).then(data => c.json(data));
    
  } catch (error) {
    console.error('Error in registration-based unit registration:', error);
    return c.json({ 
      error: 'Failed to register allocated unit', 
      details: error.message 
    }, 500);
  }
});

// Start the server
const port = process.env.PORT || 3000;

console.log(`Starting server on port ${port}...`);

serve({
  fetch: app.fetch,
  port: port,
});

console.log(`Server running on http://localhost:${port}`);

export { app };
