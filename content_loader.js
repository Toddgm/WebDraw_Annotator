// FILE: content_loader.js
// This script is injected immediately on page load (as per manifest).
// It just sits and waits for the activation message from the background script.

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggleWebDraw") {
    // Check if the main content script's functions/objects already exist
    if (typeof window.webDrawToggle === 'function') {
      // If yes, call the toggle function
      // Use try-catch in case webDrawToggle throws an error during init/deinit
      try {
          window.webDrawToggle().then(isActive => {
             console.log("WebDraw Loader: Toggle complete. New state:", isActive);
             sendResponse({ isActive: isActive });
          }).catch(toggleError => {
              console.error("WebDraw Loader: Error during toggle execution:", toggleError);
              sendResponse({ isActive: false, error: "Toggle function failed." });
          });
      } catch (syncError) {
          console.error("WebDraw Loader: Synchronous error calling toggle:", syncError);
           sendResponse({ isActive: false, error: "Error calling toggle function." });
      }
      return true; // Indicates async response is intended
    } else {
        // If not, it means content.js hasn't been injected or loaded yet.
        // The background script handles the injection.
        // We send back a negative response or let background handle the promise rejection.
        console.log("WebDraw Loader: Main script (window.webDrawToggle) not ready yet.");
        // Let background know we can't toggle yet (it should handle injection first)
         sendResponse({ isActive: false, error: "Main script not loaded." });
         // Return false here as we responded synchronously.
         return false;
    }
  }
  // Optional: handle other messages if needed in the future
});

// We avoid loading the heavy content.js until the user clicks the icon.
console.log("WebDraw Loader: Ready and waiting for activation.");