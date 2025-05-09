// background.js (MV3 Service Worker Module)

// Import Supabase client library dynamically
// Make sure you have installed it if using npm: npm install @supabase/supabase-js
// If not using npm, you might need to vendor the library or use a CDN import mechanism if allowed by MV3 policies.
let supabase;
const SUPABASE_URL = "https://fwvgrrghvlxdgbauogss.supabase.co"; // <-- REPLACE with your Supabase URL
const SUPABASE_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3dmdycmdodmx4ZGdiYXVvZ3NzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjUwMTIzMSwiZXhwIjoyMDYyMDc3MjMxfQ.QSphN9QRipBAKt7uNqIUpQjSqKj_ikdGDKghnTBO1TA"; // <-- REPLACE with your Service Role Key (KEEP SECRET)
const SUPABASE_IMAGE_BUCKET = "webdraw-images"; // <-- REPLACE with your bucket name

async function initializeSupabase() {
  if (!supabase) {
    try {
      // Dynamic import requires the script to be a module ("type": "module" in manifest)
      const { createClient } = await import(
        "./node_modules/@supabase/supabase-js/dist/module/index.js"
      );
      // ^^^ Adjust path if using npm/bundler or if vendored differently

      // If not using npm, consider fetching from CDN if possible or vendoring:
      // Example using Skypack CDN (check MV3 compatibility for external scripts):
      // const { createClient } = await import('https://cdn.skypack.dev/@supabase/supabase-js');

      if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
        supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
          // Optional: Add storage options if needed
          // storage: {
          //   retryAttempts: 3,
          // },
        });
        console.log("Supabase client initialized.");
      } else {
        console.error("Supabase URL or Service Key is missing.");
      }
    } catch (e) {
      console.error("Failed to import or initialize Supabase client:", e);
    }
  }
  return supabase;
}

// Listener for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Ensure Supabase is initialized before handling requests that need it
  initializeSupabase()
    .then((supabaseClient) => {
      if (
        !supabaseClient &&
        (request.action === "createShareLink" ||
          request.action === "createImageLink")
      ) {
        sendResponse({ error: "Backend service not initialized." });
        return; // Stop if Supabase isn't ready
      }

      // Handle different actions
      if (request.action === "createShareLink") {
        handleCreateShareLink(request.data, supabaseClient)
          .then((response) => sendResponse(response))
          .catch((error) =>
            sendResponse({
              error: error.message || "Unknown error creating share link.",
            })
          );
        return true; // Indicates async response
      } else if (request.action === "createImageLink") {
        handleCreateImageLink(request.data, sender.tab.id, supabaseClient)
          .then((response) => sendResponse(response))
          .catch((error) =>
            sendResponse({
              error: error.message || "Unknown error creating image link.",
            })
          );
        return true; // Indicates async response
      }
      // --- Add listeners for fetchSharedData etc. if implementing viewing ---
      else if (request.action === "saveDrawingData") {
        // Keep conceptual one
        console.log(
          "Background: Received conceptual data to save",
          request.data
        );
        sendResponse({ status: "received by background (conceptual)" });
      } else if (request.action === "drawingDeactivated") {
        console.log(
          "Background: Drawing deactivated message received from tab:",
          sender.tab?.id
        );
        // Potentially update background state if needed
        sendResponse({ status: "acknowledged" });
      }
      // else: handle other actions if any
    })
    .catch((initError) => {
      // Handle Supabase initialization error specifically
      console.error(
        "Failed to initialize Supabase before handling message:",
        initError
      );
      sendResponse({ error: "Backend service initialization failed." });
    });

  // Return true for all message types you intend to respond to asynchronously
  if (
    request.action === "createShareLink" ||
    request.action === "createImageLink" ||
    request.action === "saveDrawingData" ||
    request.action === "drawingDeactivated"
  ) {
    return true;
  }
});

// --- Share Link Logic ---
async function handleCreateShareLink(data, supabase) {
  console.log("handleCreateShareLink: Received data:", data);
  if (!data || !data.originalUrl || !data.drawings) {
    return { error: "Invalid data received for creating share link." };
  }

  try {
    const { data: insertData, error: insertError } = await supabase
      .from("shared_annotations") // Use your table name
      .insert({
        original_url: data.originalUrl,
        drawings: data.drawings, // Assumes drawings is JSONB compatible
      })
      .select("id") // Select the ID of the inserted row
      .single(); // Expect only one row back

    if (insertError) {
      console.error("Supabase insert error:", insertError);
      return { error: `Database error: ${insertError.message}` };
    }

    if (!insertData || !insertData.id) {
      return { error: "Failed to retrieve ID after insert." };
    }

    const uniqueId = insertData.id;
    const originalUrl = data.originalUrl;
    const shareableLink =
      originalUrl +
      (originalUrl.includes("?") ? "&" : "?") +
      "webDrawShareId=" +
      uniqueId;

    console.log("Share link generated:", shareableLink);
    return { shareableLink: shareableLink };
  } catch (e) {
    console.error("Error in handleCreateShareLink:", e);
    return { error: e.message || "An unexpected error occurred." };
  }
}

