import type { CollectionEntry } from 'astro:content';

const WORDS_PER_MINUTE = 200;

export function readingTime(body: string): string {
  const words = body.trim().split(/\s+/).length;
  return `${Math.max(1, Math.round(words / WORDS_PER_MINUTE))} min read`;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

export function sortByDateDesc(posts: CollectionEntry<'blog'>[]) {
  return [...posts].sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export function publishedPosts(posts: CollectionEntry<'blog'>[]) {
  return posts.filter((post) => !post.data.draft);
}

export function relatedPosts(
  post: CollectionEntry<'blog'>,
  allPosts: CollectionEntry<'blog'>[],
  limit = 2,
) {
  const others = publishedPosts(allPosts).filter((p) => p.id !== post.id);

  const scored = others.map((candidate) => {
    let score = 0;
    if (candidate.data.category === post.data.category) score += 2;
    score += candidate.data.tags.filter((tag) => post.data.tags.includes(tag)).length;
    return { candidate, score };
  });

  scored.sort((a, b) => b.score - a.score || b.candidate.data.pubDate.valueOf() - a.candidate.data.pubDate.valueOf());

  return scored.slice(0, limit).map((s) => s.candidate);
}
