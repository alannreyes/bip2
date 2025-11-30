/**
 * Generate Admin Token for BIP2 RTI System
 *
 * Usage:
 *   npx ts-node scripts/generate-admin-token.ts
 *   npx ts-node scripts/generate-admin-token.ts --expires 30d
 *   npx ts-node scripts/generate-admin-token.ts --username customuser
 *
 * Environment Variables:
 *   JWT_SECRET - Secret key for signing tokens (required in production)
 */

import * as jwt from 'jsonwebtoken';

// Parse command line arguments
const args = process.argv.slice(2);
let expiresIn = '7d';
let username = 'admin';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--expires' && args[i + 1]) {
    expiresIn = args[i + 1];
    i++;
  }
  if (args[i] === '--username' && args[i + 1]) {
    username = args[i + 1];
    i++;
  }
}

// Get secret from environment or use default (warn if using default)
const secret = process.env.JWT_SECRET || 'bip2-default-secret-change-in-production';

if (!process.env.JWT_SECRET) {
  console.warn('\n⚠️  WARNING: Using default JWT secret. Set JWT_SECRET environment variable in production!\n');
}

// Generate token payload
const payload = {
  sub: 'admin-001',
  username: username,
  role: 'admin',
};

// Sign token with 7 days expiration (604800 seconds)
const expirationSeconds = expiresIn === '7d' ? 604800 : expiresIn === '30d' ? 2592000 : 604800;
const token = jwt.sign(payload, secret, { expiresIn: expirationSeconds });

// Decode to show expiration
const decoded = jwt.decode(token) as jwt.JwtPayload;
const expirationDate = decoded?.exp ? new Date(decoded.exp * 1000) : null;

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║          BIP2 RTI System - Admin Token Generator              ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

console.log('Token Details:');
console.log(`  Username: ${username}`);
console.log(`  Role: admin`);
console.log(`  Expires In: ${expiresIn}`);
console.log(`  Expiration Date: ${expirationDate?.toISOString()}\n`);

console.log('JWT Token:');
console.log('────────────────────────────────────────────────────────────────────');
console.log(token);
console.log('────────────────────────────────────────────────────────────────────\n');

console.log('Usage in HTTP Headers:');
console.log(`  Authorization: Bearer ${token.substring(0, 50)}...\n`);

console.log('Example curl command:');
console.log(`  curl -H "Authorization: Bearer ${token.substring(0, 30)}..." http://localhost:3001/api/prompts\n`);

console.log('Postman Setup:');
console.log('  1. Go to Authorization tab');
console.log('  2. Select "Bearer Token"');
console.log('  3. Paste the token above\n');
