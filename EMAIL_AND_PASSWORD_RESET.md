# Email Field and Password Reset Implementation

This document explains the changes made to add email support and password reset functionality.

## Changes Made

1. Added an email field to the students table
2. Updated student creation and update endpoints to include email
3. Added a forgot password endpoint

## How to Apply the Changes

1. Run the migration to add the email field:
   ```
   node apply-email-migration.js
   ```

2. The endpoints have been updated in index.js to support email and password reset.

## API Endpoints

### Forgot Password

**Endpoint:** `POST /student/auth/forgot-password`

**Request Body:**
```json
{
  "registration_number": "STUDENT123",
  "email": "student@example.com"
}
```

**Response:**
```json
{
  "message": "Password reset successful",
  "temp_password": "ab12cd34",
  "note": "In a production environment, this would be sent via email instead of being returned in the response"
}
```

### Create Student (Updated)

**Endpoint:** `POST /students`

**Request Body:**
```json
{
  "registration_number": "STUDENT123",
  "name": "John Doe",
  "course": "Computer Science",
  "level_of_study": "Undergraduate",
  "email": "student@example.com",
  "password": "password123"
}
```

### Update Student (Updated)

**Endpoint:** `PUT /students/:id`

**Request Body:**
```json
{
  "registration_number": "STUDENT123",
  "name": "John Doe",
  "course": "Computer Science",
  "level_of_study": "Undergraduate",
  "email": "student@example.com",
  "password": "password123"
}
```

## Production Considerations

In a production environment, you should:

1. Send the temporary password via email instead of returning it in the API response
2. Implement rate limiting on the forgot password endpoint to prevent abuse
3. Add validation for email format
4. Consider implementing a token-based password reset flow with expiration