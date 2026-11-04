import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';
import { feedgrabProxyOnly } from './build/feedgrab-proxy-only';

const newtab = process.env.GHOSTIFY_FLAVOR === 'newtab';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
  manifestVersion: 3,
  outDirTemplate: `{{browser}}-mv{{manifestVersion}}${newtab ? '-newtab' : ''}`,
  autoIcons: { baseIconPath: 'assets/icon.png' },
  vite: () => ({
    plugins: [tailwindcss(), feedgrabProxyOnly()],
    // The model worker imports ONNX Runtime's module glue at runtime.
    worker: { format: 'es' },
  }),
  manifest: ({ browser }) => ({
    name: newtab ? 'Ghostify (New Tab)' : 'Ghostify',
    // `offscreen` hosts the in-browser model worker on Chrome (Firefox uses an iframe instead).
    permissions: [
      'storage',
      'alarms',
      'scripting',
      'activeTab',
      ...(browser === 'firefox' ? [] : ['offscreen']),
    ],
    optional_host_permissions: ['*://*/*'],
    action: { default_title: 'Ghostify' },
    // No remote code; wasm is allowed for the in-browser models (ONNX Runtime Web).
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: newtab ? 'ghostify-newtab@sweadev.github.io' : 'ghostify@sweadev.github.io',
          strict_min_version: '128.0',
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
  zip: {
    name: newtab ? 'ghostify-newtab' : 'ghostify',
  },
  hooks: {
    'entrypoints:resolved': (_wxt, entrypoints) => {
      if (newtab) return;
      const i = entrypoints.findIndex((e) => e.name === 'newtab');
      if (i !== -1) entrypoints.splice(i, 1);
    },
  },
});
