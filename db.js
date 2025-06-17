import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config();

// Create a postgres client using the postgres package
export const sql = postgres(process.env.DATABASE_URL, {
  ssl: { rejectUnauthorized: false } // Set to false to accept self-signed certificates
});

// Export a wrapper to maintain compatibility with existing code that uses pool.query
export const pool = {
  query: (text, params) => {
    // Convert pg style queries to postgres style
    return sql.unsafe(text, params);
  }
};
