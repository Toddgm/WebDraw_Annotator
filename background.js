// FILE: background.js
// background.js (MV3 Service Worker Module)

// --- Cloudinary Configuration ---
const CLOUDINARY_CLOUD_NAME = "duyfzazya"; // <--- REPLACE THIS
const CLOUDINARY_UPLOAD_PRESET = "webdraw_unsigned"; // As created in your Cloudinary settings

// Listener for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
if (request.action === "createShareImage") {
handleCreateImageLink(request.data, sender.tab.id)
.then(response => sendResponse(response))
.catch(error => sendResponse({ error: error.message || "Unknown error creating image link." }));
return true; // Indicates async response
} else if (request.action === "saveDrawingData") {
// Conceptual save (if needed later)
console.log("Background: Received conceptual data to save", request.data);
sendResponse({ status: "received by background (conceptual)" });
return true;
} else if (request.action === "drawingDeactivated") {
console.log("Background: Drawing deactivated message received from tab:", sender.tab?.id);
// Update background state if needed (e.g., clear temporary data)
activeTabs.delete(sender.tab?.id); // Assuming activeTabs is still used for icon state
sendResponse({ status: "acknowledged" });
return true;
}
// Add other message handlers if necessary
});

// --- Share Image Link Logic (Adapted for Cloudinary) ---
async function handleCreateImageLink(data, tabId) {
console.log("handleCreateImageLink: Received data:", data);
if (!data || !data.drawings || !data.viewport) {
return { error: "Invalid data received for creating image link." };
}

if (!CLOUDINARY_CLOUD_NAME || CLOUDINARY_CLOUD_NAME === "YOUR_CLOUD_NAME_PLACEHOLDER" || !CLOUDINARY_UPLOAD_PRESET) {
    console.warn("handleCreateImageLink: Cloudinary configuration is incomplete. Returning placeholder error.");
    // For prototyping or if not configured, return a fake success
    return { imageUrl: "https://res.cloudinary.com/demo/image/upload/sample.jpg", note: "Cloudinary not fully configured." };
}

try {
    // 1. Capture Visible Tab
    const screenshotDataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
    console.log("Screenshot captured.");

    // 2. Create Offscreen Canvas & Draw Annotations
    const imageData = await drawAnnotationsOnScreenshot(screenshotDataUrl, data.drawings, data.viewport);
    if (!imageData.blob) {
        throw new Error(imageData.error || "Failed to generate image blob.");
    }
    console.log("Annotations drawn on screenshot blob created.");

    // 3. Upload to Cloudinary
    const formData = new FormData();
    formData.append('file', imageData.blob);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    // Optional: Add tags, folder, etc.
    // formData.append('tags', 'webdraw,annotation');
    // formData.append('folder', 'webdraw_uploads');

    console.log("Uploading to Cloudinary...");
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: formData,
    });

    const result = await response.json();

    if (!response.ok || result.error) {
        console.error("Cloudinary upload failed:", result);
        throw new Error(`Cloudinary upload failed: ${result.error?.message || response.statusText || 'Unknown error'}`);
    }

    console.log("Image uploaded successfully to Cloudinary:", result);

    if (!result.secure_url) {
        throw new Error("Cloudinary response did not contain secure_url image link.");
    }

    // 4. Return Cloudinary Link
    return { imageUrl: result.secure_url };

} catch (e) {
    console.error("Error in handleCreateImageLink:", e);
    if (e.message.includes("Cannot capture page") || e.message.includes("access contents")) {
         return { error: "Cannot capture this page (e.g., chrome://, file://, protected pages)." };
     }
    return { error: e.message || "An unexpected error occurred creating the image link." };
}
}

