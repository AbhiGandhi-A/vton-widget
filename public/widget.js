(function() {
  'use strict';

  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  let API_BASE_URL = window.VTON_API_URL;

  if (!API_BASE_URL) {
    if (isLocalhost) {
      API_BASE_URL = 'http://localhost:3000';
    } else {
      // For Vercel: use same origin, API routes are served from /api
      API_BASE_URL = window.location.origin;
    }
  }

  const CONFIG = {
    apiBaseUrl: API_BASE_URL,
    timeout: 180000
  };

  console.log('[VTON] Initialized with API URL:', CONFIG.apiBaseUrl);

  function injectStyles() {
    if (document.getElementById('vton-widget-styles')) {
      return;
    }
    const styles = document.createElement('style');
    styles.id = 'vton-widget-styles';
    styles.textContent = `
      .vton-container {
        max-width: 600px;
        margin: 0 auto;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #1a1a2e;
      }
      .vton-widget {
        background: white;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
        overflow: hidden;
      }
      .vton-header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 24px;
        text-align: center;
      }
      .vton-header h2 {
        margin: 0 0 8px 0;
        font-size: 24px;
        font-weight: 700;
      }
      .vton-header p {
        margin: 0;
        font-size: 14px;
        opacity: 0.9;
      }
      .vton-content {
        padding: 24px;
      }
      .vton-step {
        margin-bottom: 24px;
      }
      .vton-step-label {
        font-weight: 600;
        color: #1a1a2e;
        margin-bottom: 12px;
        font-size: 14px;
      }
      .vton-upload-area {
        border: 2px dashed #cbd5e0;
        border-radius: 8px;
        padding: 32px 24px;
        text-align: center;
        cursor: pointer;
        transition: all 0.3s ease;
        background: #f8f9fa;
      }
      .vton-upload-area:hover {
        border-color: #667eea;
        background: #f0f4ff;
      }
      .vton-upload-area.active {
        border-color: #667eea;
        background: #f0f4ff;
      }
      .vton-upload-icon {
        font-size: 40px;
        margin-bottom: 12px;
      }
      .vton-upload-text {
        font-weight: 600;
        color: #1a1a2e;
        margin-bottom: 4px;
      }
      .vton-upload-subtext {
        font-size: 12px;
        color: #718096;
      }
      .vton-file-input {
        display: none;
      }
      .vton-preview {
        border-radius: 8px;
        overflow: hidden;
        background: #f8f9fa;
      }
      .vton-preview-image {
        width: 100%;
        height: auto;
        display: block;
        border-radius: 8px;
      }
      .vton-preview-label {
        font-size: 12px;
        color: #718096;
        margin-bottom: 8px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .vton-button {
        display: inline-block;
        padding: 12px 24px;
        border-radius: 8px;
        border: none;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        text-align: center;
      }
      .vton-button-primary {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        width: 100%;
        margin-top: 12px;
      }
      .vton-button-primary:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
      }
      .vton-button-primary:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .vton-button-secondary {
        background: #e2e8f0;
        color: #1a1a2e;
        margin-top: 8px;
        width: 100%;
      }
      .vton-button-secondary:hover {
        background: #cbd5e0;
      }
      .vton-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 24px;
      }
      .vton-spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #e2e8f0;
        border-top: 4px solid #667eea;
        border-radius: 50%;
        animation: vton-spin 1s linear infinite;
        margin-bottom: 16px;
      }
      @keyframes vton-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .vton-loading-text {
        color: #718096;
        font-size: 14px;
        text-align: center;
      }
      .vton-error {
        background: #fed7d7;
        color: #c53030;
        padding: 12px;
        border-radius: 8px;
        font-size: 14px;
        margin-bottom: 16px;
        line-height: 1.5;
      }
      .vton-error-quota {
        background: #fef3c7;
        color: #92400e;
        border-left: 4px solid #f59e0b;
      }
      .vton-success {
        background: #c6f6d5;
        color: #22543d;
        padding: 12px;
        border-radius: 8px;
        font-size: 14px;
        margin-bottom: 16px;
      }
      .vton-result {
        margin-top: 24px;
      }
      .vton-result-image {
        width: 100%;
        height: auto;
        border-radius: 8px;
        display: block;
        margin-bottom: 16px;
      }
      .vton-result-badge {
        display: inline-block;
        background: #c6f6d5;
        color: #22543d;
        padding: 6px 12px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
      }
      .vton-two-column {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        margin-bottom: 16px;
      }
      @media (max-width: 600px) {
        .vton-two-column {
          grid-template-columns: 1fr;
        }
        .vton-header h2 {
          font-size: 20px;
        }
        .vton-container {
          max-width: 100%;
        }
      }
    `;
    document.head.appendChild(styles);
  }

  class VirtualTryOnWidget {
    constructor(containerId) {
      this.container = document.getElementById(containerId);
      if (!this.container) {
        console.error(`[VTON] Container with id "${containerId}" not found`);
        return;
      }
      this.state = {
        userImage: null,
        clothImage: null,
        result: null,
        loading: false,
        error: null
      };
      this.render();
    }

    render() {
      injectStyles();
      const containerId = this.container.id;
      const html = `
        <div class="vton-container">
          <div class="vton-widget">
            <div class="vton-header">
              <h2>Virtual Try-On</h2>
              <p>Upload your photo and clothing to see the result</p>
            </div>
            <div class="vton-content">
              <div id="vton-error-container-${containerId}"></div>
              <div id="vton-success-container-${containerId}"></div>
              <div id="vton-input-section-${containerId}">
                <div class="vton-two-column">
                  <div class="vton-step">
                    <div class="vton-step-label">Your Photo</div>
                    <div class="vton-upload-area" id="vton-user-upload-${containerId}" onclick="document.getElementById('vton-user-input-${containerId}').click()">
                      <div class="vton-upload-icon">👤</div>
                      <div class="vton-upload-text">Upload Your Photo</div>
                      <div class="vton-upload-subtext">JPG, PNG (Max 10MB)</div>
                    </div>
                    <input type="file" id="vton-user-input-${containerId}" class="vton-file-input" accept="image/*">
                    <div id="vton-user-preview-${containerId}"></div>
                  </div>
                  <div class="vton-step">
                    <div class="vton-step-label">Clothing Image</div>
                    <div class="vton-upload-area" id="vton-cloth-upload-${containerId}" onclick="document.getElementById('vton-cloth-input-${containerId}').click()">
                      <div class="vton-upload-icon">👕</div>
                      <div class="vton-upload-text">Upload Clothing</div>
                      <div class="vton-upload-subtext">JPG, PNG (Max 10MB)</div>
                    </div>
                    <input type="file" id="vton-cloth-input-${containerId}" class="vton-file-input" accept="image/*">
                    <div id="vton-cloth-preview-${containerId}"></div>
                  </div>
                </div>
                <button id="vton-generate-btn-${containerId}" class="vton-button vton-button-primary" disabled>
                  Generate Try-On
                </button>
              </div>
              <div id="vton-loading-section-${containerId}" style="display: none;">
                <div class="vton-loading">
                  <div class="vton-spinner"></div>
                  <div class="vton-loading-text">
                    <p>Processing your images...</p>
                    <p style="font-size: 12px; opacity: 0.7; margin-top: 8px;">This may take up to 3 minutes</p>
                  </div>
                </div>
              </div>
              <div id="vton-result-section-${containerId}" style="display: none;">
                <div class="vton-result">
                  <div class="vton-preview-label">Virtual Try-On Result</div>
                  <img id="vton-result-image-${containerId}" class="vton-result-image" alt="Result">
                  <div style="margin-bottom: 16px;">
                    <span class="vton-result-badge">✓ Try-on complete</span>
                  </div>
                </div>
                <button id="vton-reset-btn-${containerId}" class="vton-button vton-button-secondary">
                  Try Again
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
      this.container.innerHTML = html;
      this.attachEventListeners(containerId);
    }

    attachEventListeners(containerId) {
      const userInput = document.getElementById(`vton-user-input-${containerId}`);
      const clothInput = document.getElementById(`vton-cloth-input-${containerId}`);
      const generateBtn = document.getElementById(`vton-generate-btn-${containerId}`);
      const resetBtn = document.getElementById(`vton-reset-btn-${containerId}`);

      userInput.addEventListener('change', (e) => this.handleUserImageUpload(e, containerId));
      clothInput.addEventListener('change', (e) => this.handleClothImageUpload(e, containerId));
      generateBtn.addEventListener('click', () => this.generateTryOn(containerId));
      resetBtn.addEventListener('click', () => this.reset(containerId));
    }

    handleUserImageUpload(event, containerId) {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        this.showError('Image size must be less than 10MB', containerId);
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        this.state.userImage = e.target.result;
        this.displayPreview('user', e.target.result, containerId);
        this.updateGenerateButton(containerId);
      };
      reader.readAsDataURL(file);
    }

    handleClothImageUpload(event, containerId) {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        this.showError('Image size must be less than 10MB', containerId);
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        this.state.clothImage = e.target.result;
        this.displayPreview('cloth', e.target.result, containerId);
        this.updateGenerateButton(containerId);
      };
      reader.readAsDataURL(file);
    }

    displayPreview(type, imageData, containerId) {
      const previewContainer = document.getElementById(`vton-${type}-preview-${containerId}`);
      const uploadArea = document.getElementById(`vton-${type}-upload-${containerId}`);
      uploadArea.style.display = 'none';
      previewContainer.innerHTML = `
        <div style="margin-top: 12px;">
          <div class="vton-preview-label">Selected</div>
          <img src="${imageData}" class="vton-preview-image" alt="Preview">
        </div>
      `;
    }

    updateGenerateButton(containerId) {
      const btn = document.getElementById(`vton-generate-btn-${containerId}`);
      if (this.state.userImage && this.state.clothImage) {
        btn.disabled = false;
      } else {
        btn.disabled = true;
      }
    }

    async generateTryOn(containerId) {
      if (!this.state.userImage || !this.state.clothImage) {
        this.showError('Please upload both images', containerId);
        return;
      }

      this.state.loading = true;
      this.showLoading(containerId);

      try {
        const endpoint = `${CONFIG.apiBaseUrl}/api/vton-process`;
        console.log('[VTON] Sending request to:', endpoint);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userImage: this.state.userImage,
            clothImage: this.state.clothImage
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const contentType = response.headers.get('content-type');
          let errorDetails = {};
          
          if (contentType?.includes('application/json')) {
            try {
              errorDetails = await response.json();
            } catch (e) {
              errorDetails = { message: `Server error: ${response.status}` };
            }
          } else {
            errorDetails = { message: `Server error: ${response.status}` };
          }

          const serverMessage = errorDetails.message || 'Unknown error';
          if (response.status === 429 || errorDetails.errorType === 'quota_limit') {
            const quotaError = new Error('QUOTA_LIMIT');
            quotaError.customMessage = serverMessage;
            throw quotaError;
          }
          throw new Error(serverMessage);
        }

        const data = await response.json();
        this.state.result = data.result;
        this.showResult(containerId);

      } catch (error) {
        console.error('[VTON] Error:', error);
        let errorMessage = error.message || 'An error occurred. Please try again.';
        
        if (error.name === 'AbortError') {
          errorMessage = 'Request timed out. Please try again.';
        } else if (error.message === 'QUOTA_LIMIT') {
          errorMessage = error.customMessage || 'AI service quota limit reached. Please try again later.';
        }
        
        this.showError(errorMessage, containerId);

      } finally {
        this.state.loading = false;
      }
    }

    showLoading(containerId) {
      document.getElementById(`vton-input-section-${containerId}`).style.display = 'none';
      document.getElementById(`vton-loading-section-${containerId}`).style.display = 'block';
      document.getElementById(`vton-result-section-${containerId}`).style.display = 'none';
      this.clearMessage(containerId);
    }

    showResult(containerId) {
      const resultImage = document.getElementById(`vton-result-image-${containerId}`);
      resultImage.src = `data:image/jpeg;base64,${this.state.result}`;
      document.getElementById(`vton-input-section-${containerId}`).style.display = 'none';
      document.getElementById(`vton-loading-section-${containerId}`).style.display = 'none';
      document.getElementById(`vton-result-section-${containerId}`).style.display = 'block';
      this.showSuccess('Virtual try-on completed successfully!', containerId);
    }

    reset(containerId) {
      this.state = {
        userImage: null,
        clothImage: null,
        result: null,
        loading: false,
        error: null
      };
      document.getElementById(`vton-user-input-${containerId}`).value = '';
      document.getElementById(`vton-cloth-input-${containerId}`).value = '';
      document.getElementById(`vton-user-preview-${containerId}`).innerHTML = '';
      document.getElementById(`vton-cloth-preview-${containerId}`).innerHTML = '';
      document.getElementById(`vton-user-upload-${containerId}`).style.display = 'block';
      document.getElementById(`vton-cloth-upload-${containerId}`).style.display = 'block';
      document.getElementById(`vton-input-section-${containerId}`).style.display = 'block';
      document.getElementById(`vton-loading-section-${containerId}`).style.display = 'none';
      document.getElementById(`vton-result-section-${containerId}`).style.display = 'none';
      this.updateGenerateButton(containerId);
      this.clearMessage(containerId);
    }

    showError(message, containerId) {
      const container = document.getElementById(`vton-error-container-${containerId}`);
      let cssClass = 'vton-error';
      
      if (message.includes('quota') || message.includes('unavailable') || message.includes('overloaded')) {
        cssClass = 'vton-error vton-error-quota';
      }
      
      container.innerHTML = `<div class="${cssClass}">${message}</div>`;
      const timeout = message.includes('quota') ? 8000 : 5000;
      
      setTimeout(() => {
        container.innerHTML = '';
      }, timeout);

      document.getElementById(`vton-input-section-${containerId}`).style.display = 'block';
      document.getElementById(`vton-loading-section-${containerId}`).style.display = 'none';
      document.getElementById(`vton-result-section-${containerId}`).style.display = 'none';
    }

    showSuccess(message, containerId) {
      const container = document.getElementById(`vton-success-container-${containerId}`);
      container.innerHTML = `<div class="vton-success">${message}</div>`;
      setTimeout(() => {
        container.innerHTML = '';
      }, 5000);
    }

    clearMessage(containerId) {
      document.getElementById(`vton-error-container-${containerId}`).innerHTML = '';
      document.getElementById(`vton-success-container-${containerId}`).innerHTML = '';
    }
  }

  function initializeWidget() {
    const containers = document.querySelectorAll('[data-vton-widget]');
    containers.forEach((container) => {
      if (!container.dataset.initialized) {
        container.dataset.initialized = 'true';
        new VirtualTryOnWidget(container.id);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeWidget);
  } else {
    initializeWidget();
  }

  function initializeLegacyWidget() {
    const legacyContainer = document.getElementById('vton');
    if (legacyContainer && !legacyContainer.dataset.initialized) {
      legacyContainer.dataset.initialized = 'true';
      new VirtualTryOnWidget('vton');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeLegacyWidget);
  } else {
    initializeLegacyWidget();
  }

  window.VirtualTryOn = {
    Widget: VirtualTryOnWidget,
    config: CONFIG
  };
})();
