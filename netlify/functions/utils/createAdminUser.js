// Utility script to create an admin user
import { sql } from '../db.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

async function createAdminUser(username, password) {
  try {
    console.log(`Creating admin user: ${username}`);
    
    // Check if user already exists
    const checkResult = await sql`SELECT * FROM admins WHERE username = ${username}`;
    
    if (checkResult && checkResult.length > 0) {
      console.log(`Admin user '${username}' already exists.`);
      return;
    }
    
    // Hash the password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    // Insert the new admin
    const result = await sql`
      INSERT INTO admins (username, password_hash) 
      VALUES (${username}, ${passwordHash}) 
      RETURNING *
    `;
    
    console.log('Admin user created successfully');
    return result;
  } catch (error) {
    console.error('Error creating admin user:', error);
    throw error;
  }
}

// Self-invoking function to allow top-level await
(async () => {
  try {
    // Initialize tables first to ensure the admins table exists
    console.log('Ensuring database tables exist...');
      // Create extension for UUID generation if it doesn't exist
    await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
    
    // Create admins table if it doesn't exist
    await sql`
      CREATE TABLE IF NOT EXISTS admins (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(255) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL
      )
    `;
    console.log('Admins table checked/created.');
    
    // Create admin user with username "Admin" and password "Admin123"
    await createAdminUser('Admin', 'Admin123');
    console.log('Admin user creation process completed.');
    process.exit(0);
  } catch (error) {
    console.error('Failed to create admin user:', error);
    process.exit(1);
  }
})();
