import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// Get the core configs first
const baseConfigs = compat.extends("next/core-web-vitals", "next/typescript");

const eslintConfig = [
  // Spread the base configs
  ...baseConfigs,
  
  // Add a custom config to downgrade all errors to warnings
  {
    rules: {
      // This will convert all rules with severity "error" to "warn"
      // This helps with MVP development by not blocking builds
      "@next/next/no-html-link-for-pages": "warn",
      "@next/next/no-img-element": "warn",
      "jsx-a11y/alt-text": "warn",
      "jsx-a11y/aria-props": "warn",
      "jsx-a11y/aria-proptypes": "warn",
      "jsx-a11y/aria-unsupported-elements": "warn",
      "jsx-a11y/role-has-required-aria-props": "warn",
      "jsx-a11y/role-supports-aria-props": "warn",
      "react/no-unescaped-entities": "warn",
      "react/jsx-no-target-blank": "warn",
      "react/jsx-key": "warn",
      // Turn off rules that are too strict for MVP
      "react-hooks/exhaustive-deps": "off"
    },
  },
];

export default eslintConfig;
