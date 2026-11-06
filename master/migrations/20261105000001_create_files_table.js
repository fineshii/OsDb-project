/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable('files', (table) => {
    table.increments('id').primary();
    table.string('name', 255).notNullable();
    table.string('mime_type', 100).nullable();
    table.integer('size_bytes').notNullable();
    table.string('content_hash', 64).notNullable().unique();
    // LONGTEXT in MySQL
    table.specificType('content', 'LONGTEXT').notNullable();
    table.timestamp('uploaded_at').defaultTo(knex.fn.now());
  });

  // Add MySQL FULLTEXT index
  await knex.raw('ALTER TABLE files ADD FULLTEXT KEY ft_content (content)');
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('files');
}
