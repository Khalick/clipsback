# Student Portal API Documentation

This document provides detailed information about the Student Portal API endpoints.

## Base URL

```
http://localhost:3000
```

## Authentication

### Admin Login

```
POST /auth/admin-login
```

**Request Body:**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response:**
```json
{
  "token": "jwt_token_here",
  "username": "admin"
}
```

### Student Login

```
POST /auth/student-login
```

**Request Body:**
```json
{
  "registration_number": "STU001",
  "password": "password123"
}
```

**Response:**
```json
{
  "token": "jwt_token_here",
  "student_id": 1,
  "registration_number": "STU001",
  "name": "Student Name"
}
```

### Student Forgot Password

```
POST /student/auth/forgot-password
```

**Request Body:**
```json
{
  "registration_number": "STU001",
  "new_password": "newpassword123"
}
```

**Response (Success):**
```json
{
  "message": "Password reset successful",
  "registration_number": "STU001"
}
```

**Response (Error - Missing Fields):**
```json
{
  "error": "Registration number is required"
}
```

## Students

### Get All Students

```
GET /students
```

**Response:**
```json
[
  {
    "id": "uuid_here",
    "registration_number": "STU001",
    "name": "John Doe",
    "course": "Computer Science",
    "level_of_study": "Undergraduate",
    "photo_url": "https://example.com/photo.jpg",
    "national_id": "12345678",
    "birth_certificate": "BC12345",
    "date_of_birth": "2000-01-01"
  }
]
```

### Get Student by ID

```
GET /students/:id
```

**Response:**
```json
{
  "id": "uuid_here",
  "registration_number": "STU001",
  "name": "John Doe",
  "course": "Computer Science",
  "level_of_study": "Undergraduate",
  "photo_url": "https://example.com/photo.jpg",
  "national_id": "12345678",
  "birth_certificate": "BC12345",
  "date_of_birth": "2000-01-01"
}
```

### Create Student

```
POST /students
```

**Request Body:**
```json
{
  "registration_number": "STU002",
  "name": "Jane Smith",
  "course": "Computer Science",
  "level_of_study": "Undergraduate",
  "photo_url": "https://example.com/photo.jpg",
  "national_id": "87654321",
  "birth_certificate": "BC54321",
  "date_of_birth": "2001-02-02",
  "password": "password123"
}
```

**Response:**
```json
{
  "id": "uuid_here",
  "registration_number": "STU002",
  "name": "Jane Smith",
  "course": "Computer Science",
  "level_of_study": "Undergraduate",
  "photo_url": "https://example.com/photo.jpg",
  "national_id": "87654321",
  "birth_certificate": "BC54321",
  "date_of_birth": "2001-02-02"
}
```

### Update Student

```
PUT /students/:id
```

**Request Body:**
```json
{
  "registration_number": "STU002",
  "name": "Jane Smith",
  "course": "Computer Science",
  "level_of_study": "Undergraduate",
  "photo_url": "https://example.com/photo.jpg",
  "national_id": "87654321",
  "birth_certificate": "BC54321",
  "date_of_birth": "2001-02-02"
}
```

**Response:**
```json
{
  "id": "uuid_here",
  "registration_number": "STU002",
  "name": "Jane Smith",
  "course": "Computer Science",
  "level_of_study": "Undergraduate",
  "photo_url": "https://example.com/photo.jpg",
  "national_id": "87654321",
  "birth_certificate": "BC54321",
  "date_of_birth": "2001-02-02"
}
```

### Delete Student

```
DELETE /students/:id
```

**Response:**
```json
{
  "message": "Student deleted"
}
```

### Promote Student

```
POST /students/promote
```

**Request Body:**
```json
{
  "registration_number": "REG123456",
  "new_level": 2
}
```

**Response (Success):**
```json
{
  "message": "Student promoted successfully",
  "student": {
    "id": "uuid_here",
    "registration_number": "REG123456",
    "first_name": "John",
    "last_name": "Doe",
    "level_of_study": 2,
    "email": "john.doe@example.com",
    "status": "active"
    // other student properties
  }
}
```

**Response (Not Found):**
```json
{
  "error": "Student not found",
  "details": "No student found with registration number: REG123456"
}
```

## Units

### Get All Units

```
GET /units
```

**Response:**
```json
[
  {
    "id": "uuid_here",
    "unit_name": "Introduction to Programming",
    "unit_code": "CS101"
  }
]
```

### Get Unit by ID

```
GET /units/:id
```

**Response:**
```json
{
  "id": "uuid_here",
  "unit_name": "Introduction to Programming",
  "unit_code": "CS101"
}
```

### Create Unit

```
POST /units
```

**Request Body:**
```json
{
  "unit_name": "Data Structures",
  "unit_code": "CS102"
}
```

