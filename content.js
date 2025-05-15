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
  let isResizingObject = false; // Flag for resizing rects/text
  let resizeHandleType = null; // e.g., 'nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'
  const RESIZE_HANDLE_SIZE = 8; // In pixels, for drawing and hit detection
  const MIN_RECT_SIZE = RESIZE_HANDLE_SIZE * 2.5; // Minimum dimension for rect/text box during resize
  const MIN_TEXT_FONT_SIZE_PX = 8;
  const MAX_TEXT_FONT_SIZE_PX = 120;

  let isSelectingArea = false; // Flag for area selection

  let toolboxOffsetX, toolboxOffsetY;
  let subwindowOffsetX, subwindowOffsetY; // For subwindow dragging
  let startX, startY; // Document coords for drawing/dragging/resizing start
  let dragStartX, dragStartY; // Page coords for mousemove delta calculation (for dragging existing objects)
  let initialObjectPos; // For storing object state at start of drag/resize {x,y,width,height,fontSize,...}
  let selectionAreaRect = null; // For drawing selection area preview {x, y, width, height} in document coords

  let currentTool = "pencil";

  // Default Style Settings
  const PRESET_COLORS = ["#343a40", "#0c8599", "#f08c00", "#c2255c"];
  const WIDTH_MAP = { S: 1, M: 3, L: 6 };
  const FONT_SIZE_MAP = { S: "12px", M: "16px", L: "24px" }; // Default sizes for new text
  const FONT_FAMILY_MAP = {
    Virgil: '"Virgil", "Helvetica Neue", Arial, sans-serif',
    Arial: "Arial, sans-serif",
    BigBlueTerm: '"WebDrawNerdFont", monospace', // Using the @font-face name from content.css
  };

  let currentColor = PRESET_COLORS[0];
  let currentLineWidth = WIDTH_MAP.M;
  let currentLineDash = null; // Can be an array like [4, 4]
  const BASE_DOTTED_PATTERN = [4, 4]; // Base pattern for dotted lines
  let currentFontFamily = FONT_FAMILY_MAP.Virgil;
  let currentFontSize = FONT_SIZE_MAP.M; // For new text elements
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
    const initialButton = toolbox?.querySelector(
      `button[data-tool="${currentTool}"]`
    );
    if (initialButton) initialButton.classList.add("active");
    console.log("WebDraw: Active.");
    return true;
  }

  function createCanvas() {
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
    if (document.getElementById("webDrawToolbox")) {
      console.warn("WebDraw: Toolbox already exists.");
      return;
    }
    toolbox = document.createElement("div");
    toolbox.id = "webDrawToolbox";
    // Generate buttons from svgs object keys for maintainability
    let buttonsHTML = Object.keys(svgs)
      .map((key) => {
        // Create a more descriptive title if needed, e.g., capitalize
        const title = key.charAt(0).toUpperCase() + key.slice(1);
        const shortcut =
          key === "select"
            ? " (S)"
            : key === "pencil"
            ? " (P)"
            : key === "rect"
            ? " (R)"
            : key === "arrow"
            ? " (A)"
            : key === "text"
            ? " (T)"
            : key === "exit"
            ? " (Esc)"
            : "";
        return `<button data-tool="${key}" class="webdraw-button" title="${title}${shortcut}">${svgs[key]}</button>`;
      })
      .join("");

    toolbox.innerHTML = `<div class="webdraw-title" title="Drag to move">WebDraw</div>${buttonsHTML}`;
    document.body.appendChild(toolbox);
    toolbox.addEventListener("click", handleToolboxClick);
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
    e.target.style.cursor = "grabbing";
    document.addEventListener("mousemove", handleDocumentMouseMove);
    document.addEventListener("mouseup", handleDocumentMouseUp);
    e.preventDefault();
  }

  // --- Subwindow Drag Handling ---
  function handleSubwindowDragStart(e) {
    if (e.button !== 0 || e.target.closest("button")) return;
    isDraggingSubwindow = true;
    const rect = styleSubwindow.getBoundingClientRect();
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
      toolbox.style.left = `${Math.max(5, Math.min(newLeft, maxLeft))}px`;
      toolbox.style.top = `${Math.max(5, Math.min(newTop, maxTop))}px`;
    } else if (isDraggingSubwindow && styleSubwindow) {
      let newLeft = e.clientX - subwindowOffsetX;
      let newTop = e.clientY - subwindowOffsetY;
      const maxLeft = window.innerWidth - styleSubwindow.offsetWidth - 5;
      const maxTop = window.innerHeight - styleSubwindow.offsetHeight - 5;
      styleSubwindow.style.left = `${Math.max(
        5,
        Math.min(newLeft, maxLeft)
      )}px`;
      styleSubwindow.style.top = `${Math.max(5, Math.min(newTop, maxTop))}px`;
    } else if (
      isDrawing ||
      isDraggingObject ||
      isResizingObject ||
      (currentTool === "select" && isSelectingArea)
    ) {
      handleDrawingMouseMove(e);
    }
  }

  function handleDocumentMouseUp(e) {
    let wasActionHandled = false;
    if (
      isDrawing ||
      isDraggingObject ||
      isResizingObject ||
      (currentTool === "select" && isSelectingArea)
    ) {
      handleDrawingMouseUp(e); // This will clear its own document listeners
      wasActionHandled = true; // The drawing/object action took precedence
    }

    if (isDraggingToolbox) {
      isDraggingToolbox = false;
      const titleElement = toolbox.querySelector(".webdraw-title");
      if (titleElement) titleElement.style.cursor = "grab";
      if (!wasActionHandled) {
        // Only remove if not already removed by drawing action
        document.removeEventListener("mousemove", handleDocumentMouseMove);
        document.removeEventListener("mouseup", handleDocumentMouseUp);
      }
    } else if (isDraggingSubwindow) {
      isDraggingSubwindow = false;
      const dragHandle = styleSubwindow?.querySelector(
        ".webdraw-subwindow-drag-handle"
      );
      if (dragHandle) dragHandle.style.cursor = "grab";
      if (!wasActionHandled) {
        document.removeEventListener("mousemove", handleDocumentMouseMove);
        document.removeEventListener("mouseup", handleDocumentMouseUp);
      }
    }
  }

  // --- Style Sub-window ---
  function hideAllStyleSubWindows() {
    if (styleSubwindow) {
      styleSubwindow.remove();
      styleSubwindow = null;
    }
  }

  function createOrShowStyleSubWindow(toolOrObjectType) {
    hideAllStyleSubWindows();
    styleSubwindow = document.createElement("div");
    styleSubwindow.id = "webDrawStyleSubwindow";
    let contentHTML = `<div class="webdraw-subwindow-drag-handle" title="Drag to move">Style Options</div>`;

    const selectedObj =
      selectedDrawingIndex !== null ? drawings[selectedDrawingIndex] : null;

    // Determine effective styles: from selected object or global defaults
    const effColor = selectedObj?.color || currentColor;
    const effLineWidth = selectedObj?.lineWidth || currentLineWidth;
    const effLineDash = selectedObj?.lineDash || currentLineDash;
    const effFontFamily = selectedObj?.fontFamily || currentFontFamily;
    const effFontSize = selectedObj?.fontSize || currentFontSize; // For text, this is the actual size
    const effTextAlign = selectedObj?.textAlign || currentTextAlign;

    const createColorButtons = () => {
      let buttonsHTML = `<div class="webdraw-style-section"><span class="webdraw-style-label">Color:</span>`;
      PRESET_COLORS.forEach((color) => {
        buttonsHTML += `<button class="webdraw-color-button ${
          color === effColor ? "active" : ""
        }" data-color="${color}" style="background-color: ${color};" title="${color}"></button>`;
      });
      return buttonsHTML + `</div>`;
    };

    if (["pencil", "rect", "arrow"].includes(toolOrObjectType)) {
      contentHTML += createColorButtons();
      contentHTML += `<div class="webdraw-style-section"><span class="webdraw-style-label">Width:</span>`;
      Object.keys(WIDTH_MAP).forEach((sizeKey) => {
        const pxValue = WIDTH_MAP[sizeKey];
        contentHTML += `<button class="webdraw-width-button ${
          pxValue === effLineWidth ? "active" : ""
        }" data-width="${pxValue}" title="${pxValue}px">${sizeKey}<span class="webdraw-width-example"><hr style="height:${Math.max(
          1,
          pxValue
        )}px;"></span></button>`;
      });
      contentHTML += `</div>`;
      contentHTML += `<div class="webdraw-style-section"><span class="webdraw-style-label">Style:</span>`;
      const styles = [
        { name: "Solid", dash: null },
        { name: "Dotted", dash: BASE_DOTTED_PATTERN },
      ];
      styles.forEach((style) => {
        let isActive =
          (style.dash === null && effLineDash === null) ||
          (style.dash && effLineDash && effLineDash.length > 0); // Check if effLineDash is a non-empty array for "Dotted"
        contentHTML += `<button class="webdraw-linestyle-button ${
          isActive ? "active" : ""
        }" data-linedash='${JSON.stringify(style.dash)}' title="${
          style.name
        }"><hr style="border-top-style: ${
          style.dash ? "dashed" : "solid"
        };"></button>`;
      });
      contentHTML += `</div>`;
    } else if (toolOrObjectType === "text") {
      contentHTML += createColorButtons();
      contentHTML += `<div class="webdraw-style-section"><span class="webdraw-style-label">Font:</span>`;
      Object.keys(FONT_FAMILY_MAP).forEach((fontKey) => {
        const fontFamilyValue = FONT_FAMILY_MAP[fontKey];
        // Compare the string value for fontFamily for active state
        contentHTML += `<button class="webdraw-font-button ${
          fontFamilyValue === effFontFamily ? "active" : ""
        }" data-fontkey="${fontKey}" title="${fontKey}" style="font-family: ${fontFamilyValue};">${fontKey}</button>`;
      });
      contentHTML += `</div>`;
      // For text, font size is directly its pixel value, not S/M/L mapping after creation
      // However, for new text, we use S/M/L. If a text object is selected, we could show its actual px value or map back to S/M/L if it matches.
      // For simplicity, the S/M/L buttons in sub-window will set a PRESET size.
      contentHTML += `<div class="webdraw-style-section"><span class="webdraw-style-label">Size:</span>`;
      Object.keys(FONT_SIZE_MAP).forEach((sizeKey) => {
        const pxValue = FONT_SIZE_MAP[sizeKey];
        // Check if the selected object's font size matches one of the S/M/L presets
        const isActive = pxValue === effFontSize;
        contentHTML += `<button class="webdraw-width-button ${
          isActive ? "active" : ""
        }" data-fontsize="${pxValue}" title="${pxValue}">${sizeKey}</button>`;
      });
      contentHTML += `</div>`;

      contentHTML += `<div class="webdraw-style-section"><span class="webdraw-style-label">Align:</span>`;
      const aligns = [
        { name: "Left", value: "left", icon: "\uF036" },
        { name: "Center", value: "center", icon: "\uF037" },
        { name: "Right", value: "right", icon: "\uF038" },
      ];
      aligns.forEach((align) => {
        contentHTML += `<button class="webdraw-align-button ${
          align.value === effTextAlign ? "active" : ""
        }" data-align="${align.value}" title="${align.name}">${
          align.icon
        }</button>`;
      });
      contentHTML += `</div>`;
    } else {
      // No relevant styles for this type or nothing selected that has styles
      hideAllStyleSubWindows();
      return;
    }

    styleSubwindow.innerHTML = contentHTML;
    const dragHandle = styleSubwindow.querySelector(
      ".webdraw-subwindow-drag-handle"
    );
    if (dragHandle)
      dragHandle.addEventListener("mousedown", handleSubwindowDragStart);
    styleSubwindow.addEventListener("click", handleStyleSubwindowClick);
    document.body.appendChild(styleSubwindow);
    positionSubwindow();
  }

  function positionSubwindow() {
    if (!styleSubwindow || !toolbox) return;
    if (isDraggingSubwindow) return; // Position is handled by dragging logic
    const toolboxRect = toolbox.getBoundingClientRect();
    let topPos = toolboxRect.bottom + 5;
    let leftPos = toolboxRect.left;
    const subwindowWidth = styleSubwindow.offsetWidth;
    const subwindowHeight = styleSubwindow.offsetHeight;
    if (leftPos + subwindowWidth > window.innerWidth - 5) {
      leftPos = window.innerWidth - subwindowWidth - 5;
    }
    if (topPos + subwindowHeight > window.innerHeight - 5) {
      topPos = window.innerHeight - subwindowHeight - 5;
    }
    styleSubwindow.style.left = `${Math.max(5, leftPos)}px`;
    styleSubwindow.style.top = `${Math.max(5, topPos)}px`;
  }

  function getScaledDashArray(baseDashArray, lineWidth) {
    if (!baseDashArray) return null; // Solid line
    const scaleFactor = Math.max(1, lineWidth / 4); // Adjust divisor as needed
    return [baseDashArray[0] * scaleFactor, baseDashArray[1] * scaleFactor];
  }

  function handleStyleSubwindowClick(e) {
    const target = e.target.closest("button");
    if (!target) return;
    const parentSection = target.closest(".webdraw-style-section");
    if (!parentSection) return;

    let styleChanged = false;
    const selectedObj =
      selectedDrawingIndex !== null ? drawings[selectedDrawingIndex] : null;

    // Helper to update style on object or global default
    const updateStyle = (prop, value) => {
      if (selectedObj) selectedObj[prop] = value;
      else
        window[`current${prop.charAt(0).toUpperCase() + prop.slice(1)}`] =
          value; // e.g. currentColor
      styleChanged = true;
    };
    const updateGlobalStyle = (globalVarName, value) => {
      window[globalVarName] = value;
      styleChanged = true;
    };

    if (target.dataset.color) {
      const newColor = target.dataset.color;
      if (selectedObj) selectedObj.color = newColor;
      else currentColor = newColor;
      styleChanged = true;
    } else if (target.dataset.width) {
      const newWidth = parseInt(target.dataset.width, 10);
      if (selectedObj) {
        selectedObj.lineWidth = newWidth;
        if (selectedObj.lineDash)
          selectedObj.lineDash = getScaledDashArray(
            BASE_DOTTED_PATTERN,
            newWidth
          );
      } else {
        currentLineWidth = newWidth;
        if (currentLineDash)
          currentLineDash = getScaledDashArray(BASE_DOTTED_PATTERN, newWidth);
      }
      styleChanged = true;
    } else if (target.dataset.linedash) {
      const baseDash = JSON.parse(target.dataset.linedash);
      const effectiveLineWidth = selectedObj
        ? selectedObj.lineWidth
        : currentLineWidth;
      const newDash = baseDash
        ? getScaledDashArray(baseDash, effectiveLineWidth)
        : null;
      if (selectedObj) selectedObj.lineDash = newDash;
      else currentLineDash = newDash;
      styleChanged = true;
    } else if (target.dataset.fontkey) {
      const newFontFamily = FONT_FAMILY_MAP[target.dataset.fontkey];
      if (selectedObj) selectedObj.fontFamily = newFontFamily;
      else currentFontFamily = newFontFamily;
      styleChanged = true;
    } else if (target.dataset.fontsize) {
      // This applies S/M/L presets
      const newFontSize = target.dataset.fontsize;
      if (selectedObj && selectedObj.type === "text")
        selectedObj.fontSize = newFontSize;
      else currentFontSize = newFontSize;
      styleChanged = true;
    } else if (target.dataset.align) {
      const newAlign = target.dataset.align;
      if (selectedObj) selectedObj.textAlign = newAlign;
      else currentTextAlign = newAlign;
      styleChanged = true;
    }

    if (styleChanged) {
      parentSection
        .querySelectorAll("button")
        .forEach((btn) => btn.classList.remove("active"));
      target.classList.add("active");

      // Special handling for line style active state (solid vs dotted)
      if (target.dataset.linedash) {
        const currentActiveDash = selectedObj
          ? selectedObj.lineDash
          : currentLineDash;
        parentSection
          .querySelectorAll("button[data-linedash]")
          .forEach((btn) => {
            const btnDashVal = JSON.parse(btn.dataset.linedash); // null for solid, array for dotted
            const btnIsDottedIntent = btnDashVal !== null;
            const currentIsDotted =
              currentActiveDash !== null && currentActiveDash.length > 0;
            btn.classList.toggle(
              "active",
              btnIsDottedIntent === currentIsDotted
            );
          });
      }

      if (selectedObj) {
        saveDrawings();
        redrawCanvas();
      }
      // Log current effective styles (either global or what's being applied to selected obj)
      console.log(
        "Style updated. Current effective: ",
        selectedObj || {
          currentColor,
          currentLineWidth,
          currentLineDash,
          currentFontFamily,
          currentFontSize,
          currentTextAlign,
        }
      );
    }
  }

  function handleToolboxClick(e) {
    const targetButton = e.target.closest("button[data-tool]");
    if (!targetButton) return;
    const tool = targetButton.getAttribute("data-tool");

    if (tool === "share") {
      handleShare();
      return;
    }
    if (tool === "clear") {
      handleDelete();
      return;
    }
    if (tool === "exit") {
      deactivateDrawing();
      return;
    }

    // If clicking the currently active tool
    if (currentTool === tool) {
      if (
        tool === "select" &&
        selectedDrawingIndex !== null &&
        drawings[selectedDrawingIndex]
      ) {
        // Toggle style subwindow for the selected object
        if (styleSubwindow) hideAllStyleSubWindows();
        else createOrShowStyleSubWindow(drawings[selectedDrawingIndex].type);
      } else if (["pencil", "rect", "arrow", "text"].includes(tool)) {
        // For drawing tools, toggle their subwindow
        if (styleSubwindow) hideAllStyleSubWindows();
        else createOrShowStyleSubWindow(tool);
      }
      return;
    }

    // Switching to a new tool
    const currentActiveButtonInToolbox = toolbox.querySelector(
      ".webdraw-button.active"
    );
    if (currentActiveButtonInToolbox)
      currentActiveButtonInToolbox.classList.remove("active");
    currentTool = tool;
    targetButton.classList.add("active");

    // Reset selection state when switching tools, unless switching TO select and an object becomes selected later
    if (tool !== "select") {
      selectedDrawingIndex = null;
    }
    isDraggingObject = false;
    isResizingObject = false;
    resizeHandleType = null;
    if (isSelectingArea) {
      isSelectingArea = false;
      selectionAreaRect = null;
    }
    if (textInputDiv) removeTextInput(true); // true to not save on tool switch, just cancel

    setCursorForTool(currentTool);

    // Manage style subwindow visibility based on new tool
    if (tool === "select") {
      // For select tool, subwindow is shown only if an object is actually selected (handled in mousedown/mouseup)
      if (selectedDrawingIndex !== null && drawings[selectedDrawingIndex]) {
        createOrShowStyleSubWindow(drawings[selectedDrawingIndex].type);
      } else {
        hideAllStyleSubWindows();
      }
    } else if (["pencil", "rect", "arrow", "text"].includes(tool)) {
      createOrShowStyleSubWindow(tool); // Show subwindow for new drawing tool
    } else {
      // For tools like share, clear, exit (though handled earlier) or any future tools without subwindows
      hideAllStyleSubWindows();
    }
    redrawCanvas(); // Redraw to clear selection highlights if any, or show new tool cursor effects
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
        canvas.style.cursor = "text";
        break;
      case "select":
        canvas.style.cursor = "default";
        break; // Hover logic will change it for objects/handles
      default:
        canvas.style.cursor = "default";
    }
  }

  function addEventListeners() {
    if (!canvas) return;
    canvas.addEventListener("mousedown", handleCanvasMouseDown);
    window.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", handleResize);
    document.addEventListener("keydown", handleKeyDown);
  }

  function removeEventListeners() {
    if (canvas) canvas.removeEventListener("mousedown", handleCanvasMouseDown);
    document.removeEventListener("mousemove", handleDocumentMouseMove);
    document.removeEventListener("mouseup", handleDocumentMouseUp);
    const titleElement = toolbox?.querySelector(".webdraw-title");
    if (titleElement)
      titleElement.removeEventListener("mousedown", handleToolboxDragStart);
    const dragHandle = styleSubwindow?.querySelector(
      ".webdraw-subwindow-drag-handle"
    );
    if (dragHandle)
      dragHandle.removeEventListener("mousedown", handleSubwindowDragStart);
    window.removeEventListener("scroll", handleScroll);
    window.removeEventListener("resize", handleResize);
    document.removeEventListener("keydown", handleKeyDown);
  }

  function handleScroll() {
    requestAnimationFrame(redrawCanvas);
    if (!isDraggingSubwindow) positionSubwindow();
  }

  function handleResize() {
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
    }
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    requestAnimationFrame(redrawCanvas);
    if (!isDraggingSubwindow) positionSubwindow();
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") {
      if (confirmationDiv) removeConfirmation();
      else if (styleSubwindow) hideAllStyleSubWindows();
      else if (textInputDiv) removeTextInput(true); // true to cancel
      else if (
        isDrawing ||
        isDraggingObject ||
        isResizingObject ||
        isSelectingArea
      ) {
        isDrawing = false;
        isDraggingObject = false;
        isResizingObject = false;
        resizeHandleType = null;
        isSelectingArea = false;
        selectionAreaRect = null;
        initialObjectPos = null;
        // If drawing was pencil and very short, remove it.
        if (currentTool === "pencil" && isDrawing && drawings.length > 0) {
          const lastDrawing = drawings[drawings.length - 1];
          if (lastDrawing.type === "pencil" && lastDrawing.points.length <= 1)
            drawings.pop();
        }
        redrawCanvas();
      } else deactivateDrawing();
    } else if (
      (e.key === "Delete" || e.key === "Backspace") &&
      !(
        document.activeElement === textInputDiv ||
        textInputDiv?.contains(document.activeElement)
      )
    ) {
      if (isActive && selectedDrawingIndex !== null) {
        e.preventDefault();
        handleDelete();
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
      const toolKey = e.key.toLowerCase();
      if (toolKey === "p") switchTool("pencil");
      else if (toolKey === "r") switchTool("rect");
      else if (toolKey === "t") switchTool("text");
      else if (toolKey === "a") switchTool("arrow");
      else if (toolKey === "s") switchTool("select");
    }
  }

  function switchTool(tool) {
    if (!toolbox || currentTool === tool) return;
    const button = toolbox.querySelector(`button[data-tool="${tool}"]`);
    if (button) button.click(); // Simulate click to go through full tool switch logic
  }

  function getCanvasRelativeCoords(e) {
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function getDocumentRelativeCoords(e) {
    return { x: e.pageX, y: e.pageY };
  }

  function getResizeHandleAtPoint(drawing, canvasX, canvasY) {
    if (
      !drawing ||
      (drawing.type !== "rect" && drawing.type !== "text") ||
      !canvas
    )
      return null;

    const objBounds = getDrawingBounds(drawing, true); // true for precise bounds for handles
    if (!objBounds) return null;

    const hs = RESIZE_HANDLE_SIZE; // Use full size for easier hit
    const canvasRect = canvas.getBoundingClientRect();
    const mouseDocX = canvasX + canvasRect.left + window.scrollX;
    const mouseDocY = canvasY + canvasRect.top + window.scrollY;

    let actualX, actualY, actualWidth, actualHeight;
    if (drawing.type === "rect") {
      actualX = drawing.x;
      actualY = drawing.y;
      actualWidth = drawing.width;
      actualHeight = drawing.height;
    } else {
      // text
      actualX = objBounds.xPrecise;
      actualY = objBounds.yPrecise;
      actualWidth = objBounds.widthPrecise;
      actualHeight = objBounds.heightPrecise;
    }

    const handles = {
      // Positions are centers of handles
      nw: { x: actualX, y: actualY },
      n: { x: actualX + actualWidth / 2, y: actualY },
      ne: { x: actualX + actualWidth, y: actualY },
      w: { x: actualX, y: actualY + actualHeight / 2 },
      e: { x: actualX + actualWidth, y: actualY + actualHeight / 2 },
      sw: { x: actualX, y: actualY + actualHeight },
      s: { x: actualX + actualWidth / 2, y: actualY + actualHeight },
      se: { x: actualX + actualWidth, y: actualY + actualHeight },
    };

    for (const type in handles) {
      const handle = handles[type];
      // Check if mouseDocX, mouseDocY is within the handle's bounds (hs is half-size for this check)
      if (
        mouseDocX >= handle.x - hs / 2 &&
        mouseDocX <= handle.x + hs / 2 &&
        mouseDocY >= handle.y - hs / 2 &&
        mouseDocY <= handle.y + hs / 2
      ) {
        return type;
      }
    }
    return null;
  }

  function getCursorForResizeHandle(handleType) {
    switch (handleType) {
      case "n":
      case "s":
        return "ns-resize";
      case "e":
      case "w":
        return "ew-resize";
      case "nw":
      case "se":
        return "nwse-resize";
      case "ne":
      case "sw":
        return "nesw-resize";
      default:
        return "move";
    }
  }

  function handleCanvasMouseDown(e) {
    if (
      e.button !== 0 ||
      !ctx ||
      !canvas ||
      isDraggingToolbox ||
      isDraggingSubwindow
    )
      return;
    if (
      styleSubwindow &&
      styleSubwindow.contains(e.target) &&
      !e.target.closest(".webdraw-subwindow-drag-handle")
    )
      return;

    const docCoords = getDocumentRelativeCoords(e);
    const canvasCoords = getCanvasRelativeCoords(e);
    startX = docCoords.x;
    startY = docCoords.y; // Mousedown location in document coords
    dragStartX = e.pageX;
    dragStartY = e.pageY; // Mousedown location in page coords (for delta on move)

    isDrawing = false;
    isDraggingObject = false;
    isResizingObject = false;
    resizeHandleType = null;
    isSelectingArea = false;
    selectionAreaRect = null;

    if (currentTool === "select") {
      let clickedOnSelectedObjectHandle = false;
      if (selectedDrawingIndex !== null && drawings[selectedDrawingIndex]) {
        const selectedObj = drawings[selectedDrawingIndex];
        if (selectedObj.type === "rect" || selectedObj.type === "text") {
          resizeHandleType = getResizeHandleAtPoint(
            selectedObj,
            canvasCoords.x,
            canvasCoords.y
          );
          if (resizeHandleType) {
            isResizingObject = true;
            clickedOnSelectedObjectHandle = true;
            const preciseBounds = getDrawingBounds(selectedObj, true);
            initialObjectPos = {
              x: selectedObj.x,
              y: selectedObj.y,
              // For rect, width/height are direct. For text, they come from bounds.
              width:
                selectedObj.type === "rect"
                  ? selectedObj.width
                  : preciseBounds.widthPrecise,
              height:
                selectedObj.type === "rect"
                  ? selectedObj.height
                  : preciseBounds.heightPrecise,
              fontSize: selectedObj.fontSize, // Store original font size for text
              // Store precise top-left for text object anchor adjustment during resize
              preciseX: preciseBounds.xPrecise,
              preciseY: preciseBounds.yPrecise,
            };
          }
        }
      }

      if (!clickedOnSelectedObjectHandle) {
        // Not starting a resize op
        const clickedIndex = findClickedDrawingIndex(
          canvasCoords.x,
          canvasCoords.y
        );
        if (clickedIndex !== null) {
          selectedDrawingIndex = clickedIndex;
          isDraggingObject = true;
          const obj = drawings[selectedDrawingIndex];
          if (obj.type === "pencil")
            initialObjectPos = obj.points.map((p) => ({ ...p }));
          else if (obj.type === "arrow")
            initialObjectPos = {
              x1: obj.x1,
              y1: obj.y1,
              x2: obj.x2,
              y2: obj.y2,
            };
          else {
            // rect, text
            const preciseBounds = getDrawingBounds(obj, true);
            initialObjectPos = {
              x: obj.x,
              y: obj.y,
              width:
                obj.type === "rect" ? obj.width : preciseBounds.widthPrecise,
              height:
                obj.type === "rect" ? obj.height : preciseBounds.heightPrecise,
              fontSize: obj.fontSize,
              preciseX: preciseBounds.xPrecise, // For text drag reference
              preciseY: preciseBounds.yPrecise,
            };
          }
        } else {
          // Clicked empty space
          selectedDrawingIndex = null;
          isSelectingArea = true;
          selectionAreaRect = { x: startX, y: startY, width: 0, height: 0 };
        }
      }
      // Update subwindow based on selection
      if (selectedDrawingIndex !== null && drawings[selectedDrawingIndex]) {
        createOrShowStyleSubWindow(drawings[selectedDrawingIndex].type);
      } else {
        hideAllStyleSubWindows();
      }
    } else if (["pencil", "rect", "arrow", "text"].includes(currentTool)) {
      selectedDrawingIndex = null; // Deselect if starting to draw new
      if (styleSubwindow && currentTool !== styleSubwindow.dataset.toolFor) {
        // If subwindow is for a different tool type
        createOrShowStyleSubWindow(currentTool);
      } else if (!styleSubwindow) {
        createOrShowStyleSubWindow(currentTool);
      }

      isDrawing = true;
      if (currentTool === "pencil") {
        drawings.push({
          type: "pencil",
          points: [docCoords],
          color: currentColor,
          lineWidth: currentLineWidth,
          lineDash: currentLineDash ? [...currentLineDash] : null,
        });
      }
    }

    if (isDrawing || isDraggingObject || isResizingObject || isSelectingArea) {
      document.addEventListener("mousemove", handleDocumentMouseMove);
      document.addEventListener("mouseup", handleDocumentMouseUp);
    }
    redrawCanvas();
    e.preventDefault();
  }

  function handleDrawingMouseMove(e) {
    if (!isActive) return;
    const docCoords = getDocumentRelativeCoords(e); // Current mouse in document coords
    const pageX = e.pageX,
      pageY = e.pageY; // Current mouse in page coords (for older delta logic if needed)
    const canvasCoords = getCanvasRelativeCoords(e); // For cursor updates

    if (isResizingObject && selectedDrawingIndex !== null && initialObjectPos) {
      const obj = drawings[selectedDrawingIndex];
      // Deltas from original mousedown position (startX, startY in doc coords)
      const deltaX = docCoords.x - startX;
      const deltaY = docCoords.y - startY;

      let newX = initialObjectPos.x,
        newY = initialObjectPos.y;
      let newWidth = initialObjectPos.width,
        newHeight = initialObjectPos.height;

      if (resizeHandleType.includes("e"))
        newWidth = initialObjectPos.width + deltaX;
      if (resizeHandleType.includes("s"))
        newHeight = initialObjectPos.height + deltaY;
      if (resizeHandleType.includes("w")) {
        newX = initialObjectPos.x + deltaX;
        newWidth = initialObjectPos.width - deltaX;
      }
      if (resizeHandleType.includes("n")) {
        newY = initialObjectPos.y + deltaY;
        newHeight = initialObjectPos.height - deltaY;
      }

      if (obj.type === "rect") {
        if (newWidth >= MIN_RECT_SIZE) {
          obj.x = newX;
          obj.width = newWidth;
        }
        if (newHeight >= MIN_RECT_SIZE) {
          obj.y = newY;
          obj.height = newHeight;
        }
        // Adjust x/y if origin moved due to w/n handle and size was valid
        if (resizeHandleType.includes("w") && newWidth >= MIN_RECT_SIZE)
          obj.x = newX;
        else if (resizeHandleType.includes("w")) {
          /* no change */
        }
        if (resizeHandleType.includes("n") && newHeight >= MIN_RECT_SIZE)
          obj.y = newY;
        else if (resizeHandleType.includes("n")) {
          /* no change */
        }
      } else if (obj.type === "text") {
        // For text, newWidth/newHeight are conceptual target bounds.
        // Scale font size based on the change in width.
        if (newWidth >= MIN_RECT_SIZE && initialObjectPos.width > 0.1) {
          // initialObjectPos.width is from getDrawingBounds
          const scaleFactor = newWidth / initialObjectPos.width;
          let newFontSizePx =
            (parseInt(initialObjectPos.fontSize) || 16) * scaleFactor;
          newFontSizePx = Math.max(
            MIN_TEXT_FONT_SIZE_PX,
            Math.min(newFontSizePx, MAX_TEXT_FONT_SIZE_PX)
          );
          obj.fontSize = `${Math.round(newFontSizePx)}px`;

          // Adjust anchor (obj.x, obj.y) if top/left handles are used
          // This attempts to keep the visual content relatively stable during resize from these corners/sides.
          if (resizeHandleType.includes("w")) {
            // obj.x = initialObjectPos.preciseX + deltaX; // original preciseX + delta
            obj.x = initialObjectPos.x + (docCoords.x - startX);
          }
          if (resizeHandleType.includes("n")) {
            // obj.y = initialObjectPos.preciseY + deltaY; // original preciseY + delta
            obj.y = initialObjectPos.y + (docCoords.y - startY);
          }
        }
      }
      requestAnimationFrame(redrawCanvas);
    } else if (
      isDraggingObject &&
      selectedDrawingIndex !== null &&
      initialObjectPos
    ) {
      const deltaX = pageX - dragStartX;
      const deltaY = pageY - dragStartY; // Use page coords for simple drag
      const obj = drawings[selectedDrawingIndex];
      if (obj.type === "pencil")
        obj.points = initialObjectPos.map((p) => ({
          x: p.x + deltaX,
          y: p.y + deltaY,
        }));
      else if (obj.type === "arrow") {
        obj.x1 = initialObjectPos.x1 + deltaX;
        obj.y1 = initialObjectPos.y1 + deltaY;
        obj.x2 = initialObjectPos.x2 + deltaX;
        obj.y2 = initialObjectPos.y2 + deltaY;
      } else {
        obj.x = initialObjectPos.x + deltaX;
        obj.y = initialObjectPos.y + deltaY;
      } // Rect, Text
      requestAnimationFrame(redrawCanvas);
    } else if (isDrawing) {
      if (currentTool === "pencil") {
        /* ... (no changes) ... */
      } else if (currentTool === "rect" || currentTool === "arrow") {
        /* ... (no changes to preview) ... */
      }
    } else if (
      currentTool === "select" &&
      isSelectingArea &&
      selectionAreaRect
    ) {
      selectionAreaRect.width = docCoords.x - selectionAreaRect.x;
      selectionAreaRect.height = docCoords.y - selectionAreaRect.y;
      requestAnimationFrame(redrawCanvas);
    } else if (
      currentTool === "select" &&
      !isDraggingObject &&
      !isResizingObject
    ) {
      // Cursor updates for select tool
      let newCursor = "default";
      if (selectedDrawingIndex !== null && drawings[selectedDrawingIndex]) {
        const selectedObj = drawings[selectedDrawingIndex];
        if (selectedObj.type === "rect" || selectedObj.type === "text") {
          const handle = getResizeHandleAtPoint(
            selectedObj,
            canvasCoords.x,
            canvasCoords.y
          );
          if (handle) newCursor = getCursorForResizeHandle(handle);
          else if (
            isPointHittingDrawing(canvasCoords.x, canvasCoords.y, selectedObj)
          )
            newCursor = "move";
        } else if (
          isPointHittingDrawing(canvasCoords.x, canvasCoords.y, selectedObj)
        ) {
          newCursor = "move";
        }
      } else {
        // No object selected, check for hover over any object
        if (findClickedDrawingIndex(canvasCoords.x, canvasCoords.y) !== null)
          newCursor = "move";
      }
      if (canvas.style.cursor !== newCursor) canvas.style.cursor = newCursor;
    }
  }

  function handleDrawingMouseUp(e) {
    if (e.button !== 0 || !isActive) return;
    const docCoords = getDocumentRelativeCoords(e);

    if (
      isResizingObject &&
      selectedDrawingIndex !== null &&
      drawings[selectedDrawingIndex]
    ) {
      const obj = drawings[selectedDrawingIndex];
      if (obj.type === "rect") {
        if (obj.width < 0) {
          obj.x += obj.width;
          obj.width = Math.abs(obj.width);
        }
        if (obj.height < 0) {
          obj.y += obj.height;
          obj.height = Math.abs(obj.height);
        }
      }
      saveDrawings();
    } else if (isDraggingObject) {
      saveDrawings();
    } else if (isDrawing) {
      if (currentTool === "pencil") {
        const currentPath = drawings[drawings.length - 1];
        if (
          currentPath &&
          currentPath.type === "pencil" &&
          currentPath.points.length < 2
        )
          drawings.pop();
      } else if (currentTool === "rect") {
        const rectX = Math.min(startX, docCoords.x),
          rectY = Math.min(startY, docCoords.y);
        const rectWidth = Math.abs(docCoords.x - startX),
          rectHeight = Math.abs(docCoords.y - startY);
        if (rectWidth > MIN_RECT_SIZE / 2 && rectHeight > MIN_RECT_SIZE / 2) {
          // Allow smaller initial draw
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
            lineDash: currentLineDash ? [...currentLineDash] : null,
          });
        }
      } else if (currentTool === "text") {
        if (
          Math.abs(docCoords.x - startX) < 5 &&
          Math.abs(docCoords.y - startY) < 5
        )
          createTextPrompt(startX, startY);
      }
      if (currentTool !== "text") saveDrawings();
    } else if (
      currentTool === "select" &&
      isSelectingArea &&
      selectionAreaRect
    ) {
      const finalSelectionRect = {
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
      selectedDrawingIndex = null; // Reset before checking
      if (finalSelectionRect.width > 5 && finalSelectionRect.height > 5) {
        for (let i = drawings.length - 1; i >= 0; i--) {
          if (
            doRectsIntersect(finalSelectionRect, getDrawingBounds(drawings[i]))
          ) {
            selectedDrawingIndex = i;
            break;
          }
        }
      }
      // Update subwindow visibility/content based on new selection state
      if (selectedDrawingIndex !== null && drawings[selectedDrawingIndex]) {
        createOrShowStyleSubWindow(drawings[selectedDrawingIndex].type);
      } else {
        hideAllStyleSubWindows();
      }
    }

    isDrawing = false;
    isDraggingObject = false;
    isResizingObject = false;
    resizeHandleType = null;
    isSelectingArea = false;
    selectionAreaRect = null;
    initialObjectPos = null;
    document.removeEventListener("mousemove", handleDocumentMouseMove);
    document.removeEventListener("mouseup", handleDocumentMouseUp);
    redrawCanvas();
    setCursorForTool(currentTool);
  }

  function createTextPrompt(docX, docY) {
    if (textInputDiv) removeTextInput(true);
    textInputDiv = document.createElement("div");
    textInputDiv.id = "webDrawTextInput";
    textInputDiv.contentEditable = true;
    textInputDiv.spellcheck = false;
    textInputDiv.style.fontFamily = currentFontFamily;
    textInputDiv.style.fontSize = currentFontSize;
    textInputDiv.style.color = currentColor;
    textInputDiv.style.textAlign = currentTextAlign;
    textInputDiv.style.position = "absolute";
    textInputDiv.style.left = `${docX}px`;
    textInputDiv.style.top = `${docY}px`;
    textInputDiv.style.zIndex = "10002";
    textInputDiv.style.padding = "5px 8px";
    textInputDiv.style.minWidth = "60px";
    textInputDiv.style.lineHeight = "1.4";
    textInputDiv.style.outline = "none";
    textInputDiv.style.boxShadow = "0 2px 5px rgba(0,0,0,0.1)";
    textInputDiv.style.backgroundColor = "rgba(240, 240, 240, 0.85)";
    textInputDiv.style.border = "none";
    textInputDiv.style.overflowWrap = "break-word";

    let handleOutsideClick;
    const removeListenersAndInput = (cancel = false) => {
      if (handleOutsideClick)
        document.removeEventListener("mousedown", handleOutsideClick, true);
      removeTextInput(cancel); // Pass cancel flag
    };

    document.body.appendChild(textInputDiv);
    textInputDiv.focus();
    window.getSelection().selectAllChildren(textInputDiv);

    textInputDiv.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        removeListenersAndInput(false);
      } else if (e.key === "Escape") {
        removeListenersAndInput(true);
      }
    });

    handleOutsideClick = (event) => {
      if (
        textInputDiv &&
        !textInputDiv.contains(event.target) &&
        !toolbox?.contains(event.target) &&
        (!styleSubwindow || !styleSubwindow.contains(event.target)) && // Check if styleSubwindow exists
        (!confirmationDiv || !confirmationDiv.contains(event.target))
      ) {
        // Check if confirmationDiv exists
        removeListenersAndInput(false);
      }
    };
    setTimeout(
      () => document.addEventListener("mousedown", handleOutsideClick, true),
      50
    );
  }

  function saveOrRemoveTextOnExit(cancel = false) {
    if (!textInputDiv) return;
    if (cancel) {
      console.log("Text input cancelled.");
      return;
    }
    const currentRect = textInputDiv.getBoundingClientRect();
    const finalDocX = currentRect.left + window.scrollX;
    const finalDocY = currentRect.top + window.scrollY;
    const currentText = textInputDiv.innerText;

    if (currentText.trim()) {
      saveText(finalDocX, finalDocY, currentText);
    } else {
      console.log("Empty text input - not saved.");
    }
  }

  function saveText(docX, docY, text) {
    const trimmedText = text.trim();
    if (trimmedText) {
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
    }
  }

  function removeTextInput(cancel = false) {
    if (textInputDiv) {
      saveOrRemoveTextOnExit(cancel);
      textInputDiv.remove();
      textInputDiv = null;
      if (!cancel) {
        // If text was potentially saved (not explicitly cancelled by Esc or tool switch)
        switchTool("select");
      }
    }
  }

  function doRectsIntersect(rectA, rectB) {
    if (!rectA || !rectB) return false;
    return (
      rectA.x < rectB.x + rectB.width &&
      rectA.x + rectA.width > rectB.x &&
      rectA.y < rectB.y + rectB.height &&
      rectA.y + rectA.height > rectB.y
    );
  }

  function getDrawingBounds(drawing, precise = false) {
    if (!drawing) return null;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    let xPrecise = 0,
      yPrecise = 0,
      widthPrecise = 0,
      heightPrecise = 0; // For precise calculations

    switch (drawing.type) {
      case "pencil":
        if (!drawing.points || drawing.points.length === 0) return null;
        drawing.points.forEach((p) => {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        });
        xPrecise = minX;
        yPrecise = minY;
        widthPrecise = maxX - minX;
        heightPrecise = maxY - minY;
        break;
      case "rect":
        minX = drawing.x;
        minY = drawing.y;
        maxX = drawing.x + drawing.width;
        maxY = drawing.y + drawing.height;
        xPrecise = drawing.x;
        yPrecise = drawing.y;
        widthPrecise = drawing.width;
        heightPrecise = drawing.height;
        break;
      case "arrow":
        minX = Math.min(drawing.x1, drawing.x2);
        minY = Math.min(drawing.y1, drawing.y2);
        maxX = Math.max(drawing.x1, drawing.x2);
        maxY = Math.max(drawing.y1, drawing.y2);
        xPrecise = minX;
        yPrecise = minY;
        widthPrecise = maxX - minX;
        heightPrecise = maxY - minY;
        break;
      case "text":
        const lines = drawing.text.split("\n");
        const fontSizePx = parseInt(drawing.fontSize || FONT_SIZE_MAP.M) || 16;
        const lineHeight = fontSizePx * 1.4;
        const tempCtx = document.createElement("canvas").getContext("2d");
        tempCtx.font = `${drawing.fontSize || FONT_SIZE_MAP.M} ${
          drawing.fontFamily || FONT_FAMILY_MAP.Virgil
        }`;

        let maxLineWidth = 0;
        lines.forEach((line) => {
          maxLineWidth = Math.max(
            maxLineWidth,
            tempCtx.measureText(line).width
          );
        });

        yPrecise = drawing.y; // Text y is the top-left of the first line's baseline "area"
        heightPrecise = lines.length * lineHeight;

        if (drawing.textAlign === "center") {
          xPrecise = drawing.x - maxLineWidth / 2;
        } else if (drawing.textAlign === "right") {
          xPrecise = drawing.x - maxLineWidth;
        } else {
          // left
          xPrecise = drawing.x;
        }
        widthPrecise = maxLineWidth;

        minX = xPrecise;
        minY = yPrecise;
        maxX = xPrecise + widthPrecise;
        maxY = yPrecise + heightPrecise;
        break;
      default:
        return null;
    }

    const paddingValue = precise
      ? RESIZE_HANDLE_SIZE / 2 // For handle interaction on precise box
      : (drawing.lineWidth || (drawing.type === "text" ? 0 : 1)) / 2 +
        5 + // General hit padding
        (drawing.type === "rect" || drawing.type === "text"
          ? RESIZE_HANDLE_SIZE
          : 0); // Extra for handles

    return {
      x: minX - paddingValue,
      y: minY - paddingValue,
      width: widthPrecise + 2 * paddingValue,
      height: heightPrecise + 2 * paddingValue,
      xPrecise,
      yPrecise,
      widthPrecise,
      heightPrecise,
    };
  }

  function isPointHittingDrawing(canvasX, canvasY, drawing) {
    const bounds = getDrawingBounds(drawing); // General padded bounds
    if (!bounds || !canvas) return false;

    const canvasRect = canvas.getBoundingClientRect();
    const docX = canvasX + canvasRect.left + window.scrollX;
    const docY = canvasY + canvasRect.top + window.scrollY;

    // For resizable types, first check against their precise visual box
    if (drawing.type === "rect" || drawing.type === "text") {
      const preciseBounds = getDrawingBounds(drawing, true); // true for precise calculation
      if (
        docX >= preciseBounds.xPrecise &&
        docX <= preciseBounds.xPrecise + preciseBounds.widthPrecise &&
        docY >= preciseBounds.yPrecise &&
        docY <= preciseBounds.yPrecise + preciseBounds.heightPrecise
      ) {
        return true; // Hit the main body
      }
      // If not hitting body, a click might still be on a handle, which is covered by general `bounds`
    }
    // General check for other types or for hitting handles of resizable types
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

  function drawArrowhead(ctx, fromX, fromY, toX, toY, headLength) {
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

  function getCanvasCoords(docX, docY) {
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: docX - window.scrollX - rect.left,
      y: docY - window.scrollY - rect.top,
    };
  }

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
            ctx.strokeRect(startCoords.x, startCoords.y, d.width, d.height);
            if (index === selectedDrawingIndex) {
              // Draw resize handles
              const hs = RESIZE_HANDLE_SIZE / 2; // half size for centered drawing
              const handlesDef = [
                { x: 0, y: 0 },
                { x: d.width / 2, y: 0 },
                { x: d.width, y: 0 },
                { x: 0, y: d.height / 2 },
                { x: d.width, y: d.height / 2 },
                { x: 0, y: d.height },
                { x: d.width / 2, y: d.height },
                { x: d.width, y: d.height },
              ];
              ctx.fillStyle = "rgba(0, 100, 255, 0.7)";
              handlesDef.forEach((h) =>
                ctx.fillRect(
                  startCoords.x + h.x - hs,
                  startCoords.y + h.y - hs,
                  RESIZE_HANDLE_SIZE,
                  RESIZE_HANDLE_SIZE
                )
              );
            }
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
          ctx.font = font;
          const textAlign = d.textAlign || "left";
          ctx.textAlign = textAlign;
          const fontSizePx = parseInt(d.fontSize || FONT_SIZE_MAP.M) || 16;
          const lineHeight = fontSizePx * 1.4;
          const yOffset = fontSizePx * 0.8; // baseline adjustment
          lines.forEach((line, lineIndex) =>
            ctx.fillText(
              line,
              startCoords.x,
              startCoords.y + lineIndex * lineHeight + yOffset
            )
          );

          if (index === selectedDrawingIndex) {
            // Draw resize handles for selected text
            const bounds = getDrawingBounds(d, true); // Get precise bounds
            if (bounds) {
              const hs = RESIZE_HANDLE_SIZE / 2;
              const bTopLeftCanvas = getCanvasCoords(
                bounds.xPrecise,
                bounds.yPrecise
              ); // Use precise for handle base
              const handlesDef = [
                { x: 0, y: 0 },
                { x: bounds.widthPrecise / 2, y: 0 },
                { x: bounds.widthPrecise, y: 0 },
                { x: 0, y: bounds.heightPrecise / 2 },
                { x: bounds.widthPrecise, y: bounds.heightPrecise / 2 },
                { x: 0, y: bounds.heightPrecise },
                { x: bounds.widthPrecise / 2, y: bounds.heightPrecise },
                { x: bounds.widthPrecise, y: bounds.heightPrecise },
              ];
              ctx.fillStyle = "rgba(0, 100, 255, 0.7)";
              handlesDef.forEach((h) =>
                ctx.fillRect(
                  bTopLeftCanvas.x + h.x - hs,
                  bTopLeftCanvas.y + h.y - hs,
                  RESIZE_HANDLE_SIZE,
                  RESIZE_HANDLE_SIZE
                )
              );
            }
          }
        }
        // General selection highlight for non-resizable items (pencil, arrow)
        if (
          index === selectedDrawingIndex &&
          d.type !== "rect" &&
          d.type !== "text"
        ) {
          const bounds = getDrawingBounds(d);
          if (bounds) {
            const selectionTopLeftCanvas = getCanvasCoords(bounds.x, bounds.y);
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
            ctx.setLineDash(currentDash);
          }
        }
      } catch (drawError) {
        console.error(`WebDraw: Error drawing element ${index}:`, drawError, d);
      } finally {
        ctx.restore();
      }
    });

    if (currentTool === "select" && isSelectingArea && selectionAreaRect) {
      ctx.save();
      const selAreaStartCanvas = getCanvasCoords(
        selectionAreaRect.x,
        selectionAreaRect.y
      );
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

  function getStorageKey() {
    try {
      const p = window.location.pathname
        .replace(/[^a-zA-Z0-9/-]/g, "_")
        .substring(0, 100);
      return PAGE_STORAGE_KEY_PREFIX + window.location.origin + p;
    } catch (e) {
      return PAGE_STORAGE_KEY_PREFIX + "fallback";
    }
  }
  function saveDrawings() {
    if (!drawings) return;
    try {
      const k = getStorageKey(),
        d = JSON.stringify(drawings);
      chrome.storage.local.set({ [k]: d }, () => {
        if (chrome.runtime.lastError) console.error(chrome.runtime.lastError);
      });
    } catch (e) {
      console.error(e);
    }
  }
  function loadDrawings() {
    const k = getStorageKey();
    chrome.storage.local.get([k], (r) => {
      if (r[k])
        try {
          const d = JSON.parse(r[k]);
          drawings = Array.isArray(d) ? d.filter((i) => i && i.type) : [];
        } catch (e) {
          drawings = [];
        }
      else drawings = [];
      redrawCanvas();
    });
  }

  async function handleShare() {
    let originalToolboxDisplay = toolbox ? toolbox.style.display : "";
    let originalSubwindowDisplay = styleSubwindow
      ? styleSubwindow.style.display
      : "";

    if (toolbox) toolbox.style.display = "none";
    if (styleSubwindow) styleSubwindow.style.display = "none";
    // Confirmation div is typically removed, not just hidden, but handle if it was.
    if (confirmationDiv) confirmationDiv.style.display = "none";

    await new Promise((resolve) => setTimeout(resolve, 100)); // Short delay for UI to update

    const viewportData = {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    };
    const dataToSend = { drawings: drawings, viewport: viewportData };
    showNotification("Creating share link...", false);

    chrome.runtime
      .sendMessage({ action: "createShareImage", data: dataToSend })
      .then((response) => {
        if (response && response.imageUrl) {
          copyLinkToClipboardAndNotify(response.imageUrl);
          showNotification(
            response.note
              ? `Link copied! (${response.note})`
              : "Share link copied!"
          );
        } else if (response && response.error) {
          showNotification(`Error: ${response.error}`, true);
        } else {
          showNotification("Error: Could not create share link.", true);
        }
      })
      .catch((error) => {
        showNotification(
          `Error: ${error.message || "Failed to send share request."}`,
          true
        );
      })
      .finally(() => {
        if (toolbox) toolbox.style.display = originalToolboxDisplay || "flex";
        if (styleSubwindow)
          styleSubwindow.style.display = originalSubwindowDisplay || "flex";
        if (confirmationDiv && confirmationDiv.dataset.originalDisplay) {
          // If we stored original display
          confirmationDiv.style.display =
            confirmationDiv.dataset.originalDisplay;
        } else if (confirmationDiv) {
          // Fallback if it was just hidden
          // It's usually removed entirely, so this might not be needed
        }
      });
  }

  function copyLinkToClipboardAndNotify(link) {
    navigator.clipboard
      .writeText(link)
      .then(() => {
        // Notification is now handled in handleShare's promise resolution
      })
      .catch((err) => {
        showNotification("Failed to copy link.", true);
        prompt("Please copy this link manually:", link);
      });
  }
  function showNotification(message, isError = false) {
    let nDiv = document.getElementById("webDrawNotification");
    if (!nDiv) {
      nDiv = document.createElement("div");
      nDiv.id = "webDrawNotification";
      document.body.appendChild(nDiv);
    }
    nDiv.textContent = message;
    nDiv.className = ""; // Clear previous classes
    if (isError) nDiv.classList.add("error");
    void nDiv.offsetWidth;
    nDiv.classList.add("visible");
    if (notificationTimeout) clearTimeout(notificationTimeout);
    notificationTimeout = setTimeout(
      () => nDiv.classList.remove("visible"),
      3000
    );
  }

  function handleDelete() {
    if (selectedDrawingIndex !== null) deleteSelectedDrawingWithConfirmation();
    else clearAllDrawingsWithConfirmation();
  }
  function showComplexConfirmation(message, buttonsConfig, callback) {
    removeConfirmation();
    confirmationDiv = document.createElement("div");
    confirmationDiv.id = "webDrawConfirmation";
    confirmationDiv.innerHTML = `<p>${message}</p><div class="webdraw-confirm-buttons"></div>`;
    const bc = confirmationDiv.querySelector(".webdraw-confirm-buttons");
    buttonsConfig.forEach((cfg) => {
      const b = document.createElement("button");
      b.textContent = cfg.text;
      if (cfg.styleClass) b.classList.add(cfg.styleClass);
      b.onclick = () => {
        removeConfirmation();
        if (callback) callback(cfg.action);
      };
      bc.appendChild(b);
    });
    document.body.appendChild(confirmationDiv);
    const fb = bc.querySelector("button");
    if (fb) fb.focus();
  }
  function removeConfirmation() {
    if (confirmationDiv) {
      confirmationDiv.remove();
      confirmationDiv = null;
    }
  }
  function deleteSelectedDrawingWithConfirmation() {
    if (selectedDrawingIndex === null) return;
    const btns = [
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
      btns,
      (action) => {
        if (action === "delete_selected") {
          if (selectedDrawingIndex !== null && drawings[selectedDrawingIndex]) {
            drawings.splice(selectedDrawingIndex, 1);
            selectedDrawingIndex = null;
            isDraggingObject = false;
            isResizingObject = false;
            saveDrawings();
            redrawCanvas();
            showNotification("Selected drawing deleted.");
          }
        } else if (action === "clear_all") {
          drawings = [];
          selectedDrawingIndex = null;
          isDrawing = false;
          isDraggingObject = false;
          isResizingObject = false;
          saveDrawings();
          redrawCanvas();
          showNotification("All drawings cleared.");
        }
      }
    );
  }
  function clearAllDrawingsWithConfirmation() {
    if (drawings.length === 0) {
      showNotification("Nothing to clear.");
      return;
    }
    const btns = [
      {
        text: "Clear All",
        action: "confirm_clear_all",
        styleClass: "confirm-action-danger",
      },
      { text: "Cancel", action: "cancel", styleClass: "confirm-action-cancel" },
    ];
    showComplexConfirmation(
      "Are you sure you want to clear ALL drawings on this page?",
      btns,
      (action) => {
        if (action === "confirm_clear_all") {
          drawings = [];
          selectedDrawingIndex = null;
          isDrawing = false;
          isDraggingObject = false;
          isResizingObject = false;
          saveDrawings();
          redrawCanvas();
          showNotification("All drawings cleared.");
        }
      }
    );
  }

  function deactivateDrawing() {
    removeConfirmation();
    if (textInputDiv) removeTextInput(true); // true to cancel/not save
    hideAllStyleSubWindows();
    removeEventListeners();
    if (canvas) canvas.remove();
    canvas = null;
    if (toolbox) toolbox.remove();
    toolbox = null;
    const nDiv = document.getElementById("webDrawNotification");
    if (nDiv) nDiv.remove();
    if (notificationTimeout) clearTimeout(notificationTimeout);
    notificationTimeout = null;
    ctx = null;
    styleSubwindow = null;
    confirmationDiv = null;
    drawings = [];
    selectedDrawingIndex = null;
    isActive = false;
    isDrawing = false;
    isDraggingObject = false;
    isDraggingToolbox = false;
    isDraggingSubwindow = false;
    isResizingObject = false;
    resizeHandleType = null;
    isSelectingArea = false;
    selectionAreaRect = null;
    document.body.style.cursor = "default";
    chrome.runtime
      .sendMessage({ action: "drawingDeactivated" })
      .catch((e) => console.warn("WebDraw: Deactivation message error:", e));
    console.log("WebDraw: Deactivated.");
    window.webDrawInitialized = false;
    return false;
  }

  window.webDrawToggle = async () => {
    if (isActive) return deactivateDrawing();
    else {
      window.webDrawInitialized = true;
      return initializeDrawing();
    }
  };
} else {
  console.log(
    "WebDraw: Already initialized flag set (script ran once). Toggle via background."
  );
}
