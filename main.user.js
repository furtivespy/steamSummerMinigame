// ==UserScript== 
// @name Monster Minigame AutoScript
// @author /u/mouseasw for creating and maintaining the script, /u/WinneonSword for the Greasemonkey support, and every contributor on the GitHub repo for constant enhancements.
// @version 2.3.2
// @namespace https://github.com/mouseas/steamSummerMinigame
// @description A script that runs the Steam Monster Minigame for you.
// @match *://steamcommunity.com/minigame/towerattack*
// @match *://steamcommunity.com//minigame/towerattack*
// @grant none
// @updateURL https://raw.githubusercontent.com/mouseas/steamSummerMinigame/master/main.user.js
// @downloadURL https://raw.githubusercontent.com/mouseas/steamSummerMinigame/master/main.user.js
// ==/UserScript==

///////////////////////////////////////////////////////////
//  ___ __  __ ____   ___  ____ _____  _    _   _ _____  //
// |_ _|  \/  |  _ \ / _ \|  _ \_   _|/ \  | \ | |_   _| //
//  | || |\/| | |_) | | | | |_) || | / _ \ |  \| | | |   //
//  | || |  | |  __/| |_| |  _ < | |/ ___ \| |\  | | |   //
// |___|_|  |_|_|    \___/|_| \_\|_/_/   \_\_| \_| |_|   //
//                                                       //
//    Increment the @version parameter every time you    //
//   update the script (2.0.1, 2.0.2, etc.). Otherwise   //
//   Greasemonkey / Tampermonkey users will NOT update   //
//                    automatically!!                    //
//                                                       //
///////////////////////////////////////////////////////////

var isAlreadyRunning = false;
var autoClickGoldRain = false;

var clickRate = 10; // change to number of desired clicks per second
var timer = 0;
var lastAction = 500; //start with the max. Array length
var clickTimer;

var ABILITIES = {
	"MORALE_BOOSTER": 5,
	"GOOD_LUCK": 6,
	"MEDIC": 7,
	"METAL_DETECTOR": 8,
	"COOLDOWN": 9,
	"NUKE": 10,
	"CLUSTER_BOMB": 11,
	"NAPALM": 12
};

var ITEMS = {
    "REVIVE": 13,
    "CRIPPLE_SPAWNER": 14,
    "CRIPPLE_MONSTER": 15,
    "MAXIMIZE_ELEMENT": 16,
    "GOLD_RAIN": 17,
    "CRIT": 18,
    "PUMPED_UP": 19,
    "THROW_MONEY": 20,
    "GOD_MODE": 21,
    "TREASURE": 22,
    "STEAL_HEALTH": 23,
    "REFLECT_DAMAGE": 24
};

var ENEMY_TYPE = {
    "SPAWNER": 0,
    "CREEP": 1,
    "BOSS": 2,
    "MINIBOSS": 3,
    "TREASURE": 4
};

var ABILITY_CONDITIONS = {};
ABILITY_CONDITIONS[ABILITIES.CLUSTER_BOMB] = {
	spawnerExists: true,
	enemyCount: 3,
	spawnerMinHealthPercent: null,
	spawnerMaxHealthPercent: null
};
ABILITY_CONDITIONS[ABILITIES.NAPALM] = {
	spawnerExists: true,
	enemyCount: 3,
	spawnerMinHealthPercent: null,
	spawnerMaxHealthPercent: null
};
ABILITY_CONDITIONS[ABILITIES.NUKE] = {
	spawnerExists: true,
	enemyCount: null,
	spawnerMinHealthPercent: 0.3,
	spawnerMaxHealthPercent: 0.6
};
ABILITY_CONDITIONS[ABILITIES.MORALE_BOOSTER] = {
	spawnerExists: true,
	enemyCount: 3,
	spawnerMinHealthPercent: null,
	spawnerMaxHealthPercent: null
};
ABILITY_CONDITIONS[ABILITIES.GOOD_LUCK] = {
	spawnerExists: null,
	enemyCount: 2,
	spawnerMinHealthPercent: null,
	spawnerMaxHealthPercent: null
};

