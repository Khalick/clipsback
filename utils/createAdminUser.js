import { pool } from '../db.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

async function createAdminUser() {
  const username = process.argv[2] || 'admin';
  const password = process.argv[3] || 'admin123';

  if (!username || !password) {
    console.error('Usage: node createAdminUser.js [username] [password]');
    process.exit(1);
  }

  try {
    // Check if admin already exists
    const { rows } = await pool.query('SELECT * FROM admins WHERE username = $1', [username]);
    
    if (rows.length > 0) {
      console.log(`Admin user '${username}' already exists. Use a different username or delete the existing user.`);
      process.exit(0);
    }

    // Hash the password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Insert the admin user
    await pool.query(
      'INSERT INTO admins (username, password_hash) VALUES ($1, $2) RETURNING id',
      [username, passwordHash]
    );

    console.log(`Admin user '${username}' created successfully!`);
    process.exit(0);
  } catch (error) {
    console.error('Error creating admin user:', error);
    process.exit(1);
  }
}

createAdminUser();