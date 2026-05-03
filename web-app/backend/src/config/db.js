const { PrismaClient } = require('@prisma/client');

// Singleton pattern — prevents multiple Prisma instances in dev (hot-reload)
const globalForPrisma = globalThis;

// Debug: log available env vars at startup (names only, not values)
console.log('[DB] DATABASE_URL defined:', !!process.env.DATABASE_URL);
console.log('[DB] NODE_ENV:', process.env.NODE_ENV);
console.log('[DB] All env var keys:', Object.keys(process.env).filter(k => !k.startsWith('npm_')).join(', '));

function createPrismaClient() {
  const dbUrl = process.env.DATABASE_URL;
  
  if (!dbUrl) {
    console.error('[DB] FATAL: DATABASE_URL is not set!');
    // Return a proxy that throws on any method call instead of crashing at startup
    return new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') return undefined; // Don't fake thenable
        return new Proxy(() => {}, {
          get() { throw new Error('DATABASE_URL is not configured'); },
          apply() { throw new Error('DATABASE_URL is not configured'); },
        });
      },
    });
  }

  console.log('[DB] Creating PrismaClient with URL starting with:', dbUrl.substring(0, 30) + '...');
  return new PrismaClient({
    datasources: {
      db: {
        url: dbUrl,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