**Response:**
```json
{
  "id": "uuid_here",
  "unit_name": "Data Structures",
  "unit_code": "CS102"
}
```

### Update Unit

```
PUT /units/:id
```

**Request Body:**
```json
{
  "unit_name": "Data Structures and Algorithms",
  "unit_code": "CS102"
}
```

**Response:**
```json
{
  "id": "uuid_here",
  "unit_name": "Data Structures and Algorithms",
  "unit_code": "CS102"
}
```

### Delete Unit

```
DELETE /units/:id
```

**Response:**
```json
{
  "message": "Unit deleted"
}
```

## Registered Units

### Get All Registered Units

```
GET /registered_units
```

**Response:**
```json
[
  {
    "id": "uuid_here",
    "student_id": "student_uuid_here",
    "unit_name": "Introduction to Programming",
    "unit_code": "CS101",
    "status": "registered"
  }
]
```

### Get Units Registered by a Student

```
GET /students/:id/registered-units
```

**Response:**
```json
[
  {
    "id": "uuid_here",
    "student_id": "student_uuid_here",
    "unit_name": "Introduction to Programming",
    "unit_code": "CS101",
    "status": "registered"
  }
]
```

### Register a Unit for a Student

```
POST /students/:id/register-unit
```

**Request Body:**
```json
{
  "unit_id": "unit_uuid_here"
}
```

**Response:**
```json
{
  "id": "uuid_here",
  "student_id": "student_uuid_here",
  "unit_name": "Introduction to Programming",
  "unit_code": "CS101",
  "status": "registered"
}
```

## Fees

### Get All Fees

```
GET /fees
```

**Response:**
```json
[
  {
    "id": "uuid_here",
    "student_id": "student_uuid_here",
    "fee_balance": 5000,
    "total_paid": 15000,
    "semester_fee": 20000
  }
]
```

### Get Fees for a Student

```
GET /students/:id/fees
```

**Response:**
```json
{
  "id": "uuid_here",
  "student_id": "student_uuid_here",
  "fee_balance": 5000,
  "total_paid": 15000,
  "semester_fee": 20000
}
```

## Finance

### Get All Finance Records

```
GET /finance
```

**Response:**
```json
[
  {
    "id": "uuid_here",
    "student_id": "student_uuid_here",
    "statement": "Fee statement for semester 1",
    "statement_url": "https://example.com/statement.pdf",
    "receipt_url": "https://example.com/receipt.pdf",
    "created_at": "2023-01-01T00:00:00Z"
  }
]
```

### Get Finance Records for a Student

```
GET /students/:id/finance
```

**Response:**
```json
[
  {
    "id": "uuid_here",
    "student_id": "student_uuid_here",
    "statement": "Fee statement for semester 1",
    "statement_url": "https://example.com/statement.pdf",
    "receipt_url": "https://example.com/receipt.pdf",
    "created_at": "2023-01-01T00:00:00Z"
  }
]
```

### Get Fee Statement for a Student

```
GET /students/:id/fee-statement
```

**Response:**
```json
{
  "statement_url": "https://example.com/statement.pdf"
}
```

### Get Fee Receipt for a Student

```
GET /students/:id/fee-receipt
```

**Response:**
```json
{
  "receipt_url": "https://example.com/receipt.pdf"
}
```

### Upload Fee Statement for a Student

```
POST /students/:id/fee-statement
```

**Request Body:**
```json
{
  "statement_url": "https://example.com/statement.pdf"
}
```

**Response:**
```json
{
  "message": "Fee statement uploaded."
}
```

### Upload Fee Receipt for a Student

```
POST /students/:id/fee-receipt
```

**Request Body:**
```json
{
  "receipt_url": "https://example.com/receipt.pdf"
}
```

**Response:**
```json
{
  "message": "Fee receipt uploaded."
}
```

## Results

### Get All Results

```
GET /results
```

**Response:**
```json
[
  {
    "id": "uuid_here",
    "student_id": "student_uuid_here",
    "semester": 1,
    "result_data": {
      "units": [
        {
          "unit_code": "CS101",
          "unit_name": "Introduction to Programming",
          "grade": "A",
          "score": 85
        }
      ],
      "gpa": 4.0
    },
    "created_at": "2023-01-01T00:00:00Z"
  }
]
```

### Get Results for a Student

```
GET /students/:id/results
```

**Response:**
```json
[
  {
    "id": "uuid_here",
    "student_id": "student_uuid_here",
    "semester": 1,
    "result_data": {
      "units": [
        {
          "unit_code": "CS101",
          "unit_name": "Introduction to Programming",
          "grade": "A",
          "score": 85
        }
      ],
      "gpa": 4.0
    },
    "created_at": "2023-01-01T00:00:00Z"
  }
]
```

## Timetables

### Get All Timetables

```
GET /timetables
```

