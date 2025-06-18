import { pool } from './db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  try {
    console.log('Running migration: add_password_to_students.sql');
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', 'add_password_to_students.sql'), 'utf8');
    
    // Split SQL into separate statements to handle errors individually
    const statements = sql.split(';').filter(stmt => stmt.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await pool.query(statement + ';');
          console.log('Executed statement successfully');
        } catch (err) {
          console.log(`Statement skipped (might already exist): ${err.message}`);
        }
      }
    }
    
    console.log('Migration completed');
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

runMigration();