// tests/integration/agentReachService.test.mjs — Testes Unitários e de Integração do Agent-Reach
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReachEnvelope,
  stripHtmlToText,
  readWebPage,
  searchReddit,
  getHackerNewsTop,
  searchGitHub,
  getYouTubeMetadata,
  searchWikipedia,
  reach,
  formatReachEnvelopeMarkdown,
  formatDoctorMarkdown,
  formatReachMenuMarkdown
} from '../../src/services/agentReachService.js';
import { sqliteMasterDb } from '../../src/shared/sqliteMasterDb.js';

test('REACH-01. buildReachEnvelope e stripHtmlToText sanitizam dados corretamente', () => {
  const env = buildReachEnvelope({
    platform: 'REDDIT',
    query: 'node.js',
    title: 'Show HN: Agent Reach',
    url: 'https://example.com/item',
    author: 'dev123',
    score: 42,
    snippet: 'Exemplo de texto longo...',
    status: 'success'
  });

  assert.equal(env.platform, 'reddit');
  assert.equal(env.source, 'agent-reach');
  assert.equal(env.score, 42);
  assert.equal(env.status, 'success');
  assert.ok(env.timestamp);

  const dirtyHtml = '<div><h1>Notícia</h1><script>alert(1)</script><p>Texto &amp; Conteúdo</p></div>';
  const clean = stripHtmlToText(dirtyHtml);
  assert.ok(!clean.includes('script'));
  assert.ok(!clean.includes('alert'));
  assert.ok(clean.includes('Notícia'));
  assert.ok(clean.includes('Texto & Conteúdo'));
});

test('REACH-02. Caching SQLite WAL com TTL e log de telemetria', () => {
  const testUrl = 'https://example.com/cached-article';
  const envelope = buildReachEnvelope({
    platform: 'web',
    query: testUrl,
    url: testUrl,
    title: 'Artigo em Cache',
    snippet: 'Conteúdo memorizado em SQLite WAL.',
    status: 'success'
  });

  sqliteMasterDb.setCachedReach({
    platform: 'web',
    queryOrUrl: testUrl,
    title: envelope.title,
    url: testUrl,
    snippet: envelope.snippet,
    envelope,
    ttlSeconds: 60
  });

  const cached = sqliteMasterDb.getCachedReach('web', testUrl);
  assert.ok(cached, 'Deveria recuperar entrada do cache');
  assert.equal(cached.cached, true);
  assert.equal(cached.title, 'Artigo em Cache');

  sqliteMasterDb.logReachQuery({
    platform: 'web',
    queryOrUrl: testUrl,
    resultsCount: 1,
    latencyMs: 12,
    status: 'ok'
  });

  const stats = sqliteMasterDb.getReachStats();
  assert.ok(stats.cachedEntries >= 1);
  assert.ok(stats.totalQueries >= 1);
});

test('REACH-03. Leitura Web com Jina Reader e Mock HTTP', async () => {
  const mockAxios = {
    get: async (url) => {
      if (url.includes('r.jina.ai')) {
        return {
          data: 'Title: Documentação do Node.js\n\nEste é o resumo do framework em Markdown.'
        };
      }
      return { data: '<html><body>Fallback Content</body></html>' };
    }
  };

  const res = await readWebPage('https://nodejs.org/docs', { axiosClient: mockAxios, useCache: false });
  assert.equal(res.platform, 'web');
  assert.equal(res.title, 'Documentação do Node.js');
  assert.ok(res.snippet.includes('Markdown'));
});

