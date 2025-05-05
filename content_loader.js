// This script is injected immediately on page load (as per manifest).
// It just sits and waits for the activation message from the background script.

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggleWebDraw") {
    // Check if the main content script's functions/objects already exist
    if (typeof window.webDrawToggle === 'function') {
      // If yes, call the toggle function
      window.webDrawToggle().then(isActive => {
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