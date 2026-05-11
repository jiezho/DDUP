import type { Preview } from "@storybook/react";

import "../src/styles/tokens.css";
import "../src/styles/global.css";

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    backgrounds: {
      default: "App",
      values: [
        { name: "App", value: "linear-gradient(180deg, #f7f3e8 0%, #eef3ec 100%)" },
        { name: "White", value: "#ffffff" }
      ]
    }
  }
};

export default preview;

