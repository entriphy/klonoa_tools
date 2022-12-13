import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import sveltePreprocess from 'svelte-preprocess';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte({
    preprocess: [sveltePreprocess({})]
  }), externalCSSPlugin()]
})

function externalCSSPlugin() {
  return {
    name: 'external-css',
    transformIndexHtml: {
      enforce: 'post',
      transform(html, ctx) {
        console.log(ctx.server);
        return [
          {
            tag: "link",
            attrs: {"rel": "stylesheet", "type": "text/css", "href": "/smui.css", "media": "(prefers-color-scheme: light)"},
            injectTo: ctx.server ? "body.prepend" : "head"
          },
          {
            tag: "link",
            attrs: {"rel": "stylesheet", "type": "text/css", "href": "/smui-dark.css", "media": "(prefers-color-scheme: dark)"},
            injectTo: ctx.server ? "body.prepend" : "head"
          },
        ]
      }
    }
  }
}