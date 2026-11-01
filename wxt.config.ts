import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';
import { feedgrabProxyOnly } from './build/feedgrab-proxy-only';

const newtab = process.env.GHOSTIFY_FLAVOR === 'newtab';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
  manifestVersion: 3,
  autoIcons: { baseIconPath: 'assets/icon.svg' },
  vite: () => ({ plugins: [tailwindcss(), feedgrabProxyOnly()] }),
  manifest: ({ browser }) => ({
    name: newtab ? 'Ghostify (New Tab)' : 'Ghostify',
    permissions: ['storage', 'alarms'],
    action: { default_title: 'Ghostify' },
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
