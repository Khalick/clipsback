import { pool } from './db.js';
import fs from 'fs';
import path from 'path';

async function applyMigration() {
  try {
    console.log('Applying status field migration...');
    
    const migrationFile = path.join(process.cwd(), 'migrations', 'add_status_field.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');
    
    await pool.query(sql);
    
    console.log('Migration applied successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error applying migration:', error);
    process.exit(1);
  }
}

applyMigration();