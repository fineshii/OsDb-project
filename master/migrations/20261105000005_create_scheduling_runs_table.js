/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable('scheduling_runs', (table) => {
    table.increments('id').primary();
    table
      .integer('room_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('rooms')
      .onDelete('CASCADE');
    table.enum('algorithm', ['FCFS', 'SJF']).notNullable();
    table.double('avg_waiting').notNullable();
    table.double('avg_turnaround').notNullable();
    table.integer('job_count').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('scheduling_runs');
}
