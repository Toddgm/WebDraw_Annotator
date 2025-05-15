// FILE: content.js
// Ensure this script runs only once per injection
if (!window.webDrawInitialized) {
  window.webDrawInitialized = true;

  console.log("WebDraw: Script starting initialization...");

  let isActive = false;
  let canvas = null;
  let ctx = null;
  let toolbox = null;
  let styleSubwindow = null;
  let notificationTimeout = null;
  let confirmationDiv = null; // For custom confirmation
  let textInputDiv = null;
  let isDrawing = false;
  let isDraggingToolbox = false;
  let isDraggingObject = false;
  let toolboxOffsetX, toolboxOffsetY;
  let startX, startY; // Document coords for drawing start
  let dragStartX, dragStartY, initialObjectPos; // Page coords for dragging delta

  let currentTool = "pencil";

  // Default Style Settings
  const PRESET_COLORS = ["#343a40", "#0c8599", "#f08c00", "#c2255c"];
  const WIDTH_MAP = { S: 1, M: 3, L: 6 };
  const FONT_SIZE_MAP = { S: "12px", M: "16px", L: "24px" };
  const FONT_FAMILY_MAP = {
    Virgil: '"Virgil", "Helvetica Neue", Arial, sans-serif',
    Arial: "Arial, sans-serif",
    Courier: '"Courier New", Courier, monospace',
  };

  let currentColor = PRESET_COLORS[0];
  let currentLineWidth = WIDTH_MAP.M;
  let currentLineDash = null;
  let currentFontFamily = FONT_FAMILY_MAP.Virgil;
  let currentFontSize = FONT_SIZE_MAP.M;
  let currentTextAlign = "left";

  let drawings = [];
  let selectedDrawingIndex = null;
  const PAGE_STORAGE_KEY_PREFIX = "webDraw_";

  // define all icons used here
  const svgs = {
    // Changed Select Icon to a standard pointer
    select: `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M402-40q-30 0-56-13.5T303-92L48-465l24-23q19-19 45-22t47 12l116 81v-383q0-17 11.5-28.5T320-840q17 0 28.5 11.5T360-800v537L212-367l157 229q5 8 14 13t19 5h278q33 0 56.5-23.5T760-200v-560q0-17 11.5-28.5T800-800q17 0 28.5 11.5T840-760v560q0 66-47 113T680-40H402Zm38-440v-400q0-17 11.5-28.5T480-920q17 0 28.5 11.5T520-880v400h-80Zm160 0v-360q0-17 11.5-28.5T640-880q17 0 28.5 11.5T680-840v360h-80ZM486-300Z"/></svg>`,
    select: "\udb83\udf22",
    pencil: `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M80 0v-160h800V0H80Zm160-320h56l312-311-29-29-28-28-311 312v56Zm-80 80v-170l448-447q11-11 25.5-17t30.5-6q16 0 31 6t27 18l55 56q12 11 17.5 26t5.5 31q0 15-5.5 29.5T777-687L330-240H160Zm560-504-56-56 56 56ZM608-631l-29-29-28-28 57 57Z"/></svg>`,
    rectangle: `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Z"/></svg>`,
    arrow: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`,
    text: `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M280-160v-520H80v-120h520v120H400v520H280Zm360 0v-320H520v-120h360v120H760v320H640Z"/></svg>`,
    share: `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M720-80q-50 0-85-35t-35-85q0-7 1-14.5t3-13.5L322-392q-17 15-38 23.5T240-360q-50 0-85-35t-35-85q0-50 35-85t85-35q21 0 42 8.5t38 23.5l282-164q-2-6-2.5-12.5T600-760q0-50 35-85t85-35q50 0 85 35t35 85q0 50-35 85t-85 35q-21 0-42-8.5T638-672L356-508q2 6 2.5 12.5t.5 13.5q0 7-1 13.5t-3 12.5l282 164q17-15 38-23.5t42-8.5q50 0 85 35t35 85q0 50-35 85t-85 35Zm0-80q17 0 28.5-11.5T760-200q0-17-11.5-28.5T720-240q-17 0-28.5 11.5T680-200q0 17 11.5 28.5T720-160ZM240-440q17 0 28.5-11.5T280-480q0-17-11.5-28.5T240-520q-17 0-28.5 11.5T200-480q0 17 11.5 28.5T240-440Zm480-280q17 0 28.5-11.5T760-760q0-17-11.5-28.5T720-800q-17 0-28.5 11.5T680-760q0 17 11.5 28.5T720-720Zm0 520ZM240-480Zm480-280Z"/></svg>`,
    clear: `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520Zm-400 0v520-520Z"/></svg>`,
    exit: `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#currentColor"><path d="M200-120q-33 0-56.5-23.5T120-200v-160h80v160h560v-560H200v160h-80v-160q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm220-160-56-58 102-102H120v-80h346L364-622l56-58 200 200-200 200Z"/></svg>`,
  };

  // --- Initialization ---

  function initializeDrawing() {
    console.log("WebDraw: Initializing...");
    if (!createCanvas()) return false;
    createToolbox();
    addEventListeners(); // Add listeners *after* elements exist
    loadDrawings();
    isActive = true;
    setCursorForTool(currentTool);
    // Set initial active button state
    const initialButton = toolbox?.querySelector(
      `button[data-tool="${currentTool}"]`
    );
    if (initialButton) initialButton.classList.add("active");
    console.log("WebDraw: Active.");
    return true;
  }

  function createCanvas() {
    // ... (no changes) ...
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
    canvas.style.pointerEvents = "auto"; // Make sure it can receive clicks
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
      if (canvas) canvas.remove();
      canvas = null;
      return false;
    }
  }

  function createToolbox() {
    // ... (no changes to HTML structure) ...
    if (document.getElementById("webDrawToolbox")) {
      console.warn("WebDraw: Toolbox already exists.");
      return;
    }
    toolbox = document.createElement("div");
    toolbox.id = "webDrawToolbox";
    toolbox.innerHTML = `
          <div class="webdraw-title" title="Drag to move">WebDraw</div>
          <button data-tool="select" class="webdraw-button" title="Select (S)">${svgs.select}</button>
          <button data-tool="pencil" class="webdraw-button" title="Pencil (P)">${svgs.pencil}</button>
          <button data-tool="rect" class="webdraw-button" title="Rectangle (R)">${svgs.rectangle}</button>
          <button data-tool="arrow" class="webdraw-button" title="Arrow (A)">${svgs.arrow}</button>
          <button data-tool="text" class="webdraw-button" title="Text (T)"> ${svgs.text} </button>
          <button data-tool="share" class="webdraw-button" title="Share Screenshot">${svgs.share}</button>
          <button data-tool="clear" class="webdraw-button" title="Delete Selected / Clear All">${svgs.clear}</button>
          <button data-tool="exit" class="webdraw-button" title="Exit (Esc)">${svgs.exit}</button>
      `;
    document.body.appendChild(toolbox);
    console.log("WebDraw: Toolbox created.");

    // Event listener for toolbox buttons
    toolbox.addEventListener("click", handleToolboxClick);

    // Dragging logic for the toolbox title
    const titleElement = toolbox.querySelector(".webdraw-title");
    if (titleElement) {
      titleElement.addEventListener("mousedown", handleToolboxDragStart);
    }
  }

  // --- Toolbox Drag Handling ---
  function handleToolboxDragStart(e) {
    if (e.button !== 0) return;
    isDraggingToolbox = true;
    const rect = toolbox.getBoundingClientRect();
    toolboxOffsetX = e.clientX - rect.left;
    toolboxOffsetY = e.clientY - rect.top;
    // Change cursor directly on the title element during drag
    e.target.style.cursor = "grabbing";
    document.addEventListener("mousemove", handleDocumentMouseMove); // Listen on document for movement anywhere
    document.addEventListener("mouseup", handleDocumentMouseUp); // Listen on document for release anywhere
    e.preventDefault();
  }

  function handleDocumentMouseMove(e) {
    if (isDraggingToolbox && toolbox) {
      let newLeft = e.clientX - toolboxOffsetX;
      let newTop = e.clientY - toolboxOffsetY;
      const maxLeft = window.innerWidth - toolbox.offsetWidth - 5;
      const maxTop = window.innerHeight - toolbox.offsetHeight - 5;
      newLeft = Math.max(5, Math.min(newLeft, maxLeft));
      newTop = Math.max(5, Math.min(newTop, maxTop));
      toolbox.style.left = `${newLeft}px`;
      toolbox.style.top = `${newTop}px`;
    } else if (isDrawing || isDraggingObject) {
      // Route drawing/object dragging mouse moves ONLY
      handleDrawingMouseMove(e);
    }
  }

  function handleDocumentMouseUp(e) {
    if (isDraggingToolbox) {
      isDraggingToolbox = false;
      const titleElement = toolbox.querySelector(".webdraw-title");
      if (titleElement) titleElement.style.cursor = "grab"; // Restore cursor
      // Remove listeners added in handleToolboxDragStart
      document.removeEventListener("mousemove", handleDocumentMouseMove);
      document.removeEventListener("mouseup", handleDocumentMouseUp);
    } else if (isDrawing || isDraggingObject) {
      // Route drawing/object dragging mouse up
      handleDrawingMouseUp(e);
    }
  }

  // --- Style Sub-window ---
  // createOrShowStyleSubWindow, hideAllStyleSubWindows, positionSubwindow, handleStyleSubwindowClick
  // ... (no changes from previous version) ...
  function hideAllStyleSubWindows() {
    if (styleSubwindow) {
      styleSubwindow.remove();
      styleSubwindow = null;
    }
  }

  function createOrShowStyleSubWindow(toolName) {
    hideAllStyleSubWindows(); // Ensure only one is open

    styleSubwindow = document.createElement("div");
    styleSubwindow.id = "webDrawStyleSubwindow";

    let contentHTML = "";

    // --- Common Controls: Color ---
    const createColorButtons = () => {
      let buttonsHTML = `<div class="webdraw-style-section"><span class="webdraw-style-label">Color:</span>`;
      PRESET_COLORS.forEach((color) => {
        const isActive = color === currentColor;
        buttonsHTML += `<button class="webdraw-color-button ${
          isActive ? "active" : ""
        }" data-color="${color}" style="background-color: ${color};" title="${color}"></button>`;
      });
      buttonsHTML += `</div>`;
      return buttonsHTML;
    };

    // --- Shape Controls (Pencil, Rect, Arrow) ---
    if (["pencil", "rect", "arrow"].includes(toolName)) {
      contentHTML += createColorButtons();

      // Width Controls
      contentHTML += `<div class="webdraw-style-section"><span class="webdraw-style-label">Width:</span>`;
      Object.keys(WIDTH_MAP).forEach((sizeKey) => {
        const pxValue = WIDTH_MAP[sizeKey];
        const isActive = pxValue === currentLineWidth;
        contentHTML += `
                  <button class="webdraw-width-button ${
                    isActive ? "active" : ""
                  }" data-width="${pxValue}" title="${pxValue}px">
                      ${sizeKey}
                      <span class="webdraw-width-example"><hr style="height: ${Math.max(
                        1,
                        pxValue
                      )}px;"></span>
                  </button>`;
      });
      contentHTML += `</div>`;

      // Line Style Controls
      contentHTML += `<div class="webdraw-style-section"><span class="webdraw-style-label">Style:</span>`;
      const styles = [
        { name: "Solid", dash: null },
        { name: "Dotted", dash: [4, 4] },
      ];
      styles.forEach((style) => {
        const isActive =
          JSON.stringify(style.dash) === JSON.stringify(currentLineDash);
        const borderStyle = style.dash ? "dashed" : "solid";
        contentHTML += `
                  <button class="webdraw-linestyle-button ${
                    isActive ? "active" : ""
                  }" data-linedash="${JSON.stringify(style.dash)}" title="${
          style.name
        }">
                     <hr style="border-top-style: ${borderStyle};">
                  </button>`;
      });
      contentHTML += `</div>`;
    }
    // --- Text Controls ---
    else if (toolName === "text") {
      contentHTML += createColorButtons();

      // Font Family Controls
      contentHTML += `<div class="webdraw-style-section"><span class="webdraw-style-label">Font:</span>`;
      Object.keys(FONT_FAMILY_MAP).forEach((name) => {
        const fontFamilyValue = FONT_FAMILY_MAP[name];
        const isActive = fontFamilyValue === currentFontFamily;
        const displayName = name;
        contentHTML += `
                  <button class="webdraw-font-button ${
                    isActive ? "active" : ""
                  }" data-fontfamily="${fontFamilyValue}" title="${name}" style="font-family: ${fontFamilyValue};">
                      ${displayName}
                  </button>`;
      });
      contentHTML += `</div>`;

      // Font Size Controls
      contentHTML += `<div class="webdraw-style-section"><span class="webdraw-style-label">Size:</span>`;
      Object.keys(FONT_SIZE_MAP).forEach((sizeKey) => {
        const pxValue = FONT_SIZE_MAP[sizeKey];
        const isActive = pxValue === currentFontSize;
        contentHTML += `
                  <button class="webdraw-width-button ${
                    isActive ? "active" : ""
                  }" data-fontsize="${pxValue}" title="${pxValue}">
                      ${sizeKey}
                  </button>`;
      });
      contentHTML += `</div>`;

      // Text Align Controls
      contentHTML += `<div class="webdraw-style-section"><span class="webdraw-style-label">Align:</span>`;
      const aligns = [
        { name: "Left", value: "left" },
        { name: "Center", value: "center" },
        { name: "Right", value: "right" },
      ];
      aligns.forEach((align) => {
        const isActive = align.value === currentTextAlign;
        const icon = align.name.substring(0, 1);
        contentHTML += `
                  <button class="webdraw-align-button ${
                    isActive ? "active" : ""
                  }" data-align="${align.value}" title="${align.name}">
                      ${icon}
                  </button>`;
      });
      contentHTML += `</div>`;
    }

    styleSubwindow.innerHTML = contentHTML;
    styleSubwindow.addEventListener("click", handleStyleSubwindowClick);
    document.body.appendChild(styleSubwindow);
    positionSubwindow();
  }

  function positionSubwindow() {
    if (!styleSubwindow || !toolbox) return;
    const toolboxRect = toolbox.getBoundingClientRect();
    styleSubwindow.style.left = `${toolboxRect.left}px`;
    styleSubwindow.style.top = `${toolboxRect.bottom + window.scrollY + 5}px`; // Position below toolbox
  }

  function handleStyleSubwindowClick(e) {
    const target = e.target.closest("button");
    if (!target) return;
    const parentSection = target.closest(".webdraw-style-section");
    if (!parentSection) return;

    // Update state
    if (target.dataset.color) currentColor = target.dataset.color;
    else if (target.dataset.width)
      currentLineWidth = parseInt(target.dataset.width, 10);
    else if (target.dataset.linedash)
      currentLineDash = JSON.parse(target.dataset.linedash);
    else if (target.dataset.fontfamily)
      currentFontFamily = target.dataset.fontfamily;
    else if (target.dataset.fontsize) currentFontSize = target.dataset.fontsize;
    else if (target.dataset.align) currentTextAlign = target.dataset.align;
    else return;

    // Update UI
    parentSection
      .querySelectorAll("button")
      .forEach((btn) => btn.classList.remove("active"));
    target.classList.add("active");

    // Apply to selected drawing if any
    if (selectedDrawingIndex !== null && drawings[selectedDrawingIndex]) {
      const selected = drawings[selectedDrawingIndex];
      if (target.dataset.color) selected.color = currentColor;
      if (target.dataset.width) selected.lineWidth = currentLineWidth;
      if (target.dataset.linedash) selected.lineDash = currentLineDash;
      if (target.dataset.fontfamily) selected.fontFamily = currentFontFamily;
      if (target.dataset.fontsize) selected.fontSize = currentFontSize;
      if (target.dataset.align) selected.textAlign = currentTextAlign;
      saveDrawings();
      redrawCanvas();
    }
    console.log("Style updated:", {
      currentColor,
      currentLineWidth,
      currentLineDash,
      currentFontFamily,
      currentFontSize,
      currentTextAlign,
    });
  }

  // --- Toolbox Click Handler ---
  function handleToolboxClick(e) {
    const targetButton = e.target.closest("button[data-tool]");
    if (!targetButton) return; // Ignore clicks not on a tool button

    const tool = targetButton.getAttribute("data-tool");

    // Handle non-tool-switching actions first
    if (tool === "share") {
      handleShare();
      return;
    }
    if (tool === "clear") {
      handleDelete(); // Will show confirmation internally
      return;
    }
    if (tool === "exit") {
      deactivateDrawing();
      return;
    }

    // --- Tool Switching Logic ---
    if (currentTool === tool) {
      // If clicking the active tool again, maybe toggle subwindow? For now, do nothing.
      if (styleSubwindow) hideAllStyleSubWindows();
      else createOrShowStyleSubWindow(tool);
      return;
    }

    const currentActiveButton = toolbox.querySelector(".webdraw-button.active");
    if (currentActiveButton) currentActiveButton.classList.remove("active");

    currentTool = tool;
    targetButton.classList.add("active");
    selectedDrawingIndex = null;
    isDraggingObject = false;
    setCursorForTool(currentTool);
    if (textInputDiv) removeTextInput();

    // Show/Hide Style Subwindow based on the NEW tool
    if (["pencil", "rect", "arrow", "text"].includes(tool)) {
      createOrShowStyleSubWindow(tool);
    } else {
      hideAllStyleSubWindows();
    }

    console.log("Selected tool:", currentTool);
    redrawCanvas(); // Redraw mainly to clear selection highlight
  }

  function setCursorForTool(tool) {
    // ... (no changes) ...
    if (!canvas) return;
    switch (tool) {
      case "pencil":
      case "rect":
      case "arrow":
        canvas.style.cursor = "crosshair";
        break;
      case "text":
        canvas.style.cursor = "text";
        break;
      case "select":
        canvas.style.cursor = "default";
        break; // Hover handled elsewhere
      default:
        canvas.style.cursor = "default";
    }
  }

  // --- Event Handling ---

  function addEventListeners() {
    console.log("WebDraw: Adding event listeners.");
    if (!canvas) return;
    // Listen for mousedown directly on the canvas to initiate drawing/selection
    canvas.addEventListener("mousedown", handleCanvasMouseDown);
    // Mouse move/up are handled by document listeners added during drags (toolbox or drawing)
    // canvas.addEventListener("mouseleave", handleMouseLeave); // Revisit if needed

    window.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", handleResize);
    document.addEventListener("keydown", handleKeyDown);
    console.log("WebDraw: Event listeners added.");
  }

  function removeEventListeners() {
    console.log("WebDraw: Removing event listeners.");
    if (canvas) {
      canvas.removeEventListener("mousedown", handleCanvasMouseDown);
      // canvas.removeEventListener("mouseleave", handleMouseLeave);
    }
    // Remove document listeners if they were added
    document.removeEventListener("mousemove", handleDocumentMouseMove);
    document.removeEventListener("mouseup", handleDocumentMouseUp);
    // Remove toolbox drag listener specifically
    const titleElement = toolbox?.querySelector(".webdraw-title");
    if (titleElement) {
      titleElement.removeEventListener("mousedown", handleToolboxDragStart);
    }

    window.removeEventListener("scroll", handleScroll);
    window.removeEventListener("resize", handleResize);
    document.removeEventListener("keydown", handleKeyDown);
  }

  function handleScroll() {
    requestAnimationFrame(redrawCanvas);
    positionSubwindow();
  }
  function handleResize() {
    // ... (no changes) ...
    if (!canvas || !ctx || !isActive) return;
    const newWidth = Math.max(
      document.body.scrollWidth,
      document.documentElement.scrollWidth
    );
    const newHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    );
    if (canvas.width !== newWidth || canvas.height !== newHeight) {
      canvas.width = newWidth;
      canvas.height = newHeight;
      console.log(
        `WebDraw: Canvas resized. New W: ${canvas.width} H: ${canvas.height}`
      );
    }
    ctx.lineCap = "round";
    ctx.lineJoin = "round"; // Reset context properties
    requestAnimationFrame(redrawCanvas);
    positionSubwindow();
  }

  function handleKeyDown(e) {
    // ... (no changes from previous version, including Delete/Backspace logic) ...
    if (e.key === "Escape") {
      if (confirmationDiv) {
        // Dismiss confirmation first
        removeConfirmation();
      } else if (styleSubwindow) {
        hideAllStyleSubWindows();
      } else if (textInputDiv) {
        removeTextInput();
      } else if (isDrawing || isDraggingObject) {
        isDrawing = false;
        isDraggingObject = false;
        initialObjectPos = null; // Clear reference
        // If drawing was in progress, remove the incomplete drawing entry
        if (currentTool !== "select") drawings.pop();
        redrawCanvas();
      } else {
        deactivateDrawing();
      }
    } else if (e.key === "Delete" || e.key === "Backspace") {
      if (
        document.activeElement === textInputDiv ||
        textInputDiv?.contains(document.activeElement)
      )
        return;
      if (isActive && selectedDrawingIndex !== null) {
        e.preventDefault();
        deleteSelectedDrawingWithConfirmation(); // Use the function which now shows custom confirm
      }
    } else if (
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      document.activeElement?.tagName !== "INPUT" &&
      document.activeElement?.tagName !== "TEXTAREA" &&
      !document.activeElement?.isContentEditable &&
      document.activeElement !== textInputDiv
    ) {
      if (e.key.toLowerCase() === "p") switchTool("pencil");
      else if (e.key.toLowerCase() === "r") switchTool("rect");
      else if (e.key.toLowerCase() === "t") switchTool("text");
      else if (e.key.toLowerCase() === "a") switchTool("arrow");
      else if (e.key.toLowerCase() === "s") switchTool("select");
    }
  }

  function switchTool(tool) {
    // ... (no changes) ...
    if (!toolbox || currentTool === tool) return;
    const button = toolbox.querySelector(`button[data-tool="${tool}"]`);
    if (button) button.click();
  }

  // --- Coordinate Helpers ---
  function getCanvasRelativeCoords(e) {
    // ... (no changes) ...
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function getDocumentRelativeCoords(e) {
    // ... (no changes) ...
    return { x: e.pageX, y: e.pageY };
  }

  // --- Drawing Event Handlers ---

  // Renamed from handleMouseDown to clarify it's for the canvas element
  function handleCanvasMouseDown(e) {
    if (e.button !== 0 || !ctx || !canvas || isDraggingToolbox) return; // Ignore if dragging toolbox
    if (styleSubwindow && styleSubwindow.contains(e.target)) return; // Ignore clicks in subwindow

    const docCoords = getDocumentRelativeCoords(e);
    const canvasCoords = getCanvasRelativeCoords(e);
    console.log(
      `handleCanvasMouseDown: Tool: ${currentTool}, Doc(${docCoords.x},${docCoords.y}), Canvas(${canvasCoords.x},${canvasCoords.y})`
    );

    startX = docCoords.x; // Doc coords for drawing data start
    startY = docCoords.y;
    dragStartX = e.pageX; // Page coords for delta calculation start
    dragStartY = e.pageY;
    isDrawing = false;
    isDraggingObject = false;

    if (currentTool === "select") {
      const clickedIndex = findClickedDrawingIndex(
        canvasCoords.x,
        canvasCoords.y
      );
      if (clickedIndex !== null) {
        selectedDrawingIndex = clickedIndex;
        isDraggingObject = true; // Start dragging the selected object
        const obj = drawings[selectedDrawingIndex];
        // Store initial position for relative dragging
        if (obj.type === "pencil")
          initialObjectPos = obj.points.map((p) => ({ ...p }));
        else if (obj.type === "arrow")
          initialObjectPos = { x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 };
        else initialObjectPos = { x: obj.x, y: obj.y };
        console.log("Selection: Started dragging index", selectedDrawingIndex);
      } else {
        selectedDrawingIndex = null; // Deselect if clicked empty space
        console.log("Selection: Clicked empty space");
      }
      redrawCanvas(); // Show selection change
    } else if (["pencil", "rect", "arrow", "text"].includes(currentTool)) {
      isDrawing = true; // Start drawing a new shape/text placement
      // For pencil, add the first point immediately
      if (currentTool === "pencil") {
        drawings.push({
          type: "pencil",
          points: [docCoords],
          color: currentColor,
          lineWidth: currentLineWidth,
          lineDash: currentLineDash,
        });
        // No immediate drawing needed, redrawCanvas on move will handle it
      }
    }

    // Add document listeners ONLY if we started drawing or dragging an object
    if (isDrawing || isDraggingObject) {
      document.addEventListener("mousemove", handleDocumentMouseMove);
      document.addEventListener("mouseup", handleDocumentMouseUp);
    }

    e.preventDefault(); // Prevent default browser actions like text selection drag
  }

  // Renamed from handleMouseMove - ONLY called via handleDocumentMouseMove
  function handleDrawingMouseMove(e) {
    if (!isActive) return; // Check if drawing is active

    const docCoords = getDocumentRelativeCoords(e); // For storing data
    const pageX = e.pageX; // For delta calculation
    const pageY = e.pageY;

    if (isDraggingObject && selectedDrawingIndex !== null) {
      // --- Object Dragging ---
      const deltaX = pageX - dragStartX;
      const deltaY = pageY - dragStartY;
      const obj = drawings[selectedDrawingIndex];
      if (!obj || !initialObjectPos) return; // Safety check

      if (obj.type === "pencil" && Array.isArray(initialObjectPos)) {
        obj.points = initialObjectPos.map((p) => ({
          x: p.x + deltaX,
          y: p.y + deltaY,
        }));
      } else if (obj.type === "arrow") {
        obj.x1 = initialObjectPos.x1 + deltaX;
        obj.y1 = initialObjectPos.y1 + deltaY;
        obj.x2 = initialObjectPos.x2 + deltaX;
        obj.y2 = initialObjectPos.y2 + deltaY;
      } else {
        // rect, text
        obj.x = initialObjectPos.x + deltaX;
        obj.y = initialObjectPos.y + deltaY;
      }
      requestAnimationFrame(redrawCanvas);
    } else if (isDrawing) {
      // --- Drawing New Shape ---
      if (currentTool === "pencil") {
        const currentPath = drawings[drawings.length - 1];
        if (currentPath?.type === "pencil") {
          currentPath.points.push(docCoords);
          requestAnimationFrame(redrawCanvas); // Redraw the whole canvas to show new segment
        }
      } else if (currentTool === "rect" || currentTool === "arrow") {
        // Draw preview shape on top
        requestAnimationFrame(() => {
          redrawCanvas(); // Redraw existing drawings first
          ctx.save();
          ctx.strokeStyle = currentColor;
          ctx.lineWidth = currentLineWidth;
          ctx.setLineDash(currentLineDash || []);
          const startCanvas = getCanvasCoords(startX, startY);
          const currentCanvas = getCanvasCoords(docCoords.x, docCoords.y);

          if (currentTool === "rect") {
            ctx.strokeRect(
              startCanvas.x,
              startCanvas.y,
              currentCanvas.x - startCanvas.x,
              currentCanvas.y - startCanvas.y
            );
          } else {
            // Arrow
            ctx.beginPath();
            ctx.moveTo(startCanvas.x, startCanvas.y);
            ctx.lineTo(currentCanvas.x, currentCanvas.y);
            ctx.stroke();
            drawArrowhead(
              ctx,
              startCanvas.x,
              startCanvas.y,
              currentCanvas.x,
              currentCanvas.y,
              10 + currentLineWidth * 2
            );
          }
          ctx.restore();
        });
      }
    }
  }

  // Renamed from handleMouseUp - ONLY called via handleDocumentMouseUp
  function handleDrawingMouseUp(e) {
    if (e.button !== 0 || !isActive) return;

    const docCoords = getDocumentRelativeCoords(e);
    console.log(
      `handleDrawingMouseUp: Tool: ${currentTool}, Drawing: ${isDrawing}, Dragging: ${isDraggingObject}`
    );

    // Finalize based on the action that was in progress
    if (isDraggingObject) {
      // Object drag finished
      saveDrawings();
      console.log("Object drag finished, saved drawings.");
    } else if (isDrawing) {
      // Drawing action finished
      if (currentTool === "pencil") {
        // Path already updated during move
        // Optional simplification could happen here
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
            lineDash: currentLineDash,
          });
        } else {
          drawings.pop();
        } // Remove if too small (likely accidental click)
      } else if (currentTool === "arrow") {
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
            lineDash: currentLineDash,
          });
        } else {
          drawings.pop();
        } // Remove if too small
      } else if (currentTool === "text") {
        createTextPrompt(startX, startY); // Create input at the starting point
      }

      // Save drawings unless it was text (which saves separately)
      if (currentTool !== "text") {
        saveDrawings();
        console.log("Drawing finished, saved drawings.");
      }
      redrawCanvas(); // Final redraw
    }

    // Reset flags and remove document listeners added by handleCanvasMouseDown
    isDrawing = false;
    isDraggingObject = false;
    initialObjectPos = null;
    document.removeEventListener("mousemove", handleDocumentMouseMove);
    document.removeEventListener("mouseup", handleDocumentMouseUp);
  }

  // handleMouseLeave not strictly necessary with document listeners, but can be added for edge cases if needed.

  // --- Text Input ---
  // createTextPrompt, saveOrRemoveTextOnExit, saveText, removeTextInput
  // ... (no changes from previous version) ...
  function createTextPrompt(docX, docY) {
    if (textInputDiv) removeTextInput();
    console.log("createTextPrompt: Creating input at Doc Coords:", docX, docY);

    textInputDiv = document.createElement("div");
    textInputDiv.id = "webDrawTextInput";
    textInputDiv.contentEditable = true;
    textInputDiv.spellcheck = false;

    textInputDiv.style.fontFamily = currentFontFamily;
    textInputDiv.style.fontSize = currentFontSize;
    textInputDiv.style.color = currentColor;
    textInputDiv.style.textAlign = currentTextAlign;
    textInputDiv.style.border = "none";
    textInputDiv.style.backgroundColor = "rgba(240, 240, 240, 0.85)";

    textInputDiv.style.position = "absolute";
    textInputDiv.style.left = `${docX}px`;
    textInputDiv.style.top = `${docY}px`;
    textInputDiv.style.zIndex = "10002";
    textInputDiv.style.padding = "5px 8px";
    textInputDiv.style.minWidth = "60px";
    textInputDiv.style.lineHeight = "1.4";
    textInputDiv.style.outline = "none";
    textInputDiv.style.boxShadow = "0 2px 5px rgba(0,0,0,0.1)";
    textInputDiv.style.overflowWrap = "break-word";

    let handleOutsideClick;

    const removeListenersAndInput = () => {
      if (handleOutsideClick) {
        document.removeEventListener("mousedown", handleOutsideClick, true);
        handleOutsideClick = null;
      }
      removeTextInput();
    };

    document.body.appendChild(textInputDiv);
    textInputDiv.focus();
    window.getSelection().selectAllChildren(textInputDiv);

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
      if (
        textInputDiv &&
        !textInputDiv.contains(event.target) &&
        !toolbox?.contains(event.target) &&
        !styleSubwindow?.contains(event.target) &&
        !confirmationDiv?.contains(event.target)
      ) {
        console.log("Clicked outside text input.");
        saveOrRemoveTextOnExit(docX, docY);
        removeListenersAndInput();
      }
    };
    // Delay adding listener slightly to prevent immediate trigger from the click that created it
    setTimeout(
      () => document.addEventListener("mousedown", handleOutsideClick, true),
      50
    );
  }

  function saveOrRemoveTextOnExit(docX, docY) {
    if (!textInputDiv) return;
    const currentText = textInputDiv.innerText;
    if (currentText.trim()) {
      saveText(docX, docY, currentText);
    } else {
      console.log("Empty text input - not saved.");
    }
  }
  function saveText(docX, docY, text) {
    const trimmedText = text.trim();
    if (trimmedText && drawings) {
      drawings.push({
        type: "text",
        x: docX,
        y: docY,
        text: trimmedText,
        color: currentColor,
        fontFamily: currentFontFamily,
        fontSize: currentFontSize,
        textAlign: currentTextAlign,
      });
      saveDrawings();
      redrawCanvas();
      console.log("Text saved:", trimmedText);
    } else {
      console.log("saveText: Empty text not saved.");
    }
  }
  function removeTextInput() {
    if (textInputDiv) {
      textInputDiv.remove();
      textInputDiv = null;
      console.log("Text input removed.");
    }
  }

  // --- Selection and Hit Detection ---
  // getDrawingBounds, isPointHittingDrawing, findClickedDrawingIndex
  // ... (no changes from previous version) ...
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
        const lines = drawing.text.split("\n");
        const fontSizePx = parseInt(drawing.fontSize || FONT_SIZE_MAP.M) || 16;
        const approxLineHeight = fontSizePx * 1.4;
        const tempCtx = document.createElement("canvas").getContext("2d");
        tempCtx.font = `${drawing.fontSize || FONT_SIZE_MAP.M} ${
          drawing.fontFamily || FONT_FAMILY_MAP.Virgil
        }`;
        const maxLineWidth = lines.reduce(
          (max, line) => Math.max(max, tempCtx.measureText(line).width),
          0
        );

        // Adjust bounds based on text alignment (rough estimate)
        let xOffset = 0;
        if (drawing.textAlign === "center") xOffset = -maxLineWidth / 2;
        else if (drawing.textAlign === "right") xOffset = -maxLineWidth;

        minX = drawing.x + xOffset;
        minY = drawing.y; // Use top-left Y as reference start
        maxX = minX + maxLineWidth;
        maxY = drawing.y + lines.length * approxLineHeight;
        break;
      default:
        return null;
    }
    const padding =
      (drawing.lineWidth || (drawing.type === "text" ? 2 : 1)) / 2 + 5;
    return {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + 2 * padding,
      height: maxY - minY + 2 * padding,
    };
  }

  function isPointHittingDrawing(canvasX, canvasY, drawing) {
    const bounds = getDrawingBounds(drawing);
    if (!bounds || !canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const docX = canvasX + window.scrollX; // Already relative to viewport
    const docY = canvasY + window.scrollY;
    return (
      docX >= bounds.x &&
      docX <= bounds.x + bounds.width &&
      docY >= bounds.y &&
      docY <= bounds.y + bounds.height
    );
  }

  function findClickedDrawingIndex(canvasX, canvasY) {
    for (let i = drawings.length - 1; i >= 0; i--) {
      if (isPointHittingDrawing(canvasX, canvasY, drawings[i])) return i;
    }
    return null;
  }

  // --- Arrow Head Drawing ---
  function drawArrowhead(ctx, fromX, fromY, toX, toY, headLength) {
    // ... (no changes) ...
    const dx = toX - fromX;
    const dy = toY - fromY;
    const angle = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(toX, toY);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-headLength, -headLength / 2);
    ctx.moveTo(0, 0);
    ctx.lineTo(-headLength, headLength / 2);
    ctx.stroke();
    ctx.restore();
  }

  // --- Helper to get Canvas Coords from Doc Coords ---
  function getCanvasCoords(docX, docY) {
    // ... (no changes) ...
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    return { x: docX - scrollX - rect.left, y: docY - scrollY - rect.top };
  }

  // --- Redrawing & Persistence ---
  function redrawCanvas() {
    // ... (no changes in logic, ensures styles from drawing objects are used) ...
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawings.forEach((d, index) => {
      ctx.save();
      ctx.strokeStyle = d.color || "#000000";
      ctx.fillStyle = d.color || "#000000";
      ctx.lineWidth = d.lineWidth || 1;
      ctx.setLineDash(d.lineDash || []);

      try {
        if (d.type === "pencil" && d.points?.length > 0) {
          /*...*/
          ctx.beginPath();
          const startCoords = getCanvasCoords(d.points[0].x, d.points[0].y);
          ctx.moveTo(startCoords.x, startCoords.y);
          for (let i = 1; i < d.points.length; i++) {
            const pointCoords = getCanvasCoords(d.points[i].x, d.points[i].y);
            ctx.lineTo(pointCoords.x, pointCoords.y);
          }
          ctx.stroke();
        } else if (d.type === "rect") {
          /*...*/
          if (typeof d.width === "number" && typeof d.height === "number") {
            const startCoords = getCanvasCoords(d.x, d.y);
            ctx.strokeRect(startCoords.x, startCoords.y, d.width, d.height);
          }
        } else if (d.type === "arrow") {
          /*...*/
          const startCoords = getCanvasCoords(d.x1, d.y1);
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
          /*...*/
          const startCoords = getCanvasCoords(d.x, d.y);
          const lines = d.text.split("\n");
          const font = `${d.fontSize || FONT_SIZE_MAP.M} ${
            d.fontFamily || FONT_FAMILY_MAP.Virgil
          }`;
          const textAlign = d.textAlign || "left";
          const fontSizePx = parseInt(d.fontSize || FONT_SIZE_MAP.M) || 16;
          const lineHeight = fontSizePx * 1.4;
          ctx.font = font;
          ctx.textAlign = textAlign;
          const yOffset = fontSizePx * 0.8; // Baseline adjustment
          lines.forEach((line, lineIndex) => {
            ctx.fillText(
              line,
              startCoords.x,
              startCoords.y + lineIndex * lineHeight + yOffset
            );
          });
        }

        if (index === selectedDrawingIndex) {
          /* Draw selection highlight */
          const bounds = getDrawingBounds(d);
          if (bounds) {
            const selectionCoords = getCanvasCoords(bounds.x, bounds.y);
            // Save state specifically for dashed line
            const currentDash = ctx.getLineDash();
            ctx.strokeStyle = "rgba(0, 100, 255, 0.7)";
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(
              selectionCoords.x,
              selectionCoords.y,
              bounds.width,
              bounds.height
            );
            ctx.setLineDash(currentDash); // Restore original dash
          }
        }
      } catch (drawError) {
        console.error(`WebDraw: Error drawing element ${index}:`, drawError, d);
      } finally {
        ctx.restore();
      }
    });
  }

  // --- Persistence ---
  // getStorageKey, saveDrawings, loadDrawings
  // ... (no changes from previous version) ...
  function getStorageKey() {
    try {
      const path = window.location.pathname
        .replace(/[^a-zA-Z0-9/-]/g, "_")
        .substring(0, 100);
      const origin = window.location.origin;
      return PAGE_STORAGE_KEY_PREFIX + origin + path;
    } catch (e) {
      console.error(e);
      return PAGE_STORAGE_KEY_PREFIX + "fallback";
    }
  }
  function saveDrawings() {
    if (!drawings) return;
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
    const k = getStorageKey();
    console.log("Loading key:", k);
    chrome.storage.local.get([k], (r) => {
      if (chrome.runtime.lastError) console.error(chrome.runtime.lastError);
      else if (r[k]) {
        try {
          const d = JSON.parse(r[k]);
          if (Array.isArray(d)) drawings = d.filter((i) => i && i.type);
          else drawings = [];
        } catch (e) {
          console.error(e);
          drawings = [];
        }
      } else drawings = [];
      console.log(`${drawings.length} drawings loaded.`);
      redrawCanvas();
    });
  }

  // --- Utilities: Share, Delete, Notifications, Confirmation ---

  function handleShare() {
    // ... (no changes) ...
    console.log("Initiating Share...");
    const makeupLink = "https://i.imgur.com/placeholder_example.png"; // Use prototype link
    copyLinkToClipboardAndNotify(makeupLink);
  }

  function copyLinkToClipboardAndNotify(link) {
    // ... (no changes) ...
    navigator.clipboard
      .writeText(link)
      .then(() => {
        console.log("Link copied:", link);
        showNotification("Share link copied!");
      })
      .catch((err) => {
        console.error("Copy failed:", err);
        showNotification("Failed to copy link.", true);
        prompt("Please copy this link manually:", link);
      });
  }

  function showNotification(message, isError = false) {
    // ... (no changes) ...
    let nDiv = document.getElementById("webDrawNotification");
    if (!nDiv) {
      nDiv = document.createElement("div");
      nDiv.id = "webDrawNotification";
      document.body.appendChild(nDiv);
    }
    nDiv.textContent = message;
    nDiv.className = isError ? "error" : "";
    if (notificationTimeout) clearTimeout(notificationTimeout);
    void nDiv.offsetWidth;
    nDiv.classList.add("visible");
    notificationTimeout = setTimeout(() => {
      nDiv.classList.remove("visible");
    }, 3000);
  }

  function handleDelete() {
    if (selectedDrawingIndex !== null) {
      deleteSelectedDrawingWithConfirmation();
    } else {
      clearAllDrawingsWithConfirmation();
    }
  }

  // --- Custom Confirmation ---
  function showConfirmation(message, onConfirm) {
    removeConfirmation(); // Remove existing if any

    confirmationDiv = document.createElement("div");
    confirmationDiv.id = "webDrawConfirmation"; // Style this ID in CSS
    confirmationDiv.innerHTML = `
            <p>${message}</p>
            <div class="webdraw-confirm-buttons">
                <button class="confirm-yes">Confirm</button>
                <button class="confirm-no">Cancel</button>
            </div>
        `;

    // Simple inline styles for positioning - ideally use CSS classes
    confirmationDiv.style.position = "fixed";
    confirmationDiv.style.left = "50%";
    confirmationDiv.style.top = "40%";
    confirmationDiv.style.transform = "translate(-50%, -50%)";
    confirmationDiv.style.background = "#fff";
    confirmationDiv.style.border = "1px solid #ccc";
    confirmationDiv.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
    confirmationDiv.style.padding = "20px";
    confirmationDiv.style.borderRadius = "8px";
    confirmationDiv.style.zIndex = "10006"; // Above notification
    confirmationDiv.style.textAlign = "center";

    const btnContainer = confirmationDiv.querySelector(
      ".webdraw-confirm-buttons"
    );
    btnContainer.style.marginTop = "15px";
    btnContainer.style.display = "flex";
    btnContainer.style.gap = "10px";
    btnContainer.style.justifyContent = "center";

    const yesButton = confirmationDiv.querySelector(".confirm-yes");
    const noButton = confirmationDiv.querySelector(".confirm-no");
    // Basic button styling
    [yesButton, noButton].forEach((btn) => {
      btn.style.padding = "8px 15px";
      btn.style.border = "1px solid #ccc";
      btn.style.borderRadius = "4px";
      btn.style.cursor = "pointer";
    });
    yesButton.style.background = "#d9534f";
    yesButton.style.color = "white";
    yesButton.style.borderColor = "#d43f3a"; // Red for confirm delete
    noButton.style.background = "#f0f0f0";

    yesButton.onclick = () => {
      removeConfirmation();
      onConfirm(); // Execute the action
    };
    noButton.onclick = () => {
      removeConfirmation(); // Just close
    };

    document.body.appendChild(confirmationDiv);
  }

  function removeConfirmation() {
    if (confirmationDiv) {
      confirmationDiv.remove();
      confirmationDiv = null;
    }
  }

  function deleteSelectedDrawingWithConfirmation() {
    if (selectedDrawingIndex === null) return; // Should not happen if called correctly
    showConfirmation("Delete selected drawing?", () => {
      if (selectedDrawingIndex !== null && drawings[selectedDrawingIndex]) {
        // Double check index is still valid
        drawings.splice(selectedDrawingIndex, 1);
        selectedDrawingIndex = null;
        isDraggingObject = false;
        saveDrawings();
        redrawCanvas();
        console.log("Selected drawing deleted.");
      }
    });
  }

  function clearAllDrawingsWithConfirmation() {
    if (drawings.length === 0) return;
    showConfirmation("Clear ALL drawings?", () => {
      drawings = [];
      selectedDrawingIndex = null;
      isDrawing = false;
      isDraggingObject = false;
      saveDrawings();
      redrawCanvas();
      console.log("All drawings cleared.");
    });
  }

  // --- Deactivation ---
  function deactivateDrawing() {
    console.log("WebDraw: Deactivating...");
    removeConfirmation(); // Ensure confirmation is removed
    if (textInputDiv) {
      /*...*/ saveOrRemoveTextOnExit(
        parseFloat(textInputDiv.style.left),
        parseFloat(textInputDiv.style.top)
      );
      removeTextInput();
    }
    hideAllStyleSubWindows();
    removeEventListeners();
    if (canvas) canvas.remove();
    if (toolbox) toolbox.remove();
    const nDiv = document.getElementById("webDrawNotification");
    if (nDiv) nDiv.remove();
    if (notificationTimeout) clearTimeout(notificationTimeout);

    // Reset state
    canvas = null;
    ctx = null;
    toolbox = null;
    styleSubwindow = null;
    confirmationDiv = null;
    drawings = [];
    selectedDrawingIndex = null;
    isActive = false;
    isDrawing = false;
    isDraggingObject = false;
    isDraggingToolbox = false;

    document.body.style.cursor = "default";
    chrome.runtime
      .sendMessage({ action: "drawingDeactivated" })
      .catch((e) => console.warn(e));
    console.log("WebDraw: Deactivated.");
    window.webDrawInitialized = false;
    return false;
  }

  // --- Global Toggle Function ---
  window.webDrawToggle = async () => {
    // ... (no changes) ...
    console.log(
      "WebDraw: Toggle requested. Current state isActive =",
      isActive
    );
    if (isActive) return deactivateDrawing();
    else {
      window.webDrawInitialized = true;
      return initializeDrawing();
    }
  };
} else {
  console.log("WebDraw: Already initialized flag set.");
}
