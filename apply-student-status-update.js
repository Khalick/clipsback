import { pool } from './db.js';
import fs from 'fs';
import path from 'path';

async function applyMigration() {
  try {
    console.log('Applying student status update migration...');
    
    const migrationFile = path.join(process.cwd(), 'migrations', 'update_student_status.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');
    
    await pool.query(sql);
    
    console.log('Migration applied successfully!');
    
    // Verify the changes
    const { rows } = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
        COUNT(CASE WHEN status = 'deregistered' THEN 1 END) as deregistered,
        COUNT(CASE WHEN status = 'on_leave' THEN 1 END) as on_leave
      FROM students
    `);
    
    console.log('Student status counts:', rows[0]);
    
    process.exit(0);
  } catch (error) {
    console.error('Error applying migration:', error);
    process.exit(1);
  }
}

applyMigration();