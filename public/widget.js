// public/widget.js
(function() {
    // VTON_API_URL is injected by the server.js on the fly.
    const API_ENDPOINT = (window.VTON_API_URL || "https://vton-widget-k4hh.onrender.com") + "/api/virtual-tryon/process";
    
    // Global variables for the standard widget UI
    let globalTargetSelector = null; 
    let widgetStatusElement = null; // Status for the main interactive widget

    // ------------------------------------------------------------------
    // CORE UTILITIES
    // ------------------------------------------------------------------

    /**
     * Creates or updates a unique floating status message for a given ID/Process.
     * This is essential for distinguishing status updates when VTON.process is
     * called multiple times concurrently.
     * @param {string} processId - A unique ID for this process (e.g., a target selector or custom ID).
     * @param {string} message - The status message.
     * @param {string} className - 'status-info', 'status-success', or 'status-error'.
     * @param {boolean} isFloating - Whether to display as a fixed floating message.
     */
    function showStatus(processId, message, className, isFloating = true) {
        const uniqueId = `vton-status-${processId.replace(/[^a-zA-Z0-9]/g, '-')}`;
        let statusElement = document.getElementById(uniqueId);
        
        if (!statusElement) {
            statusElement = document.createElement('div');
            statusElement.id = uniqueId;
            document.body.appendChild(statusElement);

            if (isFloating) {
                // Style for the floating status message (Method 4)
                statusElement.style.cssText = `
                    position: fixed; 
                    bottom: 10px; 
                    right: 10px; 
                    z-index: 1000; 
                    padding: 10px; 
                    border-radius: 5px; 
                    box-shadow: 0 0 10px rgba(0,0,0,0.2); 
                    font-family: sans-serif; 
                    transition: all 0.3s;
                    max-width: 300px;
                `;
            } else {
                // Style for the main widget status (Method 1-3)
                 statusElement.style.cssText = 'margin-top: 15px; padding: 10px; border-radius: 6px; text-align: center; font-size: 1em;';
            }
        }
        
        statusElement.textContent = message;
        statusElement.className = className;
        statusElement.style.display = 'block';

        // Auto-hide success/error messages for headless processing
        if (isFloating && (className === 'status-success' || className === 'status-error')) {
            setTimeout(() => {
                statusElement.style.display = 'none';
            }, 8000);
        }
    }


    /**
     * Converts a File object to a Base64 string (data part only).
     */
     function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]); 
            reader.onerror = error => reject(error);
            reader.readAsDataURL(file);
        });
    }

    /**
     * Fetches an image URL and converts it to a Base64 string (data part only).
     */
    function urlToBase64(url) {
        return fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error fetching image from URL! Status: ${response.status}`);
                }
                return response.blob();
            })
            .then(blob => fileToBase64(new File([blob], 'image', { type: blob.type })));
    }

    /**
     * Displays a preview of the selected image.
     */
    function setupImagePreview(fileInput, previewElement) {
        fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    previewElement.src = e.target.result;
                    previewElement.style.display = 'block';
                    previewElement.alt = `Preview of ${fileInput.id}`;
                };
                reader.readAsDataURL(file);
            } else {
                previewElement.src = "";
                previewElement.style.display = 'none';
            }
        });
    }


    /**
     * Handles the core logic of calling the VTON API and updating the result image.
     * @param {string} processId - Unique ID for status tracking.
     * @param {string} personImageBase64 - Base64 data of the person image.
     * @param {string} garmentImageBase64 - Base64 data of the garment image.
     * @param {HTMLElement} finalResultImage - The <img> element to update.
     * @param {boolean} isHeadless - True if called from VTON.process (Method 4).
     * @param {HTMLElement | null} generateButton - The button to disable/enable (null if headless).
     */
    async function processTryOn(processId, personImageBase64, garmentImageBase64, finalResultImage, isHeadless, generateButton) {
        const statusUpdater = (message, className) => showStatus(processId, message, className, isHeadless);

        if (generateButton) generateButton.disabled = true;
        
        statusUpdater("Uploading and processing... This may take up to 3 minutes.", 'status-info');
        
        // Hide result initially
        finalResultImage.src = "";

        try {
            const response = await fetch(API_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    personImageBase64: personImageBase64,
                    garmentImageBase64: garmentImageBase64
                })
            });

            const data = await response.json();

            if (response.ok && data.status === 'success' && data.processed_image_base64) {
                const base64Image = data.processed_image_base64;

                // Prepend the data URL prefix for display
                finalResultImage.src = `data:image/jpeg;base64,${base64Image}`;
                finalResultImage.style.display = 'block'; 

                statusUpdater("Success! Image generated.", 'status-success');
                return finalResultImage.src; // Return URL for optional external use
            } else {
                const errorMsg = data.message || data.errorDetails || `API Error: ${response.statusText}`;
                statusUpdater(`Error: ${errorMsg}`, 'status-error');
                throw new Error(errorMsg);
            }

        } catch (error) {
            console.error(`VTON Process [${processId}] Fetch Error:`, error);
            statusUpdater(`Network/System Error: Could not connect to the server or process request.`, 'status-error');
            throw error; // Re-throw to be caught by VTON.process caller
        } finally {
            if (generateButton) generateButton.disabled = false;
        }
    }


    /**
     * Finds the single target image element.
     */
    function determineTargetElement(rootElement) {
        // ... (Target determination logic remains the same for the widget UI)
        if (globalTargetSelector) {
            const externalElement = document.querySelector(globalTargetSelector);
            if (externalElement && externalElement.tagName === 'IMG') {
                return externalElement;
            }
        }

        const selectorAttribute = rootElement.getAttribute('data-target-selector') || rootElement.getAttribute('data-target-id');
        if (selectorAttribute) {
            const externalElement = document.querySelector(selectorAttribute);
            if (externalElement && externalElement.tagName === 'IMG') {
                return externalElement;
            }
        }

        const imageTarget = document.querySelector('img[data-vton-target]');
        if (imageTarget) {
            return imageTarget;
        }

        return null;
    }


    /**
     * Creates and returns the HTML structure for the widget.
     */
    function getWidgetHtml(externalTarget) {
        const resultSection = externalTarget
            ? `<p style="margin-top: 15px; color: #4CAF50;">Result will be applied to the image element: **${externalTarget.id ? '#' + externalTarget.id : externalTarget.tagName}**</p>`
            : `<div id="vton-result-area">
                 <h4>Try-On Result:</h4>
                 <img id="vton-result-image" src="" alt="Try-on Result" style="display:none; max-width: 100%; height: auto; min-height: 200px; border: 3px solid #4CAF50; border-radius: 10px;">
               </div>`;

        return `
            <style>
                /* ... (Widget CSS remains the same for brevity) ... */
                #vton-widget { max-width: 480px; margin: 0 auto; padding: 25px; border: 1px solid #e0e0e0; border-radius: 12px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; box-shadow: 0 6px 20px rgba(0,0,0,0.08); background-color: #ffffff; }
                #vton-widget h3 { margin-top: 0; color: #1a1a1a; text-align: center; font-size: 1.5em; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px; margin-bottom: 20px; }
                #vton-widget label { display: block; margin-top: 15px; margin-bottom: 5px; font-weight: 600; color: #333; font-size: 0.95em; }
                #vton-widget input[type="file"] { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px; box-sizing: border-box; }
                .input-group { margin-bottom: 20px; display: flex; flex-direction: column; align-items: center; }
                .preview-container { display: flex; justify-content: space-around; gap: 15px; margin: 10px 0 25px 0; width: 100%; }
                .preview-wrapper { display: flex; flex-direction: column; align-items: center; width: 45%; }
                .image-preview { width: 120px; height: 150px; object-fit: contain; border: 2px solid #ddd; border-radius: 8px; display: none; margin-top: 5px; padding: 5px; background-color: #f9f9f9; }
                #vton-widget button { width: 100%; padding: 15px; margin-top: 20px; background-color: #4CAF50; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 1.1em; font-weight: bold; transition: background-color 0.3s, transform 0.1s; }
                #vton-widget button:hover:not(:disabled) { background-color: #43a047; transform: translateY(-1px); }
                #vton-widget button:disabled { background-color: #a5d6a7; cursor: not-allowed; }
                #vton-status-message { margin-top: 15px; padding: 10px; border-radius: 6px; text-align: center; font-size: 1em; }
                .status-info { color: #007bff; background-color: #e6f3ff; }
                .status-success { color: #2ecc71; background-color: #e6fff0; }
                .status-error { color: #e74c3c; background-color: #ffe6e6; }
            </style>
            <div id="vton-widget">
                <h3>🛍️ Virtual Try-On</h3>
                <div id="vton-status-message" class="status-info">Ready. (Max 10MB per image)</div>

                <div class="input-group">
                    <label for="personImageFile">1. Upload Your Photo (JPG/PNG):</label>
                    <input type="file" id="personImageFile" accept="image/jpeg, image/png">
                </div>

                <div class="input-group">
                    <label for="clothImageFile">2. Upload Cloth/Garment Photo (JPG/PNG):</label>
                    <input type="file" id="clothImageFile" accept="image/jpeg, image/png">
                </div>

                <div class="preview-container">
                    <div class="preview-wrapper">
                        <img id="personImagePreview" class="image-preview" src="" alt="Your Photo Preview">
                        <small style="margin-top: 5px; color: #555;">Your Photo</small>
                    </div>
                    <div class="preview-wrapper">
                        <img id="clothImagePreview" class="image-preview" src="" alt="Cloth Photo">
                        <small style="margin-top: 5px; color: #555;">Cloth Photo</small>
                    </div>
                </div>

                <button id="vton-generate-button">Generate Try-On Image</button>

                ${resultSection}
            </div>
        `;
    }


    /**
     * Main function to initialize the widget.
     */
    function initializeWidget() {
        let rootElement = document.getElementById("vton");
        
        const rootId = rootElement ? 'vton' : (document.currentScript ? document.currentScript.getAttribute('data-root-id') : 'vton');

        if (!rootElement) {
            // Find root element based on VTON.init() call or custom ID
            rootElement = document.getElementById(rootId);
            if (!rootElement) {
                console.warn("VTON Widget container ('#vton' or custom ID) not found. Programmatic use via VTON.process() is still available.");
                return;
            }
        }


        const externalTargetElement = determineTargetElement(rootElement);

        rootElement.innerHTML = getWidgetHtml(externalTargetElement);

        const personImageFileInput = document.getElementById("personImageFile");
        const clothImageFileInput = document.getElementById("clothImageFile");
        const personImagePreview = document.getElementById("personImagePreview");
        const clothImagePreview = document.getElementById("clothImagePreview");
        const generateButton = document.getElementById("vton-generate-button");
        // Assign status element for the interactive widget
        widgetStatusElement = document.getElementById("vton-status-message"); 

        const finalResultImage = externalTargetElement || document.getElementById("vton-result-image");

        setupImagePreview(personImageFileInput, personImagePreview);
        setupImagePreview(clothImageFileInput, clothImagePreview);

        // Event listener for the generate button (Method 1-3)
        generateButton.addEventListener("click", async () => {
            const personFile = personImageFileInput.files[0];
            const clothFile = clothImageFileInput.files[0];
            
            if (!personFile || !clothFile) {
                widgetStatusElement.textContent = `Error: Please upload both images.`;
                widgetStatusElement.className = 'status-error';
                return;
            }

            try {
                const [personImageBase64, garmentImageBase64] = await Promise.all([
                    fileToBase64(personFile),
                    fileToBase64(clothFile)
                ]);
                
                // Use widgetStatusElement for tracking and pass its ID for unique status management
                await processTryOn('widget', personImageBase64, garmentImageBase64, finalResultImage, false, generateButton);

            } catch (error) {
                console.error("VTON Widget File Read Error:", error);
                widgetStatusElement.textContent = `Error reading files.`;
                widgetStatusElement.className = 'status-error';
            }
        });
    }
    
    // ------------------------------------------------------------------
    // EXPOSE GLOBAL API (Method 1 & 4)
    // ------------------------------------------------------------------
    window.VTON = {
        /**
         * Method 1: Initializes the interactive widget and sets the external target.
         */
        init: (options) => {
             if (options && options.target) {
                globalTargetSelector = options.target; 
            }
            
            const rootId = options && options.root ? options.root : 'vton';
            const rootElement = document.getElementById(rootId);
            
            if (rootElement) {
                // Temporarily ensure the initialization targets the correct custom root ID
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', initializeWidget);
                } else {
                    initializeWidget();
                }
            } else {
                if (options && options.root) {
                    console.error(`VTON.init() Error: Root element with ID '${options.root}' not found.`);
                }
            }
        },

        /**
         * Method 4: Programmatically triggers try-on using image URLs.
         * The 'options.target' selector is used as the unique process ID
         * to manage its dedicated floating status message.
         */
        process: async (options) => {
            if (!options || !options.personImageUrl || !options.garmentImageUrl || !options.target) {
                console.error("VTON.process() Error: Missing required options (personImageUrl, garmentImageUrl, target).");
                // Use a generic status ID if target is missing for a quick error message
                showStatus('process-error', 'VTON.process() Error: Missing image URLs or target selector.', 'status-error', true); 
                return;
            }
            
            // Use the target selector (e.g., '#try-on-result-4') as the unique process ID
            const processId = options.target.replace('#', '');
            
            const targetElement = document.querySelector(options.target);
            if (!targetElement || targetElement.tagName !== 'IMG') {
                console.error(`VTON.process() Error: Target element '${options.target}' not found or is not an <img>.`);
                showStatus(processId, `VTON.process() Error: Target image not found.`, 'status-error', true);
                return;
            }
            
            // Optional callbacks for custom interfaces
            if (options.onStart) options.onStart();

            try {
                // 1. Fetch URLs and convert to Base64 in parallel
                showStatus(processId, "Fetching images and converting to data...", 'status-info', true);

                const [personImageBase64, garmentImageBase64] = await Promise.all([
                    urlToBase64(options.personImageUrl),
                    urlToBase64(options.garmentImageUrl)
                ]);

                // 2. Call the core processing function
                const resultUrl = await processTryOn(
                    processId, 
                    personImageBase64, 
                    garmentImageBase64, 
                    targetElement, 
                    true, // isHeadless = true
                    null // generateButton = null
                );
                
                if (options.onComplete) options.onComplete(resultUrl);

            } catch (error) {
                console.error("VTON.process() Initialization Error:", error);
                // Status is already handled by processTryOn, but add a final check
                showStatus(processId, `VTON.process() Failed: Check console for details.`, 'status-error', true);
                if (options.onError) options.onError(error);
            }
        }
    };

    // ------------------------------------------------------------------
    // DEFAULT INITIALIZATION (Method 2 & 3 checks run here)
    // ------------------------------------------------------------------
    // If the default container ID "vton" exists, initialize the widget automatically.
    if (document.getElementById("vton")) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeWidget);
        } else {
            initializeWidget();
        }
    }
})();
