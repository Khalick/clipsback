# Student Status Implementation

This document explains how to implement the student status changes in the database.

## Overview

The implementation adds a `status` field to the students table that will be updated when:
- Deregistering students
- Granting academic leave
- Reregistering students

## Implementation Steps

1. **Apply the database migration**

   Run the migration script to add the status column:

   ```bash
   node apply-status-migration.js
   ```

2. **Update the existing endpoints**

   Modify the existing endpoints in `index.js` to update the status field:

   - For deregistering students:
     ```javascript
     // In deregistration endpoints
     `UPDATE students SET 
       deregistered=true, 
       deregistration_date=$1, 
       deregistration_reason=$2,
       status='deregistered' 
     WHERE id=$3 RETURNING *`
     ```

   - For granting academic leave:
     ```javascript
     // In academic leave endpoints
     `UPDATE students SET 
       academic_leave=true, 
       academic_leave_start=$1, 
       academic_leave_end=$2,
       academic_leave_reason=$3,
       status='on_leave' 
     WHERE id=$4 RETURNING *`
     ```

   - For reregistering students:
     ```javascript
     // In reregistration endpoints
     `UPDATE students SET 
       deregistered=false, 
       deregistration_date=NULL, 
       deregistration_reason=NULL,
       status='active' 
     WHERE id=$1 RETURNING *`
     ```

   - For canceling academic leave:
     ```javascript
     // In cancel academic leave endpoints
     `UPDATE students SET 
       academic_leave=false, 
       academic_leave_start=NULL, 
       academic_leave_end=NULL,
       academic_leave_reason=NULL,
       status='active' 
     WHERE id=$1 RETURNING *`
     ```

3. **Alternative: Use the helper functions**

   Import and use the helper functions from `student-status.js`:

   ```javascript
   import { 
     deregisterStudent, 
     grantAcademicLeave, 
     reregisterStudent, 
     cancelAcademicLeave 
   } from './student-status.js';

   // Example usage in an endpoint
   app.post('/students/:id/deregister', async (c) => {
     try {
       const student_id = c.req.param('id');
       let reason = '';
       try {
         const body = await c.req.json();
         reason = body.reason || body.deregistration_reason || '';
       } catch (e) {}
       
       const student = await deregisterStudent(student_id, reason);
       
       if (!student) return c.json({ error: 'Student not found' }, 404);
       return c.json({ 
         message: 'Student deregistered successfully', 
         student 
       });
     } catch (error) {
       console.error('Error deregistering student:', error);
       return c.json({ 
         error: 'Failed to deregister student', 
         details: error.message 
       }, 500);
     }
   });
   ```

## Status Values

The status field can have the following values:
- `active` - Default status for registered students
- `deregistered` - For deregistered students
- `on_leave` - For students on academic leave