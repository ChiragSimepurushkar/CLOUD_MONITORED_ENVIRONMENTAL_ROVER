// craco.config.js
// Suppresses the @mediapipe/tasks-vision source map warning
// without ejecting Create React App
module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Find and patch the source-map-loader rule to exclude node_modules
      webpackConfig.module.rules.forEach((rule) => {
        if (rule.oneOf) {
          rule.oneOf.forEach((oneOfRule) => {
            if (
              oneOfRule.loader &&
              oneOfRule.loader.includes('source-map-loader')
            ) {
              oneOfRule.exclude = /node_modules/;
            }
            // Also handle use arrays
            if (Array.isArray(oneOfRule.use)) {
              oneOfRule.use.forEach((use) => {
                if (use.loader && use.loader.includes('source-map-loader')) {
                  use.options = use.options || {};
                  oneOfRule.exclude = /node_modules/;
                }
              });
            }
          });
        }
      });
      return webpackConfig;
    },
  },
};
