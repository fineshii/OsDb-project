/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable('jobs', (table) => {
    table.increments('id').primary();
    table
      .integer('room_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('rooms')
      .onDelete('CASCADE');
    table
      .integer('file_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('files')
      .onDelete('CASCADE');
    table.enum('type', ['index', 'preprocess']).notNullable();
    table.enum('status', ['queued', 'running', 'done', 'failed']).notNullable().defaultTo('queued');
    table.bigInteger('arrival_time').notNullable();
    table.integer('burst_estimate').notNullable();
    table.integer('attempts').notNullable().defaultTo(0);
    table
      .integer('worker_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('workers')
      .onDelete('SET NULL');
    table.bigInteger('started_at').nullable();
    table.bigInteger('finished_at').nullable();

    table.index(['room_id', 'status'], 'idx_jobs_room_status');
  });

  await knex.schema.createTable('job_runs', (table) => {
    table.increments('id').primary();
    table
      .integer('job_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('jobs')
      .onDelete('CASCADE');
    table
      .integer('worker_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('workers')
      .onDelete('CASCADE');
    table.bigInteger('started_at').notNullable();
    table.bigInteger('ended_at').nullable();
    table.enum('outcome', ['done', 'failed', 'requeued']).nullable();
    table.text('error').nullable();
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('job_runs');
  await knex.schema.dropTableIfExists('jobs');
}
