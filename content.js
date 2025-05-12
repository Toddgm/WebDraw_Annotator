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
          <button data-tool="clear" class="webdraw-button" title="Clear All">${svgs.clear}</button>
          <button data-tool="exit" class="webdraw-button" title="Exit (Esc)">${svgs.exit}</button>
      `;
    document.body.appendChild(toolbox);
    console.log("WebDraw: Toolbox created.");

    // General toolbox click handler
    toolbox.addEventListener("click", handleToolboxClick);

    // Color Picker Logic
    const colorPickerElement = document.getElementById("webDrawColorPicker");
    if (colorPickerElement) {
      colorPickerElement.addEventListener("input", (e) => {
        currentColor = e.target.value;
        console.log("WebDraw: Color changed to", currentColor);
        if (selectedDrawingIndex !== null && drawings[selectedDrawingIndex]) {
          drawings[selectedDrawingIndex].color = currentColor;
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

    if (!targetButton) {
      if (targetColorPicker) {
        // Color picker interaction is handled by its own 'input' event listener
      }
      return; // Click was not on a tool button
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

    if (currentActiveButton) currentActiveButton.classList.remove("active");
    currentTool = tool;
    targetButton.classList.add("active");
    selectedDrawingIndex = null;
    setCursorForTool(currentTool);
    if (textInputDiv) removeTextInput();
    console.log("Selected tool:", currentTool);
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

  // --- Event Handling ---

  function addEventListeners() {
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
    console.log("WebDraw: Removing event listeners.");
    if (canvas) {
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
    }
    window.removeEventListener("scroll", handleScroll);
    window.removeEventListener("resize", handleResize);
    document.removeEventListener("keydown", handleKeyDown);
  }

  function handleScroll() {
    requestAnimationFrame(redrawCanvas);
  }
  function handleResize() {
    if (!canvas || !ctx || !isActive) return;
    // Recalculate canvas dimensions based on potentially changed scroll/doc size
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
        `WebDraw: Canvas resized due to window resize. New W: ${canvas.width} H: ${canvas.height}`
      );
    }
    // Ensure line cap/join are reset if canvas context was lost (unlikely but good practice)
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    requestAnimationFrame(redrawCanvas); // Redraw everything
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") {
      if (textInputDiv) {
        removeTextInput();
      } else {
        deactivateDrawing();
      }
    } else if (e.key === "Delete" || e.key === "Backspace") {
      if (isActive && selectedDrawingIndex !== null) {
        console.log("Deleting selected drawing:", selectedDrawingIndex);
        drawings.splice(selectedDrawingIndex, 1);
        selectedDrawingIndex = null;
        saveDrawings();
        redrawCanvas();
        e.preventDefault();
      }
    } else if (
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
      else if (e.key.toLowerCase() === "a") switchTool("arrow");
      else if (e.key.toLowerCase() === "s") switchTool("select");
    }
  }

  function switchTool(tool) {
    if (!toolbox || currentTool === tool) return;
    const button = toolbox.querySelector(`button[data-tool="${tool}"]`);
    if (button) {
      // Simulate a click event on the button to use the existing handleToolboxClick logic
      const clickEvent = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
      });
      button.dispatchEvent(clickEvent);
    }
  }

  // --- Coordinate Helpers ---
  function getCanvasRelativeCoords(e) {
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function getDocumentRelativeCoords(e) {
    return { x: e.pageX, y: e.pageY };
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
    isDrawing = false;

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
      redrawCanvas();
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
      isDrawing = true;
    } else if (currentTool === "text") {
      isDrawing = true;
    }

    e.preventDefault();
  }

  function handleMouseMove(e) {
    if (!isDrawing || !ctx || !canvas) {
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

    if (currentTool === "pencil") {
      ctx.lineTo(canvasCoords.x, canvasCoords.y);
      ctx.stroke();
      const currentPath = drawings[drawings.length - 1];
      if (currentPath?.type === "pencil") {
        currentPath.points.push(docCoords);
      }
    } else if (currentTool === "rect" || currentTool === "arrow") {
      redrawCanvas();
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
        );
      }
    } else if (currentTool === "text") {
      // No action on mouse move for text
    }
  }

  function handleMouseUp(e) {
    if (e.button !== 0) return;

    const docCoords = getDocumentRelativeCoords(e);
    console.log(
      `handleMouseUp: Tool: ${currentTool}, Doc(${docCoords.x},${docCoords.y}), Drawing: ${isDrawing}`
    );

    if (!isDrawing && currentTool !== "select") {
      isDrawing = false;
      return;
    }

    if (currentTool === "pencil") {
      if (ctx) ctx.closePath();
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
      createTextPrompt(startX, startY);
    }

    if (currentTool !== "select") {
      redrawCanvas();
      saveDrawings();
      console.log("Drawing finished/Text prompt placed, saved drawings.");
    }

    isDrawing = false;
  }

  function handleMouseLeave(e) {
    if (isDrawing && currentTool !== "select" && currentTool !== "text") {
      console.log("Mouse left canvas while drawing shape, finalizing.");
      handleMouseUp(e); // Finalize the drawing as if mouse was released
    }
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
      document.removeEventListener("mousedown", handleOutsideClick, true);
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
      if (textInputDiv && !textInputDiv.contains(event.target)) {
        saveOrRemoveTextOnExit(docX, docY);
        removeListenersAndInput();
      }
    };
    document.addEventListener("mousedown", handleOutsideClick, true);

    textInputDiv.addEventListener("blur", () => {
      setTimeout(() => {
        // Check if textInputDiv still exists because it might have been removed by another event
        if (textInputDiv) {
          saveOrRemoveTextOnExit(docX, docY);
          removeListenersAndInput(); // Ensure this also removes the mousedown listener
        }
      }, 150); // Delay to allow click events on toolbox etc. to fire first
    });
  }

  function saveOrRemoveTextOnExit(docX, docY) {
    if (!textInputDiv) return;
    const currentText = textInputDiv.innerText;
    if (currentText.trim()) {
      saveText(docX, docY, currentText);
    } else {
      removeTextInput(); // Just remove if empty, don't save
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
        color: currentColor, // Use current selected color for text
        font: '16px "Virgil", "Helvetica Neue", Arial, sans-serif', // Use the app's drawing font
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
        const approxLineHeight = 20;
        const approxCharWidth = 8;
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

    const padding =
      (drawing.lineWidth || (drawing.type === "text" ? 1 : 1)) / 2 + 5;
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
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const docX = canvasX + scrollX + rect.left;
    const docY = canvasY + scrollY + rect.top;

    return (
      docX >= bounds.x &&
      docX <= bounds.x + bounds.width &&
      docY >= bounds.y &&
      docY <= bounds.y + bounds.height
    );
  }

  function findClickedDrawingIndex(canvasX, canvasY) {
    for (let i = drawings.length - 1; i >= 0; i--) {
      if (isPointHittingDrawing(canvasX, canvasY, drawings[i])) {
        return i;
      }
    }
    return null;
  }

  // --- Arrow Head Drawing ---
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

    const getCanvasCoords = (docX, docY) => ({
      x: docX - scrollX - rect.left,
      y: docY - scrollY - rect.top,
    });

    drawings.forEach((d, index) => {
      ctx.strokeStyle = d.color || "#000000";
      ctx.fillStyle = d.color || "#000000"; // For text
      ctx.font = d.font || '16px "Virgil", "Helvetica Neue", Arial, sans-serif';
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
          const fontSize = parseInt(ctx.font) || 16; // Parse font size from the string
          const lineHeight = fontSize * 1.4; // Approximate line height
          lines.forEach((line, lineIndex) => {
            ctx.fillText(
              line,
              startCoords.x,
              startCoords.y + lineIndex * lineHeight
            );
          });
        }

        if (index === selectedDrawingIndex) {
          const bounds = getDrawingBounds(d);
          if (bounds) {
            const selectionCoords = getCanvasCoords(bounds.x, bounds.y);
            ctx.save();
            ctx.strokeStyle = "rgba(0, 100, 255, 0.7)";
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(
              selectionCoords.x,
              selectionCoords.y,
              bounds.width,
              bounds.height
            );
            ctx.setLineDash([]);
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
    try {
      const path = window.location.pathname
        .replace(/[^a-zA-Z0-9/-]/g, "_") // Sanitize path
        .substring(0, 100); // Truncate long paths
      const origin = window.location.origin; // Get origin for uniqueness
      return PAGE_STORAGE_KEY_PREFIX + origin + path;
    } catch (e) {
      console.error("WebDraw: Error generating storage key:", e);
      // Fallback key in case of unexpected errors (e.g., weird URLs)
      return PAGE_STORAGE_KEY_PREFIX + "fallback_error_key";
    }
  }
  function saveDrawings() {
    if (!drawings) return;
    try {
      const key = getStorageKey();
      const data = JSON.stringify(drawings);
      // Basic check for excessive data size (localStorage limit is ~5MB)
      if (data.length > 4.5 * 1024 * 1024) {
        // 4.5MB
        console.warn(
          "WebDraw: Drawing data is very large, might exceed storage limits."
        );
      }
      chrome.storage.local.set({ [key]: data }, () => {
        if (chrome.runtime.lastError) {
          console.error(
            "WebDraw: Error saving drawings:",
            chrome.runtime.lastError
          );
        } else {
          // console.log("WebDraw: Drawings saved for key:", key);
        }
      });
    } catch (e) {
      console.error("WebDraw: Exception while saving drawings:", e);
    }
  }
  function loadDrawings() {
    const key = getStorageKey();
    console.log("WebDraw: Attempting to load drawings for key:", key);
    chrome.storage.local.get([key], (result) => {
      if (chrome.runtime.lastError) {
        console.error(
          "WebDraw: Error loading drawings:",
          chrome.runtime.lastError
        );
        drawings = []; // Initialize with empty array on error
      } else if (result[key]) {
        try {
          const parsedData = JSON.parse(result[key]);
          if (Array.isArray(parsedData)) {
            // Basic validation for each drawing object (optional, but good)
            drawings = parsedData.filter((item) => item && item.type); // Ensure each item is an object with a type
            console.log(
              `WebDraw: ${drawings.length} drawings loaded successfully for key: ${key}`
            );
          } else {
            console.error(
              "WebDraw: Loaded data is not an array. Key:",
              key,
              "Data:",
              result[key]
            );
            drawings = [];
          }
        } catch (e) {
          console.error(
            "WebDraw: Error parsing loaded drawings. Key:",
            key,
            "Error:",
            e
          );
          drawings = []; // Initialize with empty array on parse error
        }
      } else {
        console.log(
          "WebDraw: No drawings found in local storage for key:",
          key
        );
        drawings = []; // Initialize with empty array if no data
      }
      redrawCanvas(); // Redraw canvas whether drawings were loaded or not
    });
  }

  // --- Deactivation ---
  function deactivateDrawing() {
    console.log("WebDraw: Deactivating...");
    if (textInputDiv) {
      // Attempt to save text if any, then remove input
      saveOrRemoveTextOnExit(
        parseFloat(textInputDiv.style.left),
        parseFloat(textInputDiv.style.top)
      );
      removeTextInput(); // Ensures it's removed even if saveOrRemoveTextOnExit didn't explicitly
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
    document.body.style.cursor = "default"; // Reset body cursor
    // Notify background script (if needed for state management there)
    chrome.runtime
      .sendMessage({ action: "drawingDeactivated" })
      .catch((e) =>
        console.warn("WebDraw: Could not send deactivation message", e)
      );
    console.log("WebDraw: Deactivated.");
    window.webDrawInitialized = false; // Reset initialization flag for next activation
    return false; // Return new state
  }

  // --- Global Toggle Function ---
  window.webDrawToggle = async () => {
    console.log(
      "WebDraw: Toggle requested. Current state isActive =",
      isActive
    );
    if (isActive) {
      return deactivateDrawing(); // Returns false
    } else {
      // Re-set the initialized flag as we are starting up again.
      // The initial check `if (!window.webDrawInitialized)` at the top of the file
      // prevents re-declaration of functions, but this flag indicates operational status.
      window.webDrawInitialized = true;
      return initializeDrawing(); // Returns true if successful
    }
  };
} else {
  console.log("WebDraw: Already initialized flag set.");
} // End of window.webDrawInitialized check
// This script is injected immediately on page load (as per manifest).
// It just sits and waits for the activation message from the background script.

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggleWebDraw") {
    // Check if the main content script's functions/objects already exist
    if (typeof window.webDrawToggle === "function") {
      // If yes, call the toggle function
      window.webDrawToggle().then((isActive) => {
        sendResponse({ isActive: isActive });
      });
      return true; // Indicates async response
    } else {
      // If not, it means content.js hasn't been injected or loaded yet.
      // The background script handles the injection.
      // We send back a negative response or let background handle the promise rejection.
      console.log("WebDraw Loader: Main script not ready yet.");
      // Let background know we can't toggle yet (it should handle injection first)
      sendResponse({ isActive: false, error: "Main script not loaded." });
    }
  }
  // Important: Return true if you intend to use sendResponse asynchronously.
  // Otherwise, the message channel might close prematurely.
});

// We avoid loading the heavy content.js until the user clicks the icon.
console.log("WebDraw Loader: Ready and waiting for activation.");
