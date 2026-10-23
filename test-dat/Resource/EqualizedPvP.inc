// Equalized PvP (__FL_EQUALIZED_MODE): which PvP events are equalized.
// While an event is equalized, players pick a class when they enter it and fight as a level 150 Hero/Legend of
// that class with every skill maxed and the shared gear preset of that class (EqualizedPresets.inc, the same for every event). Their own
// character comes back when they leave the event or log out.
//
// One line per event:  EVENT  ON  SLAYER TEMPLAR HARLEQUIN CRACKSHOOTER MENTALIST ARCANIST FORCEMASTER SERAPH
//   EVENT  FFA, TDM or GS (Guild Siege)
//   ON     1 = equalized, 0 = normal (own character)
//   then the most players of each class in one run (99 = no limit)
// Reload in game: /eqreload (an event already running keeps the players it has).
// TDM and GS are read but not used yet (later steps).

FFA	1	99	99	99	99	99	99	99	99
TDM	1	99	99	99	99	99	99	99	99
GS	1	99	99	99	99	99	99	99	99
