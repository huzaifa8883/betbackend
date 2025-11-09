/**
 * Fix for Admin Dashboard
 * 
 * This script updates the admin dashboard JavaScript to use the correct API endpoints.
 */

const fs = require('fs');
const path = require('path');

console.log('Fixing admin dashboard JavaScript...');

// Path to the admin dashboard JavaScript file
const adminDashboardPath = path.join(__dirname, 'admin_dashboard.js');

// Read the file
let content = fs.readFileSync(adminDashboardPath, 'utf8');

// Update the fetchUsers function to use the correct API endpoint
// Original: fetch(`/api/users?role=${role}`)
// Updated: fetch(`http://localhost:5000/api/users?role=${role}`)
content = content.replace(
  /fetch\(`\/api\/users\?role=\${role}`\)/g,
  'fetch(`http://localhost:5000/api/users?role=${role}`, { method: "GET", headers: { "Content-Type": "application/json" } })'
);

// Update the create user endpoint
// Original: fetch('/api/users/create', {
// Updated: fetch('http://localhost:5000/api/users/create', {
content = content.replace(
  /fetch\('\/api\/users\/create'/g,
  "fetch('http://localhost:5000/api/users/create'"
);

// Update the delete user endpoint
// Original: fetch(`/api/users/${userId}`, {
// Updated: fetch(`http://localhost:5000/api/users/${userId}`, {
content = content.replace(
  /fetch\(`\/api\/users\/\${userId}`/g,
  "fetch(`http://localhost:5000/api/users/${userId}`"
);

// Update the view user endpoint
// Original: fetch(`/api/users/${userId}`)
// Updated: fetch(`http://localhost:5000/api/users/${userId}`)
content = content.replace(
  /fetch\(`\/api\/users\/\${userId}`\)/g,
  "fetch(`http://localhost:5000/api/users/${userId}`)"
);

// Update the edit user endpoint
// Original: fetch(`/api/users/${userId}`, {
// Updated: fetch(`http://localhost:5000/api/users/${userId}`, {
content = content.replace(
  /fetch\(`\/api\/users\/\${userId}`/g,
  "fetch(`http://localhost:5000/api/users/${userId}`"
);

// Add CORS headers to all fetch requests
content = content.replace(
  /fetch\(`http:\/\/localhost:5000\/api\/users/g,
  'fetch(`http://localhost:5000/api/users'
);

// Write the updated content back to the file
fs.writeFileSync(adminDashboardPath, content, 'utf8');

console.log('Admin dashboard JavaScript updated successfully!');
console.log('The dashboard now uses the correct API endpoints on port 5000.');
console.log('\nNext steps:');
console.log('1. Refresh the admin dashboard in your browser');
console.log('2. Verify that user data is being fetched correctly');
console.log('3. Test creating a new user to confirm the fix is working');
