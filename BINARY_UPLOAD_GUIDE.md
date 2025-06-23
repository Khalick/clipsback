# Binary File Upload Guide

This guide explains how to upload files as binary data instead of using multipart/form-data in the CLIPS College backend.

## Overview

The application now supports two methods for file uploads:
1. **Binary Upload (Preferred)** - Send files as raw binary data with metadata in headers/query parameters
2. **Multipart Form Data (Legacy)** - Traditional form-based uploads (still supported for backward compatibility)

## Binary Upload Advantages

- **Simpler implementation** - No need to handle multipart parsing
- **Better performance** - Direct binary transfer without encoding overhead
- **More reliable** - Avoids multipart boundary parsing issues
- **Mobile-friendly** - Easier to implement in mobile applications

## Supported Endpoints

### Exam Card Uploads

#### 1. Binary Upload to `/exam-cards/upload`
```http
POST /exam-cards/upload
Content-Type: application/octet-stream
X-Registration-Number: STU001
X-Filename: exam_card.pdf

[Binary file data]
```

Query parameter alternative:
```http
POST /exam-cards/upload?registration_number=STU001&filename=exam_card.pdf
Content-Type: application/pdf

[Binary file data]
```

#### 2. Binary Upload to `/students/registration/{regNumber}/upload-exam-card`
```http
POST /students/registration/STU001/upload-exam-card
Content-Type: application/pdf
X-Filename: exam_card.pdf

[Binary file data]
```

### Student Photo Uploads

#### 1. Binary Upload to `/students` (with student data)
```http
POST /students
Content-Type: image/jpeg
X-Registration-Number: STU001
X-Name: John Doe
X-Course: Computer Science
X-Level-Of-Study: Undergraduate
X-Email: john@example.com
X-Filename: photo.jpg

[Binary image data]
```

Query parameter alternative:
```http
POST /students?registration_number=STU001&name=John%20Doe&course=Computer%20Science&level_of_study=Undergraduate
Content-Type: image/jpeg

[Binary image data]
```

## Implementation Examples

### JavaScript/Fetch API

```javascript
// Upload exam card as binary
const uploadExamCard = async (registrationNumber, fileData, filename) => {
  const response = await fetch('/exam-cards/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Registration-Number': registrationNumber,
      'X-Filename': filename
    },
    body: fileData // ArrayBuffer or Uint8Array
  });
  
  return await response.json();
};

// Upload student photo with data
const createStudentWithPhoto = async (studentData, photoData) => {
  const response = await fetch('/students', {
    method: 'POST',
    headers: {
      'Content-Type': 'image/jpeg',
      'X-Registration-Number': studentData.registration_number,
      'X-Name': studentData.name,
      'X-Course': studentData.course,
      'X-Level-Of-Study': studentData.level_of_study,
      'X-Email': studentData.email,
      'X-Filename': 'student_photo.jpg'
    },
    body: photoData // ArrayBuffer or Uint8Array
  });
  
  return await response.json();
};

// Reading file as binary
const fileInput = document.getElementById('fileInput');
const file = fileInput.files[0];
const arrayBuffer = await file.arrayBuffer();

// Upload the file
await uploadExamCard('STU001', arrayBuffer, file.name);
```

### Python/Requests

```python
import requests

def upload_exam_card_binary(registration_number, file_path, filename):
    with open(file_path, 'rb') as file:
        file_data = file.read()
    
    headers = {
        'Content-Type': 'application/octet-stream',
        'X-Registration-Number': registration_number,
        'X-Filename': filename
    }
    
    response = requests.post(
        'https://your-domain.com/exam-cards/upload',
        headers=headers,
        data=file_data
    )
    
    return response.json()

# Usage
result = upload_exam_card_binary('STU001', '/path/to/exam_card.pdf', 'exam_card.pdf')
```

### cURL

