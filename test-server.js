import { Hono } from 'hono';
import { serve } from '@hono/node-server';

const app = new Hono();

app.get('/', (c) => {
  return c.text('Hello, world!');
});

const port = process.env.PORT || 3001;

console.log(`Starting simple test server on port ${port}...`);
try {
  serve({
    fetch: app.fetch,
    port: port,
    onListen: ({ port }) => {
      console.log(`✅ Simple test server is running on http://localhost:${port}`);
    }
  });
  console.log('serve() called successfully');
} catch (err) {
  console.error('❌ Failed to start test server:', err);
  console.error(err);
}
