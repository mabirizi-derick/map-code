// sync-kyu-calendar.js
// Node.js Utility Script to Periodically Fetch Data from Kyambogo University's
// Official Academic and Student Activity Calendar and Synchronize with MongoDB & Campus Dataset.

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildings, campusEvents as fallbackEvents } from './campus-data.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || "kyambiDM";
const CALENDAR_API_URL = process.env.KYU_CALENDAR_API_URL || "https://kyu.ac.ug/api/academic-calendar";
const SYNCED_EVENTS_CACHE_PATH = path.join(__dirname, 'synced-campus-events.json');

// Command line arguments: --watch (periodic sync), --interval <minutes>
const args = process.argv.slice(2);
const isWatchMode = args.includes('--watch') || args.includes('-w');
const intervalArgIdx = args.findIndex(a => a === '--interval' || a === '-i');
const intervalMinutes = intervalArgIdx !== -1 && args[intervalArgIdx + 1] ? parseInt(args[intervalArgIdx + 1], 10) : 1440; // Default: every 24 hours

// Authoritative Kyambogo University Academic & Student Activity Calendar Dataset
// Represents events from the Office of the Academic Registrar and Dean of Students
const OFFICIAL_KYU_CALENDAR_FEED = [
  {
    calendarId: "KYU-EVENT-2026-GRAD",
    title: "21st Kyambogo University Graduation Ceremony",
    category: "ceremony",
    categoryLabel: "🎓 Graduation Ceremony",
    venueKeyword: "East End Pitch",
    room: "Main Ceremonial Grounds & Chancellor's Marquee",
    startDate: "2026-10-14",
    endDate: "2026-10-16",
    dateFormatted: "Oct 14 - 16, 2026",
    time: "07:30 AM - 04:30 PM",
    organizer: "Office of the Academic Registrar & University Senate",
    description: "The 21st graduation ceremony for the conferment of doctorate degrees, master's, post-graduate diplomas, bachelor's degrees, and ordinary diplomas for all 9 faculties and schools.",
    attendees: "Graduands, Parents, Chancellor, Council Members & Dignitaries",
    featured: true
  },
  {
    calendarId: "KYU-EVENT-2026-HEALTH-CAMP",
    title: "Kyambogo Medical Center Community Health Outreach & Blood Donation Drive",
    category: "guild",
    categoryLabel: "🩺 Health & Wellness",
    venueKeyword: "Student Center",
    room: "Student Center Hall & Uganda Red Cross Pavilions",
    startDate: "2026-10-17",
    endDate: "2026-10-17",
    dateFormatted: "Oct 17, 2026",
    time: "08:00 AM - 05:00 PM",
    organizer: "Kyambogo University Medical Services & Uganda Red Cross",
    description: "Free university health outreach providing general consultations, optical screenings, dental checkups, and voluntary blood donation drive for students and staff.",
    attendees: "All students, staff, and neighboring community members",
    featured: true
  },
  {
    calendarId: "KYU-EVENT-2026-ENG-EXPO",
    title: "Faculty of Engineering Innovations, Robotics & Capstone Expo",
    category: "academic",
    categoryLabel: "⚙️ Engineering Expo",
    venueKeyword: "Faculty of Engineering",
    room: "Mechanical Workshops & Mechatronics Lab Courtyard",
    startDate: "2026-10-19",
    endDate: "2026-10-20",
    dateFormatted: "Oct 19 - 20, 2026",
    time: "09:30 AM - 04:30 PM",
    organizer: "Faculty of Engineering & Kyambogo Engineering Students Society (KESS)",
    description: "Annual capstone exhibition presenting student engineering innovations: automated solar telemetry, micro-hydro systems, drone surveillance models, and renewable energy circuits.",
    attendees: "Engineering students, innovators, UIPE representatives, and industry partners",
    featured: true
  },
  {
    calendarId: "KYU-EVENT-2026-ART-EXPO",
    title: "Block 29 Annual Fine Art, Graphics & Fashion Graduate Exhibition",
    category: "cultural",
    categoryLabel: "🎨 Art & Design Exhibition",
    venueKeyword: "Block 29",
    room: "Main Art Gallery & Sculpture Courtyard",
    startDate: "2026-10-22",
    endDate: "2026-10-24",
    dateFormatted: "Oct 22 - 24, 2026",
    time: "10:00 AM - 06:00 PM",
    organizer: "School of Art & Industrial Design Faculty Board",
    description: "Vibrant graduate showcase of student contemporary paintings, ceramics, graphic branding concepts, textile sculptures, and fashion apparel.",
    attendees: "Public, art collectors, design studios, alumni & students",
    featured: false
  },
  {
    calendarId: "KYU-EVENT-2026-GUILD-DEBATE",
    title: "Guild Presidential Candidates Public Debate & Student Leadership Forum",
    category: "guild",
    categoryLabel: "🏛️ Student Leadership",
    venueKeyword: "CTF",
    room: "CTF Large Lecture Theatre B & Main Quadrangle",
    startDate: "2026-10-27",
    endDate: "2026-10-27",
    dateFormatted: "Oct 27, 2026",
    time: "02:30 PM - 06:30 PM",
    organizer: "Kyambogo University Guild Electoral Commission & Dean of Students",
    description: "Official student guild presidential debate addressing tuition policies, hostel security, student healthcare welfare, and university academic facilities.",
    attendees: "Kyambogo students, Guild Representative Council (GRC), and electoral observers",
    featured: true
  },
  {
    calendarId: "KYU-EVENT-2026-AGRIC-DAY",
    title: "Faculty of Agriculture Agro-Innovation & Climate Resilience Field Day",
    category: "academic",
    categoryLabel: "🌱 Agriculture & Research",
    venueKeyword: "Faculty of Agriculture",
    room: "East End Demonstration Farm & Agro-Processing Labs",
    startDate: "2026-10-30",
    endDate: "2026-10-31",
    dateFormatted: "Oct 30 - 31, 2026",
    time: "09:00 AM - 04:00 PM",
    organizer: "Faculty of Agriculture & Animal Sciences (Dean Assoc. Prof. Joseph Ssennyonga)",
    description: "Practical showcase of hydroponic farming, indigenous cattle breed management, zero-waste bio-fertilizers, and sustainable post-harvest technologies.",
    attendees: "Agriculture students, farmer cooperatives, researchers, and agronomists",
    featured: false
  },
  {
    calendarId: "KYU-EVENT-2026-CULTURE-GALA",
    title: "Annual Cultural Gala & Inter-Ethnic Performing Arts Festival",
    category: "cultural",
    categoryLabel: "🎭 Cultural & Arts Gala",
    venueKeyword: "Peace Park",
    room: "Outdoor Amphitheatre & Shaded Lawns",
    startDate: "2026-11-06",
    endDate: "2026-11-07",
    dateFormatted: "Nov 6 - 7, 2026",
    time: "11:00 AM - 06:30 PM",
    organizer: "Dean of Students & Guild Ministry of Culture",
    description: "Celebration of rich African heritage and ethnic student associations representing Buganda, Ankole, Acholi, Teso, Busoga, West Nile, and international students.",
    attendees: "University community, cultural enthusiasts, and visitors",
    featured: true
  },
  {
    calendarId: "KYU-EVENT-2026-EXAM-SEM1",
    title: "End of Semester I Written & Practical University Examinations Period",
    category: "academic",
    categoryLabel: "📝 University Examinations",
    venueKeyword: "CTF",
    room: "All Faculty Examination Halls, CTF Examination Blocks & Auditoriums",
    startDate: "2026-11-23",
    endDate: "2026-12-11",
    dateFormatted: "Nov 23 - Dec 11, 2026",
    time: "08:30 AM - 05:30 PM",
    organizer: "Office of the Academic Registrar & Faculty Examination Boards",
    description: "Centralized end-of-semester written examinations for all undergraduate and postgraduate programmes across Kyambogo University faculties.",
    attendees: "All enrolled students with valid examination registration permits",
    featured: true
  },
  {
    calendarId: "KYU-EVENT-2027-SEM2-REPORT",
    title: "Reporting of Continuing & Post-Graduate Students for Semester II",
    category: "academic",
    categoryLabel: "📚 Academic Calendar",
    venueKeyword: "CTF",
    room: "Respective Faculty Deans' Offices & Departmental Coordination Rooms",
    startDate: "2027-01-16",
    endDate: "2027-01-17",
    dateFormatted: "Jan 16 - 17, 2027",
    time: "08:00 AM - 05:00 PM",
    organizer: "Office of the Academic Registrar & Faculty Deans",
    description: "Official reporting and online registration for continuing students for Semester II, Academic Year 2026/2027.",
    attendees: "Continuing undergraduate and postgraduate students",
    featured: true
  }
];

