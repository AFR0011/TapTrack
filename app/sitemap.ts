import type { MetadataRoute } from 'next';

const PUBLIC_ORIGIN = 'https://ravel-fawn.vercel.app';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: PUBLIC_ORIGIN,
      lastModified: new Date('2026-09-11T00:00:00.000Z'),
      changeFrequency: 'monthly',
      priority: 1,
    },
  ];
}
