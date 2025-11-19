// public/widget.js
(function() {
    // VTON_API_URL is injected by the server.js on the fly.
    const API_ENDPOINT = (window.VTON_API_URL || "https://vton-widget-k4hh.onrender.com") + "/api/virtual-tryon/process";
    
    // Global variable to store the target selector from VTON.init()
    let globalTargetSelector = null; 
    let statusElement = null; // Reference to the status message element

    /**
     * Converts a File object to a Base64 string.
     */
     function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
            reader.readAsDataURL(file);
        });
    }

    /**
     * Fetches an image URL and converts it to a Base64 string.
     * @param {string} url - The image URL.
     * @returns {Promise<string>} Base64 data URL.
     */
    function urlToBase64(url) {
        return fetch(url)
            .then(response => response.blob())
            .then(blob => fileToBase64(new File([blob], 'image', { type: blob.type })));
    }


    /**
     * Handles the core logic of calling the VTON API and updating the result image.
     * @param {string} personImageBase64 - Base64 string of the person image.
     * @param {string} garmentImageBase64 - Base64 string of the garment image.
     * @param {HTMLElement} finalResultImage - The target <img> element for the result.
     * @param {HTMLElement} statusDisplay - The element to update with status messages.
     * @param {HTMLElement | null} generateButton - The button to disable/enable (can be null for programmatic call).
     */
    async function processTryOn(personImageBase64, garmentImageBase64, finalResultImage, statusDisplay, generateButton) {
        if (generateButton) generateButton.disabled = true;
        
        statusDisplay.textContent = "Uploading and processing... This may take up to 3 minutes.";
        statusDisplay.className = 'status-info';
        
        // Hide result initially, especially if it's the external target image
        finalResultImage.src = "";
        if (finalResultImage.id === 'vton-result-image') {
            finalResultImage.style.display = 'none';
        }

        try {
            const response = await fetch(API_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ personImageBase64, garmentImageBase64 })
            });

            const data = await response.json();

            if (response.ok && data.status === 'success' && data.processed_image_base64) {
                const base64Image = data.processed_image_base64;

                finalResultImage.src = `data:image/jpeg;base64,${base64Image}`;
                finalResultImage.style.display = 'block'; // Ensure the image is visible

                statusDisplay.textContent = "Success! Image generated.";
                statusDisplay.className = 'status-success';
            } else {
                const errorMsg = data.message || data.errorDetails || "An unknown error occurred during processing.";
                statusDisplay.textContent = `Error: ${errorMsg}`;
                statusDisplay.className = 'status-error';
            }

        } catch (error) {
            console.error("VTON Widget Fetch Error:", error);
            statusDisplay.textContent = `Network/System Error: Could not connect to the server.`;
            statusDisplay.className = 'status-error';
        } finally {
            if (generateButton) generateButton.disabled = false;
        }
    }


    /**
     * Finds the single target image element based on various user input methods.
     * @param {HTMLElement} rootElement - The main VTON div element.
     * @returns {HTMLElement | null} The target <img> element or null.
     */
    function determineTargetElement(rootElement) {
        // 1. Priority 1: VTON.init({ target: selector })
        if (globalTargetSelector) {
            const externalElement = document.querySelector(globalTargetSelector);
            if (externalElement && externalElement.tagName === 'IMG') {
                return externalElement;
            }
        }

        // 2. Priority 2: data-target-selector on the VTON div
        const selectorAttribute = rootElement.getAttribute('data-target-selector') || rootElement.getAttribute('data-target-id');
        if (selectorAttribute) {
            const externalElement = document.querySelector(selectorAttribute);
            if (externalElement && externalElement.tagName === 'IMG') {
                return externalElement;
            }
        }

        // 3. Priority 3: data-vton-target on the image itself
        const imageTarget = document.querySelector('img[data-vton-target]');
        if (imageTarget) {
            return imageTarget;
        }

        // 4. Fallback: Internal display
        return null;
    }


    // ... (fileToBase64, setupImagePreview, getWidgetHtml functions remain the same)
    
    /**
     * Creates and returns the HTML structure for the widget.
     */
    function getWidgetHtml(externalTarget) {
        const resultSection = externalTarget
            ? `<p style="margin-top: 15px; color: #4CAF50;">Result will be applied to the image element: **${externalTarget.id ? '#' + externalTarget.id : externalTarget.tagName}**</p>`
            : `<div id="vton-result-area">
                 <h4>Try-On Result:</h4>
                 <img id="vton-result-image" src="" alt="Try-on Result" style="display:none;">
               </div>`;

        return `
            <style>
                /* ... (widget CSS remains the same) ... */
                #vton-widget {
                    max-width: 480px; 
                    margin: 0 auto;
                    padding: 25px;
                    border: 1px solid #e0e0e0;
                    border-radius: 12px;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    box-shadow: 0 6px 20px rgba(0,0,0,0.08);
                    background-color: #ffffff;
                }
                #vton-widget h3 {
                    margin-top: 0;
                    color: #1a1a1a;
                    text-align: center;
                    font-size: 1.5em;
                    border-bottom: 2px solid #f0f0f0;
                    padding-bottom: 10px;
                    margin-bottom: 20px;
                }
                #vton-widget label {
                    display: block;
                    margin-top: 15px;
                    margin-bottom: 5px;
                    font-weight: 600;
                    color: #333;
                    font-size: 0.95em;
                }
                #vton-widget input[type="file"] {
                    width: 100%;
                    padding: 10px;
                    border: 1px solid #ccc;
                    border-radius: 6px;
                    box-sizing: border-box; 
                }
                .input-group {
                    margin-bottom: 20px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }
                .preview-container {
                    display: flex;
                    justify-content: space-around;
                    gap: 15px;
                    margin: 10px 0 25px 0; 
                    width: 100%;
                }
                .preview-wrapper {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    width: 45%; 
                }
                .image-preview {
                    width: 120px; 
                    height: 150px; 
                    object-fit: contain; 
                    border: 2px solid #ddd;
                    border-radius: 8px;
                    display: none;
                    margin-top: 5px;
                    padding: 5px;
                    background-color: #f9f9f9;
                }
                #vton-widget button {
                    width: 100%;
                    padding: 15px;
                    margin-top: 20px;
                    background-color: #4CAF50;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 1.1em;
                    font-weight: bold;
                    transition: background-color 0.3s, transform 0.1s;
                }
                #vton-widget button:hover:not(:disabled) {
                    background-color: #43a047;
                    transform: translateY(-1px);
                }
                #vton-widget button:disabled {
                    background-color: #a5d6a7;
                    cursor: not-allowed;
                }
                #vton-result-area {
                    margin-top: 30px;
                    text-align: center;
                    padding-top: 15px;
                    border-top: 1px solid #f0f0f0;
                }
                #vton-result-area h4 {
                    color: #1a1a1a;
                    margin-bottom: 15px;
                }
                #vton-result-image {
                    max-width: 100%;
                    height: auto;
                    min-height: 200px;
                    border: 3px solid #4CAF50;
                    border-radius: 10px;
                    display: none;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.1);
                }
                #vton-status-message {
                    margin-top: 15px;
                    padding: 10px;
                    border-radius: 6px;
                    text-align: center;
                    font-size: 1em;
                }
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
        const rootElement = document.getElementById("vton");
        if (!rootElement) {
            // Widget container is missing, but VTON.process might still be used.
            // Check if statusElement is already defined for VTON.process context.
            if (!statusElement) { 
                console.warn("VTON Widget container ('#vton') not found. Programmatic use via VTON.process() is still available.");
            }
            return;
        }

        const externalTargetElement = determineTargetElement(rootElement);

        // Render the widget UI, adjusting the result section based on the target
        rootElement.innerHTML = getWidgetHtml(externalTargetElement);

        // Get elements for the generated UI
        const personImageFileInput = document.getElementById("personImageFile");
        const clothImageFileInput = document.getElementById("clothImageFile");
        const personImagePreview = document.getElementById("personImagePreview");
        const clothImagePreview = document.getElementById("clothImagePreview");
        const generateButton = document.getElementById("vton-generate-button");
        statusElement = document.getElementById("vton-status-message"); // Assign to global status element

        // Select the result display element: either the external target or the internal one
        const finalResultImage = externalTargetElement || document.getElementById("vton-result-image");

        // Set up real-time image previews
        setupImagePreview(personImageFileInput, personImagePreview);
        setupImagePreview(clothImageFileInput, clothImagePreview);

        // Event listener for the generate button (Manual File Upload)
        generateButton.addEventListener("click", async () => {
            const personFile = personImageFileInput.files[0];
            const clothFile = clothImageFileInput.files[0];
            
            if (!personFile || !clothFile) {
                statusElement.textContent = `Error: Please upload both images.`;
                statusElement.className = 'status-error';
                return;
            }

            try {
                const [personImageBase64, garmentImageBase64] = await Promise.all([
                    fileToBase64(personFile),
                    fileToBase64(clothFile)
                ]);
                
                // Call the core processing function
                await processTryOn(personImageBase64, garmentImageBase64, finalResultImage, statusElement, generateButton);

            } catch (error) {
                console.error("VTON Widget File Read Error:", error);
                statusElement.textContent = `Error reading files.`;
                statusElement.className = 'status-error';
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
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initializeWidget);
            } else {
                initializeWidget();
            }
        },

        /**
         * Method 4: Programmatically triggers try-on using image URLs.
         */
        process: async (options) => {
            if (!options || !options.personImageUrl || !options.garmentImageUrl || !options.target) {
                console.error("VTON.process() Error: Missing required options (personImageUrl, garmentImageUrl, target).");
                return;
            }
            
            // Create a dummy status element if the widget wasn't initialized
            if (!statusElement) {
                statusElement = document.createElement('div');
                statusElement.id = 'vton-status-process';
                document.body.appendChild(statusElement); // Append to body for visibility
            }
            
            const targetElement = document.querySelector(options.target);
            if (!targetElement || targetElement.tagName !== 'IMG') {
                console.error(`VTON.process() Error: Target element '${options.target}' not found or is not an <img>.`);
                statusElement.textContent = `VTON.process() Error: Target image not found.`;
                statusElement.className = 'status-error';
                return;
            }

            try {
                // 1. Fetch URLs and convert to Base64 in parallel
                statusElement.textContent = "Fetching images and converting to data...";
                statusElement.className = 'status-info';

                const [personImageBase64, garmentImageBase64] = await Promise.all([
                    urlToBase64(options.personImageUrl),
                    urlToBase64(options.garmentImageUrl)
                ]);

                // 2. Call the core processing function
                await processTryOn(personImageBase64, garmentImageBase64, targetElement, statusElement, null); // null for generateButton
                
            } catch (error) {
                console.error("VTON.process() Initialization Error:", error);
                statusElement.textContent = `VTON.process() Error: Failed to fetch image URLs.`;
                statusElement.className = 'status-error';
            }
        }
    };

    // ------------------------------------------------------------------
    // DEFAULT INITIALIZATION (Method 2 & 3 checks run here)
    // ------------------------------------------------------------------
    if (document.getElementById("vton")) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeWidget);
        } else {
            initializeWidget();
        }
    }
})();