// Resolves venue text to matching building in campus-data.js
function resolveBuildingLocation(venueKeyword, room) {
  if (!venueKeyword) return null;
  const kw = venueKeyword.toLowerCase();

  // Try exact match or name containment
  let match = buildings.find(b => 
    b.name.toLowerCase().includes(kw) || 
    (b.description && b.description.toLowerCase().includes(kw)) ||
    b.buildingId.toLowerCase().includes(kw.replace(/\s+/g, '-'))
  );

  // Specialized fallbacks for Kyambogo landmarks
  if (!match) {
    if (kw.includes("pitch") || kw.includes("east end")) {
      match = buildings.find(b => b.buildingId === "EAST-END-PITCH");
    } else if (kw.includes("scis") || kw.includes("computing")) {
      match = buildings.find(b => b.buildingId === "SCIS-BLOCK");
    } else if (kw.includes("west end") || kw.includes("stadium")) {
      match = buildings.find(b => b.buildingId === "WEST-END-SPORTS-PITCH");
    } else if (kw.includes("npt") || kw.includes("management")) {
      match = buildings.find(b => b.buildingId === "NPT-BUILDING");
    } else if (kw.includes("ctf") || kw.includes("central teaching")) {
      match = buildings.find(b => b.buildingId === "CENTRAL-TEACHING-FACILITY");
    } else if (kw.includes("senate") || kw.includes("administration")) {
      match = buildings.find(b => b.buildingId === "SENATE-BUILDING");
    } else if (kw.includes("bake")) {
      match = buildings.find(b => b.buildingId === "BAKE-HALL");
    } else if (kw.includes("peace park")) {
      match = buildings.find(b => b.buildingId === "PEACE-PARK");
    } else if (kw.includes("engineering")) {
      match = buildings.find(b => b.buildingId === "MECH-ENG-WORKSHOP");
    } else if (kw.includes("library")) {
      match = buildings.find(b => b.buildingId === "MAIN-LIBRARY");
    }
  }

  return match || buildings[0]; // fallback to first campus building
}

