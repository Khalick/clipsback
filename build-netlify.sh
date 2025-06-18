#!/bin/bash
set -e

# This script prepares the Netlify Functions deployment

echo "Preparing Netlify Functions deployment..."

# Create the functions directory if it doesn't exist
mkdir -p netlify/functions

# Copy necessary files to the functions directory
echo "Copying package.json..."
cp package.json netlify/functions/

echo "Copying db.js..."
cp db.js netlify/functions/

# Copy the utils directory and its contents
echo "Copying utils directory..."
mkdir -p netlify/functions/utils
cp -r utils/* netlify/functions/utils/

# Copy SQL files for database initialization
echo "Copying SQL files..."
cp create_*.sql netlify/functions/

echo "Setup complete!"
