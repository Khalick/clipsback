// Import the app from the main index.js file
import { app } from '../../index.js';
import serverless from 'serverless-http';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Set env var to let the app know we're running in Netlify
process.env.NETLIFY = "true";

// Log the function startup
console.log("Initializing Netlify serverless function");

// Create a wrapper to handle both direct and proxied paths
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
