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
let isResizingObject = false; // Flag for resizing rects
let resizeHandleType = null; // e.g., 'nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'
const RESIZE_HANDLE_SIZE = 8; // In pixels, for drawing and hit detection
const MIN_RECT_SIZE = RESIZE_HANDLE_SIZE * 2; // Minimum size for a rectangle during resize

let isSelectingArea = false; // Flag for area selection

let toolboxOffsetX, toolboxOffsetY;
let subwindowOffsetX, subwindowOffsetY; // For subwindow dragging
let startX, startY; // Document coords for drawing/dragging/resizing start
let dragStartX, dragStartY, initialObjectPos; // Page coords for delta calculation, initial object state
let selectionAreaRect = null; // For drawing selection area preview {x, y, width, height} in document coords


let currentTool = "pencil";

// Default Style Settings
const PRESET_COLORS = ["#343a40", "#0c8599", "#f08c00", "#c2255c"];
const WIDTH_MAP = { S: 1, M: 3, L: 6 };
const FONT_SIZE_MAP = { S: "12px", M: "16px", L: "24px" };
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
    if (e.button !== 0 || e.target.closest('button')) return; // Don't drag if clicking a button inside
    isDraggingSubwindow = true;
    const rect = styleSubwindow.getBoundingClientRect();
    // Calculate offset from viewport coordinates
    subwindowOffsetX = e.clientX - rect.left;
    subwindowOffsetY = e.clientY - rect.top;

    const dragHandle = styleSubwindow.querySelector('.webdraw-subwindow-drag-handle');
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
} else if (isDrawing || isDraggingObject || isResizingObject || (currentTool === "select" && isSelectingArea)) {
// Route drawing/object dragging/resizing/area selection mouse moves
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
    const dragHandle = styleSubwindow?.querySelector('.webdraw-subwindow-drag-handle');
    if (dragHandle) dragHandle.style.cursor = "grab";
    document.removeEventListener("mousemove", handleDocumentMouseMove);
    document.removeEventListener("mouseup", handleDocumentMouseUp);
} else if (isDrawing || isDraggingObject || isResizingObject || (currentTool === "select" && isSelectingArea)) {
// Route drawing/object dragging/resizing/area selection mouse up
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
    let isActive = false;
    if (style.dash === null && currentLineDash === null) {
        isActive = true;
    } else if (style.dash && currentLineDash) {
        if (currentLineDash) isActive = true;
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
  Object.keys(FONT_FAMILY_MAP).forEach((fontKey) => { // Iterate by key
    const fontFamilyValue = FONT_FAMILY_MAP[fontKey];
    const isActive = fontFamilyValue === currentFontFamily;
    const displayName = fontKey; // Use the key for display name
    contentHTML += `
              <button class="webdraw-font-button ${isActive ? "active" : ""}"
                      data-fontkey="${fontKey}"
                      title="${displayName}"
                      style="font-family: ${fontFamilyValue};">
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
              <button class="webdraw-width-button ${ // Re-use width-button class for S/M/L text size
                isActive ? "active" : ""
              }" data-fontsize="${pxValue}" title="${pxValue}">
                  ${sizeKey}
              </button>`;
  });
  contentHTML += `</div>`;

  // Text Align Controls
  contentHTML += `<div class="webdraw-style-section"><span class="webdraw-style-label">Align:</span>`;
  const aligns = [ // Using Nerd Font characters for align icons
    { name: "Left", value: "left", icon: '\uF036' /* nf-fa-align_left */ },
    { name: "Center", value: "center", icon: '\uF037' /* nf-fa-align_center */ },
    { name: "Right", value: "right", icon: '\uF038' /* nf-fa-align_right */ },
  ];
  aligns.forEach((align) => {
    const isActive = align.value === currentTextAlign;
    contentHTML += `
              <button class="webdraw-align-button ${ // Ensure this button uses Nerd Font
                isActive ? "active" : ""
              }" data-align="${align.value}" title="${align.name}">
                  ${align.icon}
              </button>`;
  });
  contentHTML += `</div>`;
}

styleSubwindow.innerHTML = contentHTML;

// Add mousedown listener to the drag handle
const dragHandle = styleSubwindow.querySelector('.webdraw-subwindow-drag-handle');
if (dragHandle) {
    dragHandle.addEventListener('mousedown', handleSubwindowDragStart);
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
    if (currentLineDash) {
        currentLineDash = getScaledDashArray(BASE_DOTTED_PATTERN, currentLineWidth);
    }
} else if (target.dataset.linedash) {
    const baseDash = JSON.parse(target.dataset.linedash);
    if (baseDash) {
        currentLineDash = getScaledDashArray(baseDash, currentLineWidth);
    } else {
        currentLineDash = null;
    }
} else if (target.dataset.fontkey) { // Changed from data-fontfamily to data-fontkey
    currentFontFamily = FONT_FAMILY_MAP[target.dataset.fontkey];
} else if (target.dataset.fontsize) {
    currentFontSize = target.dataset.fontsize;
} else if (target.dataset.align) {
    currentTextAlign = target.dataset.align;
} else {
    return;
}

// Update UI in the subwindow
parentSection
  .querySelectorAll("button")
  .forEach((btn) => btn.classList.remove("active"));
target.classList.add("active");

if (target.dataset.linedash) {
    parentSection.querySelectorAll('button[data-linedash]').forEach(btn => {
        const btnDash = JSON.parse(btn.dataset.linedash);
        const currentIsDotted = currentLineDash !== null;
        const btnIsDotted = btnDash !== null;
        if (currentIsDotted === btnIsDotted) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}


// Apply to selected drawing if any
if (selectedDrawingIndex !== null && drawings[selectedDrawingIndex]) {
  const selected = drawings[selectedDrawingIndex];
  if (target.dataset.color) selected.color = currentColor;
  if (target.dataset.width) {
      selected.lineWidth = currentLineWidth;
      if (selected.lineDash) {
          selected.lineDash = getScaledDashArray(BASE_DOTTED_PATTERN, selected.lineWidth);
      }
  }
  if (target.dataset.linedash) {
      const baseDash = JSON.parse(target.dataset.linedash);
      selected.lineDash = baseDash ? getScaledDashArray(baseDash, selected.lineWidth || currentLineWidth) : null;
  }
  if (target.dataset.fontkey) selected.fontFamily = currentFontFamily; // Use currentFontFamily updated from FONT_FAMILY_MAP
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
  if (styleSubwindow && ["pencil", "rect", "arrow", "text"].includes(tool)) {
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
selectedDrawingIndex = null;
isDraggingObject = false;
isResizingObject = false;
resizeHandleType = null;
if (isSelectingArea) {
    isSelectingArea = false;
    selectionAreaRect = null;
}

setCursorForTool(currentTool);
if (textInputDiv) removeTextInput();

if (["pencil", "rect", "arrow", "text"].includes(tool)) {
  createOrShowStyleSubWindow(tool);
} else {
  hideAllStyleSubWindows();
}

console.log("Selected tool:", currentTool);
redrawCanvas();
}

function setCursorForTool(tool) {
if (!canvas) return;
switch (tool) {
case "pencil":
case "rect": // Default for rect, will be overridden by hover logic for handles
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
canvas.addEventListener("mousedown", handleCanvasMouseDown);

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
document.removeEventListener("mousemove", handleDocumentMouseMove);
document.removeEventListener("mouseup", handleDocumentMouseUp);
const titleElement = toolbox?.querySelector(".webdraw-title");
if (titleElement) {
titleElement.removeEventListener("mousedown", handleToolboxDragStart);
}
const dragHandle = styleSubwindow?.querySelector('.webdraw-subwindow-drag-handle');
if (dragHandle) {
    dragHandle.removeEventListener('mousedown', handleSubwindowDragStart);
}


window.removeEventListener("scroll", handleScroll);
window.removeEventListener("resize", handleResize);
document.removeEventListener("keydown", handleKeyDown);
}

function handleScroll() {
requestAnimationFrame(redrawCanvas);
if (!isDraggingSubwindow) {
    positionSubwindow();
}
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
console.log(
`WebDraw: Canvas resized. New W: ${canvas.width} H: ${canvas.height}`
);
}
ctx.lineCap = "round";
ctx.lineJoin = "round";
requestAnimationFrame(redrawCanvas);
if (!isDraggingSubwindow) {
    positionSubwindow();
}
}

function handleKeyDown(e) {
if (e.key === "Escape") {
if (confirmationDiv) {
removeConfirmation();
} else if (styleSubwindow) {
hideAllStyleSubWindows();
} else if (textInputDiv) {
removeTextInput();
} else if (isDrawing || isDraggingObject || isResizingObject || isSelectingArea) {
isDrawing = false;
isDraggingObject = false;
isResizingObject = false;
resizeHandleType = null;
isSelectingArea = false;
selectionAreaRect = null;
initialObjectPos = null;
if (currentTool !== "select" && isDrawing && drawings.length > 0) {
    const lastDrawing = drawings[drawings.length -1];
    if (lastDrawing.type === "pencil" && lastDrawing.points.length <= 1) {
        drawings.pop();
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
if (button) button.click();
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

// --- Rectangle Resize Handle Helpers ---
function getResizeHandleAtPoint(drawing, canvasX, canvasY) {
    if (!drawing || drawing.type !== 'rect' || !canvas) return null;

    const rectDoc = { x: drawing.x, y: drawing.y, width: drawing.width, height: drawing.height };
    const hs = RESIZE_HANDLE_SIZE / 2; // half size for centered handles

    // Convert mouse canvasX, canvasY to document coordinates for comparison
    const canvasBoundingRect = canvas.getBoundingClientRect();
    const mouseDocX = canvasX + canvasBoundingRect.left + window.scrollX;
    const mouseDocY = canvasY + canvasBoundingRect.top + window.scrollY;

    const handles = {
        'nw': { x: rectDoc.x, y: rectDoc.y },
        'n':  { x: rectDoc.x + rectDoc.width / 2, y: rectDoc.y },
        'ne': { x: rectDoc.x + rectDoc.width, y: rectDoc.y },
        'w':  { x: rectDoc.x, y: rectDoc.y + rectDoc.height / 2 },
        'e':  { x: rectDoc.x + rectDoc.width, y: rectDoc.y + rectDoc.height / 2 },
        'sw': { x: rectDoc.x, y: rectDoc.y + rectDoc.height },
        's':  { x: rectDoc.x + rectDoc.width / 2, y: rectDoc.y + rectDoc.height },
        'se': { x: rectDoc.x + rectDoc.width, y: rectDoc.y + rectDoc.height },
    };

    for (const type in handles) {
        const handle = handles[type];
        // Check if mouseDocX, mouseDocY is within the handle's bounds (document coords)
        if (mouseDocX >= handle.x - hs && mouseDocX <= handle.x + hs &&
            mouseDocY >= handle.y - hs && mouseDocY <= handle.y + hs) {
            return type;
        }
    }
    return null;
}

function getCursorForResizeHandle(handleType) {
    switch (handleType) {
        case 'n': case 's': return 'ns-resize';
        case 'e': case 'w': return 'ew-resize';
        case 'nw': case 'se': return 'nwse-resize';
        case 'ne': case 'sw': return 'nesw-resize';
        default: return 'move'; // Default for dragging the body
    }
}


// --- Drawing Event Handlers ---

function handleCanvasMouseDown(e) {
if (e.button !== 0 || !ctx || !canvas || isDraggingToolbox || isDraggingSubwindow) return;
if (styleSubwindow && styleSubwindow.contains(e.target)) return;

const docCoords = getDocumentRelativeCoords(e);
const canvasCoords = getCanvasRelativeCoords(e);
console.log(
  `handleCanvasMouseDown: Tool: ${currentTool}, Doc(${docCoords.x},${docCoords.y}), Canvas(${canvasCoords.x},${canvasCoords.y})`
);

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
  if (selectedDrawingIndex !== null && drawings[selectedDrawingIndex]?.type === 'rect') {
      resizeHandleType = getResizeHandleAtPoint(drawings[selectedDrawingIndex], canvasCoords.x, canvasCoords.y);
      if (resizeHandleType) {
          isResizingObject = true;
          clickedOnSelectedObjectHandle = true;
          const obj = drawings[selectedDrawingIndex];
          initialObjectPos = { x: obj.x, y: obj.y, width: obj.width, height: obj.height }; // Store original state
          console.log("Selection: Started resizing rect, handle:", resizeHandleType);
      }
  }

  if (!clickedOnSelectedObjectHandle) { // If not starting a resize
    const clickedIndex = findClickedDrawingIndex(canvasCoords.x, canvasCoords.y);
    if (clickedIndex !== null) {
        selectedDrawingIndex = clickedIndex;
        isDraggingObject = true;
        const obj = drawings[selectedDrawingIndex];
        if (obj.type === "pencil") initialObjectPos = obj.points.map((p) => ({ ...p }));
        else if (obj.type === "arrow") initialObjectPos = { x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 };
        else initialObjectPos = { x: obj.x, y: obj.y, width: obj.width, height: obj.height }; // Also store w/h for rects
        console.log("Selection: Started dragging index", selectedDrawingIndex);
    } else {
        selectedDrawingIndex = null;
        isSelectingArea = true;
        selectionAreaRect = { x: startX, y: startY, width: 0, height: 0 };
        console.log("Selection: Clicked empty space, starting area selection.");
    }
  }
  redrawCanvas();
} else if (["pencil", "rect", "arrow", "text"].includes(currentTool)) {
  selectedDrawingIndex = null;
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
  redrawCanvas();
}

if (isDrawing || isDraggingObject || isResizingObject || isSelectingArea) {
  document.addEventListener("mousemove", handleDocumentMouseMove);
  document.addEventListener("mouseup", handleDocumentMouseUp);
}

e.preventDefault();
}


function handleDrawingMouseMove(e) {
if (!isActive) return;

const docCoords = getDocumentRelativeCoords(e);
const pageX = e.pageX;
const pageY = e.pageY;
const canvasCoords = getCanvasRelativeCoords(e); // For cursor updates


if (isResizingObject && selectedDrawingIndex !== null && drawings[selectedDrawingIndex]?.type === 'rect') {
    const rect = drawings[selectedDrawingIndex];
    const deltaX = docCoords.x - startX; // Use docCoords for delta from initial mousedown (startX, startY)
    const deltaY = docCoords.y - startY;

    let newX = initialObjectPos.x;
    let newY = initialObjectPos.y;
    let newWidth = initialObjectPos.width;
    let newHeight = initialObjectPos.height;

    if (resizeHandleType.includes('e')) newWidth = initialObjectPos.width + deltaX;
    if (resizeHandleType.includes('s')) newHeight = initialObjectPos.height + deltaY;
    if (resizeHandleType.includes('w')) {
        newX = initialObjectPos.x + deltaX;
        newWidth = initialObjectPos.width - deltaX;
    }
    if (resizeHandleType.includes('n')) {
        newY = initialObjectPos.y + deltaY;
        newHeight = initialObjectPos.height - deltaY;
    }

    // Update only if size is valid
    if (newWidth >= MIN_RECT_SIZE) {
        rect.x = newX;
        rect.width = newWidth;
    }
    if (newHeight >= MIN_RECT_SIZE) {
        rect.y = newY;
        rect.height = newHeight;
    }
    // Ensure x/y are updated if width/height changed due to w/n handles moving the origin
    if (resizeHandleType.includes('w') && newWidth < MIN_RECT_SIZE) { /* no change */ }
    else if (resizeHandleType.includes('w')) { rect.x = newX; }

    if (resizeHandleType.includes('n') && newHeight < MIN_RECT_SIZE) { /* no change */ }
    else if (resizeHandleType.includes('n')) { rect.y = newY; }


    requestAnimationFrame(redrawCanvas);

} else if (isDraggingObject && selectedDrawingIndex !== null) {
  const deltaX = pageX - dragStartX;
  const deltaY = pageY - dragStartY;
  const obj = drawings[selectedDrawingIndex];
  if (!obj || !initialObjectPos) return;

  if (obj.type === "pencil" && Array.isArray(initialObjectPos)) {
    obj.points = initialObjectPos.map((p) => ({ x: p.x + deltaX, y: p.y + deltaY }));
  } else if (obj.type === "arrow") {
    obj.x1 = initialObjectPos.x1 + deltaX; obj.y1 = initialObjectPos.y1 + deltaY;
    obj.x2 = initialObjectPos.x2 + deltaX; obj.y2 = initialObjectPos.y2 + deltaY;
  } else if (obj.type === "rect" || obj.type === "text") { // Rect dragging (not resizing)
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
      const startCanvasPreview = getCanvasCoords(startX, startY);
      const currentCanvasPreview = getCanvasCoords(docCoords.x, docCoords.y);

      if (currentTool === "rect") {
        ctx.strokeRect(
          startCanvasPreview.x, startCanvasPreview.y,
          currentCanvasPreview.x - startCanvasPreview.x, currentCanvasPreview.y - startCanvasPreview.y
        );
      } else {
        ctx.beginPath();
        ctx.moveTo(startCanvasPreview.x, startCanvasPreview.y);
        ctx.lineTo(currentCanvasPreview.x, currentCanvasPreview.y);
        ctx.stroke();
        drawArrowhead(
          ctx, startCanvasPreview.x, startCanvasPreview.y,
          currentCanvasPreview.x, currentCanvasPreview.y, 10 + currentLineWidth * 2
        );
      }
      ctx.restore();
    });
  }
} else if (currentTool === "select" && isSelectingArea && selectionAreaRect) {
    selectionAreaRect.width = docCoords.x - selectionAreaRect.x;
    selectionAreaRect.height = docCoords.y - selectionAreaRect.y;
    requestAnimationFrame(redrawCanvas);
} else if (currentTool === 'select' && selectedDrawingIndex !== null && drawings[selectedDrawingIndex]?.type === 'rect' && !isDraggingObject && !isResizingObject) {
    // Hovering over a selected rectangle, check for resize handles
    const handle = getResizeHandleAtPoint(drawings[selectedDrawingIndex], canvasCoords.x, canvasCoords.y);
    if (handle) {
        canvas.style.cursor = getCursorForResizeHandle(handle);
    } else if (isPointHittingDrawing(canvasCoords.x, canvasCoords.y, drawings[selectedDrawingIndex])) {
        canvas.style.cursor = 'move';
    } else {
        canvas.style.cursor = 'default';
    }
} else if (currentTool === 'select' && !isDraggingObject && !isResizingObject) {
    // General select tool cursor update if nothing is selected or being dragged/resized
     const hoveredIndex = findClickedDrawingIndex(canvasCoords.x, canvasCoords.y);
     if (hoveredIndex !== null) {
         canvas.style.cursor = 'move'; // Or 'pointer'
     } else {
         canvas.style.cursor = 'default';
     }
}


}


function handleDrawingMouseUp(e) {
if (e.button !== 0 || !isActive) return;

const docCoords = getDocumentRelativeCoords(e);
console.log(
  `handleMouseUp: Tool: ${currentTool}, Drawing: ${isDrawing}, DraggingObj: ${isDraggingObject}, ResizingObj: ${isResizingObject}, SelectingArea: ${isSelectingArea}`
);

if (isResizingObject) {
    // Rectangle resize finished
    const rect = drawings[selectedDrawingIndex];
    // Ensure width/height are positive after resize might have flipped them
    if (rect.width < 0) {
        rect.x += rect.width;
        rect.width = Math.abs(rect.width);
    }
    if (rect.height < 0) {
        rect.y += rect.height;
        rect.height = Math.abs(rect.height);
    }
    saveDrawings();
    console.log("Object resize finished, saved drawings.");
} else if (isDraggingObject) {
  saveDrawings();
  console.log("Object drag finished, saved drawings.");
} else if (isDrawing) {
  if (currentTool === "pencil") {
    const currentPath = drawings[drawings.length - 1];
    if (currentPath && currentPath.type === "pencil" && currentPath.points.length < 2) {
        drawings.pop();
    }
  } else if (currentTool === "rect") {
    const rectX = Math.min(startX, docCoords.x);
    const rectY = Math.min(startY, docCoords.y);
    const rectWidth = Math.abs(docCoords.x - startX);
    const rectHeight = Math.abs(docCoords.y - startY);
    if (rectWidth > MIN_RECT_SIZE / 2 && rectHeight > MIN_RECT_SIZE / 2) {
      drawings.push({
        type: "rect", x: rectX, y: rectY, width: rectWidth, height: rectHeight,
        color: currentColor, lineWidth: currentLineWidth, lineDash: currentLineDash ? [...currentLineDash] : null,
      });
    }
  } else if (currentTool === "arrow") {
    if (Math.abs(docCoords.x - startX) > 2 || Math.abs(docCoords.y - startY) > 2 ) {
      drawings.push({
        type: "arrow", x1: startX, y1: startY, x2: docCoords.x, y2: docCoords.y,
        color: currentColor, lineWidth: currentLineWidth, lineDash: currentLineDash ? [...currentLineDash] : null,
      });
    }
  } else if (currentTool === "text") {
    if (Math.abs(docCoords.x - startX) < 5 && Math.abs(docCoords.y - startY) < 5) {
        createTextPrompt(startX, startY);
    }
  }

  if (currentTool !== "text") {
    saveDrawings();
    console.log("Drawing finished for tool, saved drawings.", currentTool);
  }
} else if (currentTool === "select" && isSelectingArea && selectionAreaRect) {
    const finalSelectionRect = {
        x: Math.min(selectionAreaRect.x, selectionAreaRect.x + selectionAreaRect.width),
        y: Math.min(selectionAreaRect.y, selectionAreaRect.y + selectionAreaRect.height),
        width: Math.abs(selectionAreaRect.width),
        height: Math.abs(selectionAreaRect.height),
    };

    if (finalSelectionRect.width > 5 && finalSelectionRect.height > 5) {
        let foundIndex = null;
        for (let i = drawings.length - 1; i >= 0; i--) {
            const drawingBounds = getDrawingBounds(drawings[i]);
            if (drawingBounds && doRectsIntersect(finalSelectionRect, drawingBounds)) {
                foundIndex = i;
                break;
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
        selectedDrawingIndex = null;
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
setCursorForTool(currentTool); // Reset cursor to tool default
}

// --- Text Input ---
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
if (!drawing) return null;
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

switch (drawing.type) {
  case "pencil":
    if (!drawing.points || drawing.points.length === 0) return null;
    drawing.points.forEach((p) => {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    });
    break;
  case "rect":
    minX = drawing.x; minY = drawing.y;
    maxX = drawing.x + drawing.width; maxY = drawing.y + drawing.height;
    break;
  case "arrow":
    minX = Math.min(drawing.x1, drawing.x2); minY = Math.min(drawing.y1, drawing.y2);
    maxX = Math.max(drawing.x1, drawing.x2); maxY = Math.max(drawing.y1, drawing.y2);
    break;
  case "text":
    const lines = drawing.text.split("\n");
    const fontSizePx = parseInt(drawing.fontSize || FONT_SIZE_MAP.M) || 16;
    const approxLineHeight = fontSizePx * 1.4;
    const tempCtx = document.createElement("canvas").getContext("2d");
    tempCtx.font = `${drawing.fontSize || FONT_SIZE_MAP.M} ${drawing.fontFamily || FONT_FAMILY_MAP.Virgil}`;
    const maxLineWidth = lines.reduce((max, line) => Math.max(max, tempCtx.measureText(line).width),0);
    let xOffset = 0;
    if (drawing.textAlign === "center") xOffset = -maxLineWidth / 2;
    else if (drawing.textAlign === "right") xOffset = -maxLineWidth;
    minX = drawing.x + xOffset; minY = drawing.y;
    maxX = minX + maxLineWidth; maxY = drawing.y + lines.length * approxLineHeight;
    break;
  default: return null;
}
const effectiveLineWidth = drawing.lineWidth || (drawing.type === "text" ? 2 : 1);
const padding = Math.max(1, effectiveLineWidth / 2) + 5 + (drawing.type === 'rect' ? RESIZE_HANDLE_SIZE : 0); // Extra padding for rect handles

return {
  x: minX - padding, y: minY - padding,
  width: (maxX - minX) + 2 * padding, height: (maxY - minY) + 2 * padding,
};
}

function isPointHittingDrawing(canvasX, canvasY, drawing) {
const bounds = getDrawingBounds(drawing);
if (!bounds || !canvas) return false;

const canvasRect = canvas.getBoundingClientRect();
const docX = canvasX + canvasRect.left + window.scrollX;
const docY = canvasY + canvasRect.top + window.scrollY;

// For rectangles, a more precise hit check on the actual shape (excluding just padding for handles)
if (drawing.type === 'rect') {
    const rectBody = {
        x: drawing.x, y: drawing.y,
        width: drawing.width, height: drawing.height
    };
    const paddingForBody = Math.max(1, (drawing.lineWidth || 1) / 2) + 2; // Smaller padding for body hit
    if (docX >= rectBody.x - paddingForBody && docX <= rectBody.x + rectBody.width + paddingForBody &&
        docY >= rectBody.y - paddingForBody && docY <= rectBody.y + rectBody.height + paddingForBody) {
        return true;
    }
    // If not hitting body, still check if hitting handles (covered by general bounds)
    // Fall through to general bounds check for handles
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

// --- Helper to get Canvas Coords from Doc Coords ---
function getCanvasCoords(docX, docY) {
if (!canvas) return { x: 0, y: 0 };
const rect = canvas.getBoundingClientRect();
return { x: docX - window.scrollX - rect.left, y: docY - window.scrollY - rect.top };
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

        if (index === selectedDrawingIndex) { // Draw resize handles for selected rect
            const hs = RESIZE_HANDLE_SIZE / 2;
            const handlesDef = [ // relative to rect's top-left on canvas
                { x: 0, y: 0 }, { x: d.width / 2, y: 0 }, { x: d.width, y: 0 },
                { x: 0, y: d.height / 2 }, { x: d.width, y: d.height / 2 },
                { x: 0, y: d.height }, { x: d.width / 2, y: d.height }, { x: d.width, y: d.height }
            ];
            ctx.fillStyle = "rgba(0, 100, 255, 0.7)";
            handlesDef.forEach(h => {
                ctx.fillRect(startCoords.x + h.x - hs, startCoords.y + h.y - hs, RESIZE_HANDLE_SIZE, RESIZE_HANDLE_SIZE);
            });
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
        ctx, startCoords.x, startCoords.y, endCoords.x, endCoords.y,
        10 + (d.lineWidth || 1) * 2
      );
    } else if (d.type === "text") {
      const startCoords = getCanvasCoords(d.x, d.y);
      const lines = d.text.split("\n");
      const font = `${d.fontSize || FONT_SIZE_MAP.M} ${d.fontFamily || FONT_FAMILY_MAP.Virgil}`;
      const textAlign = d.textAlign || "left";
      const fontSizePx = parseInt(d.fontSize || FONT_SIZE_MAP.M) || 16;
      const lineHeight = fontSizePx * 1.4;
      ctx.font = font;
      ctx.textAlign = textAlign;
      const yOffset = fontSizePx * 0.8;
      lines.forEach((line, lineIndex) => {
        ctx.fillText(line, startCoords.x, startCoords.y + lineIndex * lineHeight + yOffset);
      });
    }

    if (index === selectedDrawingIndex && d.type !== 'rect') { // General selection highlight (not for rects, they have handles)
      const bounds = getDrawingBounds(d);
      if (bounds) {
        const selectionTopLeftCanvas = getCanvasCoords(bounds.x, bounds.y);
        const currentDash = ctx.getLineDash();
        ctx.strokeStyle = "rgba(0, 100, 255, 0.7)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(selectionTopLeftCanvas.x, selectionTopLeftCanvas.y, bounds.width, bounds.height);
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
    const selAreaStartCanvas = getCanvasCoords(selectionAreaRect.x, selectionAreaRect.y);
    ctx.strokeStyle = "rgba(0, 100, 255, 0.7)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(selAreaStartCanvas.x, selAreaStartCanvas.y, selectionAreaRect.width, selectionAreaRect.height);
    ctx.restore();
}
}

// --- Persistence ---
function getStorageKey() {
try {
const path = window.location.pathname.replace(/[^a-zA-Z0-9/-]/g, "_").substring(0, 100);
const origin = window.location.origin;
return PAGE_STORAGE_KEY_PREFIX + origin + path;
} catch (e) { console.error(e); return PAGE_STORAGE_KEY_PREFIX + "fallback"; }
}
function saveDrawings() {
if (!drawings) return;
try {
const k = getStorageKey(), d = JSON.stringify(drawings);
if (d.length > 4.5e6) console.warn("Data > 4.5MB");
chrome.storage.local.set({ [k]: d }, () => {
if (chrome.runtime.lastError) console.error(chrome.runtime.lastError);
});
} catch (e) { console.error(e); }
}
function loadDrawings() {
const k = getStorageKey();
console.log("Loading key:", k);
chrome.storage.local.get([k], (r) => {
if (chrome.runtime.lastError) console.error(chrome.runtime.lastError);
else if (r[k]) {
try {
const d = JSON.parse(r[k]);
if (Array.isArray(d)) drawings = d.filter((i) => i && i.type); else drawings = [];
} catch (e) { console.error(e); drawings = []; }
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

chrome.runtime.sendMessage({ action: "createShareImage", data: dataToSend })
    .then(response => {
        if (response && response.imageUrl) {
            copyLinkToClipboardAndNotify(response.imageUrl);
             if (response.note) { // If background sent a note (e.g. about placeholder)
                showNotification(`Link copied! (${response.note})`);
            } else {
                showNotification("Share link copied!");
            }
        } else if (response && response.error) {
            console.error("Share failed:", response.error);
            showNotification(`Error: ${response.error}`, true);
        } else {
            console.error("Share failed: Unknown response from background.");
            showNotification("Error: Could not create share link.", true);
        }
    })
    .catch(error => {
        console.error("Share message failed:", error);
        showNotification(`Error: ${error.message || "Failed to send share request."}`, true);
    });
}

function copyLinkToClipboardAndNotify(link) {
navigator.clipboard
.writeText(link)
.then(() => {
console.log("Link copied:", link);
// showNotification("Share link copied!"); // Notification now handled in handleShare response
})
.catch((err) => {
console.error("Copy failed:", err);
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
nDiv.className = "webdraw-notification"; // Base class
if (isError) nDiv.classList.add("error");

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

// --- Custom Confirmation (Enhanced) ---
function showComplexConfirmation(message, buttonsConfig, callback) {
    removeConfirmation();

    confirmationDiv = document.createElement("div");
    confirmationDiv.id = "webDrawConfirmation";
    confirmationDiv.innerHTML = `<p>${message}</p><div class="webdraw-confirm-buttons"></div>`;

    const buttonsContainer = confirmationDiv.querySelector(".webdraw-confirm-buttons");

    buttonsConfig.forEach(btnConfig => {
        const button = document.createElement("button");
        button.textContent = btnConfig.text;
        if (btnConfig.styleClass) {
            button.classList.add(btnConfig.styleClass);
        }
        button.onclick = () => {
            removeConfirmation();
            if (callback) callback(btnConfig.action);
        };
        buttonsContainer.appendChild(button);
    });

    document.body.appendChild(confirmationDiv);
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
        { text: 'Delete Selected', action: 'delete_selected', styleClass: 'confirm-action-normal' },
        { text: 'Clear ALL Drawings', action: 'clear_all', styleClass: 'confirm-action-danger' },
        { text: 'Cancel', action: 'cancel', styleClass: 'confirm-action-cancel' }
    ];

    showComplexConfirmation("An item is selected. Choose an action:", buttons, (chosenAction) => {
        if (chosenAction === 'delete_selected') {
            if (selectedDrawingIndex !== null && drawings[selectedDrawingIndex]) {
                drawings.splice(selectedDrawingIndex, 1);
                selectedDrawingIndex = null;
                isDraggingObject = false;
                isResizingObject = false;
                saveDrawings();
                redrawCanvas();
                console.log("Selected drawing deleted.");
                showNotification("Selected drawing deleted.");
            }
        } else if (chosenAction === 'clear_all') {
            drawings = []; selectedDrawingIndex = null; isDrawing = false; isDraggingObject = false; isResizingObject = false;
            saveDrawings(); redrawCanvas();
            console.log("All drawings cleared.");
            showNotification("All drawings cleared.");
        }
    });
}

function clearAllDrawingsWithConfirmation() {
    if (drawings.length === 0) {
        showNotification("Nothing to clear.");
        return;
    }
    const buttons = [
        { text: 'Clear All', action: 'confirm_clear_all', styleClass: 'confirm-action-danger' },
        { text: 'Cancel', action: 'cancel', styleClass: 'confirm-action-cancel' }
    ];
    showComplexConfirmation("Are you sure you want to clear ALL drawings on this page?", buttons, (chosenAction) => {
        if (chosenAction === 'confirm_clear_all') {
            drawings = []; selectedDrawingIndex = null; isDrawing = false; isDraggingObject = false; isResizingObject = false;
            saveDrawings(); redrawCanvas();
            console.log("All drawings cleared.");
            showNotification("All drawings cleared.");
        }
    });
}


// --- Deactivation ---
function deactivateDrawing() {
console.log("WebDraw: Deactivating...");
removeConfirmation();
if (textInputDiv) {
    const textInputStyle = window.getComputedStyle(textInputDiv);
    saveOrRemoveTextOnExit(parseFloat(textInputStyle.left), parseFloat(textInputStyle.top));
    removeTextInput();
}
hideAllStyleSubWindows();
removeEventListeners();
if (canvas) canvas.remove();
if (toolbox) toolbox.remove();
const nDiv = document.getElementById("webDrawNotification");
if (nDiv) nDiv.remove();
if (notificationTimeout) clearTimeout(notificationTimeout);

canvas = null; ctx = null; toolbox = null; styleSubwindow = null; confirmationDiv = null;
drawings = []; selectedDrawingIndex = null; isActive = false;
isDrawing = false; isDraggingObject = false; isDraggingToolbox = false; isDraggingSubwindow = false;
isResizingObject = false; resizeHandleType = null; isSelectingArea = false; selectionAreaRect = null;

document.body.style.cursor = "default";
chrome.runtime
  .sendMessage({ action: "drawingDeactivated" })
  .catch((e) => console.warn("WebDraw: Error sending deactivation message:", e));
console.log("WebDraw: Deactivated.");
window.webDrawInitialized = false;
return false;
}

// --- Global Toggle Function ---
window.webDrawToggle = async () => {
console.log("WebDraw: Toggle requested. Current state isActive =", isActive);
if (isActive) {
    return deactivateDrawing();
} else {
    window.webDrawInitialized = true;
    return initializeDrawing();
}
};
} else {
console.log("WebDraw: Already initialized flag set (script already ran once and might be active or inactive).");
}