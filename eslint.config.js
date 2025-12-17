import eslint from "@eslint/js"
import tseslint from "typescript-eslint"
import importX from "eslint-plugin-import-x"
import eslintConfigPrettier from "eslint-config-prettier"
import globals from "globals"

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  eslintConfigPrettier,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: {
      "import-x": importX
    },
    rules: {
      // Allow underscore-prefixed unused vars
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],

      // Import rules
      "import-x/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "index", "type"],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true }
        }
      ],
      "import-x/no-duplicates": "error",
      "import-x/first": "error",
      "import-x/newline-after-import": "error",

      // General code quality
      "no-console": "warn",
      eqeqeq: ["error", "always"],
      curly: ["error", "all"],
      "no-else-return": "error",
      "no-lonely-if": "error",
      "prefer-const": "error",
      "no-var": "error",
      "object-shorthand": "error",
      "prefer-arrow-callback": "error",
      "prefer-template": "error",
      "no-nested-ternary": "error",
      "no-unneeded-ternary": "error"
    }
  },
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/node_modules/**",
      "**/.react-router/**",
      "**/.source/**",
      "**/*.config.js",
      "**/*.config.ts",
      // Fumadocs uses generated types that conflict with strict type checking
      "packages/docs/**"
    ]
  }
)
