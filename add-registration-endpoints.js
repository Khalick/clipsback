import { pool } from './db.js';

// Get units registered by a student using registration number
export async function addStudentUnitsByRegistrationEndpoint(app) {
  app.get('/students/registration/:regNumber/units', async (c) => {
    try {
      const registration_number = c.req.param('regNumber');
      console.log('Fetching units for student with registration number:', registration_number);
      
      // First get the student ID from registration number
      const studentResult = await pool.query(
        'SELECT id FROM students WHERE registration_number = $1',
        [registration_number]
      );
      
      if (studentResult.rows.length === 0) {
        return c.json({ error: 'Student not found' }, 404);
      }
      
      const student_id = studentResult.rows[0].id;
      
      // Then get the registered units using the student ID
      const { rows } = await pool.query(
        'SELECT * FROM registered_units WHERE student_id = $1',
        [student_id]
      );
      
      return c.json(rows);
    } catch (error) {
      console.error('Error fetching registered units for student by registration number:', error);
      return c.json({ error: 'Failed to fetch registered units', details: error.message }, 500);
    }
  });
}

// Apply the new endpoint to the app
export async function addRegistrationEndpoints() {
  const indexPath = process.cwd() + '/index.js';
  const fs = await import('fs');
  
  let content = fs.readFileSync(indexPath, 'utf8');
  
  // Add the new endpoint code
  const endpointCode = `
// Get units registered by a student using registration number
app.get('/students/registration/:regNumber/units', async (c) => {
  try {
    const registration_number = c.req.param('regNumber');
    console.log('Fetching units for student with registration number:', registration_number);
    
    // First get the student ID from registration number
    const studentResult = await pool.query(
      'SELECT id FROM students WHERE registration_number = $1',
      [registration_number]
    );
    
    if (studentResult.rows.length === 0) {
      return c.json({ error: 'Student not found' }, 404);
    }
    
    const student_id = studentResult.rows[0].id;
    
    // Then get the registered units using the student ID
    const { rows } = await pool.query(
      'SELECT * FROM registered_units WHERE student_id = $1',
      [student_id]
    );
    
    return c.json(rows);
  } catch (error) {
    console.error('Error fetching registered units for student by registration number:', error);
    return c.json({ error: 'Failed to fetch registered units', details: error.message }, 500);
  }
});`;

  // Find a good place to insert the new endpoint
  const insertPoint = content.indexOf('// Get units registered by a student');
  
  if (insertPoint !== -1) {
    // Insert before the existing endpoint
    content = content.slice(0, insertPoint) + endpointCode + '\n\n' + content.slice(insertPoint);
  } else {
    // If we can't find the existing endpoint, add it near the end
    const endPoint = content.lastIndexOf('export { app };');
    if (endPoint !== -1) {
      content = content.slice(0, endPoint) + endpointCode + '\n\n' + content.slice(endPoint);
    } else {
      // Just append to the end
      content += '\n\n' + endpointCode;
    }
  }
  
  // Write the updated content back to the file
  fs.writeFileSync(indexPath + '.updated', content);
  
  console.log('Added registration number endpoint to index.js.updated');
  console.log('Review the changes and rename the file to index.js if they look good.');
}