// background.js (MV3 Service Worker Module)

// Listener for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle different actions
  if (request.action === "saveDrawingData") {
    // Keep conceptual one
    console.log("Background: Received conceptual data to save", request.data);
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

  // Return true for message types you intend to respond to asynchronously
  // or if sendResponse is used, even if synchronously for clarity/consistency.
  if (
    request.action === "saveDrawingData" ||
    request.action === "drawingDeactivated"
  ) {
    return true;
  }
});

// Add listener for extension install/update
chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed/updated.");
  // Place any non-Supabase initialization here if needed in the future
});

// Optional: Keep alive mechanism if needed for long operations
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

// Note: The second chrome.runtime.onMessage.addListener that was previously at the end
// has been removed as its functionality is covered by the primary listener above.
