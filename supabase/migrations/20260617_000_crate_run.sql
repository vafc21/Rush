-- Add the Crate Run (sidescroller crate-opening) game to the game_type enum.
-- Run this in the Supabase SQL editor before deploying the Crate Run game;
-- bets won't insert until the enum knows about 'crate_run'.

alter type game_type add value if not exists 'crate_run';
