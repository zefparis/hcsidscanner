// Ambient declarations — the consumer app provides the real types via
// react-native and the native plugin packages. Declaring them as `any`
// here lets the package typecheck standalone in CI without installing
// the full React Native toolchain.
//
// Once consumers integrate this package, they can simply add it via
// `file:` path npm and their host app's resolution provides the
// concrete typings.

declare module 'react-native';
declare module 'react-native-vision-camera';
declare module 'vision-camera-mrz-scanner';
declare module 'react-native-nfc-manager';