// --- Share Image Link Logic ---
async function handleCreateImageLink(data, tabId, supabase) {
  console.log("handleCreateImageLink: Received data:", data);
  if (!data || !data.drawings || !data.viewport) {
    return { error: "Invalid data received for creating image link." };
  }

  try {
    // 1. Capture Visible Tab
    const screenshotDataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: "png",
    });
    console.log("Screenshot captured.");

    // 2. Create Offscreen Canvas & Draw
    const imageData = await drawAnnotationsOnScreenshot(
      screenshotDataUrl,
      data.drawings,
      data.viewport
    );
    if (!imageData.blob) {
      throw new Error(imageData.error || "Failed to generate image blob.");
    }
    console.log("Annotations drawn on screenshot.");

    // 3. Upload to Supabase Storage
    const uniqueFilename = `${crypto.randomUUID()}.png`; // Generate unique name
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(SUPABASE_IMAGE_BUCKET) // Your bucket name
      .upload(uniqueFilename, imageData.blob, {
        cacheControl: "3600", // Cache for 1 hour
        upsert: false, // Don't overwrite existing (shouldn't happen with UUID)
      });

    if (uploadError) {
      console.error("Supabase storage upload error:", uploadError);
      return { error: `Storage upload error: ${uploadError.message}` };
    }
    console.log("Image uploaded:", uploadData);

    // 4. Get Public URL
    const { data: urlData } = supabase.storage
      .from(SUPABASE_IMAGE_BUCKET)
      .getPublicUrl(uniqueFilename);

    if (!urlData || !urlData.publicUrl) {
      // Attempt to manually construct URL if needed, but getPublicUrl is preferred
      console.warn(
        "Failed to get public URL via API, constructing manually (check bucket permissions)."
      );
      // const manualUrl = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_IMAGE_BUCKET}/${uniqueFilename}`;
      // return { imageUrl: manualUrl };
      return { error: "Failed to get public URL for the uploaded image." };
    }
    console.log("Public image URL:", urlData.publicUrl);

    // 5. Return URL
    return { imageUrl: urlData.publicUrl };
  } catch (e) {
    console.error("Error in handleCreateImageLink:", e);
    // Check for specific capture errors
    if (
      e.message.includes("Cannot access contents of url") ||
      e.message.includes("Cannot capture page")
    ) {
      return {
        error:
          "Cannot capture this page (e.g., chrome://, file://, or protected pages).",
      };
    }
    return {
      error:
        e.message || "An unexpected error occurred creating the image link.",
    };
  }
}