**Response:**
```json
[
  {
    "id": "uuid_here",
    "student_id": "student_uuid_here",
    "semester": 1,
    "timetable_data": {
      "monday": [
        {
          "unit_code": "CS101",
          "unit_name": "Introduction to Programming",
          "start_time": "08:00",
          "end_time": "10:00",
          "venue": "Room 101"
        }
      ]
    }
  }
]
```

### Get Timetables for a Student

```
GET /students/:id/timetables
```

**Response:**
```json
[
  {
    "id": "uuid_here",
    "student_id": "student_uuid_here",
    "semester": 1,
    "timetable_data": {
      "monday": [
        {
          "unit_code": "CS101",
          "unit_name": "Introduction to Programming",
          "start_time": "08:00",
          "end_time": "10:00",
          "venue": "Room 101"
        }
      ]
    }
  }
]
```

## Exam Cards

### Get All Exam Cards

```
GET /exam-cards
```

**Response:**
```json
[
  {
    "id": "uuid_here",
    "student_id": "student_uuid_here",
    "file_url": "https://example.com/exam_card.pdf",
    "created_at": "2023-01-01T00:00:00Z"
  }
]
```

### Get Exam Card for a Student

```
GET /students/:id/exam-card
```

**Response:**
```json
{
  "file_url": "https://example.com/exam_card.pdf"
}
```

### Upload Exam Card for a Student

```
POST /students/:id/exam-card
```

**Request Body:**
```json
{
  "file_url": "https://example.com/exam_card.pdf"
}
```

**Response:**
```json
{
  "message": "Exam card uploaded."
}
```

## New Unified Document Upload System

The API now supports a unified document upload system that stores all student documents in a single table with document type categorization.

### Document Upload Endpoints

All document upload endpoints follow the same pattern and use `multipart/form-data`:

#### Request Format
```
POST /{document-type}
Content-Type: multipart/form-data

Form Fields:
- registrationNumber: String (required) - Student's registration number
- file: File (required) - Document file (max 10MB)
```

#### Available Document Types

##### Exam Card Upload
```
POST /exam-card
```

##### Fees Structure Upload
```
POST /fees-structure
```

##### Fees Statement Upload
```
POST /fees-statement
```

##### Fees Receipt Upload
```
POST /fees-receipt
```

##### Results Upload
```
POST /results
```

##### Timetable Upload
```
POST /timetable
```

#### Response Format
```json
{
  "message": "Document uploaded successfully",
  "success": true,
  "data": {
    "id": "uuid_here",
    "registrationNumber": "STU001",
    "documentType": "exam-card",
    "fileUrl": "https://example.com/file.pdf",
    "fileName": "exam_card.pdf",
    "fileSize": 1024,
    "uploadedAt": "2023-01-01T00:00:00Z"
  }
}
```

### Get Student Documents

```
GET /documents/:registrationNumber
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid_here",
      "registration_number": "STU001",
      "document_type": "exam-card",
      "file_url": "https://example.com/exam_card.pdf",
      "file_name": "exam_card.pdf",
      "file_size": 1024,
      "uploaded_at": "2023-01-01T00:00:00Z",
      "created_at": "2023-01-01T00:00:00Z",
      "updated_at": "2023-01-01T00:00:00Z"
    }
  ],
  "count": 1
}
```

### File Validation

- **Maximum file size:** 10MB
- **Supported formats:** PDF, DOC, DOCX, Images (JPG, PNG, etc.)
- **Required fields:** registrationNumber, file

### Storage

Documents are stored in Supabase storage under the `student-documents` bucket with the following structure:
```
student-documents/
├── exam-card/
├── fees-structure/
├── fees-statement/
├── results/
└── timetable/
```

### Error Handling

All endpoints return appropriate HTTP status codes and error messages:

- `400 Bad Request` - Missing required fields or validation errors
- `500 Internal Server Error` - Upload or database errors

### Test Page

You can test the new unified upload system at: `/test-unified-upload`

---

# Legacy API Documentation

## Authentication

## Unit Allocation System

The API now supports a comprehensive unit allocation system where admins can allocate units to students, and students can register those allocated units in their portal.

### Admin Unit Management

#### Get All Units
```
GET /units
```

**Response:**
```json
[
  {
    "id": "uuid_here",
    "unit_name": "Introduction to Programming",
    "unit_code": "CS101"
  }
]
```

#### Create Unit
```
POST /units
```

**Request Body:**
```json
{
  "unit_name": "Data Structures",
  "unit_code": "CS102"
}
```

**Response:**
```json
{
  "message": "Unit created successfully",
  "unit": {
    "id": "uuid_here",
    "unit_name": "Data Structures",
    "unit_code": "CS102"
  }
}
```

### Unit Allocation (Admin Functions)

#### Allocate Units to Student by ID
```
POST /students/:studentId/allocate-units
```

