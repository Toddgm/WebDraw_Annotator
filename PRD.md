## Web-draw in a nutshell

- This is a chrome plugin that for noting and commenting on content in opened website
- The main use case is that you can share with others on what you created via a link.

---

## Detailed features

**\*Note**:\*
_[x] means the feature is already covered in current version to some extent_
_[ ] means the feature needs to be implemented._

---

**Main window**

[x] - When this plugin is loaded and activated, the main window should appear on the left-top corner of the screen.

[ ] - This window can be dragged by user

**Tool list**

_Selection_
[x] - The first tool in the window enables user to select objects
[ ] - After the object is select, user can drag

_Pencil_
[x] - This allows user to make free hand drawing in anywhere on the website
[ ] - When the pencil is clicked, a sub window appears, it should have 3 sections

- stroke - defines what color to user
- width - how thick the line should be
- style - dotted line or solid

_Rectangle_
[x] - Allow user to draw a rectangle
[ ] - Same style settings as pencil, stroke, width and style

_Arrow_
[x] - Allow user to draw a pointed arrow
[ ] - Same style settings as pencil, stroke, width and style

_Text_
[x] - Allow user to draw a starting typing
[ ] - When user select text input, draw the input text box without borderlines
[ ] - style settings needs to have at least these items:

- Font family (make a few default options for now)
- Font Size(S, M, L)
- Text alignment

Remove the color palette button we have right now

---

**Utilities**

_Share_
[ ] - Add a share button that allow user to share what has been drawn on the current page
[ ] - When the button is click, a screenshot of the current window is capture and upload to a online place for image storage
[ ] - The image storage for now use api.Imgur.com. If any API keys need, put as a place-holder for now
[ ] - For prototyping aims, right now when the share button is click, fill a makeup link.
[ ] - When the link is created, copy it to clipboard. and message saying "Share link copied!"

_Delete_
[x] - A button to an object that under selection or remove all if nothing is select.
[ ] - message for confirmation for both cases.

_Close_
[x] - A button to exit this tool, shortcut as ESC.
