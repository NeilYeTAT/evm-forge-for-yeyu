/** @type {import('prettier').Config} */
export default {
  arrowParens: 'avoid',
  printWidth: 100,
  singleQuote: true,
  plugins: ['prettier-plugin-tailwindcss'],
  tailwindFunctions: ['cva', 'cx', 'cn'],
  // ye:del
  // If the project is solo or personally led, set `semi` to false.
  // For team projects, set it to true to minimize differences with others.
  semi: false,
}
