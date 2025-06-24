-- Create student_documents table for unified document management
CREATE TABLE IF NOT EXISTS student_documents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    registration_number VARCHAR(50) NOT NULL,
    document_type VARCHAR(50) NOT NULL,
    file_url TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size INTEGER NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_student_documents_registration ON student_documents(registration_number);
CREATE INDEX IF NOT EXISTS idx_student_documents_type ON student_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_student_documents_uploaded ON student_documents(uploaded_at);

-- Add a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_student_documents_updated_at ON student_documents;
CREATE TRIGGER update_student_documents_updated_at
    BEFORE UPDATE ON student_documents
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
