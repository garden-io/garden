module.exports = {
  "env": {
    "browser": true,
    "es6": true,
    "node": true
  },
  "extends": ["react-app"],
  "rules": {
    "@typescript-eslint/tslint/config": [
      "error",
      {
        "rulesDirectory": [
          "/Users/eysi/code/garden-io/garden/dashboard/node_modules/tslint-react/rules",
          "/Users/eysi/code/garden-io/garden/dashboard/node_modules/tslint-microsoft-contrib"
        ],
        "rules": {
          // Override tslint-react rules here
          "jsx-alignment": true,
          "jsx-boolean-value": [
            true,
            "never"
          ],
          "jsx-curly-spacing": [
            true,
            "never"
          ],
          "jsx-equals-spacing": [
            true,
            "never"
          ],
          "jsx-key": true,
          "jsx-no-bind": true,
          "jsx-no-lambda": true,
          "jsx-no-string-ref": true,
          "jsx-self-close": true,
          "jsx-space-before-trailing-slash": true,
          "jsx-wrap-multiline": true,
          // From tslint-microsoft-contrib rules directory
          "react-unused-props-and-state": true,
          "react-this-binding-issue": true,
        }
      }
    ]
  },
  "globals": {},
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
      "project": "tsconfig.json",
      "sourceType": "module"
  },
  "plugins": [
      "@typescript-eslint",
      "@typescript-eslint/tslint"
  ],
  "settings": {
      "react": {
          "version": "detect"
      }
  }
};
