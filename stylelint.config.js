export default {
  extends: ['stylelint-config-standard', 'stylelint-config-html/astro'],
  rules: {
    'declaration-no-important': true,
    'color-named': 'never',
  },
};
