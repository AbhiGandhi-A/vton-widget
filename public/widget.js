// public/widget.js
(function() {
    // VTON_API_URL is injected by the server.js on the fly.
    const API_ENDPOINT = (window.VTON_API_URL || "https://vton-widget-k4hh.onrender.com") + "/api/virtual-tryon/process";
    
    // Global variable to store the target selector from VTON.init()
    let globalTargetSelector = null; 

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
        const selectorAttribute = rootElement.getAttribute('data-target-selector') || rootElement.getAttribute('data-target-id'); // Keep 'data-target-id' for backwards compatibility
        if (selectorAttribute) {
            const externalElement = document.querySelector(selectorAttribute);
            if (externalElement && externalElement.tagName === 'IMG') {
                return externalElement;
            }
        }

        // 3. Priority 3: data-vton-target on the image itself (Cleaned up from data-atr="apply-Hrer")
        const imageTarget = document.querySelector('img[data-vton-target]');
        if (imageTarget) {
            return imageTarget;
        }

        // 4. Fallback: Internal display
        return null;
    }


    /**
     * Converts a File object to a Base64 string. (Omitted for brevity, assume content is same)
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
     * Displays a preview of the selected image. (Omitted for brevity, assume content is same)
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
            console.error("VTON Widget: Could not find root element with ID 'vton'.");
            return;
        }

        const externalTargetElement = determineTargetElement(rootElement);

        // Render the widget UI, adjusting the result section based on the target
        rootElement.innerHTML = getWidgetHtml(externalTargetElement);

        // Get elements
        const personImageFileInput = document.getElementById("personImageFile");
        const clothImageFileInput = document.getElementById("clothImageFile");
        const personImagePreview = document.getElementById("personImagePreview");
        const clothImagePreview = document.getElementById("clothImagePreview");
        const generateButton = document.getElementById("vton-generate-button");
        const statusMessage = document.getElementById("vton-status-message");

        // Select the result display element: either the external target or the internal one
        const finalResultImage = externalTargetElement || document.getElementById("vton-result-image");


        // Set up real-time image previews
        setupImagePreview(personImageFileInput, personImagePreview);
        setupImagePreview(clothImageFileInput, clothImagePreview);

        // Event listener for the generate button
        generateButton.addEventListener("click", async () => {
            // ... (Image upload and API call logic remains the same)

            // 1. Basic Validation (Omitted for brevity)
            const personFile = personImageFileInput.files[0];
            const clothFile = clothImageFileInput.files[0];
            if (!personFile || !clothFile) {
                statusMessage.textContent = `Error: Please upload both images.`;
                statusMessage.className = 'status-error';
                return;
            }

            // 2. Start Processing (Omitted for brevity)
            generateButton.disabled = true;
            statusMessage.textContent = "Uploading and processing... This may take up to 3 minutes.";
            statusMessage.className = 'status-info';

            if (!externalTargetElement) {
                finalResultImage.style.display = 'none';
            }
            finalResultImage.src = ""; 

            try {
                const [personImageBase64, garmentImageBase64] = await Promise.all([
                    fileToBase64(personFile),
                    fileToBase64(clothFile)
                ]);

                const response = await fetch(API_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ personImageBase64, garmentImageBase64 })
                });

                const data = await response.json();

                // 5. Handle Response
                if (response.ok && data.status === 'success' && data.processed_image_base64) {
                    const base64Image = data.processed_image_base64;

                    finalResultImage.src = `data:image/jpeg;base64,${base64Image}`;
                    if (!externalTargetElement) {
                       finalResultImage.style.display = 'block';
                    }

                    statusMessage.textContent = "Success! Image generated.";
                    statusMessage.className = 'status-success';
                } else {
                    const errorMsg = data.message || data.errorDetails || "An unknown error occurred during processing.";
                    statusMessage.textContent = `Error: ${errorMsg}`;
                    statusMessage.className = 'status-error';
                }

            } catch (error) {
                console.error("VTON Widget Fetch Error:", error);
                statusMessage.textContent = `Network/System Error: Could not connect to the server.`;
                statusMessage.className = 'status-error';
            } finally {
                generateButton.disabled = false;
            }
        });
    }
    
    // ------------------------------------------------------------------
    // EXPOSE GLOBAL API (Method 1: Programmatic Initialization)
    // ------------------------------------------------------------------
    window.VTON = {
        init: (options) => {
            if (options && options.target) {
                // Store the selector provided by the user globally
                globalTargetSelector = options.target; 
            }
            // Now proceed with the standard initialization to render the widget
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initializeWidget);
            } else {
                initializeWidget();
            }
        }
    };

    // ------------------------------------------------------------------
    // DEFAULT INITIALIZATION (If VTON.init is NOT used)
    // ------------------------------------------------------------------
    if (document.getElementById("vton")) {
        // If the 'vton' div exists, but VTON.init wasn't called (which would set globalTargetSelector),
        // we use the standard flow and check for attributes inside initializeWidget.
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeWidget);
        } else {
            initializeWidget();
        }
    }
})();
