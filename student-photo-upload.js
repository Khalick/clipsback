// Create a new student with photo upload
app.post('/students/with-photo', async (c) => {
  try {
    console.log('Received student registration with photo');
    
    // Parse the multipart form data
    const formData = await c.req.parseBody();
    console.log('Form data keys:', Object.keys(formData));
    
    // Extract student data
    const registration_number = formData.registration_number || '';
    const name = formData.name || '';
    const course = formData.course || '';
    const level_of_study = formData.level_of_study || '';
    const national_id = formData.national_id || null;
    const birth_certificate = formData.birth_certificate || null;
    const date_of_birth = formData.date_of_birth || null;
    const password = formData.password || null;
    const email = formData.email || null;
    
    // Validate required fields
    if (!registration_number || !name || !course || !level_of_study) {
      return c.json({ 
        error: 'Missing required fields', 
        details: 'Registration number, name, course, and level of study are required' 
      }, 400);
    }
    
    // Handle photo upload
    let photo_url = null;
    const photo = formData.photo;
    
    if (photo && photo.data) {
      console.log('Photo received, uploading to storage');
      const fileName = `Student_photos/${registration_number}_${Date.now()}_${photo.name}`;
      
      try {
        const { data, error } = await supabase.storage
          .from('clipstech')
          .upload(fileName, photo.data, { contentType: photo.type });
          
        if (error) {
          console.error('Error uploading photo:', error);
          return c.json({ error: 'Failed to upload photo', details: error.message }, 500);
        }
        
        // Get the public URL
        const { data: urlData } = supabase.storage
          .from('clipstech')
          .getPublicUrl(fileName);
          
        photo_url = urlData.publicUrl;
        console.log('Photo uploaded successfully:', photo_url);
      } catch (uploadError) {
        console.error('Exception during photo upload:', uploadError);
        return c.json({ error: 'Failed to upload photo', details: uploadError.message }, 500);
      }
    }
    
    // Determine default password if not provided
    let finalPassword = password;
    if (!finalPassword) {
      // Use national_id or birth_certificate as password
      if (national_id) {
        finalPassword = national_id;
      } else if (birth_certificate) {
        finalPassword = birth_certificate;
      } else {
        finalPassword = 'defaultpassword';
      }
    }
    
    // Hash the password before storing
    const hashedPassword = await bcrypt.hash(finalPassword, 10);
    
    // Format date properly for database
    let formattedDate = null;
    if (date_of_birth) {
      try {
        const dateObj = new Date(date_of_birth);
        if (!isNaN(dateObj.getTime())) {
          formattedDate = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD format
        }
      } catch (err) {
        console.error('Error formatting date:', err);
      }
    }
    
    console.log('Inserting student with data:', {
      registration_number,
      name,
      course,
      level_of_study,
      photo_url,
      national_id,
      birth_certificate,
      date_of_birth: formattedDate,
      email,
      password: 'HASHED'
    });
    
    const { rows } = await pool.query(
      `INSERT INTO students (
        registration_number, name, course, level_of_study, photo_url,
        national_id, birth_certificate, date_of_birth, password, email, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        registration_number, name, course, level_of_study, photo_url,
        national_id, birth_certificate, formattedDate, hashedPassword, email, 'active'
      ]
    );
    
    return c.json({
      message: 'Student created successfully',
      student: rows[0]
    });
  } catch (error) {
    console.error('Error creating student with photo:', error);
    return c.json({ 
      error: 'Failed to create student', 
      details: error.message,
      stack: error.stack
    }, 500);
  }
});