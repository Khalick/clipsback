// Promote students endpoint
app.post('/students/promote', async (c) => {
  try {
    const body = await c.req.json();
    console.log('Student promotion request received:', body);
    
    // Only accept registration_number and new_level
    const registration_number = body.registration_number;
    const new_level = body.new_level;
    
    console.log('Parsed promotion data:', {
      registration_number,
      new_level
    });
    
    if (!registration_number) {
      return c.json({ 
        error: 'Missing required field', 
        details: 'Registration number is required. Please provide "registration_number" in your request.'
      }, 400);
    }
    
    if (!new_level) {
      return c.json({ 
        error: 'Missing required field', 
        details: 'New level of study is required. Please provide "new_level" with the target level of study.' 
      }, 400);
    }
    
    // Promote by registration number
    console.log('Promoting student by registration number:', registration_number);
    const { rows } = await pool.query(
      `UPDATE students SET 
        level_of_study=$1
      WHERE registration_number = $2 RETURNING *`,
      [new_level, registration_number]
    );
    
    if (rows.length === 0) {
      return c.json({
        error: 'Student not found',
        details: `No student found with registration number: ${registration_number}`
      }, 404);
    }
    
    return c.json({ 
      message: 'Student promoted successfully', 
      student: rows[0] 
    });
  } catch (error) {
    console.error('Error promoting students:', error);
    return c.json({ 
      error: 'Failed to promote students', 
      details: error.message 
    }, 500);
  }
});