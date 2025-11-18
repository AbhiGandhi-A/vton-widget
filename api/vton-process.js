import { Client as GradioClient } from '@gradio/client';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

// Gradio Client setup
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HF_TOKEN = process.env.HF_TOKEN; // Required for Gradio authentication
const GRADIO_TIMEOUT_MS = 180000; // 3 minutes

let gradioClient = null;
let clientInitPromise = null;

async function getGradioClient() {
  if (gradioClient) return gradioClient;
  
  if (clientInitPromise) return clientInitPromise;
  
  clientInitPromise = (async () => {
    try {
      if (!HF_TOKEN) {
        throw new Error('HF_TOKEN environment variable is not set.');
      }
      console.log('[VTON] Initializing Gradio client...');
      gradioClient = await GradioClient.connect('yisol/IDM-VTON', {
        hf_token: HF_TOKEN
      });
      console.log('[VTON] Gradio client initialized successfully');
      return gradioClient;
    } catch (error) {
      console.error('[VTON] Failed to initialize Gradio client:', error.message);
      gradioClient = null;
      clientInitPromise = null;
      throw error;
    }
  })();
  
  return clientInitPromise;
}

function base64ToBuffer(base64String) {
  const parts = base64String.split(';base64,');
  const actualBase64 = parts.length > 1 ? parts[1] : base64String;
  return Buffer.from(actualBase64, 'base64');
}

function isQuotaError(errorMessage) {
  if (!errorMessage || typeof errorMessage !== 'string') return false;
  // Consolidated keywords for quota/load/timeout issues
  const quotaKeywords = [
    'zerogpu', 'quota', 'overload', 'unavailable',
    'rate limit', 'too many', '429', 'timeout', 'asleep',
    'Processing_Timeout'
  ];
  return quotaKeywords.some(keyword =>
    errorMessage.toLowerCase().includes(keyword.toLowerCase())
  );
}

async function processVirtualTryOn(personImageBase64, clothImageBase64) {
  let personPath = null;
  let clothPath = null;
  let tempDir = null;

  try {
    console.log('[VTON] Starting virtual try-on processing...');

    // Use /tmp directory for serverless environments
    tempDir = os.tmpdir();
    personPath = path.join(tempDir, `person-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.jpg`);
    clothPath = path.join(tempDir, `cloth-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.jpg`);

    // Write base64 images to disk (required for Gradio Client to upload)
    fs.writeFileSync(personPath, base64ToBuffer(personImageBase64));
    fs.writeFileSync(clothPath, base64ToBuffer(clothImageBase64));

    console.log('[VTON] Temporary files created');

    const client = await getGradioClient();
    console.log('[VTON] Submitting to Gradio API with 3 minute timeout...');

    // API Call to Gradio
    const predictionPromise = client.predict('/tryon', [
      { background: personPath, layers: [], composite: null }, // Person image structure
      clothPath,                                             // Cloth image path
      'Try-on',                                              // Action parameter
      true,                                                  // Parameter 4
      false,                                                 // Parameter 5
      30,                                                    // Steps
      42                                                     // Seed
    ]);

    // Timeout implementation using Promise.race
    const timeoutPromise = new Promise((_, reject) => {
      const id = setTimeout(() => {
        clearTimeout(id);
        reject(new Error('Processing_Timeout'));
      }, GRADIO_TIMEOUT_MS);
    });

    const result = await Promise.race([predictionPromise, timeoutPromise]);
    console.log('[VTON] Gradio response received');

    // Extract the output path/URL from the Gradio response
    let outputPath = null;
    if (result && Array.isArray(result.data) && result.data.length > 0) {
      const firstItem = result.data[0];
      if (firstItem?.name) outputPath = firstItem.name;
      else if (typeof firstItem === 'string') outputPath = firstItem;
      else if (firstItem?.url) outputPath = firstItem.url;
    }

    if (!outputPath) {
      throw new Error('Invalid_Result_From_Gradio');
    }

    console.log(`[VTON] Fetching result image from: ${outputPath}`);

    // Fetch the resulting image data
    let imageData;
    if (outputPath.startsWith('http')) {
      // Dynamic import for 'node-fetch' since it's an ESM package
      const { default: fetch } = await import('node-fetch');
      const response = await fetch(outputPath, { timeout: 30000 });
      if (!response.ok) throw new Error(`Failed_Download_${response.status}`);
      imageData = await response.buffer();
    } else {
      // Local file path (less common for remote Gradio endpoints)
      imageData = fs.readFileSync(outputPath);
    }

    const resultBase64 = imageData.toString('base64');
    console.log('[VTON] Processing complete');
    return resultBase64;

  } catch (error) {
    console.error('[VTON] Processing error:', error.message);
    throw error;
  } finally {
    // Cleanup temporary files
    [personPath, clothPath].forEach(p => {
      if (p && fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch (e) {
          console.warn(`[VTON] Failed to delete temp file: ${p}`, e.message);
        }
      }
    });
  }
}

export default async function handler(req, res) {
  // CORS setup for preflight and actual requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userImage, clothImage } = req.body;

    if (!userImage || !clothImage) {
      return res.status(400).json({
        status: 'error',
        message: 'Both userImage and clothImage are required'
      });
    }

    console.log('[VTON] API request received');
    const resultBase64 = await processVirtualTryOn(userImage, clothImage);

    return res.status(200).json({
      status: 'success',
      result: resultBase64,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const errorMsg = error.message || 'Unknown error';
    console.error('[VTON] API error:', errorMsg);

    let statusCode = 500;
    let errorMessage = 'Failed to process images';
    let errorType = 'error';

    // Granular error handling for better client feedback
    if (errorMsg.includes('HF_TOKEN')) {
      statusCode = 500;
      errorMessage = 'Server configuration error: Hugging Face token is missing or invalid.';
    } else if (errorMsg.includes('Processing_Timeout')) {
      statusCode = 504;
      errorMessage = 'Processing timed out. The AI model may be overloaded or asleep. Please try again in a few minutes.';
    } else if (isQuotaError(errorMsg)) {
      statusCode = 429;
      errorMessage = 'AI service quota limit reached. Please try again later.';
      errorType = 'quota_limit';
    } else if (errorMsg.includes('Invalid_Result')) {
      statusCode = 500;
      errorMessage = 'AI model returned an invalid result. Try using different images.';
    }

    return res.status(statusCode).json({
      status: 'error',
      message: errorMessage,
      errorType: errorType,
      error: errorMsg
    });
  }
}