test('REACH-04. Reddit, Hacker News, GitHub e YouTube com Mocks HTTP', async () => {
  const mockAxios = {
    get: async (url) => {
      if (url.includes('reddit.com')) {
        return {
          data: {
            data: {
              children: [
                {
                  data: {
                    id: 'xyz1',
                    title: 'Como usar Telegraf no Node 22',
                    author: 'andre_dev',
                    score: 99,
                    num_comments: 15,
                    permalink: '/r/node/comments/xyz1',
                    selftext: 'Discussão detalhada sobre bots.'
                  }
                }
              ]
            }
          }
        };
      }
      if (url.includes('topstories.json')) {
        return { data: [1001, 1002] };
      }
      if (url.includes('/item/1001.json')) {
        return {
          data: {
            id: 1001,
            title: 'Agentic AI Revolution',
            by: 'pg',
            score: 350,
            descendants: 80,
            url: 'https://news.ycombinator.com/item?id=1001',
            time: 1700000000
          }
        };
      }
      if (url.includes('api.github.com/search/repositories')) {
        return {
          data: {
            items: [
              {
                full_name: 'Panniantong/Agent-Reach',
                description: 'Zero API Fee Internet Access for AI Agents',
                stargazers_count: 520,
                forks_count: 65,
                language: 'JavaScript',
                html_url: 'https://github.com/Panniantong/Agent-Reach'
              }
            ]
          }
        };
      }
      if (url.includes('youtube.com/oembed')) {
        return {
          data: {
            title: 'Aula de Primeiros Socorros',
            author_name: 'INEM Portugal',
            provider_name: 'YouTube'
          }
        };
      }
      if (url.includes('wikipedia.org/w/api.php')) {
        return {
          data: {
            query: {
              search: [{ title: 'Amarante', snippet: 'Amarante é uma cidade portuguesa no Distrito do Porto.' }]
            }
          }
        };
      }
      return { data: {} };
    }
  };

  // Reddit
  const redditRes = await searchReddit('telegraf', { axiosClient: mockAxios, useCache: false });
  assert.equal(redditRes.platform, 'reddit');
  assert.equal(redditRes.results.length, 1);
  assert.equal(redditRes.results[0].title, 'Como usar Telegraf no Node 22');

  // Hacker News
  const hnRes = await getHackerNewsTop({ limit: 1, axiosClient: mockAxios, useCache: false });
  assert.equal(hnRes.platform, 'hackernews');
  assert.equal(hnRes.results[0].title, 'Agentic AI Revolution');

  // GitHub
  const ghRes = await searchGitHub('agent-reach', { axiosClient: mockAxios, useCache: false });
  assert.equal(ghRes.platform, 'github');
  assert.equal(ghRes.results[0].fullName, 'Panniantong/Agent-Reach');

  // YouTube
  const ytRes = await getYouTubeMetadata('https://www.youtube.com/watch?v=123', { axiosClient: mockAxios, useCache: false });
  assert.equal(ytRes.platform, 'youtube');
  assert.equal(ytRes.title, 'Aula de Primeiros Socorros');

  // Wikipédia
  const wikiRes = await searchWikipedia('Amarante', { axiosClient: mockAxios, useCache: false });
  assert.equal(wikiRes.platform, 'wikipedia');
  assert.equal(wikiRes.title, 'Amarante');
});

test('REACH-05. Formatadores Markdown para Telegram', () => {
  const env = buildReachEnvelope({
    platform: 'reddit',
    title: 'Pesquisa Reddit Teste',
    author: 'u/tester',
    url: 'https://reddit.com/r/test',
    score: 10,
    results: [
      { title: 'Tópico 1', score: 25, url: 'https://reddit.com/1', snippet: 'Resumo 1' }
    ]
  });

  const md = formatReachEnvelopeMarkdown(env);
  assert.ok(md.includes('AGENT-REACH'));
  assert.ok(md.includes('REDDIT'));
  assert.ok(md.includes('Tópico 1'));

  const menu = formatReachMenuMarkdown();
  assert.ok(menu.includes('/reach read'));
  assert.ok(menu.includes('/reach reddit'));

  const doc = formatDoctorMarkdown({
    timestamp: new Date().toISOString(),
    healthyCount: 6,
    totalCount: 6,
    backends: [{ name: 'Reddit JSON', status: 'healthy', latencyMs: 140 }]
  });
  assert.ok(doc.includes('DIAGNÓSTICO AGENT-REACH'));
  assert.ok(doc.includes('Reddit JSON'));
});
