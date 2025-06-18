// Deploy check utility
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

// Check for SQL files
console.log('Checking for SQL files in functions directory:');
try {
  const files = fs.readdirSync(_dirname);
  console.log('Files in functions directory:', files);
  
  // Check for specific SQL files
  const sqlFiles = files.filter(file => file.endsWith('.sql'));
  console.log('SQL files found:', sqlFiles);

  // Check utils directory
  console.log('\nChecking utils directory:');
  const utilsDirPath = path.join(_dirname, 'utils');
  if (fs.existsSync(utilsDirPath)) {
    const utilsFiles = fs.readdirSync(utilsDirPath);
    console.log('Files in utils directory:', utilsFiles);
  } else {
    console.log('Utils directory not found!');
  }
} catch (error) {
  console.error('Error checking files:', error);
}
