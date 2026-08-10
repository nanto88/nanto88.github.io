import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const CATEGORIES = [
  'engineering',
  'ai',
  'backend',
  'system-design',
  'programming',
  'career',
  'tips',
] as const;

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    category: z.enum(CATEGORIES),
    draft: z.boolean().default(false),
    heroImage: z.string().nullable().optional(),
    series: z.string().optional(),
    featured: z.boolean().default(false),
  }),
});

export const collections = { blog };
