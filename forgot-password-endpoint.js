// Forgot password endpoint
app.post('/student/auth/forgot-password', async (c) => {
  try {
    const { registration_number, email } = await c.req.json();
    
    if (!registration_number || !email) {
      return c.json({ 
        error: 'Missing required fields', 
        details: 'Registration number and email are required' 
      }, 400);
    }
    
    // Check if student exists with matching registration number and email
    const { rows } = await pool.query(
      'SELECT * FROM students WHERE registration_number = $1 AND email = $2',
      [registration_number, email]
    );
    
    if (rows.length === 0) {
      return c.json({ 
        error: 'Invalid credentials', 
        details: 'No student found with the provided registration number and email' 
      }, 404);
    }
    
    // Generate a temporary password
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    
    // Update the student's password
    await pool.query(
      'UPDATE students SET password = $1 WHERE id = $2',
      [hashedPassword, rows[0].id]
    );
    
    // In a real application, you would send an email with the temporary password
    // For this implementation, we'll just return it in the response
    return c.json({ 
      message: 'Password reset successful', 
      temp_password: tempPassword,
      note: 'In a production environment, this would be sent via email instead of being returned in the response'
    });
  } catch (error) {
    console.error('Error in forgot password:', error);
    return c.json({ 
      error: 'Failed to process password reset', 
      details: error.message 
    }, 500);
  }
});