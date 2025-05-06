module.exports = {
  // Run ESLint and Prettier on JS/TS files
  '**/*.(ts|tsx|js|jsx)': (filenames) => [
    `eslint --fix ${filenames.join(' ')}`,
    `prettier --write ${filenames.join(' ')}`,
  ],
  // Run Prettier on other files
  '**/*.(md|json)': (filenames) => `prettier --write ${filenames.join(' ')}`,
}; 