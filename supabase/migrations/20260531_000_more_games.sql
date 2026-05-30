-- Extend the game_type enum with the new games being added in this batch.
-- Postgres won't let us add multiple values in a single statement, so each
-- value gets its own ALTER TYPE.

alter type game_type add value if not exists 'limbo';
alter type game_type add value if not exists 'dragon_tower';
alter type game_type add value if not exists 'plinko';
alter type game_type add value if not exists 'keno';
alter type game_type add value if not exists 'hilo';
