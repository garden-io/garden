
exports.up = function(knex) {
  return knex.schema.createTable("users", function(t) {
    t.increments("id").unsigned().primary();
    t.dateTime("created_at").notNull();
    t.dateTime("updated_at").nullable();
    t.string("name").notNull();
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable("users");
};
