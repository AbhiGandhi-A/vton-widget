import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function handler(req, res) {
  // Determine the file path: 'index.html' for root '/', otherwise the requested URL path
  const filePath = path.join(__dirname, '..', 'public', req.url === '/' ? 'index.html' : req.url);
  
  try {
    // Read the file synchronously (for serverless function context)
    const data = fs.readFileSync(filePath);
    
    // Determine the MIME type based on the file extension
    const ext = path.extname(filePath);
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.json': 'application/json'
    };
    
    // Set Content-Type header; default to 'application/octet-stream'
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.send(data);
  } catch (err) {
    // Log and send a 404 for files not found
    console.error(`[Static] File not found: ${filePath}`, err.message);
    res.status(404).send('Not found');
  }
}