// Initialize database tables
import { pool } from '../db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Execute SQL files to create database tables
 */
export async function initializeTables() {
  try {
    console.log('Initializing database tables...');
    
    // Create extension for UUID generation
    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
    
    // Order matters for table creation due to foreign key constraints
    const tableFiles = [
      'create_students_table.sql',
      'create_admins_table.sql',
      'create_units_table.sql',
      'create_exam_cards_table.sql',
      'create_fees_table.sql',
      'create_finance_table.sql',
      'create_registered_units_table.sql',
      'create_results_table.sql',
      'create_timetables_table.sql'
    ];
    
    for (const file of tableFiles) {
      const filePath = path.join(__dirname, '..', file);
      const sql = fs.readFileSync(filePath, 'utf8');
      await pool.query(sql);
      console.log(`Created table from ${file}`);
    }
    
    console.log('Database initialization complete');
    return true;
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}