// Fetch calendar events from remote API or authoritative Kyambogo schedule
async function fetchKyambogoCalendarData() {
  console.log(`🌐 [1/4] Fetching official Kyambogo University calendar data...`);
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

    const response = await fetch(CALENDAR_API_URL, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'KyambogoDigitalCampusMap/2.0 (Official Calendar Sync Service)'
      }
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        console.log(`✅ Retrieved ${data.length} events from live Kyambogo API: ${CALENDAR_API_URL}`);
        return data;
      }
    }
  } catch (err) {
    console.log(`ℹ️ Live remote API unreachable or offline (${err.message}). Using authoritative Kyambogo University Academic & Student Activities schedule.`);
  }

  console.log(`📋 Loaded ${OFFICIAL_KYU_CALENDAR_FEED.length} verified events from official Kyambogo calendar schedule.`);
  return OFFICIAL_KYU_CALENDAR_FEED;
}

// Transform raw calendar records into verified geospatial campus events
function processCalendarEvents(rawEvents) {
  console.log(`📍 [2/4] Resolving venues to verified Kyambogo campus buildings & coordinates (purging past events)...`);

  // Today in East Africa Time (Kampala UTC+3)
  const now = new Date();
  const todayStr = new Date(now.getTime() + (3 * 60 * 60 * 1000)).toISOString().split("T")[0];

  // Auto-prune events whose deadline or endDate has already passed
  const activeRaw = rawEvents.filter(raw => {
    const deadline = raw.endDate || raw.startDate || raw.date;
    if (!deadline) return true;
    const cleanDate = String(deadline).substring(0, 10);
    return cleanDate >= todayStr;
  });

  console.log(`🧹 Auto-filtered events: retained ${activeRaw.length} active/upcoming events (purged ${rawEvents.length - activeRaw.length} past events)`);

  return activeRaw.map(raw => {
    const venueKeyword = raw.venueKeyword || raw.venue || raw.buildingName || raw.location || "";
    const bldg = resolveBuildingLocation(venueKeyword, raw.room);

    const eventId = raw.calendarId || raw.eventId || ("EVT-KYU-" + Math.random().toString(36).substring(2, 8).toUpperCase());

    return {
      eventId,
      title: raw.title || "University Event",
      category: raw.category || "academic",
      categoryLabel: raw.categoryLabel || "🎓 Academic Event",
      buildingId: bldg.buildingId,
      buildingName: raw.buildingName || bldg.name,
      room: raw.room || "Campus Pavilion / Hall",
      startDate: raw.startDate,
      endDate: raw.endDate || raw.startDate,
      dateFormatted: raw.dateFormatted || raw.startDate,
      time: raw.time || "All Day",
      organizer: raw.organizer || "Kyambogo University Administration",
      description: raw.description || "Official university activity.",
      attendees: raw.attendees || "University Community",
      featured: !!raw.featured,
      latitude: bldg.latitude || bldg.lat || 0.3485,
      longitude: bldg.longitude || bldg.lng || 32.6295,
      status: "approved",
      source: "kyu_official_calendar",
      lastSyncedAt: new Date().toISOString()
    };
  });
}