// Helper to draw annotations onto the screenshot
async function drawAnnotationsOnScreenshot(screenshotDataUrl, drawings, viewport) {
    try {
        const offscreenCanvas = new OffscreenCanvas(viewport.width, viewport.height);
        const ctx = offscreenCanvas.getContext("2d");
        if (!ctx) {
            return { blob: null, error: "Failed to get OffscreenCanvas context." };
        }

        // 1. Fetch the screenshotDataUrl (Data URL) and convert to Blob
        const response = await fetch(screenshotDataUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch screenshot data: ${response.statusText}`);
        }
        const imageBlob = await response.blob();

        // 2. Create an ImageBitmap from the Blob
        const imageBitmap = await createImageBitmap(imageBlob);

        // 3. Draw screenshot background (ImageBitmap) onto the OffscreenCanvas
        ctx.drawImage(imageBitmap, 0, 0, viewport.width, viewport.height);
        imageBitmap.close(); // Release memory once drawn

        ctx.save(); // Save default state (after drawing background)

        // Position context relative to the viewport on the document
        ctx.translate(-viewport.scrollX, -viewport.scrollY);

        // --- Draw Annotations ---
        drawings.forEach((d) => {
            ctx.save(); // Save state for this drawing
            ctx.strokeStyle = d.color || "#000000";
            ctx.fillStyle = d.color || "#000000";
            ctx.lineWidth = d.lineWidth || 1;
            ctx.setLineDash(d.lineDash || []);

            if (d.type === "pencil" && d.points?.length > 1) {
                ctx.beginPath();
                ctx.moveTo(d.points[0].x, d.points[0].y);
                for (let i = 1; i < d.points.length; i++) {
                    ctx.lineTo(d.points[i].x, d.points[i].y);
                }
                ctx.stroke();
            } else if (d.type === "rect") {
                if (typeof d.width === "number" && typeof d.height === "number") {
                   ctx.strokeRect(d.x, d.y, d.width, d.height);
                }
            } else if (d.type === "arrow") {
                ctx.beginPath();
                ctx.moveTo(d.x1, d.y1);
                ctx.lineTo(d.x2, d.y2);
                ctx.stroke();
                drawArrowheadBackground(ctx, d.x1, d.y1, d.x2, d.y2, 10 + (d.lineWidth || 1) * 2);
            } else if (d.type === "text") {
                const font = `${d.fontSize || '16px'} ${d.fontFamily || '"Virgil", "Helvetica Neue", Arial, sans-serif'}`;
                const textAlign = d.textAlign || 'left';
                const fontSizePx = parseInt(d.fontSize || '16px') || 16;
                const lineHeight = fontSizePx * 1.4;
                ctx.font = font;
                ctx.textAlign = textAlign;
                const yOffset = fontSizePx * 0.8;
                const lines = d.text.split("\n");
                lines.forEach((line, lineIndex) => {
                    ctx.fillText(line, d.x, d.y + (lineIndex * lineHeight) + yOffset);
                });
            }
            ctx.restore(); // Restore state after drawing this element
        }); // End forEach drawing

        ctx.restore(); // Restore original translated state

        // Convert canvas to Blob
        const finalBlob = await offscreenCanvas.convertToBlob({ type: "image/png" });
        return { blob: finalBlob, error: null };

    } catch (error) {
        console.error("Error drawing annotations on offscreen canvas:", error);
        let errorMessage = "Failed during annotation drawing.";
        if (error.message.includes("Failed to fetch")) {
            errorMessage = "Failed to load screenshot data for processing.";
        } else if (error.message.includes("createImageBitmap")) {
            errorMessage = "Failed to decode screenshot image.";
        }
        return { blob: null, error: errorMessage };
    }
}

// Arrowhead drawing for background context (unchanged)
function drawArrowheadBackground(ctx, fromX, fromY, toX, toY, headLength) {
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

// Add listener for extension install/update
chrome.runtime.onInstalled.addListener(() => {
console.log("Extension installed/updated.");
});

// Keep alive mechanism (optional)
// chrome.alarms.create('keepAlive', { periodInMinutes: 4.9 });
// chrome.alarms.onAlarm.addListener(alarm => {
//   if (alarm.name === 'keepAlive') { console.log('Keep alive alarm.'); }
// });

// State to track if drawing is active on a tab
const activeTabs = new Set();

// Listen for the extension icon click
chrome.action.onClicked.addListener((tab) => {
if (!tab.id) {
console.error("WebDraw: Tab ID not found.");
return;
}
const tabId = tab.id;

// Check current state for the tab
if (activeTabs.has(tabId)) {
// Send deactivate message
chrome.tabs.sendMessage(tabId, { action: "toggleWebDraw" }, (response) => {
if (chrome.runtime.lastError) {
console.log("WebDraw: Error sending toggle (deactivate):", chrome.runtime.lastError.message);
activeTabs.delete(tabId); // Clean up if error
} else if (response && !response.isActive) {
activeTabs.delete(tabId);
console.log("WebDraw deactivated on tab", tabId);
} else {
console.log("WebDraw: Deactivation message sent, but response indicated still active or error:", response);
// It might be stuck, try removing from activeTabs anyway?
// activeTabs.delete(tabId);
}
});
} else {
// Inject scripts and CSS, then send activate message
console.log("WebDraw: Injecting scripts into tab", tabId);
chrome.scripting.insertCSS({
target: { tabId: tabId },
files: ["content.css"],
}).then(() => {
return chrome.scripting.executeScript({
target: { tabId: tabId },
files: ["content.js"],
});
}).then(() => {
console.log("WebDraw: Scripts injected, sending toggle (activate) message.");
chrome.tabs.sendMessage(tabId, { action: "toggleWebDraw" }, (response) => {
if (chrome.runtime.lastError) {
console.log("WebDraw: Error sending toggle (activate) message:", chrome.runtime.lastError.message);
// Don't add to activeTabs if message failed
} else if (response && response.isActive) {
activeTabs.add(tabId);
console.log("WebDraw activated on tab", tabId);
} else {
console.log("WebDraw: Activation message sent, but response indicated not active or error:", response);
// Injection might have failed silently, or content script logic issue
}
});
}).catch((err) => {
console.error("WebDraw: Failed to inject script or CSS:", err);
// Potentially alert the user or log more details
});
}
});

// Clean up state when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
if (activeTabs.has(tabId)) {
activeTabs.delete(tabId);
console.log("WebDraw: Cleaned up state for closed tab", tabId);
}
});