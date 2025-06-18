import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config();

// Create a postgres client using the postgres package
export const sql = postgres(process.env.DATABASE_URL, {
  ssl: { rejectUnauthorized: false } // Set to false to accept self-signed certificates
});

// Export a wrapper to maintain compatibility with existing code that uses pool.query
export const pool = {
  query: async (text, params = []) => {
    try {
      // The postgres package returns results directly as an array
      // We need to wrap it in a { rows: [] } structure to match pg interface
      const result = await sql.unsafe(text, params);
      return { rows: result };
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }
};