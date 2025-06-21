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
        
        const sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        
        try {
          // Import the sql client directly for transaction support
          const { sql: sqlClient } = await import('./db.js');
          
          // Split the SQL file by semicolons to execute statements individually
          // but preserve function and trigger definitions that contain semicolons
          let statements = [];
          let currentStatement = '';
          let inFunction = false;
          
          // Simple parsing to handle function/procedure definitions
          for (const line of sqlContent.split('\n')) {
            // Check if we're entering a function/procedure definition
            if (line.includes('CREATE FUNCTION') || line.includes('CREATE PROCEDURE') || 
                line.includes('CREATE OR REPLACE FUNCTION') || line.includes('CREATE OR REPLACE PROCEDURE')) {
              inFunction = true;
            }
            
            currentStatement += line + '\n';
            
            // If we're in a function definition and see the end of it (language specifier)
            if (inFunction && line.trim().match(/LANGUAGE\s+[a-z]+;$/i)) {
              statements.push(currentStatement.trim());
              currentStatement = '';
              inFunction = false;
              continue;
            }
            
            // If we're not in a function and have a statement terminator
            if (!inFunction && line.trim().endsWith(';')) {
              statements.push(currentStatement.trim());
              currentStatement = '';
            }
          }
          
          // Catch any remaining statements
          if (currentStatement.trim()) {
            statements.push(currentStatement.trim());
          }
          
          // Filter out empty statements
          statements = statements.filter(s => s.trim() !== '');
          
          // Execute each statement in a transaction
          await sqlClient.begin(async sqlTx => {
            for (const statement of statements) {
              if (statement.trim()) {
                try {
                  await sqlTx.unsafe(statement);
                } catch (statementError) {
                  console.error(`Error executing statement: ${statement.substring(0, 100)}...`);
                  throw statementError;
                }
              }
            }
            
            await sqlTx.unsafe('INSERT INTO migrations (name) VALUES ($1)', [file]);
          });
          
          console.log(`Migration ${file} applied successfully`);
        } catch (error) {
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