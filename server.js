import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { client as createClient } from '@gradio/client';
import { Buffer } from 'buffer';
import fetch from 'node-fetch'; // Add this to make 'fetch' available globally in the file scope

dotenv.config();

// --- Configuration ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HF_TOKEN = process.env.HF_TOKEN;

// *** FIX START: Use RENDER_EXTERNAL_URL if available ***
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
// Priority: 1. Render URL -> 2. Custom API_URL Env -> 3. Localhost
const API_URL = RENDER_URL || process.env.API_URL || `http://localhost:${PORT}`; 
console.log(`[VTON] Final API URL for Widget: ${API_URL}`);
// *** FIX END ***

// Set a generous timeout for the AI model prediction
const GRADIO_TIMEOUT_MS = 180000; // 3 minutes

// --- CUSTOM QUOTA MESSAGE CONFIGURATION ---
const QUOTA_ERROR_MESSAGE = 'The AI service daily quota appears to be full or the service is overloaded. Please try again after 3 PM IST.';
// ------------------------------------------

// Middleware
app.use(cors({
    origin: '*',
    credentials: true
}));

// Increased limit for base64 image data
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// HF Token Warning
if (!HF_TOKEN) {
    console.warn('[VTON] WARNING: HF_TOKEN is not set. This is often required for persistent access to crowded spaces.');
}

// --- Gradio Client Management ---
let gradioClient = null;

async function getGradioClient() {
    if (!gradioClient) {
        console.log('[VTON] Initializing Gradio client...');
        try {
            // Using a specific Hugging Face model
            gradioClient = await createClient('yisol/IDM-VTON', {
                hf_token: HF_TOKEN
            });
            console.log('[VTON] Gradio client initialized successfully');
            
            // LOGGING THE GRADIO CONFIG FOR DEBUGGING
            if (gradioClient && gradioClient.config) {
                const host = gradioClient.config.host || 'N/A (using default/implicit host)';
                console.log(`[VTON] Gradio Client Config: ${gradioClient.config.space_id} at ${host}`);
            }
            
        } catch (error) {
            console.error('[VTON] Failed to initialize Gradio client:', error.message);
            throw error;
        }
    }
    return gradioClient;
}

// --- Utility Functions ---

function isQuotaError(errorMessage) {
    if (!errorMessage || typeof errorMessage !== 'string') {
        return false;
    }

    const quotaKeywords = [
        'zerogpu quota',
        'quota',
        'out of quota',
        'daily quota',
        'rate limit',
        'too many requests',
        '429',
        'generic error'
    ];
    return quotaKeywords.some(keyword =>
        errorMessage.toLowerCase().includes(keyword)
    );
}

function base64ToBuffer(base64String) {
    // Remove data URI prefix if present (e.g., "data:image/jpeg;base64,")
    const parts = base64String.split(';base64,');
    const actualBase64 = parts.length > 1 ? parts[1] : base64String;
    return Buffer.from(actualBase64, 'base64');
}

// --- Core Try-On Logic ---

