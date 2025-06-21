# Form Data & File Upload Guide

This guide explains how the student registration with photo upload works in the CLIPS College backend.

## Issue Fixed

We addressed an issue where student registration with photo upload was failing with `500 (Internal Server Error)` and the error message: `Unexpected end of JSON input`.

### Root Causes

1. Incorrect content type handling in the Vercel API handler
2. Insufficient error handling in the multipart form data processing logic
3. Missing try/catch blocks for form data parsing

## Implementation Details

### Endpoints Supporting Photo Upload

1. `POST /students` - Create new student with optional photo
2. `PUT /students/:id` - Update student with optional photo

### How It Works

1. The backend detects the request's Content-Type
2. If the Content-Type is `multipart/form-data`, it uses a special handler for file uploads
3. The form data is parsed and any photo file is uploaded to Supabase storage
4. Student record is created/updated in the database with the photo URL

### Form Data Structure

When submitting a student with photo, use `multipart/form-data` with these fields:

```
registration_number: String (required)
name: String (required)
course: String (required)
level_of_study: String (required)
national_id: String (optional)
birth_certificate: String (optional)
date_of_birth: String (optional, YYYY-MM-DD format)
password: String (optional)
email: String (optional)
photo: File (optional)
```

### Example Frontend Code

```javascript
// Create a form data object
const formData = new FormData();
formData.append('registration_number', 'STU001');
formData.append('name', 'John Doe');
formData.append('course', 'Computer Science');
formData.append('level_of_study', 'Undergraduate');

// Add optional fields
formData.append('email', 'john@example.com');
formData.append('national_id', 'ID123456');

// Add the photo if selected
const photoInput = document.getElementById('photoInput');
if (photoInput.files[0]) {
  formData.append('photo', photoInput.files[0]);
}

// Submit the form
fetch('https://clipscollegebackend.vercel.app/students', {
  method: 'POST',
  body: formData,
  // No Content-Type header needed - browser sets it automatically with boundary
})
  .then(response => response.json())
  .then(data => {
    console.log('Success:', data);
  })
  .catch(error => {
    console.error('Error:', error);
  });
```

## Troubleshooting

If you encounter issues with file uploads:

1. Check that you're using `multipart/form-data` and NOT setting a Content-Type header manually
2. Ensure the form field name for the photo is `photo`
3. Check the browser console and server logs for detailed error information
4. Verify that all required fields are included in the form data
5. Ensure the Supabase storage bucket exists and has proper permissions

## Error Responses

The API now returns more specific error messages for different failures:

- `400 Bad Request` - For invalid form data or missing required fields
- `500 Internal Server Error` - For server-side issues like database or storage failures

Each error response includes:
- `error`: A short error title
- `details`: A more detailed error message
- `stack`: Stack trace (in development mode only)
