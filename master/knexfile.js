import { config } from './src/config.js';

export default {
  development: {
    client: 'mysql2',
    connection: {
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      charset: 'utf8mb4',
    },
    migrations: {
      directory: './migrations',
      extension: 'js',
    },
    pool: {
      min: 2,
      max: 10,
    },
  },
  test: {
    client: 'mysql2',
    connection: {
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      charset: 'utf8mb4',
    },
    migrations: {
      directory: './migrations',
      extension: 'js',
    },
  },
  production: {
    client: 'mysql2',
    connection: {
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      charset: 'utf8mb4',
    },
    migrations: {
      directory: './migrations',
      extension: 'js',
    },
    pool: {
      min: 2,
      max: 20,
    },
  },
};
