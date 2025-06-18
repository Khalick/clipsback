// Vercel API adapter
import { app } from '../index.js';

export default async function handler(req, res) {
  // Convert the Vercel request to a Fetch API request
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  const request = new Request(url, {
    method: req.method,
    headers: new Headers(req.headers),
    body: req.body ? JSON.stringify(req.body) : undefined
  });

  // Process the request with Hono
  const response = await app.fetch(request);
  
  // Convert the Fetch API response to a Vercel response
  res.statusCode = response.status;
  
  // Set headers
  for (const [key, value] of response.headers.entries()) {
    res.setHeader(key, value);
  }
  
  // Send the response body
  const body = await response.text();
  res.end(body);
}