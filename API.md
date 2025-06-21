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
  "national_id": "ID12345678", 
  "birth_certificate": "BC12345678", 
  "new_password": "newpassword123"
}
```

Note: Either `national_id` OR `birth_certificate` is required for identity verification.

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

**Response (Error - Identity Verification Failed):**
```json
{
  "error": "Identity verification failed",
  "details": "Please provide a valid national ID or birth certificate number"
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