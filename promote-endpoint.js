// Promote students endpoint
app.post('/students/promote', async (c) => {
  try {
    const body = await c.req.json();
    console.log('Student promotion request received:', body);
    
    // Check if we have student IDs or registration numbers
    const student_ids = body.student_ids || body.studentIds || [];
    const registration_numbers = body.registration_numbers || body.registrationNumbers || [];
    const new_level = body.new_level || body.newLevel;
    
    if ((!student_ids || student_ids.length === 0) && 
        (!registration_numbers || registration_numbers.length === 0)) {
      return c.json({ 
        error: 'Missing required field', 
        details: 'Student IDs or registration numbers are required' 
      }, 400);
    }
    
    if (!new_level) {
      return c.json({ 
        error: 'Missing required field', 
        details: 'New level of study is required' 
      }, 400);
    }
    
    let results = [];
    
    // Promote by student IDs
    if (student_ids && student_ids.length > 0) {
      const { rows } = await pool.query(
        `UPDATE students SET 
          level_of_study=$1
        WHERE id = ANY($2) RETURNING *`,
        [new_level, student_ids]
      );
      results = results.concat(rows);
    }
    
    // Promote by registration numbers
    if (registration_numbers && registration_numbers.length > 0) {
      const { rows } = await pool.query(
        `UPDATE students SET 
          level_of_study=$1
        WHERE registration_number = ANY($2) RETURNING *`,
        [new_level, registration_numbers]
      );
      results = results.concat(rows);
    }
    
    return c.json({ 
      message: `${results.length} students promoted successfully`, 
      students: results 
    });
  } catch (error) {
    console.error('Error promoting students:', error);
    return c.json({ 
      error: 'Failed to promote students', 
      details: error.message 
    }, 500);
  }
});