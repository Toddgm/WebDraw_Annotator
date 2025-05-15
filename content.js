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
  let isDraggingSubwindow = false; // Flag for dragging style subwindow
  let isDraggingObject = false;
  let isSelectingArea = false; // Flag for area selection

  let toolboxOffsetX, toolboxOffsetY;
  let subwindowOffsetX, subwindowOffsetY; // For subwindow dragging
  let startX, startY; // Document coords for drawing start
  let dragStartX, dragStartY, initialObjectPos; // Page coords for dragging delta
  let selectionAreaRect = null; // For drawing selection area preview {x, y, width, height} in document coords

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
  let currentLineDash = null; // Can be an array like [4, 4]
  const BASE_DOTTED_PATTERN = [4, 4]; // Base pattern for dotted lines
  let currentFontFamily = FONT_FAMILY_MAP.Virgil;
  let currentFontSize = FONT_SIZE_MAP.M;
  let currentTextAlign = "left";

  let drawings = [];
  let selectedDrawingIndex = null;
  const PAGE_STORAGE_KEY_PREFIX = "webDraw_";

  // Nerd Font Icons (Unicode characters)
  const svgs = {
    select: "\uf25a", // nf-fa-mouse_pointer (replaces complex SVG and old surrogate pair)
    pencil: "\udb83\uddeb", // nf-mdi-pencil
    rectangle: "\uf096", // nf-mdi-rectangle_outline
    arrow: "\udb80\udc5c", // nf-mdi-arrow_right_thin
    text: "\uF031", // nf-fa-font
    share: "\uf50f", // nf-mdi-share_variant
    clear: "\uF1F8", // nf-fa-trash
    exit: "\uF08B", // nf-fa-sign_out
  };

  // --- Initialization ---

  function initializeDrawing() {
    console.log("WebDraw: Initializing...");
    if (!createCanvas()) return false;
    createToolbox();
    addEventListeners(); // Add listeners after elements exist
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
    // ... (no changes to HTML structure other than using new svgs object) ...
    if (document.getElementById("webDrawToolbox")) {
      console.warn("WebDraw: Toolbox already exists.");
      return;
    }
    toolbox = document.createElement("div");
    toolbox.id = "webDrawToolbox";
    toolbox.innerHTML = `<div class="webdraw-title" title="Drag to move">WebDraw</div> <button data-tool="select" class="webdraw-button" title="Select (S)">${svgs.select}</button> <button data-tool="pencil" class="webdraw-button" title="Pencil (P)">${svgs.pencil}</button> <button data-tool="rect" class="webdraw-button" title="Rectangle (R)">${svgs.rectangle}</button> <button data-tool="arrow" class="webdraw-button" title="Arrow (A)">${svgs.arrow}</button> <button data-tool="text" class="webdraw-button" title="Text (T)"> ${svgs.text} </button> <button data-tool="share" class="webdraw-button" title="Share Screenshot">${svgs.share}</button> <button data-tool="clear" class="webdraw-button" title="Delete Selected / Clear All">${svgs.clear}</button> <button data-tool="exit" class="webdraw-button" title="Exit (Esc)">${svgs.exit}</button>`;
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

  // --- Subwindow Drag Handling ---
  function handleSubwindowDragStart(e) {
    if (e.button !== 0 || e.target.closest("button")) return; // Don't drag if clicking a button inside
    isDraggingSubwindow = true;
    const rect = styleSubwindow.getBoundingClientRect();
    // Calculate offset from viewport coordinates
    subwindowOffsetX = e.clientX - rect.left;
    subwindowOffsetY = e.clientY - rect.top;

    const dragHandle = styleSubwindow.querySelector(
      ".webdraw-subwindow-drag-handle"
    );
    if (dragHandle) dragHandle.style.cursor = "grabbing";

    document.addEventListener("mousemove", handleDocumentMouseMove);
    document.addEventListener("mouseup", handleDocumentMouseUp);
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
    } else if (isDraggingSubwindow && styleSubwindow) {
      let newLeft = e.clientX - subwindowOffsetX;
      let newTop = e.clientY - subwindowOffsetY;

      // Boundary checks for subwindow (relative to viewport)
      const maxLeft = window.innerWidth - styleSubwindow.offsetWidth - 5;
      const maxTop = window.innerHeight - styleSubwindow.offsetHeight - 5;
      newLeft = Math.max(5, Math.min(newLeft, maxLeft));
      newTop = Math.max(5, Math.min(newTop, maxTop));

      styleSubwindow.style.left = `${newLeft}px`;
      styleSubwindow.style.top = `${newTop}px`; // These are viewport-relative
    } else if (
      isDrawing ||
      isDraggingObject ||
      (currentTool === "select" && isSelectingArea)
    ) {
      // Route drawing/object dragging/area selection mouse moves
      handleDrawingMouseMove(e);
    }
  }

  function handleDocumentMouseUp(e) {
    if (isDraggingToolbox) {
      isDraggingToolbox = false;
      const titleElement = toolbox.querySelector(".webdraw-title");
      if (titleElement) titleElement.style.cursor = "grab"; // Restore cursor
      document.removeEventListener("mousemove", handleDocumentMouseMove);
      document.removeEventListener("mouseup", handleDocumentMouseUp);
    } else if (isDraggingSubwindow) {
      isDraggingSubwindow = false;
      const dragHandle = styleSubwindow?.querySelector(
        ".webdraw-subwindow-drag-handle"
      );
      if (dragHandle) dragHandle.style.cursor = "grab";
      document.removeEventListener("mousemove", handleDocumentMouseMove);
      document.removeEventListener("mouseup", handleDocumentMouseUp);
    } else if (
      isDrawing ||
      isDraggingObject ||
      (currentTool === "select" && isSelectingArea)
    ) {
      // Route drawing/object dragging/area selection mouse up
      handleDrawingMouseUp(e);
    }
  }

  // --- Style Sub-window ---
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

    // ADDED: Drag Handle
    let contentHTML = `<div class="webdraw-subwindow-drag-handle" title="Drag to move">Style Options</div>`;

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
        { name: "Dotted", dash: BASE_DOTTED_PATTERN }, // Use base pattern for UI display
      ];
      styles.forEach((style) => {
        // Check if currentLineDash matches the (potentially scaled) version of this style's dash
        let isActive = false;
        if (style.dash === null && currentLineDash === null) {
          isActive = true;
        } else if (style.dash && currentLineDash) {
          // For dotted, check if currentLineDash is a scaled version of BASE_DOTTED_PATTERN
          // This is a simplified check; actual currentLineDash could be scaled.
          // A more robust check would compare the "intent" (dotted) rather than exact array.
          // For UI, it's fine to just check if currentLineDash is not null if style.dash is not null.
          if (currentLineDash) isActive = true; // If currentLineDash is set, Dotted is active.
        }

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
                // Re-use width-button class for S/M/L text size
                isActive ? "active" : ""
              }" data-fontsize="${pxValue}" title="${pxValue}">
                  ${sizeKey}
              </button>`;
      });
      contentHTML += `</div>`;

      // Text Align Controls
      contentHTML += `<div class="webdraw-style-section"><span class="webdraw-style-label">Align:</span>`;
      const aligns = [
        // Using Nerd Font characters for align icons
        { name: "Left", value: "left", icon: "\uF036" /* nf-fa-align_left */ },
        {
          name: "Center",
          value: "center",
          icon: "\uF037" /* nf-fa-align_center */,
        },
        {
          name: "Right",
          value: "right",
          icon: "\uF038" /* nf-fa-align_right */,
        },
      ];
      aligns.forEach((align) => {
        const isActive = align.value === currentTextAlign;
        contentHTML += `
              <button class="webdraw-align-button ${
                // Ensure this button uses Nerd Font
                isActive ? "active" : ""
              }" data-align="${align.value}" title="${align.name}">
                  ${align.icon}
              </button>`;
      });
      contentHTML += `</div>`;
    }

    styleSubwindow.innerHTML = contentHTML;

    // Add mousedown listener to the drag handle
    const dragHandle = styleSubwindow.querySelector(
      ".webdraw-subwindow-drag-handle"
    );
    if (dragHandle) {
      dragHandle.addEventListener("mousedown", handleSubwindowDragStart);
    }

    styleSubwindow.addEventListener("click", handleStyleSubwindowClick); // For style buttons
    document.body.appendChild(styleSubwindow);
    positionSubwindow();
  }

  function positionSubwindow() {
    if (!styleSubwindow || !toolbox) return;

    // If subwindow is being dragged, its position is handled by handleDocumentMouseMove
    if (isDraggingSubwindow) return;

    const toolboxRect = toolbox.getBoundingClientRect();
    // Position subwindow based on fixed toolbox position (viewport relative)
    // And add current scrollY to account for page scroll if toolbox were absolute
    // Since toolbox IS fixed, scrollY is not strictly needed here but good for robustness if that changes.
    let topPos = toolboxRect.bottom + 5; // 5px below toolbox
    let leftPos = toolboxRect.left;

    // Ensure subwindow stays within viewport
    const subwindowWidth = styleSubwindow.offsetWidth;
    const subwindowHeight = styleSubwindow.offsetHeight;

    if (leftPos + subwindowWidth > window.innerWidth - 5) {
      leftPos = window.innerWidth - subwindowWidth - 5;
    }
    if (topPos + subwindowHeight > window.innerHeight - 5) {
      topPos = window.innerHeight - subwindowHeight - 5;
    }
    leftPos = Math.max(5, leftPos);
    topPos = Math.max(5, topPos);

    styleSubwindow.style.left = `${leftPos}px`;
    styleSubwindow.style.top = `${topPos}px`;
  }

  function getScaledDashArray(baseDashArray, lineWidth) {
    if (!baseDashArray) return null; // Solid line
    const scaleFactor = Math.max(1, lineWidth / 4); // Adjust divisor (e.g., 4) as needed
    return [baseDashArray[0] * scaleFactor, baseDashArray[1] * scaleFactor];
  }

  function handleStyleSubwindowClick(e) {
    const target = e.target.closest("button");
    if (!target) return;
    const parentSection = target.closest(".webdraw-style-section");
    if (!parentSection) return;

    // Update state
    if (target.dataset.color) {
      currentColor = target.dataset.color;
    } else if (target.dataset.width) {
      currentLineWidth = parseInt(target.dataset.width, 10);
      // If a dash style is active, update it based on the new width
      if (currentLineDash) {
        // currentLineDash is not null, meaning a dash style is active
        currentLineDash = getScaledDashArray(
          BASE_DOTTED_PATTERN,
          currentLineWidth
        );
      }
    } else if (target.dataset.linedash) {
      const baseDash = JSON.parse(target.dataset.linedash); // e.g., [4,4] or null
      if (baseDash) {
        // If it's a dash array (e.g., Dotted was clicked)
        currentLineDash = getScaledDashArray(baseDash, currentLineWidth);
      } else {
        // Solid was clicked
        currentLineDash = null;
      }
    } else if (target.dataset.fontfamily) {
      currentFontFamily = target.dataset.fontfamily;
    } else if (target.dataset.fontsize) {
      currentFontSize = target.dataset.fontsize;
    } else if (target.dataset.align) {
      currentTextAlign = target.dataset.align;
    } else {
      return; // Not a style-modifying button
    }

    // Update UI in the subwindow
    parentSection
      .querySelectorAll("button")
      .forEach((btn) => btn.classList.remove("active"));
    target.classList.add("active");

    // Special handling for line style button activation:
    // If 'Solid' (data-linedash="null") is clicked, it becomes active.
    // If 'Dotted' (data-linedash="[...]") is clicked, it becomes active.
    // Need to make sure only one is active.
    if (target.dataset.linedash) {
      parentSection.querySelectorAll("button[data-linedash]").forEach((btn) => {
        const btnDash = JSON.parse(btn.dataset.linedash);
        const currentIsDotted = currentLineDash !== null;
        const btnIsDotted = btnDash !== null;
        if (currentIsDotted === btnIsDotted) {
          // If current style matches button's intended style (dotted or solid)
          btn.classList.add("active");
        } else {
          btn.classList.remove("active");
        }
      });
    }

    // Apply to selected drawing if any
    if (selectedDrawingIndex !== null && drawings[selectedDrawingIndex]) {
      const selected = drawings[selectedDrawingIndex];
      if (target.dataset.color) selected.color = currentColor;
      if (target.dataset.width) {
        selected.lineWidth = currentLineWidth;
        // If selected drawing had a dash, update it too
        if (selected.lineDash) {
          selected.lineDash = getScaledDashArray(
            BASE_DOTTED_PATTERN,
            selected.lineWidth
          );
        }
      }
      if (target.dataset.linedash) {
        // If "Solid" is chosen, lineDash becomes null
        // If "Dotted" is chosen, lineDash becomes the scaled pattern
        const baseDash = JSON.parse(target.dataset.linedash);
        selected.lineDash = baseDash
          ? getScaledDashArray(baseDash, selected.lineWidth || currentLineWidth)
          : null;
      }
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
      // If clicking the active tool again, toggle subwindow
      if (
        styleSubwindow &&
        ["pencil", "rect", "arrow", "text"].includes(tool)
      ) {
        hideAllStyleSubWindows();
      } else if (["pencil", "rect", "arrow", "text"].includes(tool)) {
        createOrShowStyleSubWindow(tool);
      }
      return;
    }

    const currentActiveButton = toolbox.querySelector(".webdraw-button.active");
    if (currentActiveButton) currentActiveButton.classList.remove("active");

    currentTool = tool;
    targetButton.classList.add("active");
    selectedDrawingIndex = null; // Deselect object when switching tools
    isDraggingObject = false;
    if (isSelectingArea) {
      // If was in area selection mode, cancel it
      isSelectingArea = false;
      selectionAreaRect = null;
    }

    setCursorForTool(currentTool);
    if (textInputDiv) removeTextInput();

    // Show/Hide Style Subwindow based on the NEW tool
    if (["pencil", "rect", "arrow", "text"].includes(tool)) {
      createOrShowStyleSubWindow(tool);
    } else {
      hideAllStyleSubWindows();
    }

    console.log("Selected tool:", currentTool);
    redrawCanvas(); // Redraw mainly to clear selection highlight or selection area
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
        canvas.style.cursor = "default"; // For area selection, could be crosshair too, but default is fine.
        break;
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

    window.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", handleResize);
    document.addEventListener("keydown", handleKeyDown);
    console.log("WebDraw: Event listeners added.");
  }

  function removeEventListeners() {
    console.log("WebDraw: Removing event listeners.");
    if (canvas) {
      canvas.removeEventListener("mousedown", handleCanvasMouseDown);
    }
    // Remove document listeners if they were added
    document.removeEventListener("mousemove", handleDocumentMouseMove);
    document.removeEventListener("mouseup", handleDocumentMouseUp);
    // Remove toolbox drag listener specifically
    const titleElement = toolbox?.querySelector(".webdraw-title");
    if (titleElement) {
      titleElement.removeEventListener("mousedown", handleToolboxDragStart);
    }
    // Remove subwindow drag listener
    const dragHandle = styleSubwindow?.querySelector(
      ".webdraw-subwindow-drag-handle"
    );
    if (dragHandle) {
      dragHandle.removeEventListener("mousedown", handleSubwindowDragStart);
    }

    window.removeEventListener("scroll", handleScroll);
    window.removeEventListener("resize", handleResize);
    document.removeEventListener("keydown", handleKeyDown);
  }

  function handleScroll() {
    requestAnimationFrame(redrawCanvas);
    if (!isDraggingSubwindow) {
      // Don't reposition subwindow if user is dragging it
      positionSubwindow();
    }
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
    if (!isDraggingSubwindow) {
      positionSubwindow();
    }
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
      } else if (isDrawing || isDraggingObject || isSelectingArea) {
        isDrawing = false;
        isDraggingObject = false;
        isSelectingArea = false;
        selectionAreaRect = null;
        initialObjectPos = null; // Clear reference
        // If drawing was in progress (not select tool), remove the incomplete drawing entry
        if (currentTool !== "select" && isDrawing && drawings.length > 0) {
          const lastDrawing = drawings[drawings.length - 1];
          // Only pop if it was a very recently added point for pencil, or if it's not text.
          // This logic might need refinement based on how drawing pushes elements.
          if (lastDrawing.type === "pencil" && lastDrawing.points.length <= 1) {
            drawings.pop();
          } else if (
            lastDrawing.type !== "pencil" &&
            lastDrawing.type !== "text"
          ) {
            // For rect/arrow, they are pushed on mouseup. if escape during draw, they are not pushed yet.
            // This pop here would be for a scenario where it WAS pushed.
            // The current logic pushes rect/arrow on mouseup, so this pop might be redundant if escape cancels before mouseup.
          }
        }
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
        handleDelete(); // This now calls the complex confirmation flow
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

  function handleCanvasMouseDown(e) {
    if (
      e.button !== 0 ||
      !ctx ||
      !canvas ||
      isDraggingToolbox ||
      isDraggingSubwindow
    )
      return;
    if (styleSubwindow && styleSubwindow.contains(e.target)) return; // Ignore clicks in subwindow

    const docCoords = getDocumentRelativeCoords(e);
    const canvasCoords = getCanvasRelativeCoords(e); // For hit detection
    console.log(
      `handleCanvasMouseDown: Tool: ${currentTool}, Doc(${docCoords.x},${docCoords.y}), Canvas(${canvasCoords.x},${canvasCoords.y})`
    );

    startX = docCoords.x; // Doc coords for drawing data start
    startY = docCoords.y;
    dragStartX = e.pageX; // Page coords for delta calculation start
    dragStartY = e.pageY;

    isDrawing = false;
    isDraggingObject = false;
    isSelectingArea = false;
    selectionAreaRect = null;

    if (currentTool === "select") {
      const clickedIndex = findClickedDrawingIndex(
        canvasCoords.x, // Use canvas-relative for hit detection
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
        // Clicked on empty space with select tool: Start Area Selection
        selectedDrawingIndex = null; // Deselect if previously selected
        isSelectingArea = true;
        selectionAreaRect = { x: startX, y: startY, width: 0, height: 0 }; // Init selection rect
        console.log("Selection: Clicked empty space, starting area selection.");
      }
      redrawCanvas(); // Show selection change or start of area selection
    } else if (["pencil", "rect", "arrow", "text"].includes(currentTool)) {
      selectedDrawingIndex = null; // Deselect any object when starting to draw a new one
      isDrawing = true; // Start drawing a new shape/text placement
      // For pencil, add the first point immediately
      if (currentTool === "pencil") {
        drawings.push({
          type: "pencil",
          points: [docCoords],
          color: currentColor,
          lineWidth: currentLineWidth,
          lineDash: currentLineDash ? [...currentLineDash] : null, // Store a copy
        });
      }
      redrawCanvas(); // Clear selection highlight if any
    }

    // Add document listeners ONLY if we started drawing, dragging an object, or selecting an area
    if (isDrawing || isDraggingObject || isSelectingArea) {
      document.addEventListener("mousemove", handleDocumentMouseMove);
      document.addEventListener("mouseup", handleDocumentMouseUp);
    }

    e.preventDefault(); // Prevent default browser actions like text selection drag
  }

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
          requestAnimationFrame(redrawCanvas);
        }
      } else if (currentTool === "rect" || currentTool === "arrow") {
        // Draw preview shape on top
        requestAnimationFrame(() => {
          redrawCanvas(); // Redraw existing drawings first
          ctx.save();
          ctx.strokeStyle = currentColor;
          ctx.lineWidth = currentLineWidth;
          ctx.setLineDash(currentLineDash || []);
          const startCanvas = getCanvasCoords(startX, startY); // Use canvas coords for drawing preview
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
    } else if (
      currentTool === "select" &&
      isSelectingArea &&
      selectionAreaRect
    ) {
      // --- Area Selection ---
      selectionAreaRect.width = docCoords.x - selectionAreaRect.x;
      selectionAreaRect.height = docCoords.y - selectionAreaRect.y;
      requestAnimationFrame(redrawCanvas); // Redraw to show selection area
    }
  }

  function handleDrawingMouseUp(e) {
    if (e.button !== 0 || !isActive) return;

    const docCoords = getDocumentRelativeCoords(e);
    console.log(
      `handleDrawingMouseUp: Tool: ${currentTool}, Drawing: ${isDrawing}, DraggingObj: ${isDraggingObject}, SelectingArea: ${isSelectingArea}`
    );

    // Finalize based on the action that was in progress
    if (isDraggingObject) {
      // Object drag finished
      saveDrawings();
      console.log("Object drag finished, saved drawings.");
    } else if (isDrawing) {
      // Drawing action finished
      if (currentTool === "pencil") {
        // Path already updated during move, simplify if too few points
        const currentPath = drawings[drawings.length - 1];
        if (
          currentPath &&
          currentPath.type === "pencil" &&
          currentPath.points.length < 2
        ) {
          drawings.pop(); // Remove if just a dot
        }
      } else if (currentTool === "rect") {
        const rectX = Math.min(startX, docCoords.x);
        const rectY = Math.min(startY, docCoords.y);
        const rectWidth = Math.abs(docCoords.x - startX);
        const rectHeight = Math.abs(docCoords.y - startY);
        if (rectWidth > 2 || rectHeight > 2) {
          // Min size threshold
          drawings.push({
            type: "rect",
            x: rectX,
            y: rectY,
            width: rectWidth,
            height: rectHeight,
            color: currentColor,
            lineWidth: currentLineWidth,
            lineDash: currentLineDash ? [...currentLineDash] : null,
          });
        }
      } else if (currentTool === "arrow") {
        if (
          Math.abs(docCoords.x - startX) > 2 || // Min length threshold
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
            lineDash: currentLineDash ? [...currentLineDash] : null,
          });
        }
      } else if (currentTool === "text") {
        // Only create text prompt if it was a click, not a drag
        if (
          Math.abs(docCoords.x - startX) < 5 &&
          Math.abs(docCoords.y - startY) < 5
        ) {
          createTextPrompt(startX, startY); // Create input at the starting point
        }
      }

      // Save drawings unless it was text (which saves separately after input)
      if (currentTool !== "text") {
        saveDrawings();
        console.log("Drawing finished for tool, saved drawings.", currentTool);
      }
    } else if (
      currentTool === "select" &&
      isSelectingArea &&
      selectionAreaRect
    ) {
      // --- Area Selection Finished ---
      const finalSelectionRect = {
        // Ensure width/height are positive
        x: Math.min(
          selectionAreaRect.x,
          selectionAreaRect.x + selectionAreaRect.width
        ),
        y: Math.min(
          selectionAreaRect.y,
          selectionAreaRect.y + selectionAreaRect.height
        ),
        width: Math.abs(selectionAreaRect.width),
        height: Math.abs(selectionAreaRect.height),
      };

      if (finalSelectionRect.width > 5 && finalSelectionRect.height > 5) {
        // Min selection area
        let foundIndex = null;
        for (let i = drawings.length - 1; i >= 0; i--) {
          const drawingBounds = getDrawingBounds(drawings[i]);
          if (
            drawingBounds &&
            doRectsIntersect(finalSelectionRect, drawingBounds)
          ) {
            foundIndex = i;
            break; // Select the topmost one
          }
        }
        if (foundIndex !== null) {
          selectedDrawingIndex = foundIndex;
          console.log("Area selection: Selected drawing index", foundIndex);
        } else {
          selectedDrawingIndex = null;
          console.log("Area selection: No drawings found in area.");
        }
      } else {
        selectedDrawingIndex = null; // Area too small, deselect
      }
    }

    // Reset flags and remove document listeners added by handleCanvasMouseDown
    isDrawing = false;
    isDraggingObject = false;
    isSelectingArea = false;
    selectionAreaRect = null;
    initialObjectPos = null; // Clear reference for object dragging

    document.removeEventListener("mousemove", handleDocumentMouseMove);
    document.removeEventListener("mouseup", handleDocumentMouseUp);

    redrawCanvas(); // Final redraw for all cases
  }

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

  // Helper for area selection intersection
  function doRectsIntersect(rectA, rectB) {
    if (!rectA || !rectB) return false;
    return (
      rectA.x < rectB.x + rectB.width &&
      rectA.x + rectA.width > rectB.x &&
      rectA.y < rectB.y + rectB.height &&
      rectA.y + rectA.height > rectB.y
    );
  }

  function getDrawingBounds(drawing) {
    // ... (no changes to internal logic) ...
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
        // Use a temporary canvas for text measurement if ctx is not readily available or for isolation
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
    // Padding for easier selection, ensure lineWidth is sensible
    const effectiveLineWidth =
      drawing.lineWidth || (drawing.type === "text" ? 2 : 1);
    const padding = Math.max(1, effectiveLineWidth / 2) + 5; // ensure padding is at least 5

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

    // Convert canvasX, canvasY (relative to canvas viewport top-left) to document coordinates
    // because getDrawingBounds returns document coordinates.
    const canvasRect = canvas.getBoundingClientRect();
    const docX = canvasX + canvasRect.left + window.scrollX;
    const docY = canvasY + canvasRect.top + window.scrollY;

    return (
      docX >= bounds.x &&
      docX <= bounds.x + bounds.width &&
      docY >= bounds.y &&
      docY <= bounds.y + bounds.height
    );
  }

  function findClickedDrawingIndex(canvasX, canvasY) {
    // canvasX, canvasY are canvas-relative
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
    const rect = canvas.getBoundingClientRect(); // rect is relative to viewport
    // To get canvas-relative coords: (docX - scrollX) gives viewportX. Then (viewportX - rect.left).
    return {
      x: docX - window.scrollX - rect.left,
      y: docY - window.scrollY - rect.top,
    };
  }

  // --- Redrawing & Persistence ---
  function redrawCanvas() {
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
          ctx.beginPath();
          // All points are stored as document-relative, convert to canvas-relative for drawing
          const startCoords = getCanvasCoords(d.points[0].x, d.points[0].y);
          ctx.moveTo(startCoords.x, startCoords.y);
          for (let i = 1; i < d.points.length; i++) {
            const pointCoords = getCanvasCoords(d.points[i].x, d.points[i].y);
            ctx.lineTo(pointCoords.x, pointCoords.y);
          }
          ctx.stroke();
        } else if (d.type === "rect") {
          if (typeof d.width === "number" && typeof d.height === "number") {
            const startCoords = getCanvasCoords(d.x, d.y);
            // width and height are already correct, no conversion needed for them
            ctx.strokeRect(startCoords.x, startCoords.y, d.width, d.height);
          }
        } else if (d.type === "arrow") {
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
          const bounds = getDrawingBounds(d); // bounds are document-relative
          if (bounds) {
            const selectionTopLeftCanvas = getCanvasCoords(bounds.x, bounds.y);
            // bounds.width and bounds.height are fine as they are (lengths)
            const currentDash = ctx.getLineDash();
            ctx.strokeStyle = "rgba(0, 100, 255, 0.7)";
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(
              selectionTopLeftCanvas.x,
              selectionTopLeftCanvas.y,
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

    // Draw selection area preview if active
    if (currentTool === "select" && isSelectingArea && selectionAreaRect) {
      ctx.save();
      const selAreaStartCanvas = getCanvasCoords(
        selectionAreaRect.x,
        selectionAreaRect.y
      );
      // selectionAreaRect.width and height are deltas in document space, they are fine as lengths.
      ctx.strokeStyle = "rgba(0, 100, 255, 0.7)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(
        selAreaStartCanvas.x,
        selAreaStartCanvas.y,
        selectionAreaRect.width,
        selectionAreaRect.height
      );
      ctx.restore();
    }
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
    // Prepare data for background script
    const viewportData = {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    };
    const dataToSend = {
      drawings: drawings,
      viewport: viewportData,
    };

    console.log("WebDraw: Sending createShareImage to background", dataToSend);
    showNotification("Creating share link...", false); // Show a generic "creating" message

    chrome.runtime
      .sendMessage({ action: "createShareImage", data: dataToSend })
      .then((response) => {
        if (response && response.imageUrl) {
          copyLinkToClipboardAndNotify(response.imageUrl);
          // The notification for success/placeholder status will come from background implicitly
          // by the nature of the link (e.g., if it's the "fake_link_from_background.png").
          // If a more explicit message about using a placeholder is needed from content.js,
          // background.js would need to send an additional flag in the response.
          // For now, copying the received link is the primary action.
        } else if (response && response.error) {
          console.error("Share failed:", response.error);
          showNotification(`Error: ${response.error}`, true);
        } else {
          console.error("Share failed: Unknown response from background.");
          showNotification("Error: Could not create share link.", true);
        }
      })
      .catch((error) => {
        console.error("Share message failed:", error);
        showNotification(
          `Error: ${error.message || "Failed to send share request."}`,
          true
        );
      });
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
    nDiv.className = isError ? "error" : ""; // Reset classes then add error if needed
    if (isError) nDiv.classList.add("error");
    else nDiv.classList.remove("error");

    if (notificationTimeout) clearTimeout(notificationTimeout);
    // Force reflow to restart animation
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

  // --- Custom Confirmation (Enhanced) ---
  function showComplexConfirmation(message, buttonsConfig, callback) {
    removeConfirmation(); // Remove existing if any

    confirmationDiv = document.createElement("div");
    confirmationDiv.id = "webDrawConfirmation";
    confirmationDiv.innerHTML = `<p>${message}</p><div class="webdraw-confirm-buttons"></div>`;

    const buttonsContainer = confirmationDiv.querySelector(
      ".webdraw-confirm-buttons"
    );

    buttonsConfig.forEach((btnConfig) => {
      const button = document.createElement("button");
      button.textContent = btnConfig.text;
      // Apply a general class and a specific style class
      button.classList.add("webdraw-confirm-button"); // A generic class for all confirm buttons if needed
      if (btnConfig.styleClass) {
        button.classList.add(btnConfig.styleClass); // e.g., 'confirm-action-danger'
      }
      button.onclick = () => {
        removeConfirmation();
        if (callback) callback(btnConfig.action);
      };
      buttonsContainer.appendChild(button);
    });

    document.body.appendChild(confirmationDiv);
    // Focus the first button or a "cancel" button for better keyboard nav, if desired
    const firstButton = buttonsContainer.querySelector("button");
    if (firstButton) firstButton.focus();
  }

  function removeConfirmation() {
    if (confirmationDiv) {
      confirmationDiv.remove();
      confirmationDiv = null;
    }
  }

  function deleteSelectedDrawingWithConfirmation() {
    if (selectedDrawingIndex === null) return;

    const buttons = [
      {
        text: "Delete Selected",
        action: "delete_selected",
        styleClass: "confirm-action-normal",
      },
      {
        text: "Clear ALL Drawings",
        action: "clear_all",
        styleClass: "confirm-action-danger",
      },
      { text: "Cancel", action: "cancel", styleClass: "confirm-action-cancel" },
    ];

    showComplexConfirmation(
      "An item is selected. Choose an action:",
      buttons,
      (chosenAction) => {
        if (chosenAction === "delete_selected") {
          if (selectedDrawingIndex !== null && drawings[selectedDrawingIndex]) {
            drawings.splice(selectedDrawingIndex, 1);
            selectedDrawingIndex = null;
            isDraggingObject = false;
            saveDrawings();
            redrawCanvas();
            console.log("Selected drawing deleted.");
            showNotification("Selected drawing deleted.");
          }
        } else if (chosenAction === "clear_all") {
          drawings = [];
          selectedDrawingIndex = null;
          isDrawing = false;
          isDraggingObject = false;
          saveDrawings();
          redrawCanvas();
          console.log("All drawings cleared.");
          showNotification("All drawings cleared.");
        }
        // 'cancel' action does nothing as dialog is already closed
      }
    );
  }

  function clearAllDrawingsWithConfirmation() {
    if (drawings.length === 0) {
      showNotification("Nothing to clear.");
      return;
    }
    const buttons = [
      {
        text: "Clear All",
        action: "confirm_clear_all",
        styleClass: "confirm-action-danger",
      },
      { text: "Cancel", action: "cancel", styleClass: "confirm-action-cancel" },
    ];
    showComplexConfirmation(
      "Are you sure you want to clear ALL drawings on this page?",
      buttons,
      (chosenAction) => {
        if (chosenAction === "confirm_clear_all") {
          drawings = [];
          selectedDrawingIndex = null;
          isDrawing = false;
          isDraggingObject = false;
          saveDrawings();
          redrawCanvas();
          console.log("All drawings cleared.");
          showNotification("All drawings cleared.");
        }
      }
    );
  }

  // --- Deactivation ---
  function deactivateDrawing() {
    console.log("WebDraw: Deactivating...");
    removeConfirmation(); // Ensure confirmation is removed
    if (textInputDiv) {
      const textInputStyle = window.getComputedStyle(textInputDiv); // Get style if needed
      saveOrRemoveTextOnExit(
        parseFloat(textInputStyle.left), // Use computed style if direct style isn't always set
        parseFloat(textInputStyle.top)
      );
      removeTextInput();
    }
    hideAllStyleSubWindows();
    removeEventListeners(); // Will also remove subwindow drag listener
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
    isDraggingSubwindow = false;
    isSelectingArea = false;
    selectionAreaRect = null;

    document.body.style.cursor = "default";
    chrome.runtime
      .sendMessage({ action: "drawingDeactivated" })
      .catch((e) =>
        console.warn("WebDraw: Error sending deactivation message:", e)
      );
    console.log("WebDraw: Deactivated.");
    window.webDrawInitialized = false; // Allow re-initialization
    return false; // To match promise signature in content_loader
  }

  // --- Global Toggle Function ---
  window.webDrawToggle = async () => {
    // ... (no changes) ...
    console.log(
      "WebDraw: Toggle requested. Current state isActive =",
      isActive
    );
    if (isActive) {
      return deactivateDrawing(); // Returns false
    } else {
      // Ensure flag is set before initialization attempt
      // window.webDrawInitialized might have been reset by deactivateDrawing
      // The outer guard `if (!window.webDrawInitialized)` handles the very first load of the script
      // This inner one handles re-activation
      window.webDrawInitialized = true;
      return initializeDrawing(); // Returns true if successful
    }
  };
} else {
  // End of `if (!window.webDrawInitialized)`
  console.log(
    "WebDraw: Already initialized flag set (script already ran once and might be active or inactive)."
  );
  // If webDrawToggle exists, it means the script has fully loaded at least once.
  // The toggle logic in background.js calling window.webDrawToggle will handle the state.
}
