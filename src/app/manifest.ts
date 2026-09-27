import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'OXSIG — Launch. Operate. Prove.',
    short_name: 'OXSIG',
    description: 'Operate technical environments and track your progress.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f6f8fa',
    theme_color: '#0c5261',
    icons: [
      { src: '/icons/oxsig-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/oxsig-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
