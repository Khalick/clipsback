# Student Status Implementation

## Current Status
The status field has been added to the database and all relevant queries have been updated in the application code to manage the student status appropriately.

## Status Values

The status field can have the following values:
- `active` - Default status for registered students
- `deregistered` - For deregistered students
- `on_leave` - For students on academic leave

## Status Values

The status field can have the following values:
- `active` - Default status for registered students
- `deregistered` - For deregistered students
- `on_leave` - For students on academic leave

## Manual Updates

If you prefer to update the queries manually, add the status field to:

1. Deregistration queries:
   ```sql
   UPDATE students SET 
     deregistered=true, 
     deregistration_date=$1, 
     deregistration_reason=$2,
     status='deregistered' 
   WHERE ...
   ```

2. Academic leave queries:
   ```sql
   UPDATE students SET 
     academic_leave=true, 
     academic_leave_start=$1, 
     academic_leave_end=$2,
     academic_leave_reason=$3,
     status='on_leave' 
   WHERE ...
   ```

3. Reregistration queries:
   ```sql
   UPDATE students SET 
     deregistered=false, 
     deregistration_date=NULL, 
     deregistration_reason=NULL,
     status='active' 
   WHERE ...
   ```

4. Cancel academic leave queries:
   ```sql
   UPDATE students SET 
     academic_leave=false, 
     academic_leave_start=NULL, 
     academic_leave_end=NULL,
     academic_leave_reason=NULL,
     status='active' 
   WHERE ...
   ```

## Querying Students by Status

To retrieve students based on their status, use the `status` field in your queries:

```sql
-- Get all active students
SELECT * FROM students WHERE status = 'active';

-- Get all deregistered students  
SELECT * FROM students WHERE status = 'deregistered';

-- Get all students on academic leave
SELECT * FROM students WHERE status = 'on_leave';
```

An index has been created on the `status` field for efficient queries.

## API Examples

```javascript
// Get all students with a specific status
app.get('/students/status/:statusType', async (c) => {
  try {
    const statusType = c.req.param('statusType'); // 'active', 'deregistered', or 'on_leave'
    const { rows } = await pool.query(
      'SELECT * FROM students WHERE status = $1',
      [statusType]
    );
    return c.json(rows);
  } catch (error) {
    console.error('Error fetching students by status:', error);
    return c.json({ error: 'Failed to fetch students', details: error.message }, 500);
  }
});
```