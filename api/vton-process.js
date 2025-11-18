import { Client as GradioClient } from '@gradio/client';
import { Buffer } from 'buffer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HF_TOKEN = process.env.HF_TOKEN;
const GRADIO_TIMEOUT_MS = 180000; // 3 minutes

// Cache for Gradio client
let gradioClient = null;

async function getGradioClient() {
  if (!gradioClient) {
    console.log('[VTON] Initializing Gradio client...');
    gradioClient = await GradioClient.connect('yisol/IDM-VTON', {
      hf_token: HF_TOKEN
    });
    console.log('[VTON] Gradio client initialized');
  }
  return gradioClient;
}

function base64ToBuffer(base64String) {
  const parts = base64String.split(';base64,');
  const actualBase64 = parts.length > 1 ? parts[1] : base64String;
  return Buffer.from(actualBase64, 'base64');
}

function isQuotaError(errorMessage) {
  if (!errorMessage || typeof errorMessage !== 'string') return false;
  const quotaKeywords = [
    'zerogpu', 'quota', 'overloaded', 'unavailable',
    'rate limit', 'too many', '429', 'timeout'
  ];
  return quotaKeywords.some(keyword =>
    errorMessage.toLowerCase().includes(keyword)
  );
}

async function processVirtualTryOn(personImageBase64, clothImageBase64) {
  let personPath = null;
  let clothPath = null;

  try {
    console.log('[VTON] Processing virtual try-on...');

    // Create temporary files
    const tempDir = os.tmpdir();
    personPath = path.join(tempDir, `person-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.jpg`);
    clothPath = path.join(tempDir, `cloth-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.jpg`);

    fs.writeFileSync(personPath, base64ToBuffer(personImageBase64));
    fs.writeFileSync(clothPath, base64ToBuffer(clothImageBase64));

    console.log('[VTON] Temporary files created');

    const client = await getGradioClient();
    console.log('[VTON] Submitting to Gradio with 3 minute timeout...');

    const predictionPromise = client.predict('/tryon', [
      { background: personPath, layers: [], composite: null },
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
        reject(new Error('Processing_Timeout_3_Minutes'));
      }, GRADIO_TIMEOUT_MS);
    });

    const result = await Promise.race([predictionPromise, timeoutPromise]);
    console.log('[VTON] Gradio response received');

    // Extract output path
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

    console.log('[VTON] Fetching result image...');

    let imageData;
    if (outputPath.startsWith('http')) {
      const { default: fetch } = await import('node-fetch');
      const response = await fetch(outputPath);
      if (!response.ok) throw new Error('Failed_To_Download_Result');
      imageData = await response.buffer();
    } else {
      imageData = fs.readFileSync(outputPath);
    }

    const resultBase64 = imageData.toString('base64');
    console.log('[VTON] Processing complete');
    return resultBase64;

  } catch (error) {
    console.error('[VTON] Error:', error.message);
    throw error;
  } finally {
    // Cleanup
    [personPath, clothPath].forEach(p => {
      if (p && fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch (e) {}
      }
    });
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
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

    if (errorMsg.includes('Timeout') || errorMsg.includes('timeout')) {
      statusCode = 504;
      errorMessage = 'Processing timed out. AI model may be overloaded. Try again later.';
    } else if (isQuotaError(errorMsg)) {
      statusCode = 429;
      errorMessage = 'AI service quota limit reached. Please try again after some time.';
      errorType = 'quota_limit';
    } else if (errorMsg.includes('401') || errorMsg.includes('Unauthorized')) {
      statusCode = 401;
      errorMessage = 'Authentication error. HF_TOKEN may be invalid.';
    } else if (errorMsg.includes('Invalid_Result')) {
      statusCode = 500;
      errorMessage = 'AI model returned invalid result. Try different images.';
    }

    return res.status(statusCode).json({
      status: 'error',
      message: errorMessage,
      errorType: errorType,
      error: errorMsg
    });
  }
}
