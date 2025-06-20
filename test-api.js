import fetch from 'node-fetch';

async function testStudentsAPI() {
  try {
    console.log('Testing the students API endpoint...');
    
    // Get the server URL from environment or use default
    const serverUrl = process.env.SERVER_URL || 'http://localhost:3000';
    
    console.log(`Connecting to server at: ${serverUrl}`);
    console.log('Fetching students...');
    
    const response = await fetch(`${serverUrl}/students`);
    
    if (!response.ok) {
      console.error(`API request failed with status: ${response.status}`);
      const errorText = await response.text();
      console.error(`Error response: ${errorText}`);
      return;
    }
    
    const students = await response.json();
    
    console.log(`API returned ${students.length} students:`);
    students.forEach(student => {
      console.log(`- ${student.name} (${student.registration_number}): ${student.course}`);
    });
    
  } catch (error) {
    console.error('Error testing API:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('Could not connect to the server. Make sure the server is running.');
      console.log('Start the server with: node index.js');
    }
  }
}

// Run the test
testStudentsAPI();