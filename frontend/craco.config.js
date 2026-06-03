// craco.config.js
// Suppresses the @mediapipe/tasks-vision source map warning
// without ejecting Create React App
module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // 1. Exclude node_modules from source-map-loader entirely
      webpackConfig.module.rules.forEach((rule) => {
        if (rule.oneOf) {
          rule.oneOf.forEach((oneOfRule) => {
            if (
              oneOfRule.loader &&
              oneOfRule.loader.includes('source-map-loader')
            ) {
              oneOfRule.exclude = /node_modules/;
            }
            if (Array.isArray(oneOfRule.use)) {
              oneOfRule.use.forEach((use) => {
                if (use.loader && use.loader.includes('source-map-loader')) {
                  oneOfRule.exclude = /node_modules/;
                }
              });
            }
          });
        }
      });

      // 2. Ignore source-map warnings from mediapipe
      if (!webpackConfig.ignoreWarnings) {
        webpackConfig.ignoreWarnings = [];
      }
      webpackConfig.ignoreWarnings.push(/Failed to parse source map/);

      return webpackConfig;
    },
  },
};
