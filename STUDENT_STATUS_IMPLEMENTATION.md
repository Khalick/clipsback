# Student Status Implementation

This document explains how to implement the student status changes in the system.

## Overview

The implementation adds a `status` field to the students table that will be updated when:
- Deregistering students
- Granting academic leave
- Reregistering students

The status field can have the following values:
- `active` - Default status for registered students
- `deregistered` - For deregistered students
- `on_leave` - For students on academic leave

## Implementation Steps

1. **Apply the database migration**

   Run the migration script to add the status column:

   ```bash
   node apply-student-status-update.js
   ```

2. **Update the endpoints**

   There are two options for implementing the updated endpoints:

   **Option 1: Replace existing functions in index.js**
   
   Replace the existing endpoint handlers in `index.js` with the updated versions from `student-status-updates.js`.

   **Option 2: Import the functions from student-status-updates.js**
   
   Add the following import to the top of `index.js`:

   ```javascript
   import {
     grantAcademicLeave,
     grantAcademicLeaveById,
     grantAcademicLeaveByRegNumber,
     deregisterStudentById,
     deregisterStudentByRegNumber,
     bulkDeregisterStudents,
     restoreStudent,
     cancelAcademicLeave,
     reregisterStudentByRegNumber
   } from './student-status-updates.js';
   ```

   Then update the route handlers:

   ```javascript
   // Replace existing handlers
   app.post('/students/academic-leave', grantAcademicLeave);
   app.post('/students/:id/academic-leave', grantAcademicLeaveById);
   app.post('/students/registration/:regNumber/academic-leave', grantAcademicLeaveByRegNumber);
   app.post('/students/:id/deregister', deregisterStudentById);
   app.post('/students/registration/:regNumber/deregister', deregisterStudentByRegNumber);
   app.post('/students/deregister', bulkDeregisterStudents);
   app.post('/students/:id/restore', restoreStudent);
   app.delete('/students/:id/academic-leave', cancelAcademicLeave);
   
   // Add new endpoint for reregistering by registration number
   app.post('/students/registration/:regNumber/reregister', reregisterStudentByRegNumber);
   ```

3. **Add a new endpoint for reregistering students by registration number**

   This endpoint is included in the `student-status-updates.js` file and can be added to your routes.

## Testing

After implementation, test the following scenarios:

1. Deregistering a student should set status to 'deregistered'
2. Granting academic leave should set status to 'on_leave'
3. Reregistering a student should set status to 'active'
4. Canceling academic leave should set status to 'active'

## API Documentation

### Deregister a student
- POST `/students/:id/deregister`
- POST `/students/registration/:regNumber/deregister`
- POST `/students/deregister` (bulk)

### Grant academic leave
- POST `/students/academic-leave`
- POST `/students/:id/academic-leave`
- POST `/students/registration/:regNumber/academic-leave`

### Reregister a student
- POST `/students/:id/restore`
- POST `/students/registration/:regNumber/reregister`

### Cancel academic leave
- DELETE `/students/:id/academic-leave`