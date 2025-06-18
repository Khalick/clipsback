import { app } from '../../index.js';
import serverless from 'serverless-http';

// Export the serverless handler
export const handler = serverless(app);
