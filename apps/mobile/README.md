# takenotes mobile

Expo app scaffold. Runtime dependencies (`expo`, `react-native`, native storage)
are intentionally deferred until mobile product requirements are settled.

Mobile must consume shared behavior through `@takenotes/core`,
`@takenotes/contracts`, and `@takenotes/platform`; it must not fork note policy.
