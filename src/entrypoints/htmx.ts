export * from "npm:htmx.org@2.0.4"

// Allows CSS to hide interactive elements until HTMX is loaded:
document.getElementsByTagName("body").item(0)?.classList.add("htmxLoaded")