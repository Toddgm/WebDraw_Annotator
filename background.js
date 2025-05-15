// FILE: background.js
// background.js (MV3 Service Worker Module)

// --- Cloudinary Configuration ---
const CLOUDINARY_CLOUD_NAME = "duyfzazya"; // <--- REPLACE THIS
const CLOUDINARY_UPLOAD_PRESET = "webdraw_unsigned";

let fontsLoaded = false; // Flag to ensure fonts are loaded once

async function loadCustomFonts() {
    if (fontsLoaded) return true;
    try {
        const virgilFont = new FontFace('Virgil', `url(${chrome.runtime.getURL('fonts/Virgil.woff2')})`);
        const bigBlueFont = new FontFace('WebDrawNerdFont', `url(${chrome.runtime.getURL('fonts/BigBlueTermPlus.ttf')})`);

        await Promise.all([virgilFont.load(), bigBlueFont.load()]);

        self.fonts.add(virgilFont);
        self.fonts.add(bigBlueFont);
        fontsLoaded = true;
        console.log("WebDraw BG: Custom fonts loaded for service worker.");
        return true;
    } catch (e) {
        console.error("WebDraw BG: Failed to load custom fonts in service worker:", e);
        return false; // Indicate failure
    }
}

// Call it once when the service worker starts to try and load fonts early.
// However, access to chrome.runtime.getURL might be better timed, so we'll ensure it's loaded before use.
loadCustomFonts();


// Listener for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
if (request.action === "createShareImage") {
handleCreateImageLink(request.data, sender.tab.id)
.then(response => sendResponse(response))
.catch(error => {
                console.error("Error during createShareImage message handling:", error);
                sendResponse({ error: error.message || "Unknown error creating image link in listener." })
            });
return true; // Indicates async response
} else if (request.action === "saveDrawingData") {
console.log("Background: Received conceptual data to save", request.data);
sendResponse({ status: "received by background (conceptual)" });
return true;
} else if (request.action === "drawingDeactivated") {
console.log("Background: Drawing deactivated message received from tab:", sender.tab?.id);
activeTabs.delete(sender.tab?.id);
sendResponse({ status: "acknowledged" });
return true;
}
});

