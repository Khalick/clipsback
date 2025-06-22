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
        
        if (req.body) {
          // For multipart/form-data, pass through the raw body
          requestInit.body = req.body;
          console.log('Form data body provided, type:', typeof req.body);
          
          // If body is a buffer, log its length
          if (Buffer.isBuffer(req.body)) {
            console.log('Body is a Buffer of length:', req.body.length);
          } else if (typeof req.body === 'string') {
            console.log('Body is a string of length:', req.body.length);
          } else if (typeof req.body === 'object') {
            console.log('Body is an object with keys:', Object.keys(req.body));
          }
        } else if (req.rawBody) {
          // Some Vercel environments might provide rawBody instead
          requestInit.body = req.rawBody;
          console.log('Using raw body instead, type:', typeof req.rawBody);
        } else {
          console.log('Warning: multipart/form-data request has no body');
        }
      } else if (req.body) {
        // For other content types with body, stringify if needed
        requestInit.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        console.log('Regular body provided, length:', requestInit.body.length);
      } else {
        console.log('No body provided for non-GET/HEAD request');      }
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
