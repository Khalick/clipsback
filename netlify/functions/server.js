// This is a self-contained serverless function that doesn't rely on the main app
// to avoid module resolution issues in the Netlify environment
import { Hono } from 'hono';
import serverless from 'serverless-http';
import dotenv from 'dotenv';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pool, sql } from '../../db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { initializeTables } from '../../utils/initDb.js';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

// Set env var to let the app know we're running in Netlify
process.env.NETLIFY = "true";

// Log the function startup
console.log("Initializing Netlify serverless function");

// Create a new app instance specifically for the serverless function
const app = new Hono();

// Apply CORS middleware
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

// Import all routes from main app (copied here for self-containment)
// Include only the routes you need for your API

// Root route to show API status
app.get('/', async (c) => {
  return c.json({
    status: 'running',
    environment: 'netlify',
    timestamp: new Date().toISOString(),
    api: 'Clips College Student Portal Backend API'
  });
});

// Get all students
app.get('/students', async (c) => {
  const { rows } = await pool.query('SELECT * FROM students');
  return c.json(rows);
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

// Admin login endpoint
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

// Alternative admin login endpoint
app.post('/auth/admin-login', async (c) => {
  return app.fetch(new Request('/admin/login', c.req.raw));
});

// Create a wrapper to handle path prefixes
const wrappedApp = async (req, context) => {
  // Special path handling for Netlify functions
  // This removes the /.netlify/functions/server prefix from the path if present
  if (req.path && req.path.startsWith('/.netlify/functions/server')) {
    const originalPath = req.path;
    req.path = req.path.replace('/.netlify/functions/server', '') || '/';
    console.log(`Netlify path rewrite: ${originalPath} -> ${req.path}`);
  }
  
  // Pass the request to the Hono app
  return app.fetch(req, context);
};

// Create the serverless handler
const handler = serverless(wrappedApp);

// Export the handler
export { handler };
