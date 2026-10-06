// App entry. The theme engine MUST be imported first: it patches StyleSheet.create so
// every stylesheet created afterwards (all screens, components, theme.ts) gets a dark
// twin — see src/themeEngine.ts. Then hand over to expo-router as before.
import './src/themeEngine';
import 'expo-router/entry';
