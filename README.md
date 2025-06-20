# Student Portal Backend

A backend server for a student portal application with database integration and static file serving.

## Features

- RESTful API for student management
- PostgreSQL database integration
- JWT authentication
- Static file serving
- Admin dashboard

## Prerequisites

- Node.js (v16+)
- PostgreSQL database

## Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file based on `.env.example`:
   ```
   # Database connection
   DATABASE_URL=postgres://username:password@host:port/database
   
   # JWT Secret Key
   SECRET_KEY=your_secret_key_here
   
   # Port (default: 3000)
   PORT=3000
   ```

4. Initialize the database:
   ```
   npm run init-db
   ```

5. Create an admin user (optional, a default admin is created during initialization):
   ```
   npm run create-admin [username] [password]
   ```

## Running the Application

Start the server:
```
npm start
```

For development with auto-reload:
```
npm run dev
```

## API Endpoints

### Authentication
- `POST /auth/admin-login` - Admin login
- `POST /auth/student-login` - Student login

### Students
- `GET /students` - Get all students
- `GET /students/:id` - Get a student by ID
- `POST /students` - Create a new student
- `PUT /students/:id` - Update a student
- `DELETE /students/:id` - Delete a student

### Units
- `GET /units` - Get all units
- `GET /units/:id` - Get a unit by ID
- `POST /units` - Create a new unit
- `PUT /units/:id` - Update a unit
- `DELETE /units/:id` - Delete a unit

### Registered Units
- `GET /registered_units` - Get all registered units
- `GET /registered_units/:id` - Get a registered unit by ID
- `POST /registered_units` - Create a new registered unit
- `PUT /registered_units/:id` - Update a registered unit
- `DELETE /registered_units/:id` - Delete a registered unit
- `GET /students/:id/registered-units` - Get units registered by a student
- `POST /students/:id/register-unit` - Register a unit for a student

### Fees
- `GET /fees` - Get all fees
- `GET /fees/:id` - Get a fee by ID
- `POST /fees` - Create a new fee record
- `PUT /fees/:id` - Update a fee record
- `DELETE /fees/:id` - Delete a fee record
- `GET /students/:id/fees` - Get fees for a student

### Finance
- `GET /finance` - Get all finance records
- `GET /finance/:id` - Get a finance record by ID
- `POST /finance` - Create a new finance record
- `PUT /finance/:id` - Update a finance record
- `DELETE /finance/:id` - Delete a finance record
- `GET /students/:id/finance` - Get finance records for a student
- `GET /students/:id/fee-statement` - Get the latest fee statement for a student
- `GET /students/:id/fee-receipt` - Get the latest fee receipt for a student
- `POST /students/:id/fee-statement` - Upload a fee statement for a student
- `POST /students/:id/fee-receipt` - Upload a fee receipt for a student
- `POST /students/:id/upload-fee-statement` - Upload a fee statement file for a student
- `POST /students/:id/upload-fee-receipt` - Upload a fee receipt file for a student

### Results
- `GET /results` - Get all results
- `GET /results/:id` - Get a result by ID
- `POST /results` - Create a new result
- `PUT /results/:id` - Update a result
- `DELETE /results/:id` - Delete a result
- `GET /students/:id/results` - Get results for a student

### Timetables
- `GET /timetables` - Get all timetables
- `GET /timetables/:id` - Get a timetable by ID
- `POST /timetables` - Create a new timetable
- `PUT /timetables/:id` - Update a timetable
- `DELETE /timetables/:id` - Delete a timetable
- `GET /students/:id/timetables` - Get timetables for a student

### Exam Cards
- `GET /exam-cards` - Get all exam cards
- `GET /students/:id/exam-card` - Get the latest exam card for a student
- `POST /students/:id/exam-card` - Upload an exam card for a student
- `POST /students/:id/upload-exam-card` - Upload an exam card file for a student

## Static Files

Static files are served from the `public` directory. The admin dashboard is accessible at the root URL.

## License

MIT