```bash
# Upload exam card
curl -X POST "https://your-domain.com/exam-cards/upload" \
  -H "Content-Type: application/pdf" \
  -H "X-Registration-Number: STU001" \
  -H "X-Filename: exam_card.pdf" \
  --data-binary @exam_card.pdf

# Upload student with photo using query parameters
curl -X POST "https://your-domain.com/students?registration_number=STU001&name=John%20Doe&course=Computer%20Science&level_of_study=Undergraduate" \
  -H "Content-Type: image/jpeg" \
  --data-binary @student_photo.jpg
```

## Content Type Support

### Exam Cards
- `application/pdf` - PDF documents
- `image/jpeg`, `image/png`, `image/gif` - Image files
- `application/msword` - Word documents
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` - DOCX files
- `application/octet-stream` - Generic binary data

### Photos
- `image/jpeg` - JPEG images
- `image/png` - PNG images
- `image/gif` - GIF images
- `application/octet-stream` - Generic binary data

## Metadata Options

You can provide metadata via:

### HTTP Headers (Recommended)
- `X-Registration-Number` - Student registration number
- `X-Name` - Student name
- `X-Course` - Student course
- `X-Level-Of-Study` - Student level of study
- `X-Email` - Student email
- `X-National-Id` - National ID
- `X-Birth-Certificate` - Birth certificate
- `X-Date-Of-Birth` - Date of birth (YYYY-MM-DD)
- `X-Password` - Password
- `X-Filename` - Original filename

### Query Parameters
- `registration_number` - Student registration number
- `name` - Student name
- `course` - Student course
- `level_of_study` - Student level of study
- `email` - Student email
- `national_id` - National ID
- `birth_certificate` - Birth certificate
- `date_of_birth` - Date of birth
- `password` - Password
- `filename` - Original filename

## Response Format

### Successful Upload
```json
{
  "message": "Binary file uploaded successfully",
  "file_url": "https://storage.supabase.co/...",
  "registration_number": "STU001",
  "upload_path": "exam_cards/STU001_1234567890_exam_card.pdf",
  "expires_in_seconds": 31536000,
  "file_size": 1024768
}
```

### Error Response
```json
{
  "error": "Missing registration number",
  "details": "Registration number must be provided via query parameter or x-registration-number header"
}
```

## Migration from Multipart

### Before (Multipart)
```javascript
const formData = new FormData();
formData.append('registration_number', 'STU001');
formData.append('file', fileInput.files[0]);

fetch('/exam-cards/upload', {
  method: 'POST',
  body: formData
});
```

### After (Binary)
```javascript
const file = fileInput.files[0];
const arrayBuffer = await file.arrayBuffer();

fetch('/exam-cards/upload', {
  method: 'POST',
  headers: {
    'Content-Type': file.type,
    'X-Registration-Number': 'STU001',
    'X-Filename': file.name
  },
  body: arrayBuffer
});
```

## Troubleshooting

### Common Issues

1. **Missing Content-Type**: Ensure you set the correct Content-Type header
2. **Missing Metadata**: Provide registration number via header or query parameter
3. **File Size**: Check file size limits on your hosting platform
4. **Binary Encoding**: Ensure you're sending raw binary data, not base64 encoded

### Debugging

Enable debug logging to see request details:
- Check server logs for content-type detection
- Verify binary data size in logs
- Check for metadata parsing errors

### Legacy Support

If binary uploads don't work, you can still use the multipart/form-data method. All endpoints support both formats for backward compatibility.

## Best Practices

1. **Use appropriate Content-Type** - Set the correct MIME type for your files
2. **Provide filename** - Include original filename for better organization
3. **Handle errors** - Check response status and error messages
4. **File validation** - Validate file types and sizes on the client side
5. **Progress tracking** - For large files, consider implementing upload progress tracking

## File Size Limits

- Default limit: 50MB (can be configured in Supabase)
- Recommended: Keep files under 10MB for better performance
- Large files: Consider chunked uploads for files > 50MB
