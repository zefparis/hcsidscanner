module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./src'],
        alias: {
          '@hcs/id-scanner-native': '../../packages/native/src',
          '@hcs/id-scanner-core':   '../../packages/core/src',
        },
      },
    ],
  ],
};
