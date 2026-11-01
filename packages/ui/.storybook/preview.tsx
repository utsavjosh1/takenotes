import type { Decorator, Preview } from "@storybook/react-vite";
import "../src/tokens.css";
import "../src/dom/styles.css";
import "./preview.css";

/** Pins data-theme from the toolbar (or ?globals=theme:dark) so stories and
 * the screenshot tests render both themes the same way apps do. */
const withTheme: Decorator = (Story, context) => {
  document.documentElement.dataset.theme = context.globals.theme === "dark" ? "dark" : "light";
  return <div className="sb-surface"><Story /></div>;
};

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: { description: "Theme", toolbar: { icon: "circlehollow", items: ["light", "dark"], dynamicTitle: true } },
  },
  initialGlobals: { theme: "light" },
  parameters: { layout: "fullscreen", controls: { disable: true }, actions: { disable: true } },
};
export default preview;
