// routes/virtualTryOn.js
import express from "express";
import VirtualTryOnService from "../services/VirtualTryOnService.js";

const router = express.Router();

let tryOnService = null;

const getTryOnService = () => {
  if (!tryOnService) {
    console.log("[VTON Route] Initializing VirtualTryOnService with HF_TOKEN:", process.env.HF_TOKEN ? "****" : "NOT SET");
    tryOnService = new VirtualTryOnService({
      hfToken: process.env.HF_TOKEN,
      timeout: 180000,
      retryAttempts: 2,
    });
  }
  return tryOnService;
};

// --- API Endpoints ---

/**
 * POST /api/virtual-tryon/process
 * Main endpoint: Process virtual try-on image
 * Expects: { personImageBase64, garmentImageBase64 }
 */
router.post("/process", async (req, res) => {
  try {
    // UPDATED: Expect two base64 strings
    const { personImageBase64, garmentImageBase64 } = req.body;

    console.log("[VTON Route] Processing virtual try-on with two uploaded images.");

    if (!personImageBase64 || !garmentImageBase64) {
      return res.status(400).json({
        status: "error",
        message: "Both personImageBase64 (Your Photo) and garmentImageBase64 (Cloth Photo) are required.",
      });
    }

    // Basic size validation
    if (personImageBase64.length < 100 || garmentImageBase64.length < 100) {
        return res.status(400).json({
            status: "error",
            message: "One or both image files are invalid or too small to process.",
        });
    }

    console.log("[VTON Route] Calling VirtualTryOnService...");

    const service = getTryOnService();
    // Pass both Base64 strings to the service
    const result = await service.processImage(
      personImageBase64,
      garmentImageBase64
    );

    res.json({
      status: "success",
      processed_image_base64: result.processedImage,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[VTON Route] Virtual try-on error:", err.message);

    // Translate errors from VirtualTryOnService
    let statusCode = 500;
    let errorMessage = "Failed to process image. An internal error occurred.";

    if (err.message.includes("timed out") || err.message.includes("asleep")) {
      statusCode = 504;
      errorMessage = "Processing timed out. The AI service may be overloaded or asleep. Please try again.";
    } else if (err.message.includes("Authentication failed")) {
      statusCode = 401;
      errorMessage = "Authentication failed. Check HF_TOKEN environment variable.";
    } else if (err.message.includes("AI service connection failed")) {
      statusCode = 503;
      errorMessage = "AI service is unavailable or inaccessible. Please try again later.";
    }

    res.status(statusCode).json({ status: "error", message: errorMessage, errorDetails: err.message });
  }
});

/**
 * GET /api/virtual-tryon/health
 * Health check endpoint
 */
router.get("/health", async (req, res) => {
  try {
    const service = getTryOnService();
    const isHealthy = await service.healthCheck();
    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? "ok" : "service_unavailable",
      model: "yisol/IDM-VTON",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      status: "error",
      message: err.message,
    });
  }
});

export default router;