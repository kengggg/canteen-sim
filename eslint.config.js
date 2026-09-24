import tseslint from 'typescript-eslint';

const ALLOWED_MATH = ['sqrt', 'floor', 'ceil', 'round', 'trunc', 'abs', 'min', 'max', 'sign', 'imul', 'fround', 'clz32'];

export default tseslint.config(
  { ignores: ['node_modules', 'dist', 'coverage'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/sim/**/*.ts', 'src/config/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: "BinaryExpression[operator='**']", message: '`**` is not deterministic across engines; use repeated multiplication or dmath.' },
        { selector: "AssignmentExpression[operator='**=']", message: '`**=` is not deterministic across engines.' },
        {
          selector: `MemberExpression[object.name='Math'][property.name!=/^(${ALLOWED_MATH.join('|')})$/]`,
          message: 'Only Math.sqrt/floor/ceil/round/trunc/abs/min/max/sign/imul/fround/clz32 are allowed in the sim (spec §8.5).',
        },
        { selector: "Identifier[name='Date']", message: 'Date is banned in the sim.' },
        { selector: "Identifier[name='performance']", message: 'performance is banned in the sim.' },
        { selector: "Identifier[name='Intl']", message: 'Intl is banned in the sim.' },
        { selector: "CallExpression[callee.property.name='toLocaleString']", message: 'toLocaleString is banned in the sim.' },
        { selector: "CallExpression[callee.property.name='toString'][arguments.length>0]", message: 'toString(radix) is banned in the sim.' },
        { selector: "VariableDeclarator[init.type='Identifier'][init.name='Math']", message: 'Aliasing or destructuring Math bypasses the allowlist.' },
        { selector: "AssignmentExpression[right.type='Identifier'][right.name='Math']", message: 'Aliasing Math bypasses the allowlist.' },
        { selector: "MemberExpression[property.name='Math'][object.name='globalThis']", message: 'globalThis.Math bypasses the allowlist.' },
      ],
      'no-restricted-imports': ['error', { patterns: ['three', 'three/*', 'preact', 'preact/*', 'uplot', '@preact/*'] }],
    },
  },
);
