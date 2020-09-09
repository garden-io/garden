# Migrations

A migration needs to be created every time an entity is added or updated (columns added or modified). Do this by running the `migrations:generate` script with the name of the entity in question as a parameter, after you've made your changes to the entity (or entities) in question:

```console
yarn migration:generate SomeEntity
```

You then need to explicitly import the migration and reference in the `migrations` array in `src/db/connection.ts`.
