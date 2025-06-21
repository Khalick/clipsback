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
});