// Helper to draw annotations onto the screenshot
async function drawAnnotationsOnScreenshot(
  screenshotDataUrl,
  drawings,
  viewport
) {
  return new Promise((resolve) => {
    const offscreenCanvas = new OffscreenCanvas(
      viewport.width,
      viewport.height
    );
    const ctx = offscreenCanvas.getContext("2d");
    if (!ctx) {
      return resolve({
        blob: null,
        error: "Failed to get OffscreenCanvas context.",
      });
    }

    const img = new Image();
    img.onload = async () => {
      try {
        // Draw screenshot background
        ctx.drawImage(img, 0, 0, viewport.width, viewport.height);

        // --- Draw Annotations ---
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        drawings.forEach((d) => {
          // Set styles for this drawing
          ctx.strokeStyle = d.color || "#000000";
          ctx.fillStyle = d.color || "#000000";
          ctx.font = d.font || "16px sans-serif";
          ctx.lineWidth = d.lineWidth || 1;

          // Convert DOC coords to VIEWPORT coords for drawing on screenshot
          const getViewportX = (docX) => docX - viewport.scrollX;
          const getViewportY = (docY) => docY - viewport.scrollY;

          // Check if drawing is visible (simple bounds check) - Optional but good
          // let bounds = getDrawingBounds(d); // Need to adapt getDrawingBounds or re-implement simply here
          // if (!bounds || bounds.x + bounds.width < viewport.scrollX || bounds.x > viewport.scrollX + viewport.width || ...) continue;

          if (d.type === "pencil" && d.points?.length > 1) {
            ctx.beginPath();
            let firstPoint = d.points[0];
            ctx.moveTo(getViewportX(firstPoint.x), getViewportY(firstPoint.y));
            for (let i = 1; i < d.points.length; i++) {
              ctx.lineTo(
                getViewportX(d.points[i].x),
                getViewportY(d.points[i].y)
              );
            }
            ctx.stroke();
          } else if (d.type === "rect") {
            if (typeof d.width === "number" && typeof d.height === "number") {
              ctx.strokeRect(
                getViewportX(d.x),
                getViewportY(d.y),
                d.width,
                d.height
              );
            }
          } else if (d.type === "arrow") {
            const startX = getViewportX(d.x1);
            const startY = getViewportY(d.y1);
            const endX = getViewportX(d.x2);
            const endY = getViewportY(d.y2);
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
            // Need drawArrowhead logic adapted here or passed in
            drawArrowheadBackground(
              ctx,
              startX,
              startY,
              endX,
              endY,
              10 + (d.lineWidth || 1) * 2
            );
          } else if (d.type === "text") {
            const lines = d.text.split("\n");
            const fontSize = parseInt(ctx.font) || 16;
            const lineHeight = fontSize * 1.4;
            const startX = getViewportX(d.x);
            const startY = getViewportY(d.y);
            lines.forEach((line, lineIndex) => {
              ctx.fillText(line, startX, startY + lineIndex * lineHeight);
            });
          }
        }); // End forEach drawing

        // Convert canvas to Blob
        const blob = await offscreenCanvas.convertToBlob({ type: "image/png" });
        resolve({ blob: blob, error: null });
      } catch (drawError) {
        console.error(
          "Error drawing annotations on offscreen canvas:",
          drawError
        );
        resolve({ blob: null, error: "Failed during annotation drawing." });
      }
    }; // End img.onload

    img.onerror = (err) => {
      console.error("Failed to load screenshot image:", err);
      resolve({ blob: null, error: "Failed to load screenshot." });
    };
    img.src = screenshotDataUrl;
  }); // End Promise
}

// Simplified Arrowhead drawing for background context (can't use main ctx)
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

// Add listener for extension install/update to ensure Supabase client is ready
chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed/updated. Initializing Supabase...");
  initializeSupabase();
});

// Optional: Keep alive mechanism if needed for long operations, though capture/upload should be fast enough
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

  // Check if the content script is already active for this tab
  if (activeTabs.has(tabId)) {
    // If active, send a message to deactivate
    chrome.tabs.sendMessage(tabId, { action: "toggleWebDraw" }, (response) => {
      if (chrome.runtime.lastError) {
        console.log(
          "WebDraw: Content script might not be ready yet or tab closed."
        );
        activeTabs.delete(tabId); // Clean up if error
      } else if (response && !response.isActive) {
        activeTabs.delete(tabId);
        console.log("WebDraw deactivated on tab", tabId);
      }
    });
  } else {
    // If not active, inject the main content script and CSS
    console.log("WebDraw: Injecting scripts into tab", tabId);
    chrome.scripting
      .insertCSS({
        target: { tabId: tabId },
        files: ["content.css"],
      })
      .then(() => {
        return chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ["content.js"],
        });
      })
      .then(() => {
        // Send activation message *after* injection is complete
        chrome.tabs.sendMessage(
          tabId,
          { action: "toggleWebDraw" },
          (response) => {
            if (chrome.runtime.lastError) {
              console.log(
                "WebDraw: Error sending toggle message:",
                chrome.runtime.lastError.message
              );
            } else if (response && response.isActive) {
              activeTabs.add(tabId);
              console.log("WebDraw activated on tab", tabId);
            } else {
              console.log(
                "WebDraw: Injection might have succeeded but activation failed in content script."
              );
            }
          }
        );
      })
      .catch((err) =>
        console.error("WebDraw: Failed to inject script or CSS:", err)
      );
  }
});

// Optional: Clean up state when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeTabs.has(tabId)) {
    activeTabs.delete(tabId);
    console.log("WebDraw: Cleaned up state for closed tab", tabId);
  }
});

// Listen for messages from content script (e.g., for sharing later)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "saveDrawingData") {
    // In a real app, send data to backend here
    console.log("Background: Received data to save (Conceptual)", request.data);
    // For now, just acknowledge
    sendResponse({ status: "received by background (not saved)" });
    return true; // Indicates async response possible (though not used here)
  } else if (request.action === "drawingDeactivated") {
    // Update state if content script deactivates itself (e.g., via ESC)
    if (sender.tab && sender.tab.id && activeTabs.has(sender.tab.id)) {
      activeTabs.delete(sender.tab.id);
      console.log(
        "WebDraw: State updated, drawing deactivated on tab",
        sender.tab.id
      );
    }
    sendResponse({ status: "acknowledged" });
    return true;
  }
  // Handle other messages if needed
});