async function processVirtualTryOn(personImageBase64, clothImageBase64) {
    let personPath = null;
    let clothPath = null;

    try {
        console.log('[VTON] Starting virtual try-on processing...');

        // Convert base64 to temporary files
        const tempDir = os.tmpdir();
        personPath = path.join(tempDir, `person-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.jpg`);
        clothPath = path.join(tempDir, `cloth-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.jpg`);

        // Write base64 to files
        fs.writeFileSync(personPath, base64ToBuffer(personImageBase64));
        fs.writeFileSync(clothPath, base64ToBuffer(clothImageBase64));

        console.log('[VTON] Temporary files created at:', personPath, clothPath);
        console.log('[VTON] Connecting to Gradio API...');

        // Get or create Gradio client
        const client = await getGradioClient();

        console.log('[VTON] Submitting job to Gradio API with a timeout of %dms...', GRADIO_TIMEOUT_MS);

        // Define the prediction call as a promise
        const predictionPromise = client.predict('/tryon', [
            {
                background: personPath,
                layers: [],
                composite: null
            },
            clothPath,
            'Try-on', // Mode
            true, // is_upper
            false, // is_outfit
            30, // seed
            42 // scale
        ]);

        // Create a timeout promise
        const timeoutPromise = new Promise((_, reject) => {
            const id = setTimeout(() => {
                clearTimeout(id);
                // Throw an error that is specifically recognizable as a timeout
                reject(new Error('Gradio_Prediction_Timeout'));
            }, GRADIO_TIMEOUT_MS);
        });

        // Race the prediction against the timeout
        const result = await Promise.race([predictionPromise, timeoutPromise]);


        console.log('[VTON] Gradio API response received. Result structure:', JSON.stringify(result, null, 2));

        // Extract image path from result
        let outputPath = null;

        if (result && Array.isArray(result.data) && result.data.length > 0) {
            const firstItem = result.data[0];

            if (firstItem && firstItem.name) {
                outputPath = firstItem.name;
            } else if (typeof firstItem === 'string') {
                outputPath = firstItem;
            } else if (firstItem && firstItem.url) {
                outputPath = firstItem.url;
            }
        }

        if (!outputPath) {
            throw new Error('Invalid or empty result from Gradio API. Output path not found.');
        }

        console.log('[VTON] Output path:', outputPath);
        console.log('[VTON] Processing output image...');

        let imageData;
        // Use the imported 'fetch' which is now at the top of the file
        // const fetch = (await import('node-fetch')).default; // Remove this line

        // Check if the output is a remote URL or a local path
        if (outputPath.startsWith('http')) {
            const response = await fetch(outputPath);
            if (!response.ok) {
                throw new Error(`Failed to download result image from ${outputPath}: ${response.statusText}`);
            }
            // Use response.buffer() for node-fetch
            imageData = await response.buffer();
        } else {
            imageData = fs.readFileSync(outputPath);
        }

        const resultBase64 = imageData.toString('base64');

        console.log('[VTON] Successfully processed image');
        return resultBase64;

    } catch (error) {
        // --- Error Inspection and Translation ---
        console.error('[VTON] Raw Gradio processing error object:', error);
        
        let errorMessage = 'An unknown error occurred during Gradio processing.';
        
        if (error.message === 'Gradio_Prediction_Timeout') {
            errorMessage = 'Processing timed out after 3 minutes. The AI service may be overloaded or asleep.';
        } 
        // 1. Check for nested Gradio client error structure
        else if (error && error.detail && error.detail.error) {
            errorMessage = error.detail.error;
        } else if (error && typeof error.detail === 'string') {
            errorMessage = error.detail;
        } else if (error && error.message) {
            errorMessage = error.message;
        } 
        // 2. Handle the specific generic error from your log (Quota/Load Issue)
        else if (error.type === 'status' && error.stage === 'error' && error.success === false && error.endpoint === '/tryon') {
            // This condition targets the ambiguous error in your log
            errorMessage = 'The AI service returned a generic error. This often indicates the service is overloaded, asleep, or the daily quota has been exceeded.';
        }
        else if (typeof error === 'string') {
            errorMessage = error;
        }
        
        // 3. Add specific check for common Gradio/HF Auth errors
        if (errorMessage.toLowerCase().includes('401') || errorMessage.toLowerCase().includes('unauthorized')) {
             errorMessage = 'Authentication failed. Please check if your HF_TOKEN is valid and has read access to the model.';
        }

        const safeError = new Error(errorMessage);
        console.error('[VTON] Processed processing error:', safeError.message);
        throw safeError; // Re-throw the safe error with a usable message
    } finally {
        // Cleanup temporary files
        try {
            if (personPath && fs.existsSync(personPath)) {
                fs.unlinkSync(personPath);
                console.log(`[VTON] Cleaned up: ${personPath}`);
            }
            if (clothPath && fs.existsSync(clothPath)) {
                fs.unlinkSync(clothPath);
                console.log(`[VTON] Cleaned up: ${clothPath}`);
            }
        } catch (e) {
            console.warn('[VTON] Failed to cleanup temp files:', e.message);
        }
    }
}

// --- Express Routes ---

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        hf_token_configured: !!HF_TOKEN
    });
});

app.post('/api/vton/process', async (req, res) => {
    try {
        const { userImage, clothImage } = req.body;

        if (!userImage || !clothImage) {
            return res.status(400).json({
                status: 'error',
                message: 'Both userImage and clothImage are required (base64 strings)'
            });
        }

        console.log('[VTON] Received API request');

        const resultBase64 = await processVirtualTryOn(userImage, clothImage);

        res.json({
            status: 'success',
            result: resultBase64,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        // --- API Response Error Handling ---
        const errorMsg = error instanceof Error ? error.message : String(error) || 'Unknown error';
        console.error('[VTON] API error:', error); // Log the full error object for better context

        let statusCode = 500;
        let errorMessage = errorMsg || 'Failed to process images. An internal server or AI service error occurred.';
        let errorType = 'error';

        // Translate specific server-side messages to client-friendly errors
        if (isQuotaError(errorMsg) || errorMsg.includes('The AI service returned a generic error')) {
            statusCode = 429;
            // *** APPLY THE CUSTOM MESSAGE HERE ***
            errorMessage = QUOTA_ERROR_MESSAGE;
            errorType = 'quota_limit';
            console.log('[VTON] Quota limit or service unavailability detected');
        } else if (errorMsg.includes('Authentication failed') || errorMsg.includes('unauthorized')) {
            statusCode = 401;
            errorMessage = 'Authentication failed. Check your HF_TOKEN and ensure it has read permissions for the model.';
        } else if (errorMsg.includes('timed out') || errorMsg.includes('Timeout')) {
            statusCode = 504;
            errorMessage = 'Processing timed out. The AI model took too long to respond. Please try again.';
        } else if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('Failed to fetch')) {
            statusCode = 503;
            errorMessage = 'AI model service is unavailable or inaccessible. Please try again in a moment.';
        } else if (errorMsg.includes('Invalid or empty result')) {
            statusCode = 500;
            errorMessage = 'The AI model returned an invalid result. The input images might not be suitable.';
        }
        
        res.status(statusCode).json({
            status: 'error',
            message: errorMessage,
            errorType: errorType,
            error: errorMsg // Include the raw error message for client debugging
        });
    }
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

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Server Start ---
app.listen(PORT, () => {
    console.log(`\n[VTON] Server running on http://localhost:${PORT}`);
    console.log(`[VTON] Widget URL: ${API_URL}/widget.js`);
    console.log(`[VTON] Health check: ${API_URL}/api/health`);
    console.log(`[VTON] API endpoint: POST ${API_URL}/api/vton/process\n`);
});