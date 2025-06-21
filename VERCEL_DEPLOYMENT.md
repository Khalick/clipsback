# Vercel Deployment Guide for CLIPS Backend

This document provides guidance on deploying the CLIPS Backend application to Vercel.

## Environment Variables

Make sure to set up the following environment variables in your Vercel project:

- `DATABASE_URL`: The PostgreSQL connection string
- `SECRET_KEY`: Secret key for JWT token generation
- `SUPABASE_URL`: Supabase URL for file storage
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key

## Database Connection Issues

If you're experiencing database connection issues with Aiven PostgreSQL when deployed to Vercel, try the following:

### 1. IP Allowlisting

Vercel uses a range of IP addresses for outgoing connections. You need to allowlist these IP addresses in your Aiven PostgreSQL configuration:

1. Log in to your Aiven Cloud console
2. Navigate to your PostgreSQL service
3. Go to "Security" or "Network" settings
4. Add Vercel's IP ranges to the allowed list

Vercel's IP ranges can be found here: [Vercel IP Ranges](https://vercel.com/docs/functions/serverless-functions/runtimes#static-outgoing-ip-addresses)

### 2. Connection String Format

Make sure your connection string is correctly formatted:

```
postgres://avnadmin:PASSWORD@hostname:port/defaultdb?sslmode=require
```

### 3. SSL Configuration

The Aiven PostgreSQL instance requires SSL. Make sure your connection code handles this correctly:

```javascript
const sql = postgres(process.env.DATABASE_URL, {
  ssl: { 
    rejectUnauthorized: false 
  },
  // other options...
});
```

## Testing Your Deployment

After deploying, test these endpoints:

1. Health check: `https://your-vercel-app.vercel.app/api/health`
2. Students endpoint: `https://your-vercel-app.vercel.app/students`

If you see database connection errors, check the error details and verify your environment variables and IP allowlisting.

## Common Issues

1. **503 Service Unavailable**: Database connection issue - check IP allowlisting
2. **500 Internal Server Error**: Check the error logs in Vercel for more details
3. **SSL/TLS errors**: Make sure SSL is properly configured

## Debugging Tips

1. Enable logging in your Vercel deployment
2. Check the "Functions" tab in your Vercel dashboard for error logs
3. Use temporary console.log statements to debug connection issues
4. Test your database connection from other environments to isolate the issue
