"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateStandingsOnMatchUpdate = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = __importStar(require("firebase-admin"));
const logger = __importStar(require("firebase-functions/logger"));
admin.initializeApp();
const db = admin.firestore();
exports.updateStandingsOnMatchUpdate = (0, firestore_1.onDocumentWritten)({ document: 'clubs/{ownerUid}/competitions/{competitionId}/rounds/{roundId}/matches/{matchId}', region: 'asia-northeast1' }, async (event) => {
    const { ownerUid, competitionId } = event.params;
    try {
        // 1. Get all teams for the competition
        const teamsSnap = await db.collection(`clubs/${ownerUid}/teams`).get();
        const teams = teamsSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
        // Initialize standings for all teams
        const standingsMap = new Map();
        for (const team of teams) {
            standingsMap.set(team.id, {
                id: team.id,
                teamName: team.name,
                rank: 0, played: 0, wins: 0, draws: 0, losses: 0,
                goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
            });
        }
        // 2. Get all rounds for the competition
        const roundsSnap = await db.collection(`clubs/${ownerUid}/competitions/${competitionId}/rounds`).get();
        // 3. Get all matches from all rounds
        const allMatchesPromises = roundsSnap.docs.map(roundDoc => db.collection(`clubs/${ownerUid}/competitions/${competitionId}/rounds/${roundDoc.id}/matches`).get());
        const allMatchesSnaps = await Promise.all(allMatchesPromises);
        // 4. Recalculate Standing from all matches
        for (const matchesSnap of allMatchesSnaps) {
            for (const matchDoc of matchesSnap.docs) {
                const match = matchDoc.data();
                // Skip matches without scores
                if (match.homeScore == null || match.awayScore == null)
                    continue;
                const homeTeamId = match.homeTeam;
                const awayTeamId = match.awayTeam;
                const homeScore = Number(match.homeScore);
                const awayScore = Number(match.awayScore);
                const homeStanding = standingsMap.get(homeTeamId);
                const awayStanding = standingsMap.get(awayTeamId);
                if (homeStanding) {
                    homeStanding.played += 1;
                    homeStanding.goalsFor += homeScore;
                    homeStanding.goalsAgainst += awayScore;
                }
                if (awayStanding) {
                    awayStanding.played += 1;
                    awayStanding.goalsFor += awayScore;
                    awayStanding.goalsAgainst += homeScore;
                }
                if (homeScore > awayScore) {
                    if (homeStanding)
                        homeStanding.wins += 1;
                    if (awayStanding)
                        awayStanding.losses += 1;
                }
                else if (homeScore < awayScore) {
                    if (homeStanding)
                        homeStanding.losses += 1;
                    if (awayStanding)
                        awayStanding.wins += 1;
                }
                else {
                    if (homeStanding)
                        homeStanding.draws += 1;
                    if (awayStanding)
                        awayStanding.draws += 1;
                }
            }
        }
        // 5. Finalize points and goal difference
        const finalStandings = [];
        for (const standing of standingsMap.values()) {
            standing.points = (standing.wins * 3) + standing.draws;
            standing.goalDifference = standing.goalsFor - standing.goalsAgainst;
            finalStandings.push(standing);
        }
        // 6. Sort by points, goal difference, goals for
        finalStandings.sort((a, b) => {
            if (a.points !== b.points)
                return b.points - a.points;
            if (a.goalDifference !== b.goalDifference)
                return b.goalDifference - a.goalDifference;
            if (a.goalsFor !== b.goalsFor)
                return b.goalsFor - a.goalsFor;
            return a.teamName.localeCompare(b.teamName);
        });
        // 7. Assign rank
        finalStandings.forEach((s, index) => s.rank = index + 1);
        // 8. Write updated standings to Firestore in a batch
        const batch = db.batch();
        const standingsRef = db.collection(`clubs/${ownerUid}/competitions/${competitionId}/standings`);
        // First, delete all old standings documents
        const oldStandingsSnap = await standingsRef.get();
        oldStandingsSnap.docs.forEach(doc => batch.delete(doc.ref));
        // Then, add the new standings documents
        for (const standing of finalStandings) {
            const docRef = standingsRef.doc(standing.id);
            batch.set(docRef, standing);
        }
        await batch.commit();
        logger.info(`Standings updated for competition ${competitionId}`);
    }
    catch (error) {
        logger.error(`Error updating Standing for competition ${competitionId}:`, error);
    }
});
//# sourceMappingURL=index.js.map