// --- Share Image Link Logic (Adapted for Cloudinary) ---
async function handleCreateImageLink(data, tabId) {
console.log("BG: handleCreateImageLink: Received data:", data);
if (!data || !data.drawings || !data.viewport) {
return { error: "Invalid data received for creating image link." };
}

    // Ensure fonts are loaded before proceeding with canvas operations
    const fontsAreReady = await loadCustomFonts();
    if (!fontsAreReady) {
        // Potentially try to alert the user or fallback if font loading is critical
        console.warn("BG: Custom fonts failed to load. Screenshot text rendering might be affected.");
        // Proceeding anyway, browser might use fallbacks.
    }


if (!CLOUDINARY_CLOUD_NAME || CLOUDINARY_CLOUD_NAME === "YOUR_CLOUD_NAME_PLACEHOLDER" || !CLOUDINARY_UPLOAD_PRESET) {
    console.warn("BG: Cloudinary configuration is incomplete. Returning placeholder error.");
    return { imageUrl: "https://res.cloudinary.com/demo/image/upload/sample.jpg", note: "Cloudinary not fully configured." };
}

try {
    // 1. Capture Visible Tab
    const screenshotDataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
    console.log("BG: Screenshot captured.");

    // 2. Create Offscreen Canvas & Draw Annotations
    const imageData = await drawAnnotationsOnScreenshot(screenshotDataUrl, data.drawings, data.viewport);
    if (!imageData.blob) {
        throw new Error(imageData.error || "Failed to generate image blob.");
    }
    console.log("BG: Annotations drawn on screenshot blob created.");

    // 3. Upload to Cloudinary
    const formData = new FormData();
    formData.append('file', imageData.blob);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    console.log("BG: Uploading to Cloudinary...");
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: formData,
    });

    const result = await response.json();

    if (!response.ok || result.error) {
        console.error("BG: Cloudinary upload failed:", result);
        throw new Error(`Cloudinary upload failed: ${result.error?.message || response.statusText || 'Unknown error'}`);
    }

    console.log("BG: Image uploaded successfully to Cloudinary:", result);

    if (!result.secure_url) {
        throw new Error("Cloudinary response did not contain secure_url image link.");
    }

    return { imageUrl: result.secure_url };

} catch (e) {
    console.error("BG: Error in handleCreateImageLink:", e);
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

        const response = await fetch(screenshotDataUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch screenshot data: ${response.statusText}`);
        }
        const imageBlob = await response.blob();
        const imageBitmap = await createImageBitmap(imageBlob);

        ctx.drawImage(imageBitmap, 0, 0, viewport.width, viewport.height);
        imageBitmap.close();

        ctx.save();
        ctx.translate(-viewport.scrollX, -viewport.scrollY);

        drawings.forEach((d) => {
            ctx.save();
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
                // Use fontFamily string directly as stored in drawing object
                const font = `${d.fontSize || '16px'} ${d.fontFamily || '"Virgil", "Helvetica Neue", Arial, sans-serif'}`;
                const textAlign = d.textAlign || 'left';
                const fontSizePx = parseInt(d.fontSize || '16px') || 16;
                const lineHeight = fontSizePx * 1.4;
                ctx.font = font; // Apply font before measuring or drawing
                ctx.textAlign = textAlign;
                const yOffset = fontSizePx * 0.8;
                const lines = d.text.split("\n");
                lines.forEach((line, lineIndex) => {
                    ctx.fillText(line, d.x, d.y + (lineIndex * lineHeight) + yOffset);
                });
            }
            ctx.restore();
        });

        ctx.restore(); // Restore from the -scrollX, -scrollY translation

        // Add "Powered by WebDraw" watermark
        const watermarkText = "Powered by WebDraw@2025 ❤️"; // Using a literal heart emoji
        ctx.font = "bold 12px Arial"; // Using a common safe font for watermark
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.textAlign = "right";
        ctx.textBaseline = "alphabetic"; // common baseline
        const margin = 10;
        ctx.fillText(watermarkText, viewport.width - margin, viewport.height - margin);

        const finalBlob = await offscreenCanvas.convertToBlob({ type: "image/png" });
        return { blob: finalBlob, error: null };

    } catch (error) {
        console.error("BG: Error drawing annotations on offscreen canvas:", error);
        let errorMessage = "Failed during annotation drawing.";
        if (error.message.includes("Failed to fetch")) errorMessage = "Failed to load screenshot data for processing.";
        else if (error.message.includes("createImageBitmap")) errorMessage = "Failed to decode screenshot image.";
        return { blob: null, error: errorMessage };
    }
}

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

chrome.runtime.onInstalled.addListener(() => {
console.log("BG: Extension installed/updated.");
fontsLoaded = false; // Reset flag on update in case font files changed
loadCustomFonts(); // Attempt to load fonts on install/update
});

const activeTabs = new Set();

chrome.action.onClicked.addListener((tab) => {
if (!tab.id) {
console.error("WebDraw BG: Tab ID not found.");
return;
}
const tabId = tab.id;

if (activeTabs.has(tabId)) {
chrome.tabs.sendMessage(tabId, { action: "toggleWebDraw" }, (response) => {
if (chrome.runtime.lastError) {
console.log("WebDraw BG: Error sending toggle (deactivate):", chrome.runtime.lastError.message);
activeTabs.delete(tabId);
} else if (response && !response.isActive) {
activeTabs.delete(tabId);
console.log("WebDraw BG: Deactivated on tab", tabId);
} else {
console.log("WebDraw BG: Deactivation message sent, but response indicated still active or error:", response);
}
});
} else {
console.log("WebDraw BG: Injecting scripts into tab", tabId);
chrome.scripting.insertCSS({
target: { tabId: tabId },
files: ["content.css"],
}).then(() => {
return chrome.scripting.executeScript({
target: { tabId: tabId },
files: ["content.js"],
});
}).then(() => {
console.log("WebDraw BG: Scripts injected, sending toggle (activate) message.");
chrome.tabs.sendMessage(tabId, { action: "toggleWebDraw" }, (response) => {
if (chrome.runtime.lastError) {
console.log("WebDraw BG: Error sending toggle (activate) message:", chrome.runtime.lastError.message);
} else if (response && response.isActive) {
activeTabs.add(tabId);
console.log("WebDraw BG: Activated on tab", tabId);
} else {
console.log("WebDraw BG: Activation message sent, but response indicated not active or error:", response);
}
});
}).catch((err) => {
console.error("WebDraw BG: Failed to inject script or CSS:", err);
});
}
});

chrome.tabs.onRemoved.addListener((tabId) => {
if (activeTabs.has(tabId)) {
activeTabs.delete(tabId);
console.log("WebDraw BG: Cleaned up state for closed tab", tabId);
}
});