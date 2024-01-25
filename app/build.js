// Description: Build script for the Next.js app
// Usage: node build.js

const fs = require('fs');
const {spawn} = require('child_process');
const path = require('path');
const chardet = require('chardet');
const iconv = require('iconv-lite');

// Ensure the HEAD file exists
const headFilePath = path.join(__dirname, 'HEAD');
let headContent;

try {
    // Detect the encoding of the HEAD file
    const encoding = chardet.detectFileSync(headFilePath);
    const buffer = fs.readFileSync(headFilePath);

    // Decode the buffer into a string
    headContent = iconv.decode(buffer, encoding).trim();

    // Filter out non-alphanumeric characters
    headContent = headContent.replace(/[^a-zA-Z0-9]/g, '');
    console.info(' ✓ HEAD file exists, Build ID:', headContent);
} catch (error) {
    console.error(' ✗ Error reading HEAD file:', error);
    process.exit(1);
}

// Set environment variables
process.env.GIT_COMMIT = headContent;
process.env.NEXT_PUBLIC_BUILD_STAGE = 'true';

console.info(' ✓ Environment variables set');
console.info(' ✓ Starting build...');

// Start the build
const build = spawn('next', ['build'], {
    stdio: 'inherit',
    env: process.env,
    shell: true
});

build.on('close', (code) => {
    if (code !== 0) {
        console.error(`\n ✗ Build process exited with code ${code}`);
        process.exit(code);
    } else {
        console.info('\n ✓ Build process exited with code 0');
        process.exit(0);
    }
});
