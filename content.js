// Ensure this script runs only once per injection
if (!window.webDrawInitialized) {
  window.webDrawInitialized = true;

  console.log("WebDraw: Script starting initialization...");

  let isActive = false;
  let canvas = null;
  let ctx = null;
  let toolbox = null;
  let textInputDiv = null;
  let isDrawing = false;
  let currentTool = 'pencil'; // 'pencil', 'rect', 'text'
  let currentColor = '#FF0000'; // Default Red
  let currentLineWidth = 3;
  let startX, startY; // Store DOC relative start coords for rect/text
  let drawings = []; // Store drawing objects { type, x, y, width, height, color, width, text, points }
  const PAGE_STORAGE_KEY_PREFIX = 'webDraw_';

  // --- Initialization ---

  function initializeDrawing() {
    console.log("WebDraw: Initializing...");
    if (!createCanvas()) return false; // Stop if canvas fails
    createToolbox();
    addEventListeners();
    loadDrawings(); // Load existing drawings for this URL (redraws async)
    isActive = true;
    document.body.style.cursor = 'crosshair';
    console.log("WebDraw: Active.");
    return true;
  }

  function createCanvas() {
    if (document.getElementById('webDrawCanvas')) {
        console.warn("WebDraw: Canvas already exists. Aborting creation.");
        return false; // Prevent multiple canvases
    }
    canvas = document.createElement('canvas');
    canvas.id = 'webDrawCanvas';
    canvas.style.position = 'absolute'; // Relative to document body or nearest positioned ancestor
    canvas.style.top = '0px';
    canvas.style.left = '0px';
    // Match the scrollable size of the document
    canvas.width = Math.max(document.body.scrollWidth, document.documentElement.scrollWidth, document.body.offsetWidth, document.documentElement.offsetWidth);
    canvas.height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, document.body.offsetHeight, document.documentElement.offsetHeight);
    canvas.style.zIndex = '10000';
    canvas.style.pointerEvents = 'auto'; // Capture mouse events only when active
    // canvas.style.backgroundColor = 'rgba(0, 255, 0, 0.1)'; // DEBUG: Make canvas visible

    document.body.appendChild(canvas);
    console.log(`WebDraw: Canvas created W: ${canvas.width} H: ${canvas.height}`);

    ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        console.log("WebDraw: Canvas context (ctx) obtained successfully.");
        // *** Direct Test Draw (Optional - uncomment to test canvas visibility) ***
        // ctx.fillStyle = 'lime';
        // ctx.fillRect(20, 20, 200, 100);
        // ctx.font = '24px sans-serif';
        // ctx.fillStyle = 'black';
        // ctx.fillText('Canvas Test OK?', 30, 50);
        // console.log("Direct test draw attempted.");
        return true; // Indicate success
    } else {
        console.error("WebDraw: Failed to get 2D context for canvas!");
        canvas.remove(); // Clean up failed canvas
        canvas = null;
        return false; // Indicate failure
    }
  }

  function createToolbox() {
    if (document.getElementById('webDrawToolbox')) return; // Prevent multiple toolboxes
      toolbox = document.createElement('div');
      toolbox.id = 'webDrawToolbox';
      toolbox.innerHTML = `
          <div class="webdraw-title">WebDraw</div>
          <button data-tool="pencil" class="webdraw-button active" title="Pencil (P)">✏️</button>
          <button data-tool="rect" class="webdraw-button" title="Rectangle (R)">⬜</button>
          <button data-tool="text" class="webdraw-button" title="Text (T)"> T </button>
          <input type="color" id="webDrawColorPicker" value="${currentColor}" title="Color">
          <button data-tool="clear" class="webdraw-button" title="Clear All">🗑️</button>
          <button data-tool="share" class="webdraw-button" title="Share (Conceptual)">🔗</button>
          <button data-tool="exit" class="webdraw-button" title="Exit (Esc)">❌</button>
      `;
      document.body.appendChild(toolbox);
      console.log("WebDraw: Toolbox created.");

      toolbox.addEventListener('click', handleToolboxClick);
      const colorPicker = document.getElementById('webDrawColorPicker');
      if(colorPicker) {
        colorPicker.addEventListener('input', (e) => { currentColor = e.target.value; });
      }
  }

 function handleToolboxClick(e) {
    const targetButton = e.target.closest('button[data-tool]');
    const targetColorPicker = e.target.closest('#webDrawColorPicker');

    if (targetButton) {
        const tool = targetButton.getAttribute('data-tool');
        const currentActiveButton = toolbox.querySelector('.webdraw-button.active');

        if (tool === 'clear') {
            if (confirm('Are you sure you want to clear all drawings?')) {
                drawings = [];
                saveDrawings();
                redrawCanvas();
                console.log("WebDraw: Drawings cleared.");
            }
            // Keep the previously active tool button highlighted
            return; // Don't change the active tool
        } else if (tool === 'exit') {
            deactivateDrawing();
            return;
        } else if (tool === 'share') {
            shareDrawing();
            // Keep the previously active tool button highlighted
            return; // Don't change the active tool
        } else if (tool) {
            // Switch tool
            if (currentActiveButton) currentActiveButton.classList.remove('active');
            currentTool = tool;
            targetButton.classList.add('active');
            if (textInputDiv) removeTextInput(); // Clean up text input if switching
            console.log("Selected tool:", currentTool);
        }
    } else if (targetColorPicker) {
        // Allow color picker interaction without changing tool state
        // The 'input' event handler already updates currentColor
    }
}


  // --- Event Handling ---

  function addEventListeners() {
    console.log("WebDraw: Adding event listeners.");
    if (!canvas) {
        console.error("WebDraw: Cannot add listeners, canvas not found!");
        return;
    }
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseLeave); // Handle leaving canvas while drawing
    window.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', handleResize);
    document.addEventListener('keydown', handleKeyDown);
    console.log("WebDraw: Event listeners added.");
  }

  function removeEventListeners() {
    console.log("WebDraw: Removing event listeners.");
    if (canvas) {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
    }
    window.removeEventListener('scroll', handleScroll);
    window.removeEventListener('resize', handleResize);
    document.removeEventListener('keydown', handleKeyDown);
  }

  // Debounce/Throttle Resize/Scroll if performance issues arise
  function handleScroll() { requestAnimationFrame(redrawCanvas); }
  function handleResize() {
    console.log("WebDraw: Resize detected.");
    if (!canvas || !ctx) return;
    // Update canvas dimensions to match potentially changed document size
    canvas.width = Math.max(document.body.scrollWidth, document.documentElement.scrollWidth);
    canvas.height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    // Reset context properties
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    console.log(`WebDraw: Canvas resized W: ${canvas.width} H: ${canvas.height}. Redrawing.`);
    redrawCanvas();
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      console.log("WebDraw: Escape key pressed.");
      if (textInputDiv) { removeTextInput(); } // Close text input first
      else { deactivateDrawing(); }
    }
    else if (!e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA' && !document.activeElement?.isContentEditable) {
        // Basic shortcuts, avoid interfering with text fields
        if (e.key.toLowerCase() === 'p') switchTool('pencil');
        else if (e.key.toLowerCase() === 'r') switchTool('rect');
        else if (e.key.toLowerCase() === 't') switchTool('text');
    }
  }

  function switchTool(tool) {
       if (!toolbox) return;
       const button = toolbox.querySelector(`button[data-tool="${tool}"]`);
       if (button) {
           handleToolboxClick({ target: button }); // Simulate button click
       }
  }

  // --- Drawing Event Handlers ---

  function getCanvasRelativeCoords(e) {
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      // e.clientX/Y are viewport relative
      // rect.left/top are canvas edge relative to viewport
      // Result is coordinate relative to canvas top-left (0,0)
      return {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
      };
  }

  function getDocumentRelativeCoords(e) {
      // PageX/Y are relative to the top-left of the fully rendered document
      return {
          x: e.pageX,
          y: e.pageY
      };
  }

  function handleMouseDown(e) {
    if (e.button !== 0) return; // Only handle left clicks
    if (!ctx || !canvas) return;

    const docCoords = getDocumentRelativeCoords(e);
    const canvasCoords = getCanvasRelativeCoords(e);
    console.log(`handleMouseDown: Tool: ${currentTool}, Doc(${docCoords.x},${docCoords.y}), Canvas(${canvasCoords.x},${canvasCoords.y})`);

    startX = docCoords.x; // Store document-relative start position
    startY = docCoords.y;
    isDrawing = true;

    if (currentTool === 'pencil') {
        ctx.beginPath();
        ctx.moveTo(canvasCoords.x, canvasCoords.y); // Start drawing at canvas coord
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = currentLineWidth;
        // Start the new drawing object
        drawings.push({
            type: 'pencil',
            points: [docCoords], // Store starting doc coord
            color: currentColor,
            width: currentLineWidth
        });
    } else if (currentTool === 'text') {
        isDrawing = false; // Text is placed on click, no drag drawing needed
        createTextPrompt(docCoords.x, docCoords.y);
    } else if (currentTool === 'rect') {
        // For rect, we just record the start point. Drawing happens on mouse move/up.
        // No initial drawing object is created yet.
    }
    e.preventDefault(); // Prevent default browser drag behaviors
  }

  function handleMouseMove(e) {
    if (!isDrawing || !ctx || !canvas) return;

    const canvasCoords = getCanvasRelativeCoords(e);
    const docCoords = getDocumentRelativeCoords(e);

    if (currentTool === 'pencil') {
        ctx.lineTo(canvasCoords.x, canvasCoords.y); // Draw using canvas coords
        ctx.stroke();
        // Add current doc coord to the points array of the last drawing
        const currentPath = drawings[drawings.length - 1];
        if (currentPath && currentPath.type === 'pencil') {
            currentPath.points.push(docCoords);
        }
    } else if (currentTool === 'rect') {
        // Draw the preview rectangle
        redrawCanvas(); // Clear and redraw previous shapes
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = currentLineWidth;
        // Convert START doc coords to CURRENT canvas coords for preview rect
        const rect = canvas.getBoundingClientRect();
        const startCanvasX = startX - window.scrollX - rect.left;
        const startCanvasY = startY - window.scrollY - rect.top;
        // Use current canvas coords for the moving corner
        ctx.strokeRect(startCanvasX, startCanvasY, canvasCoords.x - startCanvasX, canvasCoords.y - startCanvasY);
    }
  }

  function handleMouseUp(e) {
    if (e.button !== 0 || !isDrawing) return; // Only left clicks, only if drawing was active

    const docCoords = getDocumentRelativeCoords(e);
    console.log(`handleMouseUp: Tool: ${currentTool}, Doc(${docCoords.x},${docCoords.y})`);

    if (currentTool === 'pencil') {
        if (ctx) ctx.closePath(); // Should already have points stored
    } else if (currentTool === 'rect') {
        // Finalize rectangle using DOCUMENT coordinates
        const rectX = Math.min(startX, docCoords.x);
        const rectY = Math.min(startY, docCoords.y);
        const rectWidth = Math.abs(docCoords.x - startX);
        const rectHeight = Math.abs(docCoords.y - startY);

        if (rectWidth > 1 || rectHeight > 1) { // Avoid tiny accidental rects
            drawings.push({
                type: 'rect',
                x: rectX, // Store doc coords
                y: rectY,
                width: rectWidth,
                height: rectHeight,
                color: currentColor,
                width: currentLineWidth
            });
            console.log("Rectangle saved:", { rectX, rectY, rectWidth, rectHeight });
        } else {
             console.log("Rectangle too small, not saved.");
        }
        redrawCanvas(); // Redraw to show final rectangle from stored data
    }

    isDrawing = false;
    // Save regardless of tool, might be empty if rect was too small
    saveDrawings();
    console.log("Drawing finished, saved drawings.");
  }

    function handleMouseLeave(e) {
        // If actively drawing (mouse button down) when leaving canvas, stop drawing
        if (isDrawing) {
            console.log("Mouse left canvas while drawing, finalizing shape.");
            handleMouseUp(e); // Treat as mouse up to finalize shape
        }
    }

  // --- Text Input ---

 function createTextPrompt(docX, docY) {
    if (textInputDiv) removeTextInput(); // Remove existing one first

    console.log("createTextPrompt: Creating input at Doc Coords:", docX, docY);
    textInputDiv = document.createElement('div');
    textInputDiv.id = 'webDrawTextInput';
    textInputDiv.contentEditable = true;
    textInputDiv.spellcheck = false; // Optional: disable spellcheck

    // *** DEBUG STYLES - Make it very visible ***
    // textInputDiv.style.border = '2px solid red';
    // textInputDiv.style.backgroundColor = 'yellow';
    // textInputDiv.style.minHeight = '20px';
    // *** END DEBUG STYLES ***

    // Apply styles (ensure these are sufficient)
    textInputDiv.style.position = 'absolute'; // Position relative to document
    textInputDiv.style.left = `${docX}px`;
    textInputDiv.style.top = `${docY}px`;
    textInputDiv.style.zIndex = '10002'; // Above canvas, potentially below toolbox
    textInputDiv.style.border = '1px dashed #555';
    textInputDiv.style.padding = '5px 8px';
    textInputDiv.style.backgroundColor = 'rgba(255, 255, 224, 0.95)'; // Light yellow bg
    textInputDiv.style.minWidth = '60px';
    textInputDiv.style.fontFamily = '"Virgil", "Helvetica Neue", Arial, sans-serif';
    textInputDiv.style.fontSize = '16px';
    textInputDiv.style.color = '#000';
    textInputDiv.style.lineHeight = '1.4';
    textInputDiv.style.outline = 'none';
    textInputDiv.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';
    textInputDiv.style.overflowWrap = 'break-word'; // Wrap long words

    console.log("Appending text input div to body:", textInputDiv);
    document.body.appendChild(textInputDiv);
    console.log("Text input appended. Attempting focus...");
    textInputDiv.focus();
    // Use setTimeout to check focus slightly after, sometimes needed
    setTimeout(() => {
         if (document.activeElement === textInputDiv) {
            console.log("Text input focused successfully.");
         } else {
            console.warn("Text input failed to gain focus.");
         }
         console.log("Text input computed styles - Left:", getComputedStyle(textInputDiv).left, "Top:", getComputedStyle(textInputDiv).top);
    }, 0);


    textInputDiv.addEventListener('keydown', (e) => {
        // console.log("Text input keydown:", e.key);
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); // Prevent newline in div
            console.log("Text input: Enter pressed.");
            saveText(docX, docY, textInputDiv.innerText); // Pass current doc coords
        } else if (e.key === 'Escape') {
             console.log("Text input: Escape pressed.");
             removeTextInput();
        }
    });

    // Use 'mousedown' outside the input to trigger save/remove on click away
    // Using blur can be tricky if focus shifts briefly for other reasons
    const handleOutsideClick = (event) => {
         if (textInputDiv && !textInputDiv.contains(event.target)) {
             console.log("Text input: Click outside detected.");
             saveOrRemoveTextOnExit(docX, docY);
             document.removeEventListener('mousedown', handleOutsideClick, true); // Clean up listener
         }
     };
    // Use capture phase for the listener to catch clicks reliably
    document.addEventListener('mousedown', handleOutsideClick, true);


     // Also handle blur as a fallback, but rely more on outside click
     textInputDiv.addEventListener('blur', () => {
        console.log("Text input: Blur event.");
        // Use a small delay because focus might shift temporarily (e.g., to color picker)
        // Only save/remove if the outside click didn't already handle it.
        setTimeout(() => {
            if (textInputDiv) { // Check if it still exists
                 console.log("Text input: Processing blur after delay.");
                 saveOrRemoveTextOnExit(docX, docY);
                 // Important: Remove the outside click listener if blur handles it
                 document.removeEventListener('mousedown', handleOutsideClick, true);
            }
        }, 100); // 100ms delay
     });
  }


  function saveOrRemoveTextOnExit(docX, docY) {
      if (!textInputDiv) return; // Already removed

      const currentText = textInputDiv.innerText;
      if (currentText.trim()) {
          console.log("Text input: Saving on exit.");
          saveText(docX, docY, currentText); // saveText will call removeTextInput
      } else {
          console.log("Text input: Removing on exit (empty).");
          removeTextInput();
      }
  }


  function saveText(docX, docY, text) {
      const trimmedText = text.trim();
      if (trimmedText && drawings) { // Ensure drawings array exists
          console.log("saveText: Saving text:", trimmedText, "at Doc Coords:", docX, docY);
          drawings.push({
              type: 'text',
              x: docX, // Store original document coords
              y: docY,
              text: trimmedText,
              color: currentColor, // Use selected color
              font: '16px "Virgil", "Helvetica Neue", Arial, sans-serif' // Consistent font
          });
          saveDrawings();
          redrawCanvas(); // Show the newly added text
      } else {
          console.log("saveText: Text was empty or drawings array missing, not saving.");
      }
      removeTextInput(); // Always remove input box after attempt
  }

   function removeTextInput() {
        if (textInputDiv) {
            console.log("removeTextInput: Removing text input div.");
            // Might need to remove specific listeners if added directly to textInputDiv
            textInputDiv.remove();
            textInputDiv = null;
             // Make sure outside click listener is removed if text input is removed via ESC etc.
            // document.removeEventListener('mousedown', handleOutsideClick, true); // This line is problematic if handleOutsideClick is not in scope - better handled inside createTextPrompt cleanup
        }
    }

  // --- Redrawing & Persistence ---

  function redrawCanvas() {
    if (!ctx || !canvas) {
        console.warn("redrawCanvas: Called but ctx or canvas is missing.");
        return;
    }
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Get current canvas position and scroll offset ONCE for this redraw cycle
    const rect = canvas.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    // console.log(`redrawCanvas: scroll(X:${scrollX}, Y:${scrollY}), rect(L:${rect.left}, T:${rect.top})`); // Debug log

    drawings.forEach((d, index) => {
      // Set styles for this drawing
      ctx.strokeStyle = d.color || '#000000';
      ctx.fillStyle = d.color || '#000000'; // Needed for fillText
      ctx.lineWidth = d.width || 1;
      ctx.font = d.font || '16px sans-serif';

      // Convert stored document coordinates to canvas coordinates for drawing
      const getCanvasX = (docX) => docX - scrollX - rect.left;
      const getCanvasY = (docY) => docY - scrollY - rect.top;

      try { // Add error trapping per drawing element
          if (d.type === 'pencil' && d.points && d.points.length > 1) {
              ctx.beginPath();
              ctx.moveTo(getCanvasX(d.points[0].x), getCanvasY(d.points[0].y));
              for (let i = 1; i < d.points.length; i++) {
                  ctx.lineTo(getCanvasX(d.points[i].x), getCanvasY(d.points[i].y));
              }
              ctx.stroke();
          } else if (d.type === 'rect') {
              // Use the stored width/height directly
              ctx.strokeRect(getCanvasX(d.x), getCanvasY(d.y), d.width, d.height);
          } else if (d.type === 'text') {
              const lines = d.text.split('\n');
              const fontSize = parseInt(ctx.font) || 16;
              const lineHeight = fontSize * 1.4; // Use slightly more line height
              const startCanvasX = getCanvasX(d.x);
              const startCanvasY = getCanvasY(d.y);
              lines.forEach((line, lineIndex) => {
                  // Offset each line vertically
                  ctx.fillText(line, startCanvasX, startCanvasY + (lineIndex * lineHeight));
              });
          }
      } catch (drawError) {
          console.error(`WebDraw: Error drawing element ${index} (type: ${d.type}):`, drawError, d);
      }
    });
  }

  function getStorageKey() {
    try {
        const path = window.location.pathname.replace(/[^a-zA-Z0-9/-]/g, '_').substring(0, 100); // Sanitize & limit length
        const origin = window.location.origin;
        return PAGE_STORAGE_KEY_PREFIX + origin + path;
    } catch (e) {
        console.error("WebDraw: Error creating storage key", e);
        return PAGE_STORAGE_KEY_PREFIX + 'fallback_key';
    }
  }

  function saveDrawings() {
    if (!drawings) {
        console.error("WebDraw: saveDrawings called but drawings array is null/undefined.");
        return;
    }
    try {
        const key = getStorageKey();
        const dataToSave = JSON.stringify(drawings);
        if (dataToSave.length > 4.5 * 1024 * 1024) {
             console.warn("WebDraw: Drawing data > 4.5 MB.");
        }
        chrome.storage.local.set({ [key]: dataToSave }, () => {
            if (chrome.runtime.lastError) {
                console.error("WebDraw: Error saving drawings:", chrome.runtime.lastError);
            } // else { console.log("WebDraw: Drawings saved."); } // Reduce noise
        });
    } catch (e) {
        console.error("WebDraw: Error preparing or saving drawings:", e);
        // Consider notifying user if saving fails critically
    }
  }

 function loadDrawings() {
    const key = getStorageKey();
    console.log("WebDraw: Attempting to load drawings for key:", key);
    chrome.storage.local.get([key], (result) => {
        if (chrome.runtime.lastError) {
            console.error("WebDraw: Error loading drawings:", chrome.runtime.lastError);
            drawings = [];
        } else if (result[key]) {
            try {
                const loadedData = JSON.parse(result[key]);
                if (Array.isArray(loadedData)) {
                    // Optional: Basic validation of loaded objects
                    drawings = loadedData.filter(d => d && d.type); // Ensure basic structure
                    console.log(`WebDraw: ${drawings.length} drawings loaded successfully.`);
                } else {
                    console.error("WebDraw: Loaded data is not an array. Resetting.");
                    drawings = [];
                }
            } catch (e) {
                console.error("WebDraw: Error parsing stored drawings:", e);
                drawings = [];
            }
        } else {
            console.log("WebDraw: No existing drawings found.");
            drawings = [];
        }
        // Redraw regardless of load outcome, ensures canvas is updated/cleared
        redrawCanvas();
    });
}


  // --- Sharing (Conceptual) ---

  function shareDrawing() {
      // (Keep conceptual sharing code as is)
      console.log("WebDraw: Share button clicked (Conceptual).");
      const dataToSend = { /* ... */ };
      console.log("WebDraw: Data prepared for sharing:", dataToSend);
      chrome.runtime.sendMessage({ action: "saveDrawingData", data: dataToSend }, (response) => { /* ... */ });
      alert("Sharing is conceptual.\nDrawing data logged to console.");
  }

  // --- Deactivation ---

  function deactivateDrawing() {
    console.log("WebDraw: Deactivating...");
    if (textInputDiv) removeTextInput(); // Clean up text input if open
    removeEventListeners(); // Remove listeners first
    if (canvas) canvas.remove();
    if (toolbox) toolbox.remove();
    canvas = null;
    ctx = null;
    toolbox = null;
    drawings = []; // Clear drawings from memory on deactivate? Or keep? Let's clear for now.
    isActive = false;
    document.body.style.cursor = 'default';
    chrome.runtime.sendMessage({ action: "drawingDeactivated" }).catch(err => console.warn("WebDraw: Error notifying background:", err)); // Use catch for potential errors
    console.log("WebDraw: Deactivated.");
    // Clean up global toggle function if necessary (or check if window.webDrawInitialized = false; is better)
    // delete window.webDrawToggle;
    window.webDrawInitialized = false; // Allow re-initialization
    return false;
  }


  // --- Global Toggle Function ---
  window.webDrawToggle = async () => {
    console.log("WebDraw: Toggle called. Current state isActive =", isActive);
    if (isActive) {
      return deactivateDrawing(); // Return the result (false)
    } else {
      // Re-set flag here to prevent race conditions if init fails
      window.webDrawInitialized = true;
      return initializeDrawing(); // Return the result (true/false)
    }
  };

} else {
    console.log("WebDraw: Initialization skipped - already initialized flag set.");
} // End of window.webDrawInitialized check