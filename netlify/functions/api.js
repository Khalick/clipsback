import { app } from '../../index.js';

export const handler = async (event, context) => {
  // Convert Netlify event to Fetch API Request
  const request = new Request(event.rawUrl, {
    method: event.httpMethod,
    headers: event.headers,
    body: event.body ? event.body : undefined
  });

  // Process the request with Hono
  const response = await app.fetch(request);
  
  // Convert Fetch API Response to Netlify response
  const body = await response.text();
  const headers = Object.fromEntries(response.headers.entries());
  
  return {
    statusCode: response.status,
    headers,
    body
  };
};