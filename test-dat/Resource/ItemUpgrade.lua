----------------------------------------------------------
-- Piercing Probability (n/10000) ------------------------
----------------------------------------------------------
tSuitProb = { 781, 488, 195, 79 } -- round 7: 4th slot bumped 49->79 (0.49%->0.79%), slots 1-3 unchanged; before that { 1561, 976, 390, 98 } (-50%, round 6), { 2601, 1626, 650, 163 } (-40%, round 5), { 4335, 2710, 1084, 271 } (-40%, round 4), { 5780, 3613, 1445, 361 } (-25%, round 3), { 6800, 4250, 1700, 425 } (-15%), stock { 8000, 5000, 2000, 500 }
tWeaponProb = { 3613, 1806, 904, 451, 226, 113, 56, 28, 14, 8 } -- was { 4250, 2125, 1063, 531, 266, 133, 66, 33, 17, 9 } (-15%), stock { 5000, 2500, 1250, 625, 313, 156, 78, 39, 20, 10 } (untouched this round)

----------------------------------------------------------
-- General Smelting Probability --------------------------
----------------------------------------------------------
-- Overseas, the value is reduced by 10% from +4. (n * 0.9)
tGeneral = { 3251, 3251, 2276, 1626, 1301, 976, 650, 325, 163, 65 }; -- was { 5419, 5419, 3794, 2710, 2168, 1626, 1084, 542, 271, 109 } (-40%, round 4), before that { 7225, 7225, 5058, 3613, 2890, 2168, 1445, 723, 361, 145 } (-25%, round 3), { 8500, 8500, 5950, 4250, 3400, 2550, 1700, 850, 425, 170 } (-15%), stock { 10000, 10000, 7000, 5000, 4000, 3000, 2000, 1000, 500, 200 }

----------------------------------------------------------
-- Smelting ----------------------------------------------
----------------------------------------------------------
tAttribute = {}
function AddAttribute( nNum, nProb, nDamageRate, nDefenseRate, nAddAtkDmgRate )
	tAttribute[nNum] = {}
	tAttribute[nNum].nProb = nProb
	tAttribute[nNum].nDamageRate = nDamageRate
	tAttribute[nNum].nDefenseRate = nDefenseRate
	tAttribute[nNum].nAddAtkDmgRate = nAddAtkDmgRate
end

--		Smelt, Probability, Damage Growth Rate, Defense Growth Rate, Attribute Correction Growth Rate (All values except smelting value are n / 10000)
-- nProb column trimmed -15% from stock (see UPGRADE_SUCCESS_RATES_GUIDE.md)
AddAttribute(	1,		8500,		200,			200,			500		)
AddAttribute(	2,		8500,		221,			221,			522		)
AddAttribute(	3,		7820,		256,			256,			560		)
AddAttribute(	4,		5950,		305,			305,			612		)
AddAttribute(	5,		4505,		368,			368,			680		)
AddAttribute(	6,		3400,		446,			446,			763		)
AddAttribute(	7,		2550,		537,			537,			860		)
AddAttribute(	8,		1955,		642,			642,			973		)
AddAttribute(	9,		1445,		761,			761,			1101		)
AddAttribute(	10,		1105,		895,			895,			1244		)
AddAttribute(	11,		850,		1042,			1042,			1402		)
AddAttribute(	12,		595,		1203,			1203,			1575		)
AddAttribute(	13,		510,		1379,			1379,			1763		)
AddAttribute(	14,		340,		1568,			1568,			1966		)
AddAttribute(	15,		255,		1772,			1772,			2184		)
AddAttribute(	16,		213,		1989,			1989,			2417		)
AddAttribute(	17,		170,		2221,			2221,			2665		)
AddAttribute(	18,		128,		2467,			2467,			2998		)
AddAttribute(	19,		102,		2726,			2726,			3207		)
AddAttribute(	20,		85,		3000,			3000,			3500		)

----------------------------------------------------------
-- Item transition ---------------------------------------
----------------------------------------------------------
nItemTransyLowLevel	= 500000
nItemTransyHighLevel	= 2000000