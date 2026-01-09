/**
 * Mock niws-intake server for testing
 *
 * Uses msw (Mock Service Worker) to intercept HTTP requests.
 */

// Note: This file would be used with msw for integration testing
// Install with: npm install -D msw

/*
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

export const mockArticles = new Map([
  ['article-1', {
    id: 'article-1',
    outletId: 'outlet-1',
    feedId: 'feed-1',
    title: 'Test Article from Left Outlet',
    url: 'https://example.com/article-1',
    content: 'This is the content of the test article. It discusses various policy proposals.',
    publishedAt: '2024-01-15T10:00:00Z',
    fetchedAt: '2024-01-15T10:30:00Z',
    contentHash: 'abc123',
    storyId: 'story-1',
  }],
  ['article-2', {
    id: 'article-2',
    outletId: 'outlet-2',
    feedId: 'feed-2',
    title: 'Test Article from Right Outlet',
    url: 'https://example.com/article-2',
    content: 'This is the content of the second test article. It covers the same story.',
    publishedAt: '2024-01-15T11:00:00Z',
    fetchedAt: '2024-01-15T11:30:00Z',
    contentHash: 'def456',
    storyId: 'story-1',
  }],
]);

export const mockOutlets = new Map([
  ['outlet-1', {
    id: 'outlet-1',
    name: 'Left News',
    domain: 'leftnews.com',
    politicalLean: 'left',
    biasRating: 0.7,
    factualReporting: 'high',
    createdAt: '2024-01-01T00:00:00Z',
  }],
  ['outlet-2', {
    id: 'outlet-2',
    name: 'Right News',
    domain: 'rightnews.com',
    politicalLean: 'right',
    biasRating: 0.7,
    factualReporting: 'high',
    createdAt: '2024-01-01T00:00:00Z',
  }],
  ['outlet-3', {
    id: 'outlet-3',
    name: 'Center News',
    domain: 'centernews.com',
    politicalLean: 'center',
    biasRating: 0.2,
    factualReporting: 'high',
    createdAt: '2024-01-01T00:00:00Z',
  }],
]);

export const mockStories = new Map([
  ['story-1', {
    id: 'story-1',
    title: 'Policy Debate on Infrastructure',
    track: 'politics',
    articleIds: ['article-1', 'article-2'],
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T11:00:00Z',
  }],
]);

export const intakeMockServer = setupServer(
  // GET /api/health
  http.get('http://localhost:8033/api/health', () => {
    return HttpResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
  }),

  // GET /api/articles/:id
  http.get('http://localhost:8033/api/articles/:id', ({ params }) => {
    const article = mockArticles.get(params.id as string);
    if (!article) {
      return HttpResponse.json({ error: 'Article not found' }, { status: 404 });
    }
    return HttpResponse.json(article);
  }),

  // GET /api/outlets/:id
  http.get('http://localhost:8033/api/outlets/:id', ({ params }) => {
    const outlet = mockOutlets.get(params.id as string);
    if (!outlet) {
      return HttpResponse.json({ error: 'Outlet not found' }, { status: 404 });
    }
    return HttpResponse.json(outlet);
  }),

  // GET /api/stories/:id
  http.get('http://localhost:8033/api/stories/:id', ({ params }) => {
    const story = mockStories.get(params.id as string);
    if (!story) {
      return HttpResponse.json({ error: 'Story not found' }, { status: 404 });
    }
    return HttpResponse.json(story);
  }),

  // GET /api/stories/:id/articles
  http.get('http://localhost:8033/api/stories/:id/articles', ({ params }) => {
    const story = mockStories.get(params.id as string);
    if (!story) {
      return HttpResponse.json({ error: 'Story not found' }, { status: 404 });
    }
    const articles = story.articleIds.map(id => mockArticles.get(id)).filter(Boolean);
    return HttpResponse.json({ articles });
  }),
);

// Usage in tests:
// beforeAll(() => intakeMockServer.listen());
// afterEach(() => intakeMockServer.resetHandlers());
// afterAll(() => intakeMockServer.close());
*/

// Export placeholder for when msw is not installed
export const mockArticle = {
  id: 'article-1',
  outletId: 'outlet-1',
  feedId: 'feed-1',
  title: 'Test Article',
  url: 'https://example.com/article',
  content: 'Test content',
  publishedAt: new Date().toISOString(),
  fetchedAt: new Date().toISOString(),
  contentHash: 'abc123',
};

export const mockOutlet = {
  id: 'outlet-1',
  name: 'Test Outlet',
  domain: 'test.com',
  politicalLean: 'center' as const,
  biasRating: 0.5,
  factualReporting: 'high',
  createdAt: new Date().toISOString(),
};