var ITEM_CONDITIONS = {};
ITEM_CONDITIONS[ITEMS.GOLD_RAIN] = {
	spawnerExists: null,
	bossMinHealthPercent: 0.6,
	spawnerMinHealthPercent: null
};
ITEM_CONDITIONS[ITEMS.CRIPPLE_SPAWNER] = {
	spawnerExists: true,
	bossMinHealthPercent: null,
	spawnerMinHealthPercent: 0.95
};

if (thingTimer){
	window.clearInterval(thingTimer);
}

function firstRun() {
	// disable particle effects - this drastically reduces the game's memory leak
	if (g_Minigame !== undefined) {
		g_Minigame.CurrentScene().DoClickEffect = function() {};
		g_Minigame.CurrentScene().DoCritEffect = function( nDamage, x, y, additionalText ) {};
		g_Minigame.CurrentScene().SpawnEmitter = function(emitter) {
			emitter.emit = false;
			return emitter;
		}
	}

	// disable enemy flinching animation when they get hit
	if (CEnemy !== undefined) {
		CEnemy.prototype.TakeDamage = function() {};
		CEnemySpawner.prototype.TakeDamage = function() {};
		CEnemyBoss.prototype.TakeDamage = function() {};
	}
}

function doTheThing() {
	if (!isAlreadyRunning){
		isAlreadyRunning = true;

		goToLaneWithBestTarget();
		useOffensiveAbilityIfAvailable(ABILITIES.GOOD_LUCK);
		useMedicsIfRelevant();
		useOffensiveAbilityIfAvailable(ABILITIES.MORALE_BOOSTER);
		useOffensiveAbilityIfAvailable(ABILITIES.CLUSTER_BOMB);
		useOffensiveAbilityIfAvailable(ABILITIES.NAPALM);
		useOffensiveAbilityIfAvailable(ABILITIES.NUKE);
		useItemIfAvailable(ITEMS.CRIPPLE_SPAWNER);
		useItemIfAvailable(ITEMS.GOLD_RAIN);
		//useCrippleSpawnerIfRelevant();
		useMetalDetectorIfRelevant();
		//useGoldRainIfRelevant();
		attemptRespawn();

		if(autoClickGoldRain) {
			startGoldRainClick();
		}

		isAlreadyRunning = false;
	}
}

