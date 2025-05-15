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
  let selectedDrawingIndex = null; // For single primary selection
  let multiSelectedIndices = []; // For area multi-selection

  const PAGE_STORAGE_KEY_PREFIX = "webDraw_";

  // Nerd Font Icons (Unicode characters) - User provided
  const svgs = {
    select: "\uf25a",
    pencil: "\udb83\uddeb",
    rectangle: "\uf096",
    arrow: "\udb80\udc5c",
    text: "\uF031",
    share: "\uf50f",
    clear: "\uF1F8",
    exit: "\uF08B",
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
    if (document.getElementById("webDrawConfirmationOverlay")) return;

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
    if (document.getElementById("webDrawConfirmationOverlay")) return;

    let wasActionHandledByDrawing = false;
    if (
      isDrawing ||
      isDraggingObject ||
      isResizingObject ||
      (currentTool === "select" && isSelectingArea)
    ) {
      handleDrawingMouseUp(e); // This will clear its own document listeners
      wasActionHandledByDrawing = true;
    }

    // Handle toolbox or subwindow dragging separately if no drawing action occurred
    if (isDraggingToolbox) {
      isDraggingToolbox = false;
      const titleElement = toolbox.querySelector(".webdraw-title");
      if (titleElement) titleElement.style.cursor = "grab";
      if (!wasActionHandledByDrawing) {
        // Only remove if not already handled
        document.removeEventListener("mousemove", handleDocumentMouseMove);
        document.removeEventListener("mouseup", handleDocumentMouseUp);
      }
    } else if (isDraggingSubwindow) {
      isDraggingSubwindow = false;
      const dragHandle = styleSubwindow?.querySelector(
        ".webdraw-subwindow-drag-handle"
      );
      if (dragHandle) dragHandle.style.cursor = "grab";
      if (!wasActionHandledByDrawing) {
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
    console.log("createOrShowStyleSubWindow for:", toolOrObjectType);
    hideAllStyleSubWindows();
    styleSubwindow = document.createElement("div");
    styleSubwindow.id = "webDrawStyleSubwindow";
    styleSubwindow.dataset.toolFor = toolOrObjectType; // Store what tool/type this window is for
    let contentHTML = `<div class="webdraw-subwindow-drag-handle" title="Drag to move">Style Options</div>`;

    const primarySelectedObj =
      selectedDrawingIndex !== null ? drawings[selectedDrawingIndex] : null;

    const effColor = primarySelectedObj?.color || currentColor;
    const effLineWidth = primarySelectedObj?.lineWidth || currentLineWidth;
    const effLineDash = primarySelectedObj?.lineDash || currentLineDash;
    const effFontFamily = primarySelectedObj?.fontFamily || currentFontFamily;
    const effFontSize = primarySelectedObj?.fontSize || currentFontSize;
    const effTextAlign = primarySelectedObj?.textAlign || currentTextAlign;

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
          (style.dash === null && (!effLineDash || effLineDash.length === 0)) || // Correctly check for null or empty array for solid
          (style.dash && effLineDash && effLineDash.length > 0);
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
        contentHTML += `<button class="webdraw-font-button ${
          fontFamilyValue === effFontFamily ? "active" : ""
        }" data-fontkey="${fontKey}" title="${fontKey}" style="font-family: ${fontFamilyValue};">${fontKey}</button>`;
      });
      contentHTML += `</div>`;
      contentHTML += `<div class="webdraw-style-section"><span class="webdraw-style-label">Size:</span>`;
      Object.keys(FONT_SIZE_MAP).forEach((sizeKey) => {
        const pxValue = FONT_SIZE_MAP[sizeKey];
        const isActive = pxValue === effFontSize;
        contentHTML += `<button class="webdraw-width-button ${
          isActive ? "active" : ""
        }" data-fontsize="${pxValue}" title="${pxValue}">${sizeKey}</button>`;
      });
      contentHTML += `</div>`;

      contentHTML += `<div class="webdraw-style-section"><span class="webdraw-style-label">Align:</span>`;
      const aligns = [
        {
          name: "Left",
          value: "left",
          icon: svgs.text.includes("mdi")
            ? "\uF036"
            : "\uF0E7" /* Placeholder, mdi-format-align-left */,
        },
        {
          name: "Center",
          value: "center",
          icon: svgs.text.includes("mdi")
            ? "\uF037"
            : "\uF0E8" /* Placeholder, mdi-format-align-center */,
        },
        {
          name: "Right",
          value: "right",
          icon: svgs.text.includes("mdi")
            ? "\uF038"
            : "\uF0E9" /* Placeholder, mdi-format-align-right */,
        },
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
      console.log("No relevant styles for type:", toolOrObjectType);
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
    if (isDraggingSubwindow) return;
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
    if (!baseDashArray || baseDashArray.length === 0) return null; // Solid line
    const scaleFactor = Math.max(1, lineWidth / 4);
    return [baseDashArray[0] * scaleFactor, baseDashArray[1] * scaleFactor];
  }

  function handleStyleSubwindowClick(e) {
    const target = e.target.closest("button");
    if (!target) return;
    const parentSection = target.closest(".webdraw-style-section");
    if (!parentSection) return;

    let styleChanged = false;
    const primarySelectedObj =
      selectedDrawingIndex !== null ? drawings[selectedDrawingIndex] : null;

    // Helper function to apply style to one or more selected objects
    const applyStyleToSelected = (
      prop,
      value,
      isLineDash = false,
      baseDashIfDotted = null
    ) => {
      const targets =
        multiSelectedIndices.length > 0
          ? multiSelectedIndices.map((i) => drawings[i])
          : primarySelectedObj
          ? [primarySelectedObj]
          : [];

      if (targets.length > 0) {
        targets.forEach((obj) => {
          if (obj && typeof obj[prop] !== "undefined") {
            if (isLineDash) {
              obj[prop] = baseDashIfDotted
                ? getScaledDashArray(
                    baseDashIfDotted,
                    obj.lineWidth || currentLineWidth
                  )
                : null;
            } else if (prop === "lineWidth" && obj.lineDash) {
              // If changing width and object has a dash style
              obj[prop] = value;
              obj.lineDash = getScaledDashArray(BASE_DOTTED_PATTERN, value); // Re-scale existing dash
            } else {
              obj[prop] = value;
            }
          }
        });
      } else {
        // Apply to global current styles if nothing is selected
        if (isLineDash) {
          currentLineDash = baseDashIfDotted
            ? getScaledDashArray(baseDashIfDotted, currentLineWidth)
            : null;
        } else if (prop === "lineWidth" && currentLineDash) {
          currentLineWidth = value;
          currentLineDash = getScaledDashArray(BASE_DOTTED_PATTERN, value);
        } else {
          window[`current${prop.charAt(0).toUpperCase() + prop.slice(1)}`] =
            value;
        }
      }
      styleChanged = true;
    };

    if (target.dataset.color) {
      applyStyleToSelected("color", target.dataset.color);
    } else if (target.dataset.width) {
      applyStyleToSelected("lineWidth", parseInt(target.dataset.width, 10));
    } else if (target.dataset.linedash) {
      applyStyleToSelected(
        "lineDash",
        null,
        true,
        JSON.parse(target.dataset.linedash)
      );
    } else if (target.dataset.fontkey) {
      applyStyleToSelected(
        "fontFamily",
        FONT_FAMILY_MAP[target.dataset.fontkey]
      );
    } else if (target.dataset.fontsize) {
      applyStyleToSelected("fontSize", target.dataset.fontsize);
    } else if (target.dataset.align) {
      applyStyleToSelected("textAlign", target.dataset.align);
    }

    if (styleChanged) {
      parentSection
        .querySelectorAll("button")
        .forEach((btn) => btn.classList.remove("active"));
      target.classList.add("active");

      if (target.dataset.linedash) {
        const currentActiveDash = primarySelectedObj
          ? primarySelectedObj.lineDash
          : currentLineDash;
        parentSection
          .querySelectorAll("button[data-linedash]")
          .forEach((btn) => {
            const btnDashVal = JSON.parse(btn.dataset.linedash);
            const btnIsDottedIntent = btnDashVal !== null;
            const currentIsDotted =
              currentActiveDash !== null && currentActiveDash.length > 0;
            btn.classList.toggle(
              "active",
              btnIsDottedIntent === currentIsDotted
            );
          });
      }

      if (primarySelectedObj || multiSelectedIndices.length > 0) {
        saveDrawings();
        redrawCanvas();
      }
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

    if (currentTool === tool) {
      if (
        tool === "select" &&
        selectedDrawingIndex !== null &&
        drawings[selectedDrawingIndex]
      ) {
        if (styleSubwindow) hideAllStyleSubWindows();
        else createOrShowStyleSubWindow(drawings[selectedDrawingIndex].type);
      } else if (["pencil", "rect", "arrow", "text"].includes(tool)) {
        if (styleSubwindow) hideAllStyleSubWindows();
        else createOrShowStyleSubWindow(tool);
      }
      return;
    }

    const currentActiveButtonInToolbox = toolbox.querySelector(
      ".webdraw-button.active"
    );
    if (currentActiveButtonInToolbox)
      currentActiveButtonInToolbox.classList.remove("active");
    currentTool = tool;
    targetButton.classList.add("active");

    selectedDrawingIndex = null;
    multiSelectedIndices = [];
    isDraggingObject = false;
    isResizingObject = false;
    resizeHandleType = null;
    if (isSelectingArea) {
      isSelectingArea = false;
      selectionAreaRect = null;
    }
    if (textInputDiv) removeTextInput(true);

    setCursorForTool(currentTool);

    if (tool === "select") {
      hideAllStyleSubWindows();
    } else if (["pencil", "rect", "arrow", "text"].includes(tool)) {
      createOrShowStyleSubWindow(tool);
    } else {
      hideAllStyleSubWindows();
    }
    redrawCanvas();
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
        break;
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
    if (document.getElementById("webDrawConfirmationOverlay")) {
      if (e.key === "Enter" || e.key === "Escape") {
        const confirmDialog = document.getElementById("webDrawConfirmation");
        if (confirmDialog) {
          let buttonToClick;
          if (e.key === "Enter") {
            buttonToClick =
              confirmDialog.querySelector(
                ".confirm-action-danger, .confirm-action-normal"
              ) || confirmDialog.querySelector("button");
          } else {
            buttonToClick =
              confirmDialog.querySelector(".confirm-action-cancel") ||
              confirmDialog.querySelectorAll("button")[
                confirmDialog.querySelectorAll("button").length - 1
              ];
          }
          if (buttonToClick) buttonToClick.click();
        }
      }
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (e.key === "Escape") {
      if (confirmationDiv) removeConfirmation();
      else if (styleSubwindow) hideAllStyleSubWindows();
      else if (textInputDiv) removeTextInput(true);
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
        if (currentTool === "pencil" && drawings.length > 0) {
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
      if (
        isActive &&
        (selectedDrawingIndex !== null || multiSelectedIndices.length > 0)
      ) {
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
    if (button) button.click();
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
    const objBounds = getDrawingBounds(drawing, true);
    if (!objBounds) return null;
    const hs = RESIZE_HANDLE_SIZE;
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
      actualX = objBounds.xPrecise;
      actualY = objBounds.yPrecise;
      actualWidth = objBounds.widthPrecise;
      actualHeight = objBounds.heightPrecise;
    }
    const handles = {
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
    if (document.getElementById("webDrawConfirmationOverlay")) return;
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
    startY = docCoords.y;
    dragStartX = e.pageX;
    dragStartY = e.pageY;

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
            multiSelectedIndices = [selectedDrawingIndex];
            const preciseBounds = getDrawingBounds(selectedObj, true);
            initialObjectPos = {
              x: selectedObj.x,
              y: selectedObj.y,
              width:
                selectedObj.type === "rect"
                  ? selectedObj.width
                  : preciseBounds.widthPrecise,
              height:
                selectedObj.type === "rect"
                  ? selectedObj.height
                  : preciseBounds.heightPrecise,
              fontSize: selectedObj.fontSize,
              preciseX: preciseBounds.xPrecise,
              preciseY: preciseBounds.yPrecise,
            };
          }
        }
      }

      if (!clickedOnSelectedObjectHandle) {
        const clickedIndex = findClickedDrawingIndex(
          canvasCoords.x,
          canvasCoords.y
        );
        if (clickedIndex !== null) {
          selectedDrawingIndex = clickedIndex;
          multiSelectedIndices = [clickedIndex]; // Single click selects one, clears multi
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
            const pb = getDrawingBounds(obj, true);
            initialObjectPos = {
              x: obj.x,
              y: obj.y,
              width: obj.type === "rect" ? obj.width : pb.widthPrecise,
              height: obj.type === "rect" ? obj.height : pb.heightPrecise,
              fontSize: obj.fontSize,
              preciseX: pb.xPrecise,
              preciseY: pb.yPrecise,
            };
          }
        } else {
          selectedDrawingIndex = null;
          multiSelectedIndices = [];
          isSelectingArea = true;
          selectionAreaRect = { x: startX, y: startY, width: 0, height: 0 };
        }
      }
      if (selectedDrawingIndex !== null && drawings[selectedDrawingIndex]) {
        createOrShowStyleSubWindow(drawings[selectedDrawingIndex].type);
      } else {
        hideAllStyleSubWindows();
      }
    } else if (["pencil", "rect", "arrow", "text"].includes(currentTool)) {
      selectedDrawingIndex = null;
      multiSelectedIndices = [];
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
    if (!isActive || document.getElementById("webDrawConfirmationOverlay"))
      return;
    const docCoords = getDocumentRelativeCoords(e);
    const pageX = e.pageX,
      pageY = e.pageY;
    const canvasCoords = getCanvasRelativeCoords(e);

    if (isResizingObject && selectedDrawingIndex !== null && initialObjectPos) {
      const obj = drawings[selectedDrawingIndex];
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
        if (resizeHandleType.includes("w") && newWidth >= MIN_RECT_SIZE)
          obj.x = newX;
        if (resizeHandleType.includes("n") && newHeight >= MIN_RECT_SIZE)
          obj.y = newY;
      } else if (obj.type === "text") {
        if (newWidth >= MIN_RECT_SIZE && initialObjectPos.width > 0.1) {
          const scaleFactor = newWidth / initialObjectPos.width;
          let newFontSizePx =
            (parseInt(initialObjectPos.fontSize) || 16) * scaleFactor;
          newFontSizePx = Math.max(
            MIN_TEXT_FONT_SIZE_PX,
            Math.min(newFontSizePx, MAX_TEXT_FONT_SIZE_PX)
          );
          obj.fontSize = `${Math.round(newFontSizePx)}px`;
          if (resizeHandleType.includes("w"))
            obj.x = initialObjectPos.x + (docCoords.x - startX);
          if (resizeHandleType.includes("n"))
            obj.y = initialObjectPos.y + (docCoords.y - startY);
        }
      }
      requestAnimationFrame(redrawCanvas);
    } else if (
      isDraggingObject &&
      selectedDrawingIndex !== null &&
      initialObjectPos
    ) {
      const deltaX = pageX - dragStartX;
      const deltaY = pageY - dragStartY;
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
      }
      requestAnimationFrame(redrawCanvas);
    } else if (isDrawing) {
      if (currentTool === "pencil") {
        const currentPath = drawings[drawings.length - 1];
        if (currentPath?.type === "pencil") {
          currentPath.points.push(docCoords);
          requestAnimationFrame(redrawCanvas);
        }
      } else if (currentTool === "rect" || currentTool === "arrow") {
        requestAnimationFrame(() => {
          redrawCanvas();
          ctx.save();
          ctx.strokeStyle = currentColor;
          ctx.lineWidth = currentLineWidth;
          ctx.setLineDash(currentLineDash || []);
          const startCP = getCanvasCoords(startX, startY);
          const currentCP = getCanvasCoords(docCoords.x, docCoords.y);
          if (currentTool === "rect") {
            ctx.strokeRect(
              startCP.x,
              startCP.y,
              currentCP.x - startCP.x,
              currentCP.y - startCP.y
            );
          } else if (currentTool === "arrow") {
            ctx.beginPath();
            ctx.moveTo(startCP.x, startCP.y);
            ctx.lineTo(currentCP.x, currentCP.y);
            ctx.stroke();
            drawArrowhead(
              ctx,
              startCP.x,
              startCP.y,
              currentCP.x,
              currentCP.y,
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
      selectionAreaRect.width = docCoords.x - selectionAreaRect.x;
      selectionAreaRect.height = docCoords.y - selectionAreaRect.y;
      requestAnimationFrame(redrawCanvas);
    } else if (
      currentTool === "select" &&
      !isDraggingObject &&
      !isResizingObject
    ) {
      let newCursor = "default";
      const primarySelectedObj =
        selectedDrawingIndex !== null ? drawings[selectedDrawingIndex] : null;
      if (
        primarySelectedObj &&
        (primarySelectedObj.type === "rect" ||
          primarySelectedObj.type === "text")
      ) {
        const handle = getResizeHandleAtPoint(
          primarySelectedObj,
          canvasCoords.x,
          canvasCoords.y
        );
        if (handle) newCursor = getCursorForResizeHandle(handle);
        else if (
          isPointHittingDrawing(
            canvasCoords.x,
            canvasCoords.y,
            primarySelectedObj
          )
        )
          newCursor = "move";
      } else if (
        primarySelectedObj &&
        isPointHittingDrawing(
          canvasCoords.x,
          canvasCoords.y,
          primarySelectedObj
        )
      ) {
        newCursor = "move";
      } else {
        // No primary selection, check general hover
        const hoveredIdx = findClickedDrawingIndex(
          canvasCoords.x,
          canvasCoords.y
        );
        if (hoveredIdx !== null) newCursor = "move";
      }
      if (canvas.style.cursor !== newCursor) canvas.style.cursor = newCursor;
    }
  }

  function handleDrawingMouseUp(e) {
    if (
      e.button !== 0 ||
      !isActive ||
      document.getElementById("webDrawConfirmationOverlay")
    )
      return;
    const docCoords = getDocumentRelativeCoords(e);
    let switchToSelect = false;

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
        switchToSelect = true;
      } else if (currentTool === "rect") {
        const rectX = Math.min(startX, docCoords.x),
          rectY = Math.min(startY, docCoords.y);
        const rectWidth = Math.abs(docCoords.x - startX),
          rectHeight = Math.abs(docCoords.y - startY);
        if (rectWidth > 2 && rectHeight > 2) {
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
        switchToSelect = true;
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
        switchToSelect = true;
      } else if (currentTool === "text") {
        if (
          Math.abs(docCoords.x - startX) < 5 &&
          Math.abs(docCoords.y - startY) < 5
        )
          createTextPrompt(startX, startY);
        // Text mode switches to select after text input is finished (in removeTextInput)
      }
      if (
        currentTool !== "text" &&
        drawings.length > 0 &&
        drawings[drawings.length - 1].type === currentTool
      ) {
        // check if new drawing was added
        saveDrawings();
      }
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
      selectedDrawingIndex = null;
      multiSelectedIndices = [];
      if (finalSelectionRect.width > 5 && finalSelectionRect.height > 5) {
        drawings.forEach((drawing, index) => {
          if (doRectsIntersect(finalSelectionRect, getDrawingBounds(drawing))) {
            multiSelectedIndices.push(index);
          }
        });
        if (multiSelectedIndices.length > 0) {
          console.log("Multi-selected indices:", multiSelectedIndices);
        }
      }
      if (multiSelectedIndices.length === 0) hideAllStyleSubWindows();
      else if (multiSelectedIndices.length === 1) {
        // If only one selected by area, make it primary
        selectedDrawingIndex = multiSelectedIndices[0];
        createOrShowStyleSubWindow(drawings[selectedDrawingIndex].type);
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
    if (switchToSelect) {
      switchTool("select");
    } else {
      setCursorForTool(currentTool);
    }
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
      removeTextInput(cancel);
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
        (!styleSubwindow || !styleSubwindow.contains(event.target)) &&
        (!confirmationDiv || !confirmationDiv.contains(event.target))
      ) {
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
    if (currentText.trim()) saveText(finalDocX, finalDocY, currentText);
    else console.log("Empty text input - not saved.");
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
      if (!cancel) switchTool("select");
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
      heightPrecise = 0;

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
        yPrecise = drawing.y;
        heightPrecise = lines.length * lineHeight;
        if (drawing.textAlign === "center")
          xPrecise = drawing.x - maxLineWidth / 2;
        else if (drawing.textAlign === "right")
          xPrecise = drawing.x - maxLineWidth;
        else xPrecise = drawing.x;
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
      ? RESIZE_HANDLE_SIZE / 2
      : (drawing.lineWidth || (drawing.type === "text" ? 0 : 1)) / 2 +
        5 +
        (drawing.type === "rect" || drawing.type === "text"
          ? RESIZE_HANDLE_SIZE
          : 0);
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
    const bounds = getDrawingBounds(drawing);
    if (!bounds || !canvas) return false;
    const canvasRect = canvas.getBoundingClientRect();
    const docX = canvasX + canvasRect.left + window.scrollX;
    const docY = canvasY + canvasRect.top + window.scrollY;
    if (drawing.type === "rect" || drawing.type === "text") {
      const preciseBounds = getDrawingBounds(drawing, true);
      if (
        docX >= preciseBounds.xPrecise &&
        docX <= preciseBounds.xPrecise + preciseBounds.widthPrecise &&
        docY >= preciseBounds.yPrecise &&
        docY <= preciseBounds.yPrecise + preciseBounds.heightPrecise
      ) {
        return true;
      }
    }
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

      let isThisObjectSelected =
        selectedDrawingIndex === index || multiSelectedIndices.includes(index);

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
            if (isThisObjectSelected) {
              // Only primary selected for resize handles
              const hs = RESIZE_HANDLE_SIZE / 2;
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
          const yOffset = fontSizePx * 0.8;
          lines.forEach((line, lineIndex) =>
            ctx.fillText(
              line,
              startCoords.x,
              startCoords.y + lineIndex * lineHeight + yOffset
            )
          );
          if (isThisObjectSelected) {
            // Only primary selected for resize handles
            const bounds = getDrawingBounds(d, true);
            if (bounds) {
              const hs = RESIZE_HANDLE_SIZE / 2;
              const bTopLeftCanvas = getCanvasCoords(
                bounds.xPrecise,
                bounds.yPrecise
              );
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
        // Draw general selection highlight for all multi-selected items that are not primary (or if no primary)
        // Or for primary if it's not rect/text (which have their own handle drawing)
        if (
          multiSelectedIndices.includes(index) &&
          !(
            selectedDrawingIndex === index &&
            (d.type === "rect" || d.type === "text")
          )
        ) {
          const bounds = getDrawingBounds(d);
          if (bounds) {
            const selectionTopLeftCanvas = getCanvasCoords(bounds.x, bounds.y);
            const currentDash = ctx.getLineDash();
            ctx.strokeStyle = "rgba(0, 100, 255, 0.5)"; // Slightly more transparent for multi-select highlight
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
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
    selectedDrawingIndex = null;
    multiSelectedIndices = []; // Clear selections
    redrawCanvas(); // Update canvas to remove highlights

    let originalToolboxDisplay = toolbox ? toolbox.style.display : "";
    let originalSubwindowDisplay = styleSubwindow
      ? styleSubwindow.style.display
      : "";

    if (toolbox) toolbox.style.display = "none";
    if (styleSubwindow) styleSubwindow.style.display = "none";
    if (confirmationDiv) confirmationDiv.style.display = "none";

    await new Promise((resolve) => setTimeout(resolve, 100));

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
        // Confirmation div is usually removed when an action is taken.
      });
  }

  function copyLinkToClipboardAndNotify(link) {
    navigator.clipboard.writeText(link).catch((err) => {
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
    nDiv.className = "";
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
    const numToDelete =
      multiSelectedIndices.length > 0
        ? multiSelectedIndices.length
        : selectedDrawingIndex !== null
        ? 1
        : 0;

    if (numToDelete > 0) {
      if (multiSelectedIndices.length > 0) {
        multiSelectedIndices
          .sort((a, b) => b - a)
          .forEach((idx) => drawings.splice(idx, 1));
        showNotification(`${numToDelete} item(s) deleted.`);
      } else if (
        selectedDrawingIndex !== null &&
        drawings[selectedDrawingIndex]
      ) {
        drawings.splice(selectedDrawingIndex, 1);
        showNotification(`Selected item deleted.`);
      }
      selectedDrawingIndex = null;
      multiSelectedIndices = [];
      isDraggingObject = false;
      isResizingObject = false;
      saveDrawings();
      redrawCanvas();
      hideAllStyleSubWindows();
    } else {
      clearAllDrawingsWithConfirmation(); // Clear all if nothing specific is selected
    }
  }

  function showComplexConfirmation(message, buttonsConfig, callback) {
    removeConfirmation();
    const overlay = document.createElement("div");
    overlay.id = "webDrawConfirmationOverlay";
    overlay.style.cssText =
      "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.3); z-index: 10005;";
    document.body.appendChild(overlay);
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
    const overlay = document.getElementById("webDrawConfirmationOverlay");
    if (overlay) overlay.remove();
    if (confirmationDiv) {
      confirmationDiv.remove();
      confirmationDiv = null;
    }
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
          multiSelectedIndices = [];
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
    if (textInputDiv) removeTextInput(true);
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
    multiSelectedIndices = [];
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
