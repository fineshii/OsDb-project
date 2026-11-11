/** @param {import('knex').Knex} knex */
export async function up(knex) {
  await knex.schema.alterTable('jobs', (table) => {
    table.enum('algorithm', ['FCFS', 'SJF']).notNullable().defaultTo('FCFS');
  });
  await knex.raw(`UPDATE jobs j JOIN rooms r ON r.id = j.room_id SET j.algorithm = r.algorithm`);
}

/** @param {import('knex').Knex} knex */
export async function down(knex) {
  await knex.schema.alterTable('jobs', (table) => table.dropColumn('algorithm'));
}
