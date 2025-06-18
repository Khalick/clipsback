import { initializeTables } from './utils/initDb.js';

// This script is used to initialize the database tables
// It's meant to be run once during setup or deployment
console.log('Starting database initialization...');

initializeTables()
  .then(() => {
    console.log('Database tables successfully initialized!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
