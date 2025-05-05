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
           console.log("WebDraw: Content script might not be ready yet or tab closed.");
           activeTabs.delete(tabId); // Clean up if error
       } else if (response && !response.isActive) {
           activeTabs.delete(tabId);
           console.log("WebDraw deactivated on tab", tabId);
       }
    });
  } else {
    // If not active, inject the main content script and CSS
    console.log("WebDraw: Injecting scripts into tab", tabId);
    chrome.scripting.insertCSS({
      target: { tabId: tabId },
      files: ["content.css"]
    })
    .then(() => {
      return chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content.js"]
      });
    })
    .then(() => {
      // Send activation message *after* injection is complete
      chrome.tabs.sendMessage(tabId, { action: "toggleWebDraw" }, (response) => {
        if (chrome.runtime.lastError) {
           console.log("WebDraw: Error sending toggle message:", chrome.runtime.lastError.message);
        } else if (response && response.isActive) {
           activeTabs.add(tabId);
           console.log("WebDraw activated on tab", tabId);
        } else {
            console.log("WebDraw: Injection might have succeeded but activation failed in content script.");
        }
      });
    })
    .catch(err => console.error("WebDraw: Failed to inject script or CSS:", err));
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
            console.log("WebDraw: State updated, drawing deactivated on tab", sender.tab.id);
        }
        sendResponse({ status: "acknowledged" });
        return true;
    }
    // Handle other messages if needed
});