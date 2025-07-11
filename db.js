import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config();

// Create a postgres client using the postgres package with improved connection options
export const sql = postgres(process.env.DATABASE_URL, {
  ssl: { 
    rejectUnauthorized: false // Accept self-signed certificates from Aiven
  },
  max: 10, // Maximum number of connections
  idle_timeout: 30, // Close idle connections after 30 seconds
  connect_timeout: 15, // Increased connection timeout for cloud environments
  connection: {
    application_name: 'student-portal' // Application name for connection
  },
  // Add retry logic for cloud environments
  onnotice: () => {}, // Suppress notices
  debug: (connection, query, params, types) => {
    // Only log in development
    if (process.env.NODE_ENV !== 'production') {
      console.log('DB Query:', query);
    }
  }
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
      console.error('Query:', text);
      console.error('Parameters:', params);
      console.error('Error details:', error.message);
      throw error;
    }
  }
};