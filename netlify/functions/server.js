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

// Create the serverless handler
const handler = serverless(app);

// Export the handler with specific request handling
export { handler };
