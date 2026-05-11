/**
 * Fix TS2786: "'X' cannot be used as a JSX component"
 *
 * Multiple @types/react versions coexist in this monorepo (18.2 in mobile,
 * 19.x in packages/native). @react-navigation v6 types reference a
 * ReactElement that doesn't satisfy the local ReactNode union.
 *
 * This module augmentation patches the incompatibility.
 * See: https://github.com/react-navigation/react-navigation/issues/11928
 */
export {};

declare module 'react' {
  // Make ReactElement assignable to ReactNode by ensuring that
  // ReactPortal's `children` constraint is relaxed.
  interface ReactPortal {
    children?: ReactNode | undefined;
  }
}
