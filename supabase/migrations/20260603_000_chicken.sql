-- Add the Chicken (cross-the-road) game to the game_type enum.
-- Run this in the Supabase SQL editor before deploying the Chicken game;
-- bets won't insert until the enum knows about 'chicken'.

alter type game_type add value if not exists 'chicken';
