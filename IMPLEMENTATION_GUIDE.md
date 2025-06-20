# Student Status Implementation Guide

This guide explains how to implement the student status changes in the database.

## Quick Implementation

For the quickest implementation, follow these steps:

1. **Apply the database migration**

   ```bash
   node apply-status-migration.js
   ```

2. **Update the index.js file automatically**

   ```bash
   node update-student-status.js
   ```

That's it! The system will now track student status in the database.

## Manual Implementation

If you prefer to implement the changes manually:

1. **Apply the database migration**

   ```bash
   node apply-status-migration.js
   ```

2. **Update the endpoints in index.js**

   Follow the instructions in `status-patches.txt` to update all the relevant endpoints.

## Status Values

The status field can have the following values:
- `active` - Default status for registered students
- `deregistered` - For deregistered students
- `on_leave` - For students on academic leave

## Testing

After implementation, test the following scenarios:

1. Deregistering a student should set status to 'deregistered'
2. Granting academic leave should set status to 'on_leave'
3. Reregistering a student should set status to 'active'
4. Canceling academic leave should set status to 'active'