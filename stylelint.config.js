export default {
  extends: ['stylelint-config-standard', 'stylelint-config-html/astro'],
  rules: {
    'declaration-no-important': true,
    'color-named': 'never',
    // BEM: block, block__element, block--modifier (all kebab-case).
    'selector-class-pattern': [
      '^[a-z][a-z0-9]*(-[a-z0-9]+)*(__[a-z0-9]+(-[a-z0-9]+)*)?(--[a-z0-9]+(-[a-z0-9]+)*)?$',
      { message: 'Use kebab-case BEM class names (block__element--modifier).' },
    ],
    // Astro scoped styles reach child components through :global().
    'selector-pseudo-class-no-unknown': [true, { ignorePseudoClasses: ['global'] }],
  },
};
