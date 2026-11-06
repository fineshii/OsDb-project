/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable('rooms', (table) => {
    table.increments('id').primary();
    table.specificType('code', 'CHAR(6)').notNullable().unique();
    table.enum('algorithm', ['FCFS', 'SJF']).notNullable().defaultTo('FCFS');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('workers', (table) => {
    table.increments('id').primary();
    table
      .integer('room_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('rooms')
      .onDelete('CASCADE');
    table.string('name', 100).notNullable();
    table.string('socket_id', 64).nullable();
    table.enum('status', ['idle', 'busy', 'offline']).notNullable().defaultTo('idle');
    table.timestamp('last_seen').defaultTo(knex.fn.now());
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('workers');
  await knex.schema.dropTableIfExists('rooms');
}