function goToLaneWithBestTarget() {
	// We can overlook spawners if all spawners are 40% hp or higher and a creep is under 10% hp
	var spawnerOKThreshold = 0.4;
	var creepSnagThreshold = 0.1;
	
	var targetFound = false;
	var lowHP = 0;
	var lowLane = 0;
	var lowTarget = 0;
	var lowPercentageHP = 0;
	
	// determine which lane and enemy is the optimal target
	var enemyTypePriority = [
		ENEMY_TYPE.TREASURE, 
		ENEMY_TYPE.BOSS, 
		ENEMY_TYPE.MINIBOSS,
		ENEMY_TYPE.SPAWNER, 
		ENEMY_TYPE.CREEP
	];
		
	var skippingSpawner = false;
	var skippedSpawnerLane = 0;
	var skippedSpawnerTarget = 0;
	var targetIsTreasureOrBoss = false;
	
	for (var k = 0; !targetFound && k < enemyTypePriority.length; k++) {
		
		if (enemyTypePriority[k] == ENEMY_TYPE.TREASURE || enemyTypePriority[k] == ENEMY_TYPE.BOSS){
			targetIsTreasureOrBoss = true;
		} else {
			targetIsTreasureOrBoss = false;
		}
		
		var enemies = [];
		
		// gather all the enemies of the specified type.
		for (var i = 0; i < 3; i++) {
			for (var j = 0; j < 4; j++) {
				var enemy = g_Minigame.CurrentScene().GetEnemy(i, j);
				if (enemy && enemy.m_data.type == enemyTypePriority[k]) {
					enemies[enemies.length] = enemy;
				}
			}
		}
	
		// target the enemy of the specified type with the lowest hp
		for (var i = 0; i < enemies.length; i++) {
			if (enemies[i] && !enemies[i].m_bIsDestroyed) {
				if (lowHP < 1 || enemies[i].m_flDisplayedHP < lowHP) {
					targetFound = true;
					lowHP = enemies[i].m_flDisplayedHP;
					lowLane = enemies[i].m_nLane;
					lowTarget = enemies[i].m_nID;
				}
				var percentageHP = enemies[i].m_flDisplayedHP / enemies[i].m_data.max_hp;
				if (lowPercentageHP == 0 || percentageHP < lowPercentageHP) {
					lowPercentageHP = percentageHP;
				}
			}
		}
		
		// If we just finished looking at spawners, 
		// AND none of them were below our threshold,
		// remember them and look for low creeps (so don't quit now)
		if (enemyTypePriority[k] == ENEMY_TYPE.SPAWNER && lowPercentageHP > spawnerOKThreshold) {
			skippedSpawnerLane = lowLane;
			skippedSpawnerTarget = lowTarget;
			skippingSpawner = true;
			targetFound = false;
		}
		
		// If we skipped a spawner and just finished looking at creeps,
		// AND the lowest was above our snag threshold,
		// just go back to the spawner!
		if (skippingSpawner && enemyTypePriority[k] == ENEMY_TYPE.CREEP && lowPercentageHP > creepSnagThreshold ) {
			lowLane = skippedSpawnerLane;
			lowTarget = skippedSpawnerTarget;
		}
	}

	
	// go to the chosen lane
	if (targetFound) {
		if (g_Minigame.CurrentScene().m_nExpectedLane != lowLane) {
			//console.log('switching langes');
			g_Minigame.CurrentScene().TryChangeLane(lowLane);
		}
		
		// target the chosen enemy
		if (g_Minigame.CurrentScene().m_nTarget != lowTarget) {
			//console.log('switching targets');
			g_Minigame.CurrentScene().TryChangeTarget(lowTarget);
		}
		
		
		// Prevent attack abilities and items if up against a boss or treasure minion
		if (targetIsTreasureOrBoss) {
			// Morale
			disableAbility(ABILITIES.MORALE_BOOSTER);
			// Luck
			disableAbility(ABILITIES.GOOD_LUCK);
			// Nuke
			disableAbility(ABILITIES.NUKE);
			// Clusterbomb
			disableAbility(ABILITIES.CLUSTER_BOMB);
			// Napalm
			disableAbility(ABILITIES.NAPALM);
			// Crit
			disableAbilityItem(ITEMS.CRIT);
			// Cripple Spawner
			disableAbilityItem(ITEMS.CRIPPLE_SPAWNER);
			// Cripple Monster
			disableAbilityItem(ITEMS.CRIPPLE_MONSTER);
			// Max Elemental Damage
			disableAbilityItem(ITEMS.MAXIMIZE_ELEMENT);
			// Reflect Damage
			disableAbilityItem(ITEMS.REFLECT_DAMAGE);
		} else {
			// Morale
			enableAbility(ABILITIES.MORALE_BOOSTER);
			// Luck
			enableAbility(ABILITIES.GOOD_LUCK);
			// Nuke
			enableAbility(ABILITIES.NUKE);
			// Clusterbomb
			enableAbility(ABILITIES.CLUSTER_BOMB);
			// Napalm
			enableAbility(ABILITIES.NAPALM);
			// Crit
			enableAbilityItem(ITEMS.CRIT);
			// Cripple Spawner
			enableAbilityItem(ITEMS.CRIPPLE_SPAWNER);
			// Cripple Monster
			enableAbilityItem(ITEMS.CRIPPLE_MONSTER);
			// Max Elemental Damage
			enableAbilityItem(ITEMS.MAXIMIZE_ELEMENT);
			// Reflect Damage
			enableAbilityItem(ITEMS.REFLECT_DAMAGE);
		}
	}
}

