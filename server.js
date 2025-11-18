import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Client as GradioClient } from '@gradio/client';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HF_TOKEN = process.env.HF_TOKEN;
const API_URL = process.env.API_URL || `http://localhost:${PORT}`;
const GRADIO_TIMEOUT_MS = 180000; // 3 minutes

// Custom quota error message
const QUOTA_ERROR_MESSAGE = 'The AI service daily quota appears to be full or the service is overloaded. Please try again after 3 PM IST.';

// Middleware
app.use(cors({
  origin: '*',
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

if (!HF_TOKEN) {
  console.warn('[VTON] WARNING: HF_TOKEN is not set. Set this environment variable for proper Gradio access.');
}

// Gradio Client Management
let gradioClient = null;

async function getGradioClient() {
  if (!gradioClient) {
    try {
      console.log('[VTON] Initializing Gradio client...');
      gradioClient = await GradioClient.connect('yisol/IDM-VTON', {
        hf_token: HF_TOKEN
      });
      console.log('[VTON] Gradio client initialized successfully');
    } catch (error) {
      console.error('[VTON] Failed to initialize Gradio client:', error.message);
      throw error;
    }
  }
  return gradioClient;
}

// Utility Functions
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
    'generic error',
    'overloaded',
    'unavailable'
  ];
  return quotaKeywords.some(keyword =>
    errorMessage.toLowerCase().includes(keyword)
  );
}

function base64ToBuffer(base64String) {
  const parts = base64String.split(';base64,');
  const actualBase64 = parts.length > 1 ? parts[1] : base64String;
  return Buffer.from(actualBase64, 'base64');
}

// Core Try-On Logic
async function processVirtualTryOn(personImageBase64, clothImageBase64) {
  let personPath = null;
  let clothPath = null;

  try {
    console.log('[VTON] Starting virtual try-on processing...');

    const tempDir = os.tmpdir();
    personPath = path.join(tempDir, `person-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.jpg`);
    clothPath = path.join(tempDir, `cloth-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.jpg`);

    fs.writeFileSync(personPath, base64ToBuffer(personImageBase64));
    fs.writeFileSync(clothPath, base64ToBuffer(clothImageBase64));

    console.log('[VTON] Temporary files created');

    const client = await getGradioClient();
    console.log('[VTON] Submitting job to Gradio API with timeout of 3 minutes...');

    const predictionPromise = client.predict('/tryon', [
      {
        background: personPath,
        layers: [],
        composite: null
      },
      clothPath,
      'Try-on',
      true,
      false,
      30,
      42
    ]);

    const timeoutPromise = new Promise((_, reject) => {
      const id = setTimeout(() => {
        clearTimeout(id);
        reject(new Error('Gradio_Prediction_Timeout'));
      }, GRADIO_TIMEOUT_MS);
    });

    const result = await Promise.race([predictionPromise, timeoutPromise]);

    console.log('[VTON] Gradio API response received');

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

    console.log('[VTON] Processing output image...');

    let imageData;
    const fetch = (await import('node-fetch')).default;

    if (outputPath.startsWith('http')) {
      const response = await fetch(outputPath);
      if (!response.ok) {
        throw new Error(`Failed to download result image: ${response.statusText}`);
      }
      imageData = await response.buffer();
    } else {
      imageData = fs.readFileSync(outputPath);
    }

    const resultBase64 = imageData.toString('base64');
    console.log('[VTON] Successfully processed image');

    return resultBase64;
  } catch (error) {
    console.error('[VTON] Processing error:', error);

    let errorMessage = 'An unknown error occurred during processing.';

    if (error.message === 'Gradio_Prediction_Timeout') {
      errorMessage = 'Processing timed out after 3 minutes. The AI service may be overloaded or asleep.';
    } else if (error && error.detail && error.detail.error) {
      errorMessage = error.detail.error;
    } else if (error && typeof error.detail === 'string') {
      errorMessage = error.detail;
    } else if (error && error.message) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }

    if (errorMessage.toLowerCase().includes('401') || errorMessage.toLowerCase().includes('unauthorized')) {
      errorMessage = 'Authentication failed. Please check if your HF_TOKEN is valid.';
    }

    const safeError = new Error(errorMessage);
    throw safeError;
  } finally {
    try {
      if (personPath && fs.existsSync(personPath)) {
        fs.unlinkSync(personPath);
      }
      if (clothPath && fs.existsSync(clothPath)) {
        fs.unlinkSync(clothPath);
      }
    } catch (e) {
      console.warn('[VTON] Failed to cleanup temp files:', e.message);
    }
  }
}

// Routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    hf_token_configured: !!HF_TOKEN,
    api_url: API_URL
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
    const errorMsg = error instanceof Error ? error.message : String(error) || 'Unknown error';
    console.error('[VTON] API error:', errorMsg);

    let statusCode = 500;
    let errorMessage = errorMsg || 'Failed to process images.';
    let errorType = 'error';

    if (isQuotaError(errorMsg) || errorMsg.includes('The AI service returned a generic error')) {
      statusCode = 429;
      errorMessage = QUOTA_ERROR_MESSAGE;
      errorType = 'quota_limit';
      console.log('[VTON] Quota limit or service unavailability detected');
    } else if (errorMsg.includes('Authentication failed') || errorMsg.includes('unauthorized')) {
      statusCode = 401;
      errorMessage = 'Authentication failed. Check your HF_TOKEN.';
    } else if (errorMsg.includes('timed out') || errorMsg.includes('Timeout')) {
      statusCode = 504;
      errorMessage = 'Processing timed out. Please try again.';
    } else if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('Failed to fetch')) {
      statusCode = 503;
      errorMessage = 'AI model service is unavailable. Please try again later.';
    }

    res.status(statusCode).json({
      status: 'error',
      message: errorMessage,
      errorType: errorType,
      error: errorMsg
    });
  }
});

// Serve widget with API URL injection
app.get('/widget.js', (req, res) => {
  try {
    const scriptPath = path.join(__dirname, 'public', 'widget.js');
    const script = fs.readFileSync(scriptPath, 'utf8');
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

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`\n[VTON] Server running on http://localhost:${PORT}`);
  console.log(`[VTON] Widget URL: http://localhost:${PORT}/widget.js`);
  console.log(`[VTON] Health check: http://localhost:${PORT}/api/health`);
  console.log(`[VTON] API endpoint: POST http://localhost:${PORT}/api/vton/process\n`);
});