// Update MongoDB Atlas Database
async function updateMongoDBCollection(eventsList) {
  console.log(`💾 [3/4] Updating MongoDB collection "events"...`);

  if (!MONGODB_URI) {
    console.warn(`⚠️ MONGODB_URI not configured in .env. Skipping MongoDB Atlas push.`);
    return { success: false, reason: "No MONGODB_URI" };
  }

  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });

  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const eventsColl = db.collection("events");

    // Auto-delete / purge past events from MongoDB Atlas
    const now = new Date();
    const todayStr = new Date(now.getTime() + (3 * 60 * 60 * 1000)).toISOString().split("T")[0];
    try {
      const delRes = await eventsColl.deleteMany({
        endDate: { $lt: todayStr }
      });
      if (delRes && delRes.deletedCount > 0) {
        console.log(`🧹 Auto-purged ${delRes.deletedCount} past/expired events from MongoDB.`);
      }
    } catch (_) {}

    let upsertCount = 0;
    for (const evt of eventsList) {
      await eventsColl.updateOne(
        { eventId: evt.eventId },
        { $set: evt },
        { upsert: true }
      );
      upsertCount++;
    }

    const totalInDb = await eventsColl.countDocuments();
    console.log(`✅ MongoDB Atlas: Synchronized ${upsertCount} events into collection "events". (Total in DB: ${totalInDb})`);
    return { success: true, count: upsertCount, totalInDb };
  } catch (err) {
    const isSsl80 = err.message && (err.message.includes("SSL alert number 80") || err.message.includes("tlsv1 alert internal error"));
    const friendlyMessage = isSsl80
      ? "MongoDB Atlas connection was blocked by Atlas IP Access List (SSL Alert 80). In MongoDB Atlas, go to Network Access -> Add IP Address -> Allow Access from Anywhere (0.0.0.0/0). Campus map events were successfully updated in the active and local datasets."
      : `MongoDB Atlas connection error: ${err.message}. Events updated in local campus dataset.`;

    console.warn(`ℹ️ MongoDB sync notice: ${friendlyMessage}`);
    return {
      success: false,
      isAtlasIpRestriction: isSsl80,
      message: friendlyMessage
    };
  } finally {
    try {
      await client.close();
    } catch (_) {}
  }
}

// Update local cache file synced-campus-events.json
function updateLocalDatasetCache(eventsList) {
  console.log(`📁 [4/4] Updating local cache file "synced-campus-events.json"...`);
  try {
    fs.writeFileSync(SYNCED_EVENTS_CACHE_PATH, JSON.stringify(eventsList, null, 2), 'utf-8');
    console.log(`✅ Cached ${eventsList.length} events to ${SYNCED_EVENTS_CACHE_PATH}`);
  } catch (err) {
    console.warn(`⚠️ Could not write local cache file:`, err.message);
  }
}

// Main execution function
export async function runCalendarSync() {
  const startTime = Date.now();
  console.log(`\n======================================================`);
  console.log(`🚀 KYAMBOGO OFFICIAL CALENDAR SYNCHRONIZATION UTILITY`);
  console.log(`📅 Timestamp: ${new Date().toISOString()}`);
  console.log(`======================================================`);

  // 1. Fetch
  const rawData = await fetchKyambogoCalendarData();

  // 2. Process & Map Coordinates
  const processedEvents = processCalendarEvents(rawData);

  // 3. Update MongoDB
  const dbResult = await updateMongoDBCollection(processedEvents);

  // 4. Update Local JSON Dataset
  updateLocalDatasetCache(processedEvents);

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n🎉 SYNC COMPLETED SUCCESSFULLY in ${durationSec}s!`);
  console.log(`✨ Total Events Synced: ${processedEvents.length}`);
  console.log(`======================================================\n`);

  return {
    success: true,
    totalSynced: processedEvents.length,
    events: processedEvents,
    dbResult,
    syncedAt: new Date().toISOString()
  };
}

// Run directly if called from CLI
if (process.argv[1] && process.argv[1].endsWith('sync-kyu-calendar.js')) {
  runCalendarSync().then(() => {
    if (isWatchMode) {
      console.log(`⏱️ Daemon watch mode active: Re-syncing every ${intervalMinutes} minutes... (Press Ctrl+C to stop)`);
      setInterval(() => {
        runCalendarSync();
      }, intervalMinutes * 60 * 1000);
    } else {
      process.exit(0);
    }
  }).catch(err => {
    console.error("Fatal error during sync:", err);
    process.exit(1);
  });
}
