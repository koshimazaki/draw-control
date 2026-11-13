# vendor/

A built embed file will be placed here: one ES module, produced in a sibling repository, that defines three custom elements for the Beat Path page (a key panel, `<arena-generate>` and a gallery player), themed through the page's CSS variables.

The page reserves where they mount: the key slot in the header (`#keySlot`), the Generate section (`#generateSlot`) and the Gallery section (`#gallerySlot`). The Generate element reads the guide from `window.beatPath.exportGuideInMemory()` (every bundle file as a Blob, the same content as *Export guide*) and the shot description from `recipe.json` (`shot`: subject, environment, action, legend).

Nothing here is built by this repository; files placed here are served as they are.