**Request Body:**
```json
{
  "unit_ids": ["unit_uuid_1", "unit_uuid_2"],
  "semester": 1,
  "academic_year": "2024/2025",
  "notes": "Core units for Computer Science"
}
```

**Response:**
```json
{
  "message": "Unit allocation completed",
  "student": {
    "id": "student_uuid",
    "registration_number": "STU001",
    "name": "John Doe"
  },
  "allocated_units": [
    {
      "id": "allocation_uuid",
      "student_id": "student_uuid",
      "unit_id": "unit_uuid_1",
      "semester": 1,
      "academic_year": "2024/2025",
      "status": "allocated",
      "unit_name": "Introduction to Programming",
      "unit_code": "CS101"
    }
  ],
  "summary": {
    "total_requested": 2,
    "successfully_allocated": 1,
    "errors": 1
  }
}
```

#### Allocate Units to Student by Registration Number
```
POST /students/registration/:regNumber/allocate-units
```

**For registration numbers with slashes:**
```
POST /students/registration/:course/:number/:year/allocate-units
```

**Request Body:** (Same as above)

### Unit Allocation Viewing

#### Get Allocated Units for Student by ID
```
GET /students/:studentId/allocated-units?semester=1&status=allocated
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "allocation_uuid",
      "student_id": "student_uuid",
      "unit_id": "unit_uuid",
      "semester": 1,
      "academic_year": "2024/2025",
      "status": "allocated",
      "allocated_at": "2023-01-01T00:00:00Z",
      "unit_name": "Introduction to Programming",
      "unit_code": "CS101",
      "student_name": "John Doe",
      "registration_number": "STU001"
    }
  ],
  "count": 1
}
```

#### Get Allocated Units by Registration Number
```
GET /students/registration/:regNumber/allocated-units?semester=1&status=allocated
```

**For registration numbers with slashes:**
```
GET /students/registration/:course/:number/:year/allocated-units?semester=1&status=allocated
```

**Response:** (Same as above)

### Student Unit Registration

#### Register Allocated Unit by Student ID
```
POST /students/:studentId/register-allocated-unit
```

**Request Body:**
```json
{
  "allocated_unit_id": "allocation_uuid"
}
```

**Response:**
```json
{
  "message": "Unit registered successfully",
  "registered_unit": {
    "id": "registered_unit_uuid",
    "student_id": "student_uuid",
    "unit_name": "Introduction to Programming",
    "unit_code": "CS101",
    "status": "registered"
  },
  "student_registration": "STU001"
}
```

#### Register Allocated Unit by Registration Number
```
POST /students/registration/:regNumber/register-allocated-unit
```

**For registration numbers with slashes:**
```
POST /students/registration/:course/:number/:year/register-allocated-unit
```

**Request Body:** (Same as above)

### Admin Management Functions

#### Get All Allocations (Admin Overview)
```
GET /allocated-units?semester=1&status=allocated
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "allocation_uuid",
      "student_id": "student_uuid",
      "unit_id": "unit_uuid",
      "semester": 1,
      "academic_year": "2024/2025",
      "status": "allocated",
      "allocated_at": "2023-01-01T00:00:00Z",
      "unit_name": "Introduction to Programming",
      "unit_code": "CS101",
      "student_name": "John Doe",
      "registration_number": "STU001",
      "course": "Computer Science",
      "level_of_study": "Undergraduate"
    }
  ],
  "count": 1,
  "statistics": {
    "total_allocations": "10",
    "pending_registrations": "5",
    "registered": "4",
    "cancelled": "1"
  }
}
```

#### Cancel Unit Allocation
```
DELETE /allocated-units/:allocationId
```

**Response:**
```json
{
  "message": "Unit allocation cancelled successfully",
  "cancelled_allocation": {
    "id": "allocation_uuid",
    "status": "cancelled",
    "unit_name": "Introduction to Programming",
    "unit_code": "CS101",
    "student_name": "John Doe",
    "registration_number": "STU001"
  }
}
```

### Query Parameters

- `semester`: Filter by semester (1 or 2)
- `academic_year`: Filter by academic year (e.g., "2024/2025")
- `status`: Filter by status ("allocated", "registered", "cancelled")
- `student_id`: Filter by student ID
- `unit_id`: Filter by unit ID

### Unit Allocation Workflow

1. **Admin creates units** using `POST /units`
2. **Admin allocates units to students** using `POST /students/:studentId/allocate-units`
3. **Students view their allocated units** using `GET /students/registration/:regNumber/allocated-units`
4. **Students register allocated units** using `POST /students/registration/:regNumber/register-allocated-unit`
5. **Admin monitors allocation status** using `GET /allocated-units`

### Status Flow

- `allocated`: Unit is available for student registration
- `registered`: Student has successfully registered the unit
- `cancelled`: Admin has cancelled the allocation