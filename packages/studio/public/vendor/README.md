# vendor/

The Model Arena embed lives here (`model-arena/`): one ES module from a sibling repository with the key panel (`<arena-key>`), the generate function (`generateFromGuide()`), a result player that follows the page's clock (`<arena-player>`) and the gallery (`<arena-gallery>`), themed through the page's CSS variables. The page loads it by a relative URL; without it, the key slot shows a placeholder and Generate says so.

Where they mount: the key slot in the header (`#keySlot`), the output pane beside the preview (`#generateSlot`) and the Gallery (`#gallerySlot`). Generate passes `generateFromGuide()` the guide from `exportGuideInMemory()` (every bundle file as a Blob), the reference images and the shot description; a model receives only those.

Nothing here is built by this repository; files placed here are served as they are.

## Vendored

`model-arena/` is a copy of the sibling repository's `dist/embed/` (Model Arena embed: `<arena-key>`, `generateFromGuide()`, `offeredModels()`, `composePrompt()`, `<arena-player>`, `<arena-gallery>`), source commit `1ab1342`, 239 kB, copied 2026-11-13 by `npm run vendor:arena`. Do not edit it here: change the sibling repository and copy again.
