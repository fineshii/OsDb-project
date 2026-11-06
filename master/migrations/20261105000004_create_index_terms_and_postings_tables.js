/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable('index_terms', (table) => {
    table.increments('id').primary();
    table.string('term', 100).notNullable().unique();
  });

  await knex.schema.createTable('postings', (table) => {
    table
      .integer('term_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('index_terms')
      .onDelete('CASCADE');
    table
      .integer('file_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('files')
      .onDelete('CASCADE');
    table.integer('tf').notNullable();

    table.primary(['term_id', 'file_id']);
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('postings');
  await knex.schema.dropTableIfExists('index_terms');
}