function useMedicsIfRelevant() {
	var myMaxHealth = g_Minigame.CurrentScene().m_rgPlayerTechTree.max_hp;
	
	// check if health is below 50%
	var hpPercent = g_Minigame.CurrentScene().m_rgPlayerData.hp / myMaxHealth;
	if (hpPercent > 0.5 || g_Minigame.CurrentScene().m_rgPlayerData.hp < 1) {
		return; // no need to heal - HP is above 50% or already dead
	}
	
	// check if Medics is purchased and cooled down
	if (hasPurchasedAbility(ABILITIES.MEDIC) && !isAbilityCoolingDown(ABILITIES.MEDIC)) {

		// Medics is purchased, cooled down, and needed. Trigger it.
		console.log('Medics is purchased, cooled down, and needed. Trigger it.');
		triggerAbility(ABILITIES.MEDIC);
	} else if (hasItem(ITEMS.GOD_MODE) && !isAbilityCoolingDown(ITEMS.GOD_MODE)) {
		
		console.log('We have god mode, cooled down, and needed. Trigger it.');
		triggerItem(ITEMS.GOD_MODE);
	}
};
function useOffensiveAbilityIfAvailable(abilityId) {
	//Check if Cluster Bomb is purchased and cooled down
	if (hasPurchasedAbility(abilityId)) {
		if (isAbilityCoolingDown(abilityId)) {
			return;
		}

		//Check lane has monsters to explode
		var currentLane = g_Minigame.CurrentScene().m_nExpectedLane;
		var enemyCount = 0;
		var enemySpawnerExists = false;
		var enemySpawnerHealthPercent = 0.0;

		//Count each slot in lane
		for (var i = 0; i < 4; i++) {
			var enemy = g_Minigame.CurrentScene().GetEnemy(currentLane, i);
			if (enemy) {
				enemyCount++;
				if (enemy.m_data.type == 0) {
					enemySpawnerExists = true;
					enemySpawnerHealthPercent = enemy.m_flDisplayedHP / enemy.m_data.max_hp;
				}
			}
		}

		var meetsConditions = true;

		//Only check the conditions that need to be checked	   
		if (ABILITY_CONDITIONS[abilityId].enemyCount != null) {
			meetsConditions = meetsConditions && enemyCount >= ABILITY_CONDITIONS[abilityId].enemyCount;
		}

		if (ABILITY_CONDITIONS[abilityId].spawnerExists != null) {
			meetsConditions = meetsConditions && enemySpawnerExists === ABILITY_CONDITIONS[abilityId].spawnerExists;
		}

		if (ABILITY_CONDITIONS[abilityId].spawnerMinHealthPercent != null) {
			meetsConditions = meetsConditions && enemySpawnerHealthPercent > ABILITY_CONDITIONS[abilityId].spawnerMinHealthPercent;
		}

		if (ABILITY_CONDITIONS[abilityId].spawnerMaxHealthPercent != null) {
			meetsConditions = meetsConditions && enemySpawnerHealthPercent < ABILITY_CONDITIONS[abilityId].spawnerMaxHealthPercent;
		}

		if (meetsConditions === true) {
			triggerAbility(abilityId);
		}
	}
}

function useItemIfAvailable(itemId) {
	// Check if Cripple Spawner is available
	if (hasItem(itemId)) {
		if (isAbilityCoolingDown(itemId)) {
			return;
		}

		//Check that the lane has a spawner and record it's health percentage
		var currentLane = g_Minigame.CurrentScene().m_nExpectedLane;
		var enemySpawnerExists = false;
		var enemySpawnerHealthPercent = 0.0;
		var enemyBossHealthPercent = 0.0;

		//Count each slot in lane
		for (var i = 0; i < 4; i++) {
			var enemy = g_Minigame.CurrentScene().GetEnemy(currentLane, i);
			if (enemy) {
				if (enemy.m_data.type == 0) {
					enemySpawnerExists = true;
					enemySpawnerHealthPercent = enemy.m_flDisplayedHP / enemy.m_data.max_hp;
				}

				if (enemy.m_data.type == ENEMY_TYPE.BOSS) {
					enemyBossHealthPercent = enemy.m_flDisplayedHP / enemy.m_data.max_hp;
				}
			}
		}

		var meetsConditions = true;

		if (ITEM_CONDITIONS[itemId].spawnerExists != null) {
			meetsConditions = meetsConditions && enemySpawnerExists === ITEM_CONDITIONS[itemId].spawnerExists;
		}

		if (ITEM_CONDITIONS[itemId].bossMinHealthPercent != null) {
			meetsConditions = meetsConditions && enemySpawnerHealthPercent >= ITEM_CONDITIONS[itemId].bossMinHealthPercent;
		}

		if (ITEM_CONDITIONS[itemId].spawnerMinHealthPercent != null) {
			meetsConditions = meetsConditions && enemySpawnerHealthPercent > ITEM_CONDITIONS[itemId].spawnerMinHealthPercent;
		}

		if (meetsConditions === true) {
			triggerItem(itemId);
		}
	}
}

