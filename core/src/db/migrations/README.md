# Migrations

A migration needs to be created every time an entity is updated (columns added or modified). Do this by running the `create-migration` script with the name of the entity in question as a parameter:

```console
yarn run create-migration -- SomeEntity
```

You then need to explicitly import the migration and reference in the `migrations` array in `src/db/connection.ts`.

This is not needed for _new_ entities, only after modifying an entity after it has been previously released and used.
