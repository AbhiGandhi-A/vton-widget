// server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import virtualTryOnRoutes from './routes/virtualTryOn.js'; // Import the new route file

dotenv.config();

// --- Configuration ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// *** FIX START: Use RENDER_EXTERNAL_URL if available ***
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
// Priority: 1. Render URL -> 2. Custom API_URL Env -> 3. Localhost
const API_URL = RENDER_URL || process.env.API_URL || `http://localhost:${PORT}`;
console.log(`[VTON] Final API URL for Widget: ${API_URL}`);
// *** FIX END ***

// --- CUSTOM QUOTA MESSAGE CONFIGURATION ---
const QUOTA_ERROR_MESSAGE = 'The AI service daily quota appears to be full or the service is overloaded. Please try again later.';
// ------------------------------------------

// Middleware
app.use(cors({
    origin: '*', // Allow all origins for the widget
    credentials: true
}));

// Increased limit for base64 image data
app.use(express.json({ limit: '10mb' })); // Limit set lower for base64 image input, adjust if needed
app.use(express.urlencoded({ extended: true }));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// --- Routes ---

// Use the imported router for VTON API endpoints
app.use('/api/virtual-tryon', virtualTryOnRoutes);

// Health check endpoint (simple)
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        hf_token_configured: !!process.env.HF_TOKEN,
        api_url: API_URL
    });
});

// Serve widget with API URL injection
app.get('/widget.js', (req, res) => {
    try {
        const scriptPath = path.join(__dirname, 'public', 'widget.js');
        const script = fs.readFileSync(scriptPath, 'utf8');
        // Inject API_URL into the client-side script
        const modifiedScript = `window.VTON_API_URL = '${API_URL}';\n${script}`;
        res.setHeader('Content-Type', 'application/javascript');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(modifiedScript);
    } catch (e) {
        console.error('[VTON] Error serving widget:', e.message);
        res.status(500).send('Error loading widget script.');
    }
});

// Serve index.html as the main page for local testing
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Server Start ---
app.listen(PORT, () => {
    console.log(`\n[VTON] Server running on http://localhost:${PORT}`);
    console.log(`[VTON] Widget URL: ${API_URL}/widget.js`);
    console.log(`[VTON] API endpoint: POST ${API_URL}/api/virtual-tryon/process\n`);
});