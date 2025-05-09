// Ensure this script runs only once per injection
if (!window.webDrawInitialized) {
  window.webDrawInitialized = true;

  console.log("WebDraw: Script starting initialization...");

  let isActive = false;
  let canvas = null;
  let ctx = null;
  let toolbox = null;
  let textInputDiv = null;
  let isDrawing = false; // Flag for drag actions (pencil, rect, arrow)
  let currentTool = "pencil"; // 'pencil', 'rect', 'text', 'arrow', 'select'
  let currentColor = "#228be6";
  let currentLineWidth = 3;
  let startX, startY; // Store DOC relative start coords
  let drawings = []; // Array of drawing objects
  let selectedDrawingIndex = null; // Index of the selected drawing, or null
  const PAGE_STORAGE_KEY_PREFIX = "webDraw_";

  // define all icons used here
  const svgs = {
    select: `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#02af76"><path d="M480-80 310-250l57-57 73 73v-206H235l73 72-58 58L80-480l169-169 57 57-72 72h206v-206l-73 73-57-57 170-170 170 170-57 57-73-73v206h205l-73-72 58-58 170 170-170 170-57-57 73-73H520v205l72-73 58 58L480-80Z"/></svg>`,
    pencil: `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#02af76"><path d="M80 0v-160h800V0H80Zm160-320h56l312-311-29-29-28-28-311 312v56Zm-80 80v-170l448-447q11-11 25.5-17t30.5-6q16 0 31 6t27 18l55 56q12 11 17.5 26t5.5 31q0 15-5.5 29.5T777-687L330-240H160Zm560-504-56-56 56 56ZM608-631l-29-29-28-28 57 57Z"/></svg>`,
    rectangle: `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#02af76"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Z"/></svg>`,
    arrow: `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#02af76"><path d="M80 0v-160h800V0H80Zm160-320h56l312-311-29-29-28-28-311 312v56Zm-80 80v-170l448-447q11-11 25.5-17t30.5-6q16 0 31 6t27 18l55 56q12 11 17.5 26t5.5 31q0 15-5.5 29.5T777-687L330-240H160Zm560-504-56-56 56 56ZM608-631l-29-29-28-28 57 57Z"/></svg>`,
    text: `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#02af76"><path d="M480-80 310-250l57-57 73 73v-206H235l73 72-58 58L80-480l169-169 57 57-72 72h206v-206l-73 73-57-57 170-170 170 170-57 57-73-73v206h205l-73-72 58-58 170 170-170 170-57-57 73-73H520v205l72-73 58 58L480-80Z"/></svg>`,
    share: `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#02af76"><path d="M680-80q-50 0-85-35t-35-85q0-6 3-28L282-392q-16 15-37 23.5t-45 8.5q-50 0-85-35t-35-85q0-50 35-85t85-35q24 0 45 8.5t37 23.5l281-164q-2-7-2.5-13.5T560-760q0-50 35-85t85-35q50 0 85 35t35 85q0 50-35 85t-85 35q-24 0-45-8.5T598-672L317-508q2 7 2.5 13.5t.5 14.5q0 8-.5 14.5T317-452l281 164q16-15 37-23.5t45-8.5q50 0 85 35t35 85q0 50-35 85t-85 35Zm0-80q17 0 28.5-11.5T720-200q0-17-11.5-28.5T680-240q-17 0-28.5 11.5T640-200q0 17 11.5 28.5T680-160ZM200-440q17 0 28.5-11.5T240-480q0-17-11.5-28.5T200-520q-17 0-28.5 11.5T160-480q0 17 11.5 28.5T200-440Zm480-280q17 0 28.5-11.5T720-760q0-17-11.5-28.5T680-800q-17 0-28.5 11.5T640-760q0 17 11.5 28.5T680-720Zm0 520ZM200-480Zm480-280Z"/></svg>`,
    clear: `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#02af76"><path d="M440-320h80v-166l64 62 56-56-160-160-160 160 56 56 64-62v166ZM280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520Zm-400 0v520-520Z"/></svg>`,
    exit: `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#02af76"><path d="M200-120q-33 0-56.5-23.5T120-200v-160h80v160h560v-560H200v160h-80v-160q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm220-160-56-58 102-102H120v-80h346L364-622l56-58 200 200-200 200Z"/></svg>`,
  };

  // --- Initialization ---

  function initializeDrawing() {
    console.log("WebDraw: Initializing...");
    if (!createCanvas()) return false;
    createToolbox();
    addEventListeners();
    loadDrawings();
    isActive = true;
    // Set cursor based on initial tool
    setCursorForTool(currentTool);
    console.log("WebDraw: Active.");
    return true;
  }

  function createCanvas() {
    // ... (same as before) ...
    if (document.getElementById("webDrawCanvas")) {
      console.warn("WebDraw: Canvas already exists.");
      return false;
    }
    canvas = document.createElement("canvas");
    canvas.id = "webDrawCanvas";
    canvas.style.position = "absolute";
    canvas.style.top = "0px";
    canvas.style.left = "0px";
    canvas.width = Math.max(
      document.body.scrollWidth,
      document.documentElement.scrollWidth
    );
    canvas.height = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    );
    canvas.style.zIndex = "10000";
    canvas.style.pointerEvents = "auto";
    document.body.appendChild(canvas);
    console.log(
      `WebDraw: Canvas created W: ${canvas.width} H: ${canvas.height}`
    );
    ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      console.log("WebDraw: Canvas context (ctx) obtained.");
      return true;
    } else {
      console.error("WebDraw: Failed to get 2D context!");
      canvas.remove();
      canvas = null;
      return false;
    }
  }
  // --- NEW: Sharing Handlers ---

  function handleShareAsLink(e) {
    e.preventDefault();
    console.log("Initiating Share as Link...");
    setLoadingState(true, "Generating link...");

    const dataPackage = {
      originalUrl: window.location.href,
      drawings: drawings,
    };

    chrome.runtime.sendMessage(
      { action: "createShareLink", data: dataPackage },
      (response) => {
        setLoadingState(false);
        if (chrome.runtime.lastError) {
          console.error("Share Link Error:", chrome.runtime.lastError.message);
          alert(
            "Error generating share link: " + chrome.runtime.lastError.message
          );
        } else if (response && response.error) {
          console.error("Share Link Error:", response.error);
          alert("Error generating share link: " + response.error);
        } else if (response && response.shareableLink) {
          prompt("Share this link (Ctrl+C to copy):", response.shareableLink);
          // Or copy to clipboard automatically: navigator.clipboard.writeText(response.shareableLink).then(...)
        } else {
          alert("Failed to generate share link. Unknown error.");
        }
      }
    );
  }

  function handleShareAsImageLink(e) {
    e.preventDefault();
    console.log("Initiating Share as Image Link...");
    setLoadingState(true, "Generating image link...");

    const viewportData = {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    };

    // Need to send drawings AND viewport state at time of click
    const dataPackage = {
      drawings: drawings,
      viewport: viewportData,
    };

    chrome.runtime.sendMessage(
      { action: "createImageLink", data: dataPackage },
      (response) => {
        setLoadingState(false);
        if (chrome.runtime.lastError) {
          console.error(
            "Share Image Link Error:",
            chrome.runtime.lastError.message
          );
          alert(
            "Error generating image link: " + chrome.runtime.lastError.message
          );
        } else if (response && response.error) {
          console.error("Share Image Link Error:", response.error);
          alert("Error generating image link: " + response.error);
        } else if (response && response.imageUrl) {
          prompt("Share this image link (Ctrl+C to copy):", response.imageUrl);
        } else {
          alert("Failed to generate image link. Unknown error.");
        }
      }
    );
  }

  // Helper for loading state (optional)
  function setLoadingState(isLoading, message = "Loading...") {
    const shareBtn = document.querySelector(".webdraw-share-btn");
    if (!shareBtn) return;
    if (isLoading) {
      shareBtn.disabled = true;
      shareBtn.textContent = "⏳"; // Or use a spinner icon/class
      // Optionally show a message overlay
    } else {
      shareBtn.disabled = false;
      shareBtn.textContent = "🔗"; // Restore original icon
    }
  }

  function createToolbox() {
    if (document.getElementById("webDrawToolbox")) {
      console.warn("WebDraw: Toolbox already exists.");
      return; // Prevent multiple toolboxes
    }
    toolbox = document.createElement("div");
    toolbox.id = "webDrawToolbox";
    toolbox.innerHTML = `
          <div class="webdraw-title">WebDraw</div>
          <button data-tool="select" class="webdraw-button" title="Select (S)">${svgs.select}</button>
          <button data-tool="pencil" class="webdraw-button active" title="Pencil (P)">${svgs.pencil}</button>
          <button data-tool="rect" class="webdraw-button" title="Rectangle (R)">${svgs.rectangle}</button>
          <button data-tool="arrow" class="webdraw-button" title="Arrow (A)">↗</button>
          <button data-tool="text" class="webdraw-button" title="Text (T)"> T </button>
          <input type="color" id="webDrawColorPicker" value="${currentColor}" title="Color">
          <div class="webdraw-dropdown">
             <button class="webdraw-button webdraw-share-btn" title="Share">${svgs.share}</button>
             <div class="webdraw-dropdown-content">
                 <a href="#" id="webDrawShareLink">Share as Link</a>
                 <a href="#" id="webDrawShareImageLink">Share as Image Link</a>
             </div>
        </div>
          <button data-tool="clear" class="webdraw-button" title="Clear All">${svgs.clear}</button>
          <button data-tool="exit" class="webdraw-button" title="Exit (Esc)">${svgs.exit}</button>
      `;
    document.body.appendChild(toolbox); // Append to body BEFORE trying to get elements from it
    console.log("WebDraw: Toolbox created.");

    // General toolbox click handler
    toolbox.addEventListener("click", handleToolboxClick);

    // Specific listeners for the dropdown links
    const shareLinkOption = document.getElementById("webDrawShareLink");
    const shareImageLinkOption = document.getElementById(
      "webDrawShareImageLink"
    );

    if (shareLinkOption) {
      shareLinkOption.addEventListener("click", handleShareAsLink);
      console.log("WebDraw: 'Share as Link' listener attached.");
    } else {
      console.error(
        "WebDraw: 'webDrawShareLink' element not found! Check toolbox HTML."
      );
    }

    if (shareImageLinkOption) {
      shareImageLinkOption.addEventListener("click", handleShareAsImageLink);
      console.log(
        "WebDraw: 'Share Visible Area as Image Link' listener attached."
      );
    } else {
      console.error(
        "WebDraw: 'webDrawShareImageLink' element not found! Check toolbox HTML."
      );
    }

    // **** CORRECTED COLOR PICKER LOGIC ****
    const colorPickerElement = document.getElementById("webDrawColorPicker"); // Use a different variable name to avoid confusion if 'colorPicker' was used elsewhere
    if (colorPickerElement) {
      colorPickerElement.addEventListener("input", (e) => {
        currentColor = e.target.value;
        console.log("WebDraw: Color changed to", currentColor);
        // Optional: Update selected drawing color if one is selected
        if (selectedDrawingIndex !== null && drawings[selectedDrawingIndex]) {
          drawings[selectedDrawingIndex].color = currentColor;
          // If we allow changing lineWidth of selected object later, do it here too
          // drawings[selectedDrawingIndex].lineWidth = currentLineWidth;
          saveDrawings();
          redrawCanvas();
        }
      });
      console.log("WebDraw: Color picker listener attached.");
    } else {
      console.error(
        "WebDraw: 'webDrawColorPicker' element not found! Check toolbox HTML."
      );
    }
  }

  function handleToolboxClick(e) {
    const targetButton = e.target.closest("button[data-tool]");
    const targetColorPicker = e.target.closest("#webDrawColorPicker");
    const isShareButton = e.target.classList.contains("webdraw-share-btn"); // Check if it's the main share btn
    // Don't process clicks on the main share button here (handled by dropdown)
    if (!targetButton || isShareButton) {
      if (targetColorPicker) {
        /* handle color */
      }
      return;
    }

    const tool = targetButton.getAttribute("data-tool");
    const currentActiveButton = toolbox.querySelector(".webdraw-button.active");

    if (tool === "clear") {
      if (confirm("Are you sure you want to clear all drawings?")) {
        drawings = [];
        selectedDrawingIndex = null;
        saveDrawings();
        redrawCanvas();
        console.log("WebDraw: Drawings cleared.");
      }
      return;
    } else if (tool === "exit") {
      deactivateDrawing();
      return;
    }
    // Logic for regular tool buttons
    if (currentActiveButton) currentActiveButton.classList.remove("active");
    currentTool = tool;
    targetButton.classList.add("active");
    selectedDrawingIndex = null; // Deselect any drawing when switching tools
    setCursorForTool(currentTool); // Update cursor
    if (textInputDiv) removeTextInput(); // Clean up text input if switching
    console.log("Selected tool:", currentTool);
    redrawCanvas(); // Redraw to remove selection highlight if any
  }

  function setCursorForTool(tool) {
    if (!canvas) return;
    switch (tool) {
      case "pencil":
      case "rect":
      case "arrow":
        canvas.style.cursor = "crosshair";
        break;
      case "text":
        canvas.style.cursor = "text"; // Or 'crosshair' if drag starts immediately
        break;
      case "select":
        canvas.style.cursor = "default"; // Standard pointer for selection
        break;
      default:
        canvas.style.cursor = "default";
    }
  }

  // --- Event Handling ---

  function addEventListeners() {
    // ... (same as before) ...
    console.log("WebDraw: Adding event listeners.");
    if (!canvas) return;
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", handleResize);
    document.addEventListener("keydown", handleKeyDown);
    console.log("WebDraw: Event listeners added.");
  }

  function removeEventListeners() {
    // ... (same as before) ...
    console.log("WebDraw: Removing event listeners.");
    if (canvas) {
      /* remove canvas listeners */
    }
    window.removeEventListener("scroll", handleScroll);
    window.removeEventListener("resize", handleResize);
    document.removeEventListener("keydown", handleKeyDown);
  }

  function handleScroll() {
    requestAnimationFrame(redrawCanvas);
  }
  function handleResize() {
    /* ... (same as before, redraws) ... */
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") {
      // ... (same escape logic) ...
      if (textInputDiv) {
        removeTextInput();
      } else {
        deactivateDrawing();
      }
    }
    // Delete selected drawing
    else if (e.key === "Delete" || e.key === "Backspace") {
      if (isActive && selectedDrawingIndex !== null) {
        console.log("Deleting selected drawing:", selectedDrawingIndex);
        drawings.splice(selectedDrawingIndex, 1); // Remove item
        selectedDrawingIndex = null; // Deselect
        saveDrawings();
        redrawCanvas();
        e.preventDefault(); // Prevent browser back navigation on Backspace
      }
    }
    // Tool shortcuts
    else if (
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      document.activeElement?.tagName !== "INPUT" &&
      document.activeElement?.tagName !== "TEXTAREA" &&
      !document.activeElement?.isContentEditable
    ) {
      if (e.key.toLowerCase() === "p") switchTool("pencil");
      else if (e.key.toLowerCase() === "r") switchTool("rect");
      else if (e.key.toLowerCase() === "t") switchTool("text");
      else if (e.key.toLowerCase() === "a")
        switchTool("arrow"); // Shortcut for Arrow
      else if (e.key.toLowerCase() === "s") switchTool("select"); // Shortcut for Select
    }
  }

  function switchTool(tool) {
    if (!toolbox || currentTool === tool) return; // Don't re-switch
    const button = toolbox.querySelector(`button[data-tool="${tool}"]`);
    if (button) {
      handleToolboxClick({ target: button });
    }
  }

  // --- Coordinate Helpers ---
  function getCanvasRelativeCoords(e) {
    /* ... (same) ... */ if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function getDocumentRelativeCoords(e) {
    /* ... (same) ... */ return { x: e.pageX, y: e.pageY };
  }

  // --- Drawing Event Handlers ---

  function handleMouseDown(e) {
    if (e.button !== 0 || !ctx || !canvas) return;

    const docCoords = getDocumentRelativeCoords(e);
    const canvasCoords = getCanvasRelativeCoords(e);
    console.log(
      `handleMouseDown: Tool: ${currentTool}, Doc(${docCoords.x},${docCoords.y}), Canvas(${canvasCoords.x},${canvasCoords.y})`
    );

    startX = docCoords.x;
    startY = docCoords.y;
    isDrawing = false; // Default to false, set true only for drag-drawing tools

    // --- Tool Specific Logic ---
    if (currentTool === "select") {
      selectedDrawingIndex = findClickedDrawingIndex(
        canvasCoords.x,
        canvasCoords.y
      );
      console.log(
        "Selection check:",
        selectedDrawingIndex !== null
          ? `Selected index ${selectedDrawingIndex}`
          : "Nothing selected"
      );
      redrawCanvas(); // Redraw to show/hide selection highlight
    } else if (currentTool === "pencil") {
      isDrawing = true;
      ctx.beginPath();
      ctx.moveTo(canvasCoords.x, canvasCoords.y);
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = currentLineWidth;
      drawings.push({
        type: "pencil",
        points: [docCoords],
        color: currentColor,
        lineWidth: currentLineWidth,
      });
    } else if (currentTool === "rect" || currentTool === "arrow") {
      isDrawing = true; // Start dragging for shape
    } else if (currentTool === "text") {
      // For text, mousedown just records the start. Input created on mouseup.
      isDrawing = true; // Use isDrawing flag to indicate text placement drag has started
    }

    e.preventDefault();
  }

  function handleMouseMove(e) {
    if (!isDrawing || !ctx || !canvas) {
      // Allow hover effects for selection tool even when not 'drawing'
      if (currentTool === "select" && isActive) {
        const hoverIndex = findClickedDrawingIndex(
          getCanvasRelativeCoords(e).x,
          getCanvasRelativeCoords(e).y
        );
        canvas.style.cursor = hoverIndex !== null ? "pointer" : "default";
      }
      return;
    }

    const canvasCoords = getCanvasRelativeCoords(e);
    const docCoords = getDocumentRelativeCoords(e);

    // --- Tool Specific Logic ---
    if (currentTool === "pencil") {
      ctx.lineTo(canvasCoords.x, canvasCoords.y);
      ctx.stroke();
      const currentPath = drawings[drawings.length - 1];
      if (currentPath?.type === "pencil") {
        currentPath.points.push(docCoords);
      }
    } else if (currentTool === "rect" || currentTool === "arrow") {
      redrawCanvas(); // Clear and redraw background
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = currentLineWidth;
      const rect = canvas.getBoundingClientRect();
      const startCanvasX = startX - window.scrollX - rect.left;
      const startCanvasY = startY - window.scrollY - rect.top;

      if (currentTool === "rect") {
        ctx.strokeRect(
          startCanvasX,
          startCanvasY,
          canvasCoords.x - startCanvasX,
          canvasCoords.y - startCanvasY
        );
      } else {
        // Arrow tool
        ctx.beginPath();
        ctx.moveTo(startCanvasX, startCanvasY);
        ctx.lineTo(canvasCoords.x, canvasCoords.y);
        ctx.stroke();
        drawArrowhead(
          ctx,
          startCanvasX,
          startCanvasY,
          canvasCoords.x,
          canvasCoords.y,
          10 + currentLineWidth * 2
        ); // Draw preview arrowhead
      }
    } else if (currentTool === "text") {
      // Optionally draw a preview box during drag? For now, do nothing on move.
    }
  }

  function handleMouseUp(e) {
    if (e.button !== 0) return; // Only left clicks

    const docCoords = getDocumentRelativeCoords(e);
    console.log(
      `handleMouseUp: Tool: ${currentTool}, Doc(${docCoords.x},${docCoords.y}), Drawing: ${isDrawing}`
    );

    if (!isDrawing && currentTool !== "select") {
      // If not dragging (e.g., simple click for select)
      isDrawing = false; // Ensure flag is reset
      return;
    }

    // --- Tool Specific Logic ---
    if (currentTool === "pencil") {
      if (ctx) ctx.closePath();
      // Data already pushed during move
    } else if (currentTool === "rect") {
      const rectX = Math.min(startX, docCoords.x);
      const rectY = Math.min(startY, docCoords.y);
      const rectWidth = Math.abs(docCoords.x - startX);
      const rectHeight = Math.abs(docCoords.y - startY);
      if (rectWidth > 1 || rectHeight > 1) {
        drawings.push({
          type: "rect",
          x: rectX,
          y: rectY,
          width: rectWidth,
          height: rectHeight,
          color: currentColor,
          lineWidth: currentLineWidth,
        });
      }
    } else if (currentTool === "arrow") {
      // Only save if arrow has some length
      if (
        Math.abs(docCoords.x - startX) > 2 ||
        Math.abs(docCoords.y - startY) > 2
      ) {
        drawings.push({
          type: "arrow",
          x1: startX,
          y1: startY,
          x2: docCoords.x,
          y2: docCoords.y,
          color: currentColor,
          lineWidth: currentLineWidth,
        });
      }
    } else if (currentTool === "text") {
      // Create text input at the START position of the drag (mousedown location)
      createTextPrompt(startX, startY);
    }

    // Common cleanup/saving for drawing tools
    if (currentTool !== "select") {
      redrawCanvas();
      saveDrawings();
      console.log("Drawing finished/Text prompt placed, saved drawings.");
    }

    isDrawing = false; // Reset drawing flag
  }

  function handleMouseLeave(e) {
    if (isDrawing && currentTool !== "select" && currentTool !== "text") {
      // Don't finalize text on leave
      console.log("Mouse left canvas while drawing shape, finalizing.");
      handleMouseUp(e);
    }
    // Reset hover cursor if leaving canvas
    if (currentTool === "select") {
      canvas.style.cursor = "default";
    }
  }

  // --- Text Input ---

  function createTextPrompt(docX, docY) {
    if (textInputDiv) removeTextInput();
    console.log("createTextPrompt: Creating input at Doc Coords:", docX, docY);

    textInputDiv = document.createElement("div");
    textInputDiv.id = "webDrawTextInput";
    textInputDiv.contentEditable = true;
    textInputDiv.spellcheck = false;

    // Style the input box border to match current drawing style
    textInputDiv.style.border = `${currentLineWidth}px solid ${currentColor}`;
    textInputDiv.style.position = "absolute";
    textInputDiv.style.left = `${docX}px`;
    textInputDiv.style.top = `${docY}px`;
    textInputDiv.style.zIndex = "10002";
    textInputDiv.style.padding = "5px 8px";
    textInputDiv.style.backgroundColor = "rgba(255, 255, 224, 0.95)";
    textInputDiv.style.minWidth = "60px";
    textInputDiv.style.fontFamily =
      '"Virgil", "Helvetica Neue", Arial, sans-serif';
    textInputDiv.style.fontSize = "16px";
    textInputDiv.style.color = "#000";
    textInputDiv.style.lineHeight = "1.4";
    textInputDiv.style.outline = "none";
    textInputDiv.style.boxShadow = "0 2px 5px rgba(0,0,0,0.1)";
    textInputDiv.style.overflowWrap = "break-word";

    let handleOutsideClick;
    const removeListenersAndInput = () => {
      /* ... (same as before) ... */ document.removeEventListener(
        "mousedown",
        handleOutsideClick,
        true
      );
      removeTextInput();
    };

    document.body.appendChild(textInputDiv);
    textInputDiv.focus();

    textInputDiv.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        saveText(docX, docY, textInputDiv.innerText);
        removeListenersAndInput();
      } else if (e.key === "Escape") {
        removeListenersAndInput();
      }
    });

    handleOutsideClick = (event) => {
      /* ... (same as before) ... */ if (
        textInputDiv &&
        !textInputDiv.contains(event.target)
      ) {
        saveOrRemoveTextOnExit(docX, docY);
        removeListenersAndInput();
      }
    };
    document.addEventListener("mousedown", handleOutsideClick, true);

    textInputDiv.addEventListener("blur", () => {
      /* ... (same as before, uses setTimeout) ... */ setTimeout(() => {
        if (textInputDiv) {
          saveOrRemoveTextOnExit(docX, docY);
          removeListenersAndInput();
        }
      }, 150);
    });
  }

  function saveOrRemoveTextOnExit(docX, docY) {
    /* ... (same as before) ... */ if (!textInputDiv) return;
    const currentText = textInputDiv.innerText;
    if (currentText.trim()) {
      saveText(docX, docY, currentText);
    } else {
      removeTextInput();
    }
  }
  function saveText(docX, docY, text) {
    /* ... (same as before - pushes to drawings, saves, redraws) ... */ const trimmedText =
      text.trim();
    if (trimmedText && drawings) {
      drawings.push({
        type: "text",
        x: docX,
        y: docY,
        text: trimmedText,
        color: currentColor,
        font: '16px "Virgil", "Helvetica Neue", Arial, sans-serif',
      });
      saveDrawings();
      redrawCanvas();
    } else {
      console.log("saveText: Empty text not saved.");
    }
  }
  function removeTextInput() {
    /* ... (same as before - removes div) ... */ if (textInputDiv) {
      textInputDiv.remove();
      textInputDiv = null;
    }
  }

  // --- Selection and Hit Detection ---

  // Simple Bounding Box calculation (in document coordinates)
  function getDrawingBounds(drawing) {
    if (!drawing) return null;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    switch (drawing.type) {
      case "pencil":
        if (!drawing.points || drawing.points.length === 0) return null;
        drawing.points.forEach((p) => {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        });
        break;
      case "rect":
        minX = drawing.x;
        minY = drawing.y;
        maxX = drawing.x + drawing.width;
        maxY = drawing.y + drawing.height;
        break;
      case "arrow":
        minX = Math.min(drawing.x1, drawing.x2);
        minY = Math.min(drawing.y1, drawing.y2);
        maxX = Math.max(drawing.x1, drawing.x2);
        maxY = Math.max(drawing.y1, drawing.y2);
        break;
      case "text":
        // Estimate text bounds (very rough)
        const approxLineHeight = 20; // Based on 16px font + line height
        const approxCharWidth = 8; // Rough estimate
        const lines = drawing.text.split("\n");
        const maxLineLength = lines.reduce(
          (max, line) => Math.max(max, line.length),
          0
        );
        minX = drawing.x;
        minY = drawing.y;
        maxX = drawing.x + maxLineLength * approxCharWidth;
        maxY = drawing.y + lines.length * approxLineHeight;
        break;
      default:
        return null;
    }

    // Add padding based on line width for better hit detection near edges
    const padding = (drawing.lineWidth || 1) / 2 + 5; // 5px extra tolerance
    return {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + 2 * padding,
      height: maxY - minY + 2 * padding,
    };
  }

  // Checks if a point (in CANVAS coordinates) hits a drawing
  function isPointHittingDrawing(canvasX, canvasY, drawing) {
    const bounds = getDrawingBounds(drawing);
    if (!bounds || !canvas) return false;

    // Convert canvas click coords back to document coords for comparison with bounds
    const rect = canvas.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const docX = canvasX + scrollX + rect.left;
    const docY = canvasY + scrollY + rect.top;

    // Simple AABB (Axis-Aligned Bounding Box) check
    return (
      docX >= bounds.x &&
      docX <= bounds.x + bounds.width &&
      docY >= bounds.y &&
      docY <= bounds.y + bounds.height
    );
    // TODO: Implement more precise hit detection for lines/curves later if needed
  }

  // Finds the index of the topmost drawing hit by a click (canvas coords)
  function findClickedDrawingIndex(canvasX, canvasY) {
    for (let i = drawings.length - 1; i >= 0; i--) {
      // Iterate backwards (topmost first)
      if (isPointHittingDrawing(canvasX, canvasY, drawings[i])) {
        return i;
      }
    }
    return null; // Nothing hit
  }

  // --- Arrow Head Drawing ---
  function drawArrowhead(ctx, fromX, fromY, toX, toY, headLength) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const angle = Math.atan2(dy, dx);
    ctx.save(); // Save context state
    ctx.translate(toX, toY);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-headLength, -headLength / 2);
    ctx.moveTo(0, 0); // Move back to the tip for the other line
    ctx.lineTo(-headLength, headLength / 2);
    // Use current strokeStyle and lineWidth set before calling
    ctx.stroke();
    ctx.restore(); // Restore context state
  }

  // --- Redrawing & Persistence ---

  function redrawCanvas() {
    if (!ctx || !canvas) {
      console.warn("redrawCanvas: Context or canvas missing.");
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const rect = canvas.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    // Helper to convert document coords to current canvas coords
    const getCanvasCoords = (docX, docY) => ({
      x: docX - scrollX - rect.left,
      y: docY - scrollY - rect.top,
    });

    drawings.forEach((d, index) => {
      ctx.strokeStyle = d.color || "#000000";
      ctx.fillStyle = d.color || "#000000";
      ctx.font = d.font || "16px sans-serif";
      ctx.lineWidth = d.lineWidth || 1;

      try {
        const startCoords = getCanvasCoords(
          d.x || d.points?.[0]?.x || d.x1,
          d.y || d.points?.[0]?.y || d.y1
        );

        if (d.type === "pencil" && d.points?.length > 1) {
          ctx.beginPath();
          ctx.moveTo(startCoords.x, startCoords.y);
          for (let i = 1; i < d.points.length; i++) {
            const pointCoords = getCanvasCoords(d.points[i].x, d.points[i].y);
            ctx.lineTo(pointCoords.x, pointCoords.y);
          }
          ctx.stroke();
        } else if (d.type === "rect") {
          if (typeof d.width === "number" && typeof d.height === "number") {
            ctx.strokeRect(startCoords.x, startCoords.y, d.width, d.height);
          }
        } else if (d.type === "arrow") {
          const endCoords = getCanvasCoords(d.x2, d.y2);
          ctx.beginPath();
          ctx.moveTo(startCoords.x, startCoords.y);
          ctx.lineTo(endCoords.x, endCoords.y);
          ctx.stroke();
          drawArrowhead(
            ctx,
            startCoords.x,
            startCoords.y,
            endCoords.x,
            endCoords.y,
            10 + (d.lineWidth || 1) * 2
          );
        } else if (d.type === "text") {
          const lines = d.text.split("\n");
          const fontSize = parseInt(ctx.font) || 16;
          const lineHeight = fontSize * 1.4;
          lines.forEach((line, lineIndex) => {
            ctx.fillText(
              line,
              startCoords.x,
              startCoords.y + lineIndex * lineHeight
            );
          });
        }

        // Draw selection highlight if this drawing is selected
        if (index === selectedDrawingIndex) {
          const bounds = getDrawingBounds(d);
          if (bounds) {
            const selectionCoords = getCanvasCoords(bounds.x, bounds.y);
            ctx.save();
            ctx.strokeStyle = "rgba(0, 100, 255, 0.7)"; // Blue selection
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]); // Dashed line for selection
            ctx.strokeRect(
              selectionCoords.x,
              selectionCoords.y,
              bounds.width,
              bounds.height
            );
            ctx.setLineDash([]); // Reset line dash
            ctx.restore();
          }
        }
      } catch (drawError) {
        console.error(
          `WebDraw: Error drawing element ${index} (type: ${d.type}):`,
          drawError,
          d
        );
      }
    });
  }

  function getStorageKey() {
    /* ... (same) ... */ try {
      const p = window.location.pathname
          .replace(/[^a-zA-Z0-9/-]/g, "_")
          .substring(0, 100),
        o = window.location.origin;
      return PAGE_STORAGE_KEY_PREFIX + o + p;
    } catch (e) {
      console.error(e);
      return PAGE_STORAGE_KEY_PREFIX + "fallback";
    }
  }
  function saveDrawings() {
    /* ... (same) ... */ if (!drawings) return;
    try {
      const k = getStorageKey(),
        d = JSON.stringify(drawings);
      if (d.length > 4.5e6) console.warn("Data > 4.5MB");
      chrome.storage.local.set({ [k]: d }, () => {
        if (chrome.runtime.lastError) console.error(chrome.runtime.lastError);
      });
    } catch (e) {
      console.error(e);
    }
  }
  function loadDrawings() {
    /* ... (same) ... */ const k = getStorageKey();
    console.log("Loading key:", k);
    chrome.storage.local.get([k], (r) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        drawings = [];
      } else if (r[k]) {
        try {
          const d = JSON.parse(r[k]);
          if (Array.isArray(d)) {
            drawings = d.filter((i) => i && i.type);
            console.log(`${drawings.length} drawings loaded.`);
          } else {
            console.error("Loaded data not array.");
            drawings = [];
          }
        } catch (e) {
          console.error("Parse error:", e);
          drawings = [];
        }
      } else {
        console.log("No drawings found.");
        drawings = [];
      }
      redrawCanvas();
    });
  }

  // --- Sharing (Conceptual) ---
  function shareDrawing() {
    /* ... (same conceptual code) ... */
  }

  // --- Deactivation ---
  function deactivateDrawing() {
    /* ... (same cleanup, including text input check/removal, event listeners, DOM nodes) ... */ console.log(
      "Deactivating..."
    );
    if (textInputDiv) {
      saveOrRemoveTextOnExit(
        parseFloat(textInputDiv.style.left),
        parseFloat(textInputDiv.style.top)
      );
      removeTextInput();
    }
    removeEventListeners();
    if (canvas) canvas.remove();
    if (toolbox) toolbox.remove();
    canvas = null;
    ctx = null;
    toolbox = null;
    drawings = [];
    selectedDrawingIndex = null;
    isActive = false;
    document.body.style.cursor = "default";
    chrome.runtime
      .sendMessage({ action: "drawingDeactivated" })
      .catch((e) => console.warn(e));
    console.log("Deactivated.");
    window.webDrawInitialized = false;
    return false;
  }

  // --- Global Toggle Function ---
  window.webDrawToggle = async () => {
    /* ... (same) ... */ console.log("Toggle. isActive=", isActive);
    if (isActive) {
      return deactivateDrawing();
    } else {
      window.webDrawInitialized = true;
      return initializeDrawing();
    }
  };
} else {
  console.log("WebDraw: Already initialized flag set.");
} // End of window.webDrawInitialized check
