-- Round out the game_type enum with the table-game catalog.

alter type game_type add value if not exists 'roulette';
alter type game_type add value if not exists 'blackjack';
alter type game_type add value if not exists 'baccarat';
alter type game_type add value if not exists 'wheel';
alter type game_type add value if not exists 'slots';
alter type game_type add value if not exists 'diamonds';