function useMetalDetectorIfRelevant() {
	if (hasPurchasedAbility(ABILITIES.METAL_DETECTOR)) {
		if (isAbilityCoolingDown(ABILITIES.METAL_DETECTOR)) {
			return;
		}

		var enemy = g_Minigame.m_CurrentScene.GetEnemy(g_Minigame.m_CurrentScene.m_rgPlayerData.current_lane, g_Minigame.m_CurrentScene.m_rgPlayerData.target);

		if (enemy && enemy.m_data.type == ENEMY_TYPE.BOSS) {
			var enemyBossHealthPercent = enemy.m_flDisplayedHP / enemy.m_data.max_hp;

			if (enemyBossHealthPercent < 0.3 ) {
				console.log('Metal detector is purchased and cooled down, Triggering it on boss');
				triggerAbility(ABILITIES.METAL_DETECTOR);
			}
		}
	}
}

function useCrippleSpawnerIfRelevant() {
	// Check if Cripple Spawner is available
	if(hasItem(ITEMS.CRIPPLE_SPAWNER)) {
		if (isAbilityCoolingDown(ITEMS.CRIPPLE_SPAWNER)) {
			return;
		}

		//Check that the lane has a spawner and record it's health percentage
		var currentLane = g_Minigame.CurrentScene().m_nExpectedLane;
		var enemySpawnerExists = false;
		var enemySpawnerHealthPercent = 0.0;
		//Count each slot in lane
		for (var i = 0; i < 4; i++) {
			var enemy = g_Minigame.CurrentScene().GetEnemy(currentLane, i);
			if (enemy) {
				if (enemy.m_data.type == 0) {
					enemySpawnerExists = true;
					enemySpawnerHealthPercent = enemy.m_flDisplayedHP / enemy.m_data.max_hp;
				}
			}
		}

		// If there is a spawner and it's health is above 95%, cripple it!
		if (enemySpawnerExists && enemySpawnerHealthPercent > 0.95) {
			console.log("Cripple Spawner available, and needed. Cripple 'em.");
			triggerItem(ITEMS.CRIPPLE_SPAWNER);
		}
	}
}

function useGoldRainIfRelevant() {
	// Check if gold rain is purchased
	if (hasItem(ITEMS.GOLD_RAIN)) {
		if (isAbilityCoolingDown(ITEMS.GOLD_RAIN)) {
			return;
		}

		var enemy = g_Minigame.m_CurrentScene.GetEnemy(g_Minigame.m_CurrentScene.m_rgPlayerData.current_lane, g_Minigame.m_CurrentScene.m_rgPlayerData.target);
		// check if current target is a boss, otherwise its not worth using the gold rain
		if (enemy && enemy.m_data.type == ENEMY_TYPE.BOSS) {	
			var enemyBossHealthPercent = enemy.m_flDisplayedHP / enemy.m_data.max_hp;

		  if (enemyBossHealthPercent >= 0.6) { // We want sufficient time for the gold rain to be applicable
				// Gold Rain is purchased, cooled down, and needed. Trigger it.
				console.log('Gold rain is purchased and cooled down, Triggering it on boss');
				triggerItem(ITEMS.GOLD_RAIN);
			}
		}
	}
}

//If player is dead, call respawn method
function attemptRespawn() {
	if ((g_Minigame.CurrentScene().m_bIsDead) && 
			((g_Minigame.CurrentScene().m_rgPlayerData.time_died) + 5) < (g_Minigame.CurrentScene().m_nTime)) {
		RespawnPlayer();
	}
}

function isAbilityActive(abilityId) {
	return g_Minigame.CurrentScene().bIsAbilityActive(abilityId);
}

function hasItem(itemId) {
	for ( var i = 0; i < g_Minigame.CurrentScene().m_rgPlayerTechTree.ability_items.length; ++i ) {
		var abilityItem = g_Minigame.CurrentScene().m_rgPlayerTechTree.ability_items[i];
		if (abilityItem.ability == itemId) {
			return true;
		}
	}
	return false;
}

function isAbilityCoolingDown(abilityId) {
	return g_Minigame.CurrentScene().GetCooldownForAbility(abilityId) > 0;
}

