import { pool } from './db.js';

// Update student status when deregistering
export async function deregisterStudent(id, reason = '') {
  const today = new Date().toISOString().split('T')[0];
  
  const { rows } = await pool.query(
    `UPDATE students SET 
      deregistered=true, 
      deregistration_date=$1, 
      deregistration_reason=$2,
      status='deregistered' 
    WHERE id=$3 RETURNING *`,
    [today, reason, id]
  );
  
  return rows[0];
}

// Update student status when granting academic leave
export async function grantAcademicLeave(id, startDate, endDate, reason = '') {
  const { rows } = await pool.query(
    `UPDATE students SET 
      academic_leave=true, 
      academic_leave_start=$1, 
      academic_leave_end=$2,
      academic_leave_reason=$3,
      status='on_leave' 
    WHERE id=$4 RETURNING *`,
    [startDate, endDate, reason, id]
  );
  
  return rows[0];
}

// Update student status when reregistering
export async function reregisterStudent(id) {
  const { rows } = await pool.query(
    `UPDATE students SET 
      deregistered=false, 
      deregistration_date=NULL, 
      deregistration_reason=NULL,
      status='active' 
    WHERE id=$1 RETURNING *`,
    [id]
  );
  
  return rows[0];
}

// Update student status when canceling academic leave
export async function cancelAcademicLeave(id) {
  const { rows } = await pool.query(
    `UPDATE students SET 
      academic_leave=false, 
      academic_leave_start=NULL, 
      academic_leave_end=NULL,
      academic_leave_reason=NULL,
      status='active' 
    WHERE id=$1 RETURNING *`,
    [id]
  );
  
  return rows[0];
}