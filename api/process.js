import fs from 'fs';
import path from 'path';
import os from 'os';
import { Client } from '@gradio/client';
import { Buffer } from 'buffer';

const HF_TOKEN = process.env.HF_TOKEN;
const GRADIO_TIMEOUT_MS = 180000;
const QUOTA_ERROR_MESSAGE = 'The AI service daily quota appears to be full or the service is overloaded. Please try again after 3 PM IST.';

let gradioClient = null;

async function getGradioClient() {
    if (!gradioClient) {
        console.log('[VTON] Initializing Gradio client...');
        try {
            gradioClient = await Client.connect('yisol/IDM-VTON', {
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
        'overload'
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
        console.log('[VTON] Connecting to Gradio API...');

        const client = await getGradioClient();
        console.log('[VTON] Submitting job to Gradio API...');

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
            throw new Error('Invalid or empty result from Gradio API');
        }

        console.log('[VTON] Processing output image...');
        
        let imageData;
        if (outputPath.startsWith('http')) {
            const response = await fetch(outputPath);
            if (!response.ok) {
                throw new Error(`Failed to download result image: ${response.statusText}`);
            }
            imageData = await response.arrayBuffer();
        } else {
            imageData = fs.readFileSync(outputPath);
        }

        const resultBase64 = Buffer.from(imageData).toString('base64');
        console.log('[VTON] Successfully processed image');
        return resultBase64;

    } catch (error) {
        console.error('[VTON] Raw error:', error);
        
        let errorMessage = 'An unknown error occurred during processing.';

        if (error.message === 'Gradio_Prediction_Timeout') {
            errorMessage = 'Processing timed out after 3 minutes. The AI service may be overloaded or asleep.';
        } else if (error.message) {
            errorMessage = error.message;
        }

        if (errorMessage.toLowerCase().includes('401') || errorMessage.toLowerCase().includes('unauthorized')) {
            errorMessage = 'Authentication failed. Please check if your HF_TOKEN is valid.';
        }

        const safeError = new Error(errorMessage);
        console.error('[VTON] Processed error:', safeError.message);
        throw safeError;

    } finally {
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

        console.log('[VTON] Received API request');
        const resultBase64 = await processVirtualTryOn(userImage, clothImage);

        return res.status(200).json({
            status: 'success',
            result: resultBase64,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[VTON] API error:', errorMsg);

        let statusCode = 500;
        let errorMessage = errorMsg || 'Failed to process images';
        let errorType = 'error';

        if (isQuotaError(errorMsg)) {
            statusCode = 429;
            errorMessage = QUOTA_ERROR_MESSAGE;
            errorType = 'quota_limit';
            console.log('[VTON] Quota limit detected');
        } else if (errorMsg.includes('Authentication failed') || errorMsg.includes('unauthorized')) {
            statusCode = 401;
            errorMessage = 'Authentication failed. Check your HF_TOKEN.';
        } else if (errorMsg.includes('timed out') || errorMsg.includes('Timeout')) {
            statusCode = 504;
            errorMessage = 'Processing timed out. Please try again.';
        } else if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('Failed to fetch')) {
            statusCode = 503;
            errorMessage = 'AI service unavailable. Please try again in a moment.';
        }

        return res.status(statusCode).json({
            status: 'error',
            message: errorMessage,
            errorType: errorType
        });
    }
}
