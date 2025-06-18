# Netlify Deployment

This directory contains files needed for deploying the API as a serverless function on Netlify.

## Structure

- `server.js` - The main serverless function that wraps the Hono app
- `package.json` - Contains the ESM setting and dependencies for the function

## Deployment Notes

1. The function uses ESM modules
2. Dependencies are pulled from the root project
3. Environment variables must be set in the Netlify dashboard

## Required Environment Variables

- `DATABASE_URL`: PostgreSQL database connection string
- `SECRET_KEY`: Secret key for JWT tokens
- `SUPABASE_URL`: Supabase project URL (if using Supabase)
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key (if using Supabase)

## Testing

After deployment, your API will be available at:
`https://your-netlify-site.netlify.app/.netlify/functions/server`

All requests to the root URL will be redirected to the function.
