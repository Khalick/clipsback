// Vercel API adapter
import { app } from '../index.js';

export default async function handler(req, res) {
  try {
    console.log(`${req.method} ${req.url}`);
    console.log('Request headers:', req.headers);
    console.log('Node version:', process.version);
    console.log('Environment:', process.env.NODE_ENV || 'development');
    
    // Convert the Vercel request to a Fetch API request
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    // Create the init object based on request method
    const requestInit = {
      method: req.method,
      headers: new Headers(req.headers)
    };
      // Special handling for multipart/form-data requests
    const contentType = req.headers['content-type'] || '';
    console.log('Content-Type:', contentType);
    
    // Handle special cases where body is needed
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      // Log information about the request body
      console.log('Request body type:', typeof req.body);
      console.log('Request body available:', req.body !== undefined);
      
      // Handle multipart/form-data requests specially to preserve the raw binary data
      if (contentType.includes('multipart/form-data')) {
        console.log('Handling multipart/form-data body');
        
        // Get the boundary from the content-type header
        const boundary = contentType.split('boundary=')[1]?.split(';')[0];
        console.log('Form data boundary:', boundary || 'Not found');
        
        if (req.body) {
          // For multipart/form-data, pass through the raw body
          requestInit.body = req.body;
          console.log('Form data body provided, type:', typeof req.body);
          
          // If body is a buffer, log its length
          if (Buffer.isBuffer(req.body)) {
            console.log('Body is a Buffer of length:', req.body.length);
          } else if (typeof req.body === 'string') {
            console.log('Body is a string of length:', req.body.length);
            // Add appropriate content-type header with boundary if missing
            if (boundary && !requestInit.headers.get('content-type').includes('boundary=')) {
              requestInit.headers.set('content-type', `multipart/form-data; boundary=${boundary}`);
              console.log('Added boundary to content-type header:', boundary);
            }
          } else if (typeof req.body === 'object') {
            console.log('Body is an object with keys:', Object.keys(req.body));
            // Convert object to form data for Hono if needed
            try {
              // If we received an object with files or complex data that should be FormData
              const formData = new FormData();
              for (const [key, value] of Object.entries(req.body)) {
                formData.append(key, value);
              }
              requestInit.body = formData;
            } catch (formErr) {
              console.error('Error creating FormData from object:', formErr);
              // Fallback to JSON
              requestInit.body = JSON.stringify(req.body);
              requestInit.headers.set('content-type', 'application/json');
            }
          }
        } else if (req.rawBody) {
          // Some Vercel environments might provide rawBody instead
          requestInit.body = req.rawBody;
          console.log('Using raw body instead, type:', typeof req.rawBody);
          
          // Ensure content-type has boundary if it's a string
          if (typeof req.rawBody === 'string' && boundary && 
              !requestInit.headers.get('content-type').includes('boundary=')) {
            requestInit.headers.set('content-type', `multipart/form-data; boundary=${boundary}`);
            console.log('Added boundary to content-type header for rawBody');
          }
        } else {
          console.log('Warning: multipart/form-data request has no body');
        }
      } else if (req.body) {
        // For other content types with body, stringify if needed
        if (typeof req.body === 'string') {
          requestInit.body = req.body;
        } else {
          try {
            requestInit.body = JSON.stringify(req.body);
            // Ensure we have proper content-type for JSON
            if (!contentType.includes('application/json')) {
              requestInit.headers.set('content-type', 'application/json');
            }
          } catch (jsonError) {
            console.error('Error stringifying request body:', jsonError);
            requestInit.body = String(req.body);
          }
        }
        console.log('Regular body provided, length:', requestInit.body.length);
      } else {
        console.log('No body provided for non-GET/HEAD request');
      }
    } else {
      console.log('No body needed for GET/HEAD request');
    }
    
    // Log the path being requested to help diagnose 404 errors
    console.log(`Processing request for path: ${url.pathname}`);
    
    const request = new Request(url, requestInit);

    // Process the request with Hono
    const response = await app.fetch(request);
    
    // Convert the Fetch API response to a Vercel response
    res.statusCode = response.status;
    
    // Log response details
    console.log(`Response status: ${response.status}`);
    if (response.status !== 200) {
      console.log('Non-200 response details:', {
        status: response.status,
        statusText: response.statusText,
        url: url.toString(),
        method: req.method
      });
    }
    
    // Set headers
    for (const [key, value] of response.headers.entries()) {
      res.setHeader(key, value);
      console.log(`Setting response header: ${key} = ${value}`);
    }
    
    // Send the response body
    const body = await response.text();
    console.log(`Response body length: ${body.length} bytes`);
    if (body.length < 1000) {
      console.log('Response body:', body);
    }
    res.end(body);
  } catch (error) {
    console.error('Error in API handler:', error);
    
    // Send an error response
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ 
      error: 'Internal Server Error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }));
  }
}