function hasPurchasedAbility(abilityId) {
	// each bit in unlocked_abilities_bitfield corresponds to an ability.
	// the above condition checks if the ability's bit is set or cleared. I.e. it checks if
	// the player has purchased the specified ability.
	return (1 << abilityId) & g_Minigame.CurrentScene().m_rgPlayerTechTree.unlocked_abilities_bitfield;
}

function triggerItem(itemId) {
	var elem = document.getElementById('abilityitem_' + itemId);
	if (elem && elem.childElements() && elem.childElements().length >= 1) {
		g_Minigame.CurrentScene().TryAbility(document.getElementById('abilityitem_' + itemId).childElements()[0]);
	}
}

function triggerAbility(abilityId) {
	var elem = document.getElementById('ability_' + abilityId);
	if (elem && elem.childElements() && elem.childElements().length >= 1) {
		g_Minigame.CurrentScene().TryAbility(document.getElementById('ability_' + abilityId).childElements()[0]);
	}
}

function toggleAbilityVisibility(abilityId, show) {
	var vis = show === true ? "visible" : "hidden";

	var elem = document.getElementById('ability_' + abilityId);
	if (elem && elem.childElements() && elem.childElements().length >= 1) {
		elem.childElements()[0].style.visibility = vis;
	}
}

function disableAbility(abilityId) {
	toggleAbilityVisibility(abilityId, false);
}

function enableAbility(abilityId) {
	toggleAbilityVisibility(abilityId, true);
}

function isAbilityEnabled(abilityId) {
	var elem = document.getElementById('ability_' + abilityId);
	if (elem && elem.childElements() && elem.childElements().length >= 1) {
		return elem.childElements()[0].style.visibility == "visible";
	}
	return false;
}

function toggleAbilityItemVisibility(abilityId, show) {
	var vis = show === true ? "visible" : "hidden";

	var elem = document.getElementById('abilityitem_' + abilityId);
	if (elem && elem.childElements() && elem.childElements().length >= 1) {
		elem.childElements()[0].style.visibility = show;
	}
}

function disableAbilityItem(abilityId) {
	toggleAbilityItemVisibility(abilityId, false);
}

function enableAbilityItem(abilityId) {
	toggleAbilityItemVisibility(abilityId, true);
}

function isAbilityItemEnabled(abilityId) {
	var elem = document.getElementById('abilityitem_' + abilityId);
	if (elem && elem.childElements() && elem.childElements().length >= 1) {
		return elem.childElements()[0].style.visibility == "visible";
	}
	return false;
}

function clickTheThing() {
	// If we're going to be clicking, we should reset g_msTickRate
	// There's a reddit thread about why and we might as well be safe
	g_msTickRate = 1100;

	g_Minigame.m_CurrentScene.DoClick(
		{
			data: {
				getLocalPosition: function() {
					var enemy = g_Minigame.m_CurrentScene.GetEnemy(
						g_Minigame.m_CurrentScene.m_rgPlayerData.current_lane,
						g_Minigame.m_CurrentScene.m_rgPlayerData.target);
					var laneOffset = enemy.m_nLane * 440;

					return {
						x: enemy.m_Sprite.position.x - laneOffset,
						y: enemy.m_Sprite.position.y - 52
					}
				}
			}
		}
	);
	timer = timer - 1;
}

function startGoldRainClick() {
	var actions = g_Minigame.CurrentScene().m_rgActionLog;
	if(lastAction > actions.length){
		lastAction = actions.length;
	}
	
	if(actions.length > lastAction){
		for (var i = lastAction; i < actions.length; i++) {
			//console.log(actions[i].ability + " " + actions[i].type);
			if(actions[i].ability == 17 && actions[i].type == 'ability'){
				clearInterval(clickTimer);
				timer = 0;
				console.log('Let the GOLD rain!');
				clickTimer = window.setInterval(clickTheThing, 1000/clickRate);
				timer = 150;
			}
		}
		lastAction = i;
	}
	
	if(timer <= 0){
		clearInterval(clickTimer);
		timer = 0;
	}
}

var thingTimer = window.setInterval(function(){
	if (g_Minigame && g_Minigame.CurrentScene().m_bRunning && g_Minigame.CurrentScene().m_rgPlayerTechTree) {
		window.clearInterval(thingTimer);
		firstRun();
		thingTimer = window.setInterval(doTheThing, 1000);
	}
}, 1000);
