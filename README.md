# Student Portal Backend

This is the backend API for the Student Portal application. It handles student management, course registration, fees, timetables, and other student-related data.

## Local Development

To run this application locally:

1. Install dependencies:
   ```
   npm install
   ```

2. Initialize the database (only needed once):
   ```
   npm run init-db
   ```

3. Start the server:
   ```
   npm start
   ```

The server will start on port 3001 by default (or the port specified in the `PORT` environment variable).

## Deployment to Netlify

This application is configured for deployment to Netlify as a serverless function.

### Prerequisites

- A Netlify account
- A PostgreSQL database (can be hosted on Supabase, Railway, Neon, etc.)
- Git repository (GitHub, GitLab, Bitbucket)

### Deployment Steps

1. Push your code to a Git repository.

2. Connect your repository to Netlify:
   - In Netlify dashboard, click "New site from Git"
   - Choose your Git provider and repository
   - Leave build settings as is (they're configured in netlify.toml)

3. Set up the following environment variables in the Netlify dashboard (Settings > Environment):
   - `DATABASE_URL`: Your PostgreSQL database connection string
   - `SUPABASE_URL`: Your Supabase project URL (if using Supabase for storage)
   - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (if using Supabase)
   - `SECRET_KEY`: Secret key for JWT token generation (make this secure & random)

4. Deploy the site by clicking "Deploy site" or pushing a new commit to your repository.

### Post-Deployment Setup

After the first successful deployment, you need to set up the database and admin user:

1. Initialize the database:
   ```bash
   # Using curl
   curl -X POST https://your-netlify-site.netlify.app/.netlify/functions/server/admin/init-db \
     -H "x-admin-key: your_secret_key_here"
     
   # Alternative for Windows PowerShell
   Invoke-RestMethod -Method POST -Uri "https://your-netlify-site.netlify.app/.netlify/functions/server/admin/init-db" `
     -Headers @{"x-admin-key"="your_secret_key_here"}
   ```

2. Create the initial admin user:
   ```bash
   # Using curl
   curl -X POST https://your-netlify-site.netlify.app/.netlify/functions/server/admin/create-admin \
     -H "x-admin-key: your_secret_key_here" \
     -H "Content-Type: application/json" \
     -d '{"username": "admin", "password": "your_secure_password"}'
     
   # Alternative for Windows PowerShell
   $body = @{
     username = "admin"
     password = "your_secure_password"
   } | ConvertTo-Json
   
   Invoke-RestMethod -Method POST -Uri "https://your-netlify-site.netlify.app/.netlify/functions/server/admin/create-admin" `
     -Headers @{"x-admin-key"="your_secret_key_here"; "Content-Type"="application/json"} `
     -Body $body
   ```

### Troubleshooting Deployment

If you encounter issues with the deployment:

1. Check the Netlify function logs in the Netlify dashboard (Functions > server > Logs)
2. Verify your environment variables are set correctly
3. Test the CORS configuration by accessing `/debug/cors` endpoint
4. If database connection fails, check if your database accepts connections from Netlify's IP addresses

The database initialization only needs to be done once after the first deployment or after schema changes.

## API Endpoints

The backend provides the following API endpoints:

- `/students` - Student management
- `/registered_units` - Unit registration
- `/fees` - Fees information
- `/timetables` - Class timetables
- `/results` - Student results
- `/admin/login` - Admin authentication

For detailed API documentation, please refer to the API docs.

## Database Initialization

The database tables are initialized using the script in `utils/initDb.js`. This script creates all necessary tables if they don't exist.

To manually initialize the database:

```
npm run init-db
```

Note: This should typically only be run once during initial setup or when the database schema changes.
