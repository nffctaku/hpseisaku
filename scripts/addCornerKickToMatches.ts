import { db } from '../src/lib/firebase';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';

async function addCornerKickToMatches() {
  console.log('Starting to add corner kick to all matches...');
  
  try {
    // Get all clubs
    const clubsSnap = await getDocs(collection(db, 'clubs'));
    console.log(`Found ${clubsSnap.docs.length} clubs`);
    
    let totalMatchesUpdated = 0;
    
    for (const clubDoc of clubsSnap.docs) {
      const clubId = clubDoc.id;
      console.log(`Processing club: ${clubId}`);
      
      // Get all competitions for this club
      const competitionsSnap = await getDocs(collection(db, `clubs/${clubId}/competitions`));
      console.log(`  Found ${competitionsSnap.docs.length} competitions`);
      
      for (const compDoc of competitionsSnap.docs) {
        const competitionId = compDoc.id;
        console.log(`  Processing competition: ${competitionId}`);
        
        // Get all rounds for this competition
        const roundsSnap = await getDocs(collection(db, `clubs/${clubId}/competitions/${competitionId}/rounds`));
        console.log(`    Found ${roundsSnap.docs.length} rounds`);
        
        for (const roundDoc of roundsSnap.docs) {
          const roundId = roundDoc.id;
          console.log(`    Processing round: ${roundId}`);
          
          // Get all matches for this round
          const matchesSnap = await getDocs(collection(db, `clubs/${clubId}/competitions/${competitionId}/rounds/${roundId}/matches`));
          console.log(`      Found ${matchesSnap.docs.length} matches`);
          
          for (const matchDoc of matchesSnap.docs) {
            const matchId = matchDoc.id;
            const matchData = matchDoc.data();
            
            // Check if match has teamStats
            if (!matchData.teamStats || !Array.isArray(matchData.teamStats)) {
              console.log(`        Match ${matchId}: No teamStats, skipping`);
              continue;
            }
            
            // Check if cornerKick already exists
            const hasCornerKick = matchData.teamStats.some((stat: any) => stat.id === 'cornerKicks');
            
            if (hasCornerKick) {
              console.log(`        Match ${matchId}: Already has cornerKick, skipping`);
              continue;
            }
            
            // Add cornerKick to teamStats
            const updatedTeamStats = [
              ...matchData.teamStats,
              { id: 'cornerKicks', name: 'コーナーキック', homeValue: null, awayValue: null }
            ];
            
            // Update the match document
            const matchRef = doc(db, `clubs/${clubId}/competitions/${competitionId}/rounds/${roundId}/matches/${matchId}`);
            await updateDoc(matchRef, { teamStats: updatedTeamStats });
            
            console.log(`        Match ${matchId}: Added cornerKick`);
            totalMatchesUpdated++;
          }
        }
      }
    }
    
    console.log(`\nCompleted! Total matches updated: ${totalMatchesUpdated}`);
  } catch (error) {
    console.error('Error adding corner kick to matches:', error);
  }
}

// Run the function
addCornerKickToMatches();
