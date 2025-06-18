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

1. Push your code to a Git repository connected to Netlify.

2. In Netlify, set up the following environment variables:
   - `DATABASE_URL`: Your PostgreSQL database connection string
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key
   - `SECRET_KEY`: Secret key for JWT token generation

3. Deploy the site.

4. **Important:** After the first deployment, initialize the database by making a POST request to the `/admin/init-db` endpoint with the `x-admin-key` header set to your `SECRET_KEY` value:
   ```
   curl -X POST https://your-netlify-site.netlify.app/.netlify/functions/server/admin/init-db \
     -H "x-admin-key: your_secret_key_here"
   ```

5. Create the initial admin user by making a POST request to `/admin/create-admin`:
   ```
   curl -X POST https://your-netlify-site.netlify.app/.netlify/functions/server/admin/create-admin \
     -H "x-admin-key: your_secret_key_here" \
     -H "Content-Type: application/json" \
     -d '{"username": "admin", "password": "your_secure_password"}'
   ```

The database initialization only needs to be done once after deployment.

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
