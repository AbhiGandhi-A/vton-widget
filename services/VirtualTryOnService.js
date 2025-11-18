// services/VirtualTryOnService.js
import axios from "axios";
import { Client } from "@gradio/client";
import fs from "fs";
import path from "path";
import os from "os";
import { Buffer } from "buffer"; // Ensure Buffer is available

class VirtualTryOnService {
  constructor(config = {}) {
    this.gradioSpace = config.gradioSpace || "yisol/IDM-VTON";
    this.hfToken = config.hfToken || process.env.HF_TOKEN;
    this.timeout = config.timeout || 180000; // Increased to 3 minutes
    this.logger = config.logger || console;
    this.retryAttempts = config.retryAttempts || 2;
    this.client = null;

    if (!this.hfToken) {
      this.logger.warn(
        "WARNING: HF_TOKEN is not set. This is often required for persistent access to crowded spaces."
      );
    }
  }

  /**
   * Initialize Gradio client (lazy loading)
   */
  async initializeClient() {
    if (this.client) return;

    try {
      this.logger.info(
        `[VirtualTryOn] Initializing Gradio client for space: ${this.gradioSpace}`
      );
      this.client = await Client.connect(this.gradioSpace, {
        hf_token: this.hfToken,
      });
      this.logger.info("[VirtualTryOn] Gradio client initialized successfully");
    } catch (error) {
      this.logger.error(
        `[VirtualTryOn] Failed to initialize Gradio client: ${error.message}`
      );
      throw new Error(`AI service connection failed: ${error.message}`);
    }
  }

  /**
   * Convert base64 image to Buffer
   */
  base64ToBuffer(base64String) {
    // Remove data URI prefix if present (e.g., "data:image/jpeg;base64,")
    const parts = base64String.split(";base64,");
    const actualBase64 = parts.length > 1 ? parts[1] : base64String;
    return Buffer.from(actualBase64, "base64");
  }

  /**
   * Convert buffer to base64
   */
  bufferToBase64(buffer) {
    return buffer.toString("base64");
  }

  /**
   * Convert base64 image to temporary file
   */
  base64ToTempFile(base64String, prefix = 'file') {
    try {
      const buffer = this.base64ToBuffer(base64String);
      const tempDir = os.tmpdir();
      // Use unique names to prevent conflicts
      const tempFile = path.join(tempDir, `vton-${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.jpg`);
      fs.writeFileSync(tempFile, buffer);
      return tempFile;
    } catch (error) {
      this.logger.error(`[VirtualTryOn] Failed to create temp file: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clean up temporary files
   */
  cleanupTempFile(filePath) {
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this.logger.info(`[VirtualTryOn] Cleaned up: ${filePath}`);
      }
    } catch (error) {
      this.logger.warn(
        `[VirtualTryOn] Failed to cleanup temp file ${filePath}: ${error.message}`
      );
    }
  }

  /**
   * Call Gradio API with retry logic
   */
  async callGradioAPI(personImagePath, garmentImagePath, attempt = 1) {
    let timeoutId = null;
    try {
      this.logger.info(
        `[VirtualTryOn] Calling Gradio API (attempt ${attempt}/${this.retryAttempts})...`
      );

      await this.initializeClient();

      // Setup timeout for the prediction itself
      const predictionPromise = this.client.predict("/tryon", {
        dict: {
          background: new File([fs.readFileSync(personImagePath)], path.basename(personImagePath), { type: "image/jpeg" }),
          layers: [],
          composite: null,
        },
        garm_img: new File([fs.readFileSync(garmentImagePath)], path.basename(garmentImagePath), { type: "image/jpeg" }),
        garment_des: "Try-on",
        is_checked: true, // is_upper
        is_checked_crop: false, // is_outfit
        denoise_steps: 30, // seed
        seed: 42, // scale
      });

      const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
              reject(new Error('Gradio_Prediction_Timeout'));
          }, this.timeout);
      });

      const result = await Promise.race([predictionPromise, timeoutPromise]);
      clearTimeout(timeoutId);

      this.logger.info("[VirtualTryOn] Gradio API call succeeded");

      // Extract image URL from result
      let imageUrl = null;

      if (result && Array.isArray(result.data) && result.data.length > 0) {
        const firstResult = result.data[0];
        if (firstResult && typeof firstResult === 'object') {
          imageUrl = firstResult.url || firstResult.path;
        } else if (typeof firstResult === 'string') {
          imageUrl = firstResult;
        }
      }

      if (!imageUrl) {
        this.logger.error(`[VirtualTryOn] Response structure: ${JSON.stringify(result, null, 2)}`);
        throw new Error("Could not extract image URL from Gradio response");
      }

      this.logger.info(`[VirtualTryOn] Image URL extracted: ${imageUrl}`);

      // Download the result image
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });

      const imageBuffer = Buffer.from(response.data);
      this.logger.info(`[VirtualTryOn] Result image downloaded successfully (${imageBuffer.length} bytes)`);

      return imageBuffer;
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);

      this.logger.error(
        `[VirtualTryOn] API call error: ${error.message} (attempt ${attempt}/${this.retryAttempts})`
      );

      if (attempt < this.retryAttempts && !error.message.includes('Gradio_Prediction_Timeout')) {
        const delay = Math.pow(2, attempt) * 2000;
        this.logger.info(`[VirtualTryOn] Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.callGradioAPI(personImagePath, garmentImagePath, attempt + 1);
      }

      // Translate specific errors
      let finalError = error.message;
      if (finalError.includes('Gradio_Prediction_Timeout')) {
        finalError = 'Processing timed out. The AI service may be overloaded or asleep.';
      } else if (finalError.toLowerCase().includes('401') || finalError.toLowerCase().includes('unauthorized')) {
        finalError = 'Authentication failed. Check HF_TOKEN.';
      }

      throw new Error(finalError);
    }
  }

  /**
   * Main method: Process virtual try-on
   * Now accepts two Base64 strings.
   */
  async processImage(personImageBase64, garmentImageBase64) {
    let personTempFile = null;
    let garmentTempFile = null;

    try {
      this.logger.info("[VirtualTryOn] Starting virtual try-on processing...");

      if (!personImageBase64 || !garmentImageBase64) {
        throw new Error("Both personImageBase64 and garmentImageBase64 are required");
      }

      // Convert both Base64 strings to temp files
      personTempFile = this.base64ToTempFile(personImageBase64, 'person');
      garmentTempFile = this.base64ToTempFile(garmentImageBase64, 'garment'); // Use second file for garment

      // Call Gradio API
      const resultBuffer = await this.callGradioAPI(personTempFile, garmentTempFile);

      // Convert result to base64
      const processedBase64 = this.bufferToBase64(resultBuffer);

      this.logger.info("[VirtualTryOn] Processing completed successfully");

      return {
        processedImage: processedBase64,
        status: "success",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`[VirtualTryOn] Processing failed: ${error.message}`);
      throw error;
    } finally {
      // Cleanup temp files
      this.cleanupTempFile(personTempFile);
      this.cleanupTempFile(garmentTempFile);
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      this.logger.info("[VirtualTryOn] Performing health check...");
      await this.initializeClient();
      this.logger.info("[VirtualTryOn] Health check: OK");
      return true;
    } catch (error) {
      this.logger.error(`[VirtualTryOn] Health check failed: ${error.message}`);
      return false;
    }
  }
}

export default VirtualTryOnService;