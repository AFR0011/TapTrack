import type { MetadataRoute } from 'next';

const PUBLIC_ORIGIN = 'https://ravel-fawn.vercel.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/app/', '/login', '/api/', '/auth/'],
    },
    sitemap: `${PUBLIC_ORIGIN}/sitemap.xml`,
    host: PUBLIC_ORIGIN,
  };
}
