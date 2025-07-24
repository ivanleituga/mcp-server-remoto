import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  { files: ["**/*.{js,mjs,cjs}"], plugins: { js }, extends: ["js/recommended"] },
  { files: ["**/*.js"], languageOptions: { sourceType: "commonjs" } },
  { 
    files: ["**/*.{js,mjs,cjs}"], 
    languageOptions: { 
      globals: globals.node  // Mudou de browser para node!
    },
    rules: {
      "eqeqeq": ["warn", "always"],
      "no-var": "warn",
      "prefer-const": "warn",
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
      "no-console": "off",
      "semi": ["warn", "always"],
      "quotes": ["warn", "double"],
      "indent": ["warn", 2]
    }
  }
]);
