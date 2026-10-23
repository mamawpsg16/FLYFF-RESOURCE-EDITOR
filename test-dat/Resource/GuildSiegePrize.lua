----------------------------------------------------------------------------
dofile( ".\\LuaFunc\\GuildSiegePrizeFunc.lua" )
----------------------------------------------------------------------------

-- weekly rollover time, "Ddd HH:MM" (3-letter day, 24h time) - matches Tax.lua's ChangeTaxTime syntax
WeeklyPrizeTime = "Mon 00:00"

-- 0 = use WeeklyPrizeTime above (real weekly schedule)
-- N > 0 = fire every N minutes instead - TESTING ONLY, set back to 0 before going live
TestIntervalMinutes = 0

-- PVP Token prizes. Whole numbers, rank 1 first; a missing or bad value keeps the old built-in number.
-- TokensPerKill 0-32767 (0 = none), every list entry 1-32767.
-- TokensPerKill + SiegePrize: WorldServer, read when it starts. The weekly lists: DatabaseServer, read when it starts.
TokensPerKill = 2										-- every Guild Siege kill, paid at once
SiegePrize = { 50, 14, 7 }								-- 1st, 2nd, 3rd guild of each siege, to every member who fought
GuildPrize = { 600, 300, 180, 72, 48 }					-- weekly, top 5 guilds by wins, into the guild bank
ClassPrize = { 200, 100, 60, 40, 30, 24, 20, 14, 8, 4 }	-- weekly, top 10 players by points (Total)
ClassPerClassPrize = { 100, 50, 30, 20, 15, 12, 10, 7, 4, 2 }	-- weekly, top 10 of each class (Mercenary, Magician, Acrobat, Assist)
MvpPrize = { 300, 150, 90, 60, 45, 36, 30, 21, 12, 6 }	-- weekly, top 10 by MVP count
