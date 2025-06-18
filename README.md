# Clips College Backend

This is the backend API for the Clips College Student Portal.

## Deployment

### Vercel Deployment

This project is configured for deployment on Vercel. To deploy:

1. Connect your GitHub repository to Vercel
2. Configure the following environment variables in Vercel:
   - `DATABASE_URL`: Your PostgreSQL connection string
   - `SECRET_KEY`: Secret key for JWT token generation
   - `SUPABASE_URL`: (Optional) Your Supabase URL
   - `SUPABASE_SERVICE_ROLE_KEY`: (Optional) Your Supabase service role key

3. Deploy the project

### Local Development

To run the project locally:

```bash
# Install dependencies
npm install

# Start the development server
npm start
```

The server will be available at http://localhost:3001

## API Documentation

The API provides endpoints for managing students, courses, units, and administrative functions.

### Main Endpoints

- `/students` - Student management
- `/units` - Unit management
- `/admin/login` - Admin authentication
- `/debug/cors` - CORS debugging information

For more details, see the API documentation in the code.