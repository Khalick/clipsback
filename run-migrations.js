import { pool } from './db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  try {
    console.log('Starting database migrations...');
    
    // Create migrations table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    
    // Get list of applied migrations
    const { rows: appliedMigrations } = await pool.query('SELECT name FROM migrations');
    const appliedMigrationNames = appliedMigrations.map(m => m.name);
    
    // Read migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Sort to ensure migrations run in order
    
    // Run migrations that haven't been applied yet
    for (const file of migrationFiles) {
      if (!appliedMigrationNames.includes(file)) {
        console.log(`Running migration: ${file}`);
        
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        
        // Run the migration in a transaction
        await pool.query('BEGIN');
        try {
          await pool.query(sql);
          await pool.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
          await pool.query('COMMIT');
          console.log(`Migration ${file} applied successfully`);
        } catch (error) {
          await pool.query('ROLLBACK');
          console.error(`Error applying migration ${file}:`, error);
          throw error;
        }
      } else {
        console.log(`Migration ${file} already applied, skipping`);
      }
    }
    
    console.log('All migrations completed successfully!');
  } catch (error) {
    console.error('Error running migrations:', error);
    process.exit(1);
  }
}

// Run the migrations
runMigrations()
  .then(() => {
    console.log('Migration process completed.');
    process.exit(0);
  })
  .catch(err => {
    console.error('Migration process failed:', err);
    process.exit(1);
  });