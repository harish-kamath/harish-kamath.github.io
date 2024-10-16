// Initialize medium zoom.
$(document).ready(function () {
  medium_zoom = mediumZoom('[data-zoomable]', {
    margin: 0,
    background: getComputedStyle(document.documentElement)
      .getPropertyValue('--global-bg-color') + 'ee',  // + 'ee' for trasparency.
  })
});
