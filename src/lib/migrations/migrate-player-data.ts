/**
 * Player Data Migration Script
 * Converts existing player data from age/tenureYears to dateOfBirth/joinedSeason
 * 
 * This script should be run once to migrate existing player records.
 * 
 * Migration logic:
 * - age → dateOfBirth: Estimates birth date by subtracting age from current date (August 1st)
 * - tenureYears → joinedSeason: Calculates joined season from tenure years and current season
 * 
 * Note: The estimated birth dates will be approximate since we don't know the exact birth date.
 * Admins may need to manually update the birth dates after migration.
 */

import { db } from "@/lib/firebase";
import { collection, getDocs, updateDoc, doc, query, orderBy } from "firebase/firestore";

interface PlayerRecord {
  id: string;
  age?: number;
  tenureYears?: number;
  seasons?: string[];
  [key: string]: any;
}

/**
 * Estimate birth date from age
 * Uses August 1st as the reference date (season start)
 */
function estimateBirthDateFromAge(age: number): string {
  const currentYear = new Date().getFullYear();
  const birthYear = currentYear - age;
  // Use August 1st as the estimated birth date (season start)
  return `${birthYear}-08-01`;
}

/**
 * Calculate joined season from tenure years
 * Uses the earliest season in the player's seasons array as reference
 */
function calculateJoinedSeasonFromTenure(tenureYears: number, currentSeason?: string): string {
  if (!currentSeason) {
    // If no current season, estimate based on current year
    const currentYear = new Date().getFullYear();
    const joinedYear = currentYear - tenureYears + 1;
    return `${joinedYear}/${(joinedYear + 1).toString().slice(-2)}`;
  }
  
  // Parse current season (e.g., "2025/26" → 2025)
  const seasonMatch = currentSeason.match(/^(\d{4})/);
  if (!seasonMatch) {
    const currentYear = new Date().getFullYear();
    const joinedYear = currentYear - tenureYears + 1;
    return `${joinedYear}/${(joinedYear + 1).toString().slice(-2)}`;
  }
  
  const currentStartYear = parseInt(seasonMatch[1], 10);
  const joinedYear = currentStartYear - tenureYears + 1;
  return `${joinedYear}/${(joinedYear + 1).toString().slice(-2)}`;
}

/**
 * Migrate a single player record
 */
async function migratePlayerRecord(playerId: string, playerData: PlayerRecord): Promise<void> {
  const updates: any = {};
  let needsUpdate = false;

  // Convert age to dateOfBirth
  if (playerData.age != null && typeof playerData.age === "number" && !playerData.dateOfBirth) {
    updates.dateOfBirth = estimateBirthDateFromAge(playerData.age);
    needsUpdate = true;
    console.log(`  Converting age ${playerData.age} → dateOfBirth ${updates.dateOfBirth}`);
  }

  // Convert tenureYears to joinedSeason
  if (playerData.tenureYears != null && typeof playerData.tenureYears === "number" && !playerData.joinedSeason) {
    const currentSeason = Array.isArray(playerData.seasons) && playerData.seasons.length > 0
      ? playerData.seasons[playerData.seasons.length - 1]
      : undefined;
    updates.joinedSeason = calculateJoinedSeasonFromTenure(playerData.tenureYears, currentSeason);
    needsUpdate = true;
    console.log(`  Converting tenureYears ${playerData.tenureYears} → joinedSeason ${updates.joinedSeason}`);
  }

  if (needsUpdate) {
    const playerRef = doc(db, "players", playerId);
    await updateDoc(playerRef, updates);
    console.log(`  ✓ Updated player ${playerId}`);
  }
}

/**
 * Main migration function
 */
export async function migratePlayerData(clubUid: string, teamId: string): Promise<void> {
  console.log("Starting player data migration...");
  console.log(`Club: ${clubUid}, Team: ${teamId}`);

  try {
    const playersRef = collection(db, `clubs/${clubUid}/teams/${teamId}/players`);
    const q = query(playersRef, orderBy("name"));
    const snapshot = await getDocs(q);

    console.log(`Found ${snapshot.size} player records to check`);

    let migratedCount = 0;
    let skippedCount = 0;

    for (const doc of snapshot.docs) {
      const playerData = doc.data() as PlayerRecord;
      console.log(`\nProcessing player: ${playerData.name || doc.id} (${doc.id})`);

      try {
        await migratePlayerRecord(doc.id, playerData);
        migratedCount++;
      } catch (error) {
        console.error(`  ✗ Error migrating player ${doc.id}:`, error);
        skippedCount++;
      }
    }

    console.log(`\n=== Migration Complete ===`);
    console.log(`Migrated: ${migratedCount} players`);
    console.log(`Skipped: ${skippedCount} players`);
    console.log(`\nIMPORTANT: Estimated birth dates may need manual adjustment by admins.`);
    console.log(`Please review and update birth dates after migration.`);
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
}

/**
 * Run migration for all teams in a club
 */
export async function migrateAllTeamsInClub(clubUid: string): Promise<void> {
  console.log("Starting migration for all teams in club...");
  
  // Get all teams
  const teamsRef = collection(db, `clubs/${clubUid}/teams`);
  const teamsSnapshot = await getDocs(teamsRef);

  console.log(`Found ${teamsSnapshot.size} teams`);

  for (const teamDoc of teamsSnapshot.docs) {
    console.log(`\n=== Migrating team: ${teamDoc.data().name || teamDoc.id} ===`);
    try {
      await migratePlayerData(clubUid, teamDoc.id);
    } catch (error) {
      console.error(`Failed to migrate team ${teamDoc.id}:`, error);
    }
  }

  console.log("\n=== All teams migration complete ===");
}
