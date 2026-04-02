module.exports = {
  plugins: [
    require('@csstools/postcss-oklab-function')(),
    require('postcss-color-function')({
      // Convert other color functions
    }),
    require('autoprefixer'),
  